import type { Page } from "playwright";
import type { ParsedListing } from "./types";
import { parsePrice, extractItemId } from "./utils";

export async function parseListingDetails(
  page: Page
): Promise<{ viewCount?: number; daysListed?: number; publishedDate?: string }> {
  const result: { viewCount?: number; daysListed?: number; publishedDate?: string } = {};

  try {
    const banner = await page.$(
      'div[class*="ad-seen-count-banner_adAttractivenessBox"]'
    );
    if (banner) {
      const text = (await banner.textContent()) ?? "";
      const match = text.match(/(\d+)\s*פעמים\s*ב-\s*(\d+)\s*ימים/);
      if (match) {
        result.viewCount = parseInt(match[1], 10);
        result.daysListed = parseInt(match[2], 10);
      }
    }

    const dateEl = await page.$('span[class*="report-ad_createdAt"]');
    if (dateEl) {
      const dateText = (await dateEl.textContent()) ?? "";
      const dateMatch = dateText.match(/(\d{2}\/\d{2}\/\d{2})/);
      if (dateMatch) {
        result.publishedDate = dateMatch[1];
      }
    }
  } catch (err) {
    console.error("[parser] error parsing listing details:", err);
  }

  return result;
}

const LISTING_SELECTOR = [
  'li[data-testid="platinum-item"]',
  'li[data-testid="item-basic"]',
  'li[data-testid="booster-item"]',
  'li[data-testid="agency-item"]',
].join(",");

const BASE_URL = "https://www.yad2.co.il";

export async function parseListings(page: Page): Promise<ParsedListing[]> {
  const rawItems = await page.$$eval(
    LISTING_SELECTOR,
    (elements, baseUrl) => {
      return elements.map((el) => {
        const linkEl = el.querySelector<HTMLAnchorElement>(
          "a[href*='/realestate/item/']"
        );
        const href = linkEl?.getAttribute("href") ?? "";

        const priceText =
          el.querySelector('[data-testid="price"]')?.textContent?.trim() ?? "";

        const street =
          el
            .querySelector('[data-testid="street-name"]')
            ?.textContent?.trim() ?? "";

        const infoLine1 =
          el
            .querySelector('[data-testid="item-info-line-1st"]')
            ?.textContent?.trim() ?? "";

        const infoLine2 =
          el
            .querySelector('[data-testid="item-info-line-2nd"]')
            ?.textContent?.trim() ?? "";

        const brokerSpan = el.querySelector<HTMLSpanElement>(
          "span[class*='abovePrice']"
        );
        const brokerText = brokerSpan?.textContent?.trim() ?? "";

        const testId = el.getAttribute("data-testid") ?? "";

        const hasPriceDrop =
          el.querySelector('[data-testid="ribbon-text-tag"]') !== null;

        const imgEl = el.querySelector<HTMLImageElement>('img[data-testid="image"]');
        const imageUrl = imgEl?.getAttribute("src") ?? "";

        const fullUrl = href ? baseUrl + href.split("?")[0] : "";

        return {
          href,
          priceText,
          street,
          infoLine1,
          infoLine2,
          brokerText,
          testId,
          hasPriceDrop,
          imageUrl,
          fullUrl,
        };
      });
    },
    BASE_URL
  );

  return rawItems
    .filter((item) => item.href)
    .map((item): ParsedListing => {
      return {
        itemId: extractItemId(item.href),
        street: item.street,
        infoLine1: item.infoLine1,
        infoLine2: item.infoLine2,
        price: parsePrice(item.priceText),
        priceText: item.priceText,
        isBroker: item.testId === "agency-item" || item.brokerText.length > 0,
        brokerText: item.brokerText,
        imageUrl: item.imageUrl || undefined,
        listingUrl: item.fullUrl,
        hasPriceDrop: item.hasPriceDrop,
      };
    });
}
