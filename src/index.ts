import { loadConfig } from "./config";
import { Crawler } from "./crawler";
import { parseListings, parseListingDetails } from "./parser";
import { Storage } from "./storage";
import { createAlerters, Alerter } from "./alerter";
import { formatTime, randomSleep, randomInt } from "./utils";
import { AppConfig } from "./types";

let shuttingDown = false;

async function runCrawlCycle(
  config: AppConfig,
  storage: Storage,
  alerters: Alerter[]
): Promise<void> {
  console.log(`\n[cycle] starting crawl at ${formatTime()} — ${config.searchUrls.length} URL(s)`);

  const crawler = new Crawler(config);
  let totalPages = 0;
  let totalListings = 0;
  let totalAlerts = 0;

  try {
    await crawler.launch();

    for (let urlIdx = 0; urlIdx < config.searchUrls.length; urlIdx++) {
      const searchUrl = config.searchUrls[urlIdx];
      console.log(`\n[cycle] URL ${urlIdx + 1}/${config.searchUrls.length}: ${searchUrl}`);

      if (urlIdx > 0) {
        await randomSleep(config.minPageDelay, config.maxPageDelay);
      }

      await crawler.navigateToSearch(searchUrl);

      do {
      totalPages++;
      console.log(`[cycle] parsing page ${totalPages}...`);

      const listings = await parseListings(crawler.getPage());
      totalListings += listings.length;
      console.log(`[cycle] found ${listings.length} listings on page ${totalPages}`);

      for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        if (i > 0) {
          await new Promise((r) => setTimeout(r, randomInt(500, 2000)));
        }
        try {
          const alertPayload = await storage.processListing(listing);
          if (alertPayload) {
            if (config.fetchDetails) {
              try {
                await randomSleep(2000, 5000);
                await crawler.navigateToListing(alertPayload.listing.listingUrl);
                const details = await parseListingDetails(crawler.getPage());
                alertPayload.listing.viewCount = details.viewCount;
                alertPayload.listing.daysListed = details.daysListed;
                alertPayload.listing.publishedDate = details.publishedDate;
                await randomSleep(2000, 5000);
                await crawler.goBack();
              } catch (detailErr) {
                console.error(`[cycle] error fetching listing details for ${listing.itemId}:`, detailErr);
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

    const stats = await storage.getStats();
    console.log(
      `[cycle] done: ${totalPages} pages, ${totalListings} listings, ${totalAlerts} alerts | DB: ${stats.total} total (${stats.private} private, ${stats.brokers} brokers)`
    );
  } catch (err) {
    console.error("[cycle] crawl error:", err);
  } finally {
    await crawler.close();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  console.log(`[main] search URLs: ${config.searchUrls.length}`);
  console.log(`[main] crawl interval: ${config.crawlIntervalMinMin}-${config.crawlIntervalMaxMin} minutes`);
  console.log(`[main] crawl once: ${config.crawlOnce}`);
  console.log(`[main] headless: ${config.headless}`);

  const storage = new Storage(config);
  await storage.connect();
  console.log("[main] connected to MongoDB");

  const alerters = createAlerters(config);

  const shutdown = async () => {
    console.log("\n[main] shutting down gracefully...");
    shuttingDown = true;
    await storage.close();
    console.log("[main] storage closed, exiting");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (config.crawlOnce) {
    await runCrawlCycle(config, storage, alerters);
    await storage.close();
    return;
  }

  while (!shuttingDown) {
    await runCrawlCycle(config, storage, alerters);

    if (shuttingDown) break;

    const sleepMs = randomInt(config.crawlIntervalMinMin * 60, config.crawlIntervalMaxMin * 60) * 1000;
    const sleepUntil = new Date(Date.now() + sleepMs);
    console.log(`[main] sleeping until ${formatTime(sleepUntil)} (${Math.round(sleepMs / 1000)}s)`);

    const sleepEnd = Date.now() + sleepMs;
    while (Date.now() < sleepEnd && !shuttingDown) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

main();
