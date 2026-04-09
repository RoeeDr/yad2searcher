import path from "path";
import dotenv from "dotenv";
import { AppConfig, AppMode } from "./types";

dotenv.config();

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function loadConfig(): AppConfig {
  const mode = optionalEnv("APP_MODE", "static") as AppMode;

  if (mode !== "static" && mode !== "dynamic") {
    throw new Error(`Invalid APP_MODE: ${mode}. Must be "static" or "dynamic".`);
  }

  if (mode === "dynamic" && !process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required in dynamic mode");
  }

  return {
    mode,
    searchUrls:
      mode === "static"
        ? requiredEnv("YAD2_SEARCH_URL").split(",").map((u) => u.trim())
        : [],
    mongoUri: optionalEnv("MONGO_URI", "mongodb://localhost:27017"),
    mongoDbName: optionalEnv("MONGO_DB_NAME", "yad2searcher"),
    mongoCollectionName: optionalEnv("MONGO_COLLECTION", "listings"),
    crawlIntervalMinMin: parseInt(optionalEnv("CRAWL_INTERVAL_MIN_MINUTES", "10"), 10),
    crawlIntervalMaxMin: parseInt(optionalEnv("CRAWL_INTERVAL_MAX_MINUTES", "20"), 10),
    crawlOnce: optionalEnv("CRAWL_ONCE", "false") === "true",
    minPageDelay: parseInt(optionalEnv("MIN_PAGE_DELAY_MS", "3000"), 10),
    maxPageDelay: parseInt(optionalEnv("MAX_PAGE_DELAY_MS", "8000"), 10),
    headless: optionalEnv("HEADLESS", "true") === "true",
    browserDataDir: optionalEnv("BROWSER_DATA_DIR", path.join(process.cwd(), ".browser-data")),
    fetchDetails: optionalEnv("FETCH_DETAILS", "false") === "true",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || undefined,
  };
}
