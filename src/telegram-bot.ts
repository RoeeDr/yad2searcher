import { Storage } from "./storage";
import { AppConfig } from "./types";

export class TelegramBot {
  private botToken: string;
  private storage: Storage;
  private offset: number = 0;
  private running: boolean = false;

  constructor(config: AppConfig, storage: Storage) {
    this.botToken = config.telegramBotToken!;
    this.storage = storage;
  }

  async start(): Promise<void> {
    this.running = true;
    console.log("[bot] Telegram bot started, listening for commands...");

    while (this.running) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          await this.handleUpdate(update);
          this.offset = update.update_id + 1;
        }
      } catch (err) {
        console.error("[bot] polling error:", err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async getUpdates(): Promise<any[]> {
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.offset}&timeout=30`;
    const response = await fetch(url);
    const data = await response.json();
    return data.result || [];
  }

  private async handleUpdate(update: any): Promise<void> {
    const message = update.message;
    if (!message?.text) return;

    const chatId = message.chat.id.toString();
    const text = message.text.trim();

    if (text === "/start" || text === "/help") {
      await this.handleHelp(chatId);
    } else if (text.startsWith("/add ")) {
      await this.handleAdd(chatId, text.slice(5).trim());
    } else if (text === "/list") {
      await this.handleList(chatId);
    } else if (text.startsWith("/remove ")) {
      await this.handleRemove(chatId, text.slice(8).trim());
    } else if (text === "/clear") {
      await this.handleClear(chatId);
    } else if (text === "/status") {
      await this.handleStatus(chatId);
    }
  }

  private async handleHelp(chatId: string): Promise<void> {
    const text = [
      "👋 Yad2 Searcher Bot",
      "",
      "Commands:",
      "/add <url> - Add a Yad2 search URL",
      "/list - Show your URLs",
      "/remove <n> - Remove URL by number",
      "/clear - Remove all your data",
      "/status - View your stats",
    ].join("\n");
    await this.sendMessage(chatId, text);
  }

  private async handleAdd(chatId: string, url: string): Promise<void> {
    if (!url.startsWith("https://www.yad2.co.il/")) {
      await this.sendMessage(chatId, "❌ URL must be a yad2.co.il URL");
      return;
    }

    const userUrlCount = await this.storage.getUserUrlCount(chatId);
    if (userUrlCount >= 3) {
      await this.sendMessage(chatId, "❌ You already have 3 URLs (max). Remove one first with /remove.");
      return;
    }

    const totalUrlCount = await this.storage.getTotalUrlCount();
    if (totalUrlCount >= 6) {
      await this.sendMessage(chatId, "❌ Global URL limit reached (6). Cannot add more URLs at this time.");
      return;
    }

    await this.storage.registerUrl(chatId, url);
    await this.sendMessage(chatId, "✅ URL added! Use /list to see all your URLs.");
  }

  private async handleList(chatId: string): Promise<void> {
    const urls = await this.storage.getUserUrls(chatId);
    if (urls.length === 0) {
      await this.sendMessage(chatId, "📋 No URLs registered. Use /add to add one.");
      return;
    }
    const lines = urls.map((url, i) => `${i + 1}. ${url}`);
    await this.sendMessage(chatId, `📋 Your URLs:\n\n${lines.join("\n")}`);
  }

  private async handleRemove(chatId: string, indexStr: string): Promise<void> {
    const index = parseInt(indexStr, 10) - 1;
    if (isNaN(index) || index < 0) {
      await this.sendMessage(
        chatId,
        "❌ Please provide a valid number. Use /list to see your URLs."
      );
      return;
    }
    const removed = await this.storage.removeUrl(chatId, index);
    if (!removed) {
      await this.sendMessage(
        chatId,
        "❌ Invalid URL number. Use /list to see your URLs."
      );
      return;
    }
    await this.sendMessage(chatId, `🗑️ Removed: ${removed}`);
  }

  private async handleClear(chatId: string): Promise<void> {
    await this.storage.clearUser(chatId);
    await this.sendMessage(chatId, "🧹 All your data has been cleared.");
  }

  private async handleStatus(chatId: string): Promise<void> {
    const urls = await this.storage.getUserUrls(chatId);
    const stats = await this.storage.getStats(chatId);
    await this.sendMessage(
      chatId,
      `📊 Status:\nURLs: ${urls.length}\nListings tracked: ${stats.total} (${stats.private} private, ${stats.brokers} brokers)`
    );
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`[bot] Telegram send error: ${response.status} - ${body}`);
    }
  }
}
