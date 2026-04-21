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
  imageUrls?: string[];
  hasPriceDrop: boolean;
  viewCount?: number;
  daysListed?: number;
  publishedDate?: string;
  description?: string;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasShelter?: boolean;
  publisherName?: string;
  phoneNumber?: string;
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
  description?: string;
}

export interface PriceEntry {
  price: number;
  date: Date;
}

export enum AlertType {
  NEW_LISTING = "NEW_LISTING",
  PRICE_CHANGE = "PRICE_CHANGE",
  LISTING_UPDATED = "LISTING_UPDATED",
}

export interface FieldChange {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface AlertPayload {
  type: AlertType;
  listing: ParsedListing;
  previousPrice?: number;
  changes?: FieldChange[];
}

export type AppMode = "static" | "dynamic";

export interface UserDocument {
  _id: string; // chatId
  urls: string[];
  registeredAt: Date;
  lastActiveAt: Date;
}

export interface AppConfig {
  mode: AppMode;
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
