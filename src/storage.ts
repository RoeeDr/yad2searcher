import { MongoClient, Collection, Db } from "mongodb";
import {
  AppConfig,
  ListingDocument,
  ParsedListing,
  AlertType,
  AlertPayload,
  UserDocument,
  FieldChange,
} from "./types";

export class Storage {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<ListingDocument>;
  private usersCollection!: Collection<UserDocument>;
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
    this.usersCollection = this.db.collection<UserDocument>("users");
    await this.collection.createIndex(
      { lastSeenAt: 1 },
      { expireAfterSeconds: 2592000 }
    );
  }

  async processListing(
    parsed: ParsedListing,
    userId?: string
  ): Promise<AlertPayload | null> {
    const now = new Date();
    const docId = userId ? `${userId}::${parsed.itemId}` : parsed.itemId;
    const existing = await this.collection.findOne({ _id: docId });

    if (!existing) {
      const doc: ListingDocument = {
        _id: docId,
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
        description: parsed.description,
      };
      if (userId) {
        (doc as any).userId = userId;
        (doc as any).yad2Id = parsed.itemId;
      }
      await this.collection.insertOne(doc as any);
      return { type: AlertType.NEW_LISTING, listing: parsed };
    }

    const changes = this.detectChanges(existing, parsed);

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

    if (parsed.description !== undefined) {
      update.$set.description = parsed.description;
    }

    const priceChanged =
      parsed.price > 0 && existing.price > 0 && parsed.price !== existing.price;

    if (priceChanged) {
      update.$set.previousPrice = existing.price;
      update.$set.price = parsed.price;
      update.$set.priceChangeAlertedAt = now;
      update.$push = { priceHistory: { price: parsed.price, date: now } };
    }

    await this.collection.updateOne({ _id: docId }, update);

    if (priceChanged) {
      return {
        type: AlertType.PRICE_CHANGE,
        listing: parsed,
        previousPrice: existing.price,
        changes: changes.length > 0 ? changes : undefined,
      };
    }

    if (changes.length > 0) {
      return { type: AlertType.LISTING_UPDATED, listing: parsed, changes };
    }

    return null;
  }

  private detectChanges(
    existing: ListingDocument,
    parsed: ParsedListing
  ): FieldChange[] {
    const changes: FieldChange[] = [];

    if (existing.street !== parsed.street) {
      changes.push({ field: "כתובת", oldValue: existing.street, newValue: parsed.street });
    }
    if (existing.infoLine1 !== parsed.infoLine1) {
      changes.push({ field: "מיקום", oldValue: existing.infoLine1, newValue: parsed.infoLine1 });
    }
    if (existing.infoLine2 !== parsed.infoLine2) {
      changes.push({ field: "פרטים", oldValue: existing.infoLine2, newValue: parsed.infoLine2 });
    }
    if (
      existing.description !== undefined &&
      parsed.description !== undefined &&
      existing.description !== parsed.description
    ) {
      changes.push({ field: "תיאור", oldValue: existing.description || "ללא תיאור", newValue: parsed.description || "ללא תיאור" });
    }

    return changes;
  }

  async getStats(
    userId?: string
  ): Promise<{ total: number; brokers: number; private: number }> {
    const filter: any = userId ? { userId } : {};
    const total = await this.collection.countDocuments(filter);
    const brokers = await this.collection.countDocuments({ ...filter, isBroker: true });
    return { total, brokers, private: total - brokers };
  }

  async updateDescription(
    itemId: string,
    newDescription: string,
    userId?: string
  ): Promise<FieldChange | null> {
    const docId = userId ? `${userId}::${itemId}` : itemId;
    const existing = await this.collection.findOne({ _id: docId });
    if (!existing) return null;

    const changed =
      existing.description !== undefined &&
      existing.description !== newDescription;

    await this.collection.updateOne(
      { _id: docId },
      { $set: { description: newDescription } }
    );

    if (changed) {
      return {
        field: "תיאור",
        oldValue: existing.description || "ללא תיאור",
        newValue: newDescription || "ללא תיאור",
      };
    }
    return null;
  }

  // ── User management (dynamic mode) ──

  async registerUrl(chatId: string, url: string): Promise<void> {
    const now = new Date();
    await this.usersCollection.updateOne(
      { _id: chatId },
      {
        $addToSet: { urls: url },
        $set: { lastActiveAt: now },
        $setOnInsert: { registeredAt: now },
      },
      { upsert: true }
    );
  }

  async getUserUrls(chatId: string): Promise<string[]> {
    const user = await this.usersCollection.findOne({ _id: chatId });
    return user?.urls || [];
  }

  async removeUrl(chatId: string, index: number): Promise<string | null> {
    const user = await this.usersCollection.findOne({ _id: chatId });
    if (!user || index < 0 || index >= user.urls.length) return null;
    const removed = user.urls[index];
    user.urls.splice(index, 1);
    await this.usersCollection.updateOne(
      { _id: chatId },
      { $set: { urls: user.urls, lastActiveAt: new Date() } }
    );
    return removed;
  }

  async clearUser(chatId: string): Promise<void> {
    await this.usersCollection.deleteOne({ _id: chatId });
    await this.collection.deleteMany({ userId: chatId });
  }

  async getAllUsers(): Promise<UserDocument[]> {
    return this.usersCollection
      .find({ urls: { $exists: true, $not: { $size: 0 } } })
      .toArray();
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
