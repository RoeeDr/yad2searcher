export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomSleep(minMs: number, maxMs: number): Promise<void> {
  const ms = randomInt(minMs, maxMs);
  console.log(`  [anti-bot] sleeping ${ms}ms`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

export function randomUserAgent(): string {
  return USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)];
}

export function randomViewport(): { width: number; height: number } {
  const widths = [1366, 1440, 1536, 1920];
  const heights = [768, 900, 864, 1080];
  const idx = randomInt(0, widths.length - 1);
  return {
    width: widths[idx] + randomInt(-20, 20),
    height: heights[idx] + randomInt(-20, 20),
  };
}

export function parsePrice(priceText: string): number {
  const cleaned = priceText.replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
}

export function extractItemId(href: string): string {
  const match = href.match(/\/realestate\/item\/[^/]+\/([^?/]+)/);
  return match ? match[1] : href;
}

export function formatTime(date: Date = new Date()): string {
  return date.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
}
