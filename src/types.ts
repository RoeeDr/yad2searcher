export interface ParsedListing {
  itemId: string;
  street: string;
  infoLine1: string;
  infoLine2: string;
  price: number;
  priceText: string;
  isBroker: boolean;
  brokerText: string;
  listingUrl: string;
  imageUrl?: string;
  hasPriceDrop: boolean;
  viewCount?: number;
  daysListed?: number;
  publishedDate?: string;
}

export interface ListingDocument {
  _id: string;
  street: string;
  infoLine1: string;
  infoLine2: string;
  price: number;
  priceText: string;
  isBroker: boolean;
  brokerText: string;
  listingUrl: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  previousPrice: number | null;
  priceHistory: PriceEntry[];
  alertedAt: Date | null;
  priceChangeAlertedAt: Date | null;
}

export interface PriceEntry {
  price: number;
  date: Date;
}

export enum AlertType {
  NEW_LISTING = "NEW_LISTING",
  PRICE_CHANGE = "PRICE_CHANGE",
}

export interface AlertPayload {
  type: AlertType;
  listing: ParsedListing;
  previousPrice?: number;
}

export interface AppConfig {
  searchUrls: string[];
  mongoUri: string;
  mongoDbName: string;
  mongoCollectionName: string;
  crawlIntervalMinMin: number;
  crawlIntervalMaxMin: number;
  crawlOnce: boolean;
  minPageDelay: number;
  maxPageDelay: number;
  headless: boolean;
  fetchDetails: boolean;
  browserDataDir: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}
