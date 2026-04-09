import { loadConfig } from "./config";
import { Crawler } from "./crawler";
import { parseListings, parseListingDetails } from "./parser";
import { Storage } from "./storage";
import { createAlerters, Alerter, TerminalAlerter, TelegramAlerter } from "./alerter";
import { formatTime, randomSleep, randomInt } from "./utils";
import { AppConfig, ParsedListing } from "./types";
import { TelegramBot } from "./telegram-bot";

let shuttingDown = false;

async function runCrawlCycle(
  urls: string[],
  config: AppConfig,
  storage: Storage,
  alerters: Alerter[],
  userId?: string
): Promise<void> {
  const label = userId ? ` for user ${userId}` : "";
  console.log(`\n[cycle] starting crawl at ${formatTime()} — ${urls.length} URL(s)${label}`);

  const crawler = new Crawler(config);
  let totalPages = 0;
  let totalListings = 0;
  let totalAlerts = 0;

  try {
    await crawler.launch();

    for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
      const searchUrl = urls[urlIdx];
      console.log(`\n[cycle] URL ${urlIdx + 1}/${urls.length}: ${searchUrl}`);

      if (urlIdx > 0) {
        await randomSleep(config.minPageDelay, config.maxPageDelay);
      }

      await crawler.navigateToSearch(searchUrl);

      do {
      totalPages++;
      console.log(`[cycle] parsing page ${totalPages}...`);

      const rawListings = await parseListings(crawler.getPage());
      // Deduplicate — same listing can appear as both regular and promoted.
      // If any copy is marked as broker, the listing is a broker.
      const listingMap = new Map<string, ParsedListing>();
      for (const l of rawListings) {
        const existing = listingMap.get(l.itemId);
        if (!existing) {
          listingMap.set(l.itemId, l);
        } else if (l.isBroker && !existing.isBroker) {
          existing.isBroker = true;
          existing.brokerText = l.brokerText || existing.brokerText;
        }
      }
      const listings = Array.from(listingMap.values());
      totalListings += listings.length;
      console.log(`[cycle] found ${listings.length} listings on page ${totalPages}`);

      for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        if (i > 0) {
          await new Promise((r) => setTimeout(r, randomInt(500, 2000)));
        }
        try {
          const alertPayload = await storage.processListing(listing, userId);
          if (alertPayload) {
            if (config.fetchDetails) {
              const maxAttempts = 2;
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                  await randomSleep(2000, 5000);
                  await crawler.navigateToListing(alertPayload.listing.listingUrl);
                  const details = await parseListingDetails(crawler.getPage());
                  alertPayload.listing.viewCount = details.viewCount;
                  alertPayload.listing.daysListed = details.daysListed;
                  alertPayload.listing.publishedDate = details.publishedDate;
                  alertPayload.listing.hasBalcony = details.hasBalcony;
                  alertPayload.listing.hasElevator = details.hasElevator;
                  alertPayload.listing.hasShelter = details.hasShelter;
                  if (details.imageUrls) {
                    alertPayload.listing.imageUrls = details.imageUrls;
                  }
                  // Check description change and store it
                  if (details.description !== undefined) {
                    const descChange = await storage.updateDescription(
                      listing.itemId, details.description, userId
                    );
                    if (descChange) {
                      alertPayload.changes = alertPayload.changes || [];
                      alertPayload.changes.push(descChange);
                    }
                  }
                  await randomSleep(2000, 5000);
                  await crawler.goBack();
                  break;
                } catch (detailErr) {
                  if (attempt < maxAttempts) {
                    console.warn(`[cycle] attempt ${attempt} failed for ${listing.itemId}, retrying...`);
                  } else {
                    console.error(`[cycle] error fetching listing details for ${listing.itemId} after ${maxAttempts} attempts:`, detailErr);
                  }
                }
              }
            }

            totalAlerts++;
            for (const alerter of alerters) {
              await alerter.alert(alertPayload);
            }
          }
        } catch (err) {
          console.error(`[cycle] error processing listing ${listing.itemId}:`, err);
        }
      }

      } while (await crawler.goToNextPage());
    }

    const stats = await storage.getStats(userId);
    console.log(
      `[cycle] done: ${totalPages} pages, ${totalListings} listings, ${totalAlerts} alerts | DB: ${stats.total} total (${stats.private} private, ${stats.brokers} brokers)`
    );
  } catch (err) {
    console.error("[cycle] crawl error:", err);
  } finally {
    await crawler.close();
  }
}

async function sleepBetweenCycles(config: AppConfig): Promise<void> {
  const sleepMs =
    randomInt(config.crawlIntervalMinMin * 60, config.crawlIntervalMaxMin * 60) * 1000;
  const sleepUntil = new Date(Date.now() + sleepMs);
  console.log(`[main] sleeping until ${formatTime(sleepUntil)} (${Math.round(sleepMs / 1000)}s)`);

  const sleepEnd = Date.now() + sleepMs;
  while (Date.now() < sleepEnd && !shuttingDown) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function runStaticMode(
  config: AppConfig,
  storage: Storage
): Promise<void> {
  console.log(`[main] search URLs: ${config.searchUrls.length}`);
  const alerters = createAlerters(config);

  if (config.crawlOnce) {
    await runCrawlCycle(config.searchUrls, config, storage, alerters);
    await storage.close();
    return;
  }

  while (!shuttingDown) {
    await runCrawlCycle(config.searchUrls, config, storage, alerters);
    if (shuttingDown) break;
    await sleepBetweenCycles(config);
  }
}

async function runDynamicMode(
  config: AppConfig,
  storage: Storage,
  bot: TelegramBot
): Promise<void> {
  bot.start().catch((err) => console.error("[main] bot error:", err));

  const crawlAllUsers = async () => {
    const users = await storage.getAllUsers();
    if (users.length === 0) {
      console.log("[cycle] no registered users, skipping");
      return;
    }
    for (const user of users) {
      if (shuttingDown) break;
      const alerters: Alerter[] = [
        new TerminalAlerter(),
        new TelegramAlerter(config.telegramBotToken!, user._id),
      ];
      await runCrawlCycle(user.urls, config, storage, alerters, user._id);
    }
  };

  if (config.crawlOnce) {
    await crawlAllUsers();
    bot.stop();
    await storage.close();
    return;
  }

  while (!shuttingDown) {
    await crawlAllUsers();
    if (shuttingDown) break;
    await sleepBetweenCycles(config);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  console.log(`[main] mode: ${config.mode}`);
  console.log(`[main] crawl interval: ${config.crawlIntervalMinMin}-${config.crawlIntervalMaxMin} minutes`);
  console.log(`[main] crawl once: ${config.crawlOnce}`);
  console.log(`[main] headless: ${config.headless}`);

  const storage = new Storage(config);
  await storage.connect();
  console.log("[main] connected to MongoDB");

  let bot: TelegramBot | null = null;

  const shutdown = async () => {
    console.log("\n[main] shutting down gracefully...");
    shuttingDown = true;
    bot?.stop();
    await storage.close();
    console.log("[main] storage closed, exiting");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (config.mode === "static") {
    await runStaticMode(config, storage);
  } else {
    bot = new TelegramBot(config, storage);
    await runDynamicMode(config, storage, bot);
  }
}

main();
