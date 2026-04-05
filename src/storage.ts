import { MongoClient, Collection, Db } from "mongodb";
import {
  AppConfig,
  ListingDocument,
  ParsedListing,
  AlertType,
  AlertPayload,
} from "./types";

export class Storage {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<ListingDocument>;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.client = new MongoClient(config.mongoUri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.config.mongoDbName);
    this.collection = this.db.collection<ListingDocument>(
      this.config.mongoCollectionName
    );
    await this.collection.createIndex(
      { lastSeenAt: 1 },
      { expireAfterSeconds: 2592000 }
    );
  }

  async processListing(parsed: ParsedListing): Promise<AlertPayload | null> {
    const now = new Date();
    const existing = await this.collection.findOne({ _id: parsed.itemId });

    if (!existing) {
      const doc: ListingDocument = {
        _id: parsed.itemId,
        street: parsed.street,
        infoLine1: parsed.infoLine1,
        infoLine2: parsed.infoLine2,
        price: parsed.price,
        priceText: parsed.priceText,
        isBroker: parsed.isBroker,
        brokerText: parsed.brokerText,
        listingUrl: parsed.listingUrl,
        firstSeenAt: now,
        lastSeenAt: now,
        previousPrice: null,
        priceHistory: [{ price: parsed.price, date: now }],
        alertedAt: now,
        priceChangeAlertedAt: null,
      };
      await this.collection.insertOne(doc as any);
      return { type: AlertType.NEW_LISTING, listing: parsed };
    }

    const update: any = {
      $set: {
        lastSeenAt: now,
        street: parsed.street,
        infoLine1: parsed.infoLine1,
        infoLine2: parsed.infoLine2,
        priceText: parsed.priceText,
        isBroker: parsed.isBroker,
        brokerText: parsed.brokerText,
        listingUrl: parsed.listingUrl,
      },
    };

    if (parsed.price > 0 && existing.price > 0 && parsed.price !== existing.price) {
      update.$set.previousPrice = existing.price;
      update.$set.price = parsed.price;
      update.$set.priceChangeAlertedAt = now;
      update.$push = { priceHistory: { price: parsed.price, date: now } };

      await this.collection.updateOne({ _id: parsed.itemId }, update);
      return {
        type: AlertType.PRICE_CHANGE,
        listing: parsed,
        previousPrice: existing.price,
      };
    }

    await this.collection.updateOne({ _id: parsed.itemId }, update);
    return null;
  }

  async getStats(): Promise<{ total: number; brokers: number; private: number }> {
    const total = await this.collection.countDocuments();
    const brokers = await this.collection.countDocuments({ isBroker: true });
    return { total, brokers, private: total - brokers };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
