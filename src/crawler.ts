import path from "path";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page } from "playwright";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { AppConfig } from "./types";
import { randomUserAgent, randomViewport, randomSleep, randomInt } from "./utils";

chromium.use(StealthPlugin());

export class Crawler {
  private config: AppConfig;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    const fs = await import("fs");
    fs.mkdirSync(this.config.browserDataDir, { recursive: true });

    this.context = await chromium.launchPersistentContext(this.config.browserDataDir, {
      headless: this.config.headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
      userAgent: randomUserAgent(),
      viewport: randomViewport(),
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
      geolocation: { latitude: 32.08, longitude: 34.78 },
      permissions: ["geolocation"],
      extraHTTPHeaders: {
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    // Inject anti-detection scripts before any page loads
    await this.context.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });

      // Realistic plugins array
      Object.defineProperty(navigator, "plugins", {
        get: () => {
          const plugins = [
            { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
            { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
            { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
          ];
          (plugins as any).length = 3;
          return plugins;
        },
      });

      // Realistic languages
      Object.defineProperty(navigator, "languages", { get: () => ["he-IL", "he", "en-US", "en"] });

      // Chrome runtime
      (window as any).chrome = {
        runtime: {
          connect: () => {},
          sendMessage: () => {},
        },
      };

      // Permissions API
      const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (parameters: any) => {
        if (parameters.name === "notifications") {
          return Promise.resolve({ state: Notification.permission } as PermissionStatus);
        }
        return originalQuery(parameters);
      };
    });

    this.page = this.context.pages()[0] || await this.context.newPage();

    console.log("[crawler] browser launched with anti-detection measures");
  }

  async navigateToSearch(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }

    const maxRetries = 4;
    // Backoff: 30s, 60s, 120s, then give up
    const backoffMs = [30_000, 60_000, 120_000];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[crawler] navigating to: ${url} (attempt ${attempt}/${maxRetries})`);
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      try {
        await this.page.waitForSelector('ul[data-testid="feed-list"]', { timeout: 20000 });
        await this.performMouseMovements();
        console.log("[crawler] search page loaded successfully");
        return;
      } catch {
        const screenshotPath = path.join(process.cwd(), `debug-attempt-${attempt}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        const pageTitle = await this.page.title().catch(() => "unknown");
        const isCaptcha = pageTitle.toLowerCase().includes("captcha") || pageTitle.includes("ShieldSquare");
        console.warn(`[crawler] feed list not found (attempt ${attempt}/${maxRetries}) — ${isCaptcha ? "CAPTCHA detected" : `page: "${pageTitle}"`}`);
        console.warn(`[crawler] screenshot saved to: ${screenshotPath}`);

        if (attempt < maxRetries) {
          const waitMs = backoffMs[attempt - 1];
          console.log(`[crawler] backing off ${waitMs / 1000}s before retry...`);
          await new Promise((r) => setTimeout(r, waitMs));
          await this.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        }
      }
    }

    // CAPTCHA persists across runs via the browser profile — wipe it so the next run starts clean
    const fs = await import("fs");
    fs.rmSync(this.config.browserDataDir, { recursive: true, force: true });
    console.warn(`[crawler] cleared browser data at ${this.config.browserDataDir} to reset CAPTCHA state`);

    throw new Error("Failed to load feed list after all retries — possible anti-bot block. Browser data has been cleared for next run.");
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.page;
  }

  async goToNextPage(): Promise<boolean> {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }

    const nextButton = await this.page.$('a[aria-label="עמוד הבא"]');
    if (!nextButton) {
      console.log("[crawler] no next page button found");
      return false;
    }

    // Check if the button is actually enabled (disabled on last page)
    const isDisabled = await nextButton.evaluate(
      (el) => el.hasAttribute("aria-disabled") || el.classList.contains("disabled") || (el as HTMLButtonElement).disabled
    );
    if (isDisabled) {
      console.log("[crawler] next page button is disabled (last page)");
      return false;
    }

    // Also check the current page text to detect last page
    const paginationText = await this.page.$eval(
      'span[class*="textVariant"]',
      (el) => el.textContent || ""
    ).catch(() => "");
    const pageMatch = paginationText.match(/(\d+)\s+מתוך\s+(\d+)/);
    if (pageMatch && pageMatch[1] === pageMatch[2]) {
      console.log("[crawler] already on last page");
      return false;
    }

    await this.performMouseMovements();
    await nextButton.click();
    await this.page.waitForSelector('ul[data-testid="feed-list"]', { timeout: 15000 });
    await randomSleep(this.config.minPageDelay, this.config.maxPageDelay);
    await this.performMouseMovements();

    console.log("[crawler] navigated to next page");
    return true;
  }

  async performMouseMovements(): Promise<void> {
    if (!this.page) {
      return;
    }

    const viewport = this.page.viewportSize();
    if (!viewport) {
      return;
    }

    const moveCount = randomInt(3, 6);

    for (let i = 0; i < moveCount; i++) {
      const x = randomInt(0, viewport.width - 1);
      const y = randomInt(0, viewport.height - 1);
      await this.page.mouse.move(x, y, { steps: randomInt(5, 15) });
      await new Promise((r) => setTimeout(r, randomInt(100, 500)));
    }

    // Optional small scroll
    if (Math.random() > 0.5) {
      await this.page.mouse.wheel(0, randomInt(100, 300));
    }
  }

  async navigateToListing(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }

    console.log(`[crawler] navigating to listing: ${url}`);
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.page.waitForSelector('h1[data-testid="heading"]', { timeout: 10000 });
    await this.performMouseMovements();
    console.log("[crawler] listing page loaded successfully");
  }

  async goBack(): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }

    console.log("[crawler] going back to search results");
    await this.page.goBack({ waitUntil: "domcontentloaded" });
    await this.page.waitForSelector('ul[data-testid="feed-list"]', { timeout: 15000 });
    console.log("[crawler] back to search results");
  }

  async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        console.log("[crawler] browser closed");
      }
    } catch (error) {
      console.error("[crawler] error closing browser:", error);
    }
  }
}
