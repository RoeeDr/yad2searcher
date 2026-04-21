import { AlertPayload, AlertType, AppConfig, FieldChange } from "./types";
import { geocodeAddress } from "./geocode";

export interface Alerter {
  alert(payload: AlertPayload): Promise<void>;
  notifyError(message: string): Promise<void>;
}

function parseInfoLine2(line: string): { rooms: string; floor: string; sqm: string } {
  const parts = line.split("•").map((p) => p.trim());
  return {
    rooms: parts[0] || "",
    floor: parts[1] || "",
    sqm: parts[2] || "",
  };
}

// RTL mark to force right-to-left display for price text
const RTL = "\u200F";

export class TerminalAlerter implements Alerter {
  async notifyError(message: string): Promise<void> {
    console.error(`[alert] ❌ ${message}`);
  }

  async alert(payload: AlertPayload): Promise<void> {
    const { type, listing, previousPrice, changes } = payload;
    const separator = "═".repeat(60);
    const { rooms, floor, sqm } = parseInfoLine2(listing.infoLine2);

    console.log(separator);

    if (type === AlertType.NEW_LISTING) {
      console.log("🆕 דירה חדשה!");
    } else if (type === AlertType.PRICE_CHANGE) {
      if (previousPrice !== undefined && listing.price < previousPrice) {
        console.log("📉 ירידת מחיר!");
      } else {
        console.log("📈 עליית מחיר!");
      }
      if (previousPrice !== undefined) {
        console.log(`${RTL}מחיר קודם: ${previousPrice.toLocaleString()} ₪`);
      }
    } else if (type === AlertType.LISTING_UPDATED) {
      console.log("🟠 עדכון מודעה!");
    }

    console.log(`${RTL}💰 ${listing.price.toLocaleString()} ₪`);
    console.log(`📍 ${listing.street}`);
    console.log(`📋 ${listing.infoLine1}`);
    if (rooms) console.log(`🛏️ ${rooms}`);
    if (floor) console.log(`🏢 ${floor}`);
    if (sqm) console.log(`📐 ${sqm}`);

    console.log(listing.isBroker ? "🔑 תיווך" : "🏠 פרטי");

    console.log(listing.hasBalcony === undefined ? "⚪ מרפסת - לא צוין" : listing.hasBalcony ? "🌇 מרפסת" : "❌ מרפסת");
    console.log(listing.hasElevator === undefined ? "⚪ מעלית - לא צוין" : listing.hasElevator ? "🛗 מעלית" : "❌ מעלית");
    console.log(listing.hasShelter === undefined ? "⚪ ממ״ד - לא צוין" : listing.hasShelter ? "🛡️ ממ״ד" : "❌ ממ״ד");

    if (listing.publisherName) {
      console.log(`👤 ${listing.publisherName}`);
    }
    if (listing.phoneNumber) {
      console.log(`📞 ${listing.phoneNumber}`);
    }

    if (listing.publishedDate) {
      console.log(`📅 פורסם ב-${listing.publishedDate}`);
    }
    if (listing.viewCount !== undefined) {
      console.log(`👁️ נצפתה ${listing.viewCount} פעמים ב-${listing.daysListed} ימים`);
    }

    if (type !== AlertType.NEW_LISTING && changes && changes.length > 0) {
      console.log("📋 שינויים:");
      formatChangesTerminal(changes);
    }

    console.log(`🔗 ${listing.listingUrl}`);
    console.log(separator);
  }
}

function formatChangesTerminal(changes: FieldChange[]): void {
  for (const c of changes) {
    if (c.field === "תיאור") {
      console.log(`  • ${c.field}:`);
      console.log(`    לפני: ${c.oldValue}`);
      console.log(`    אחרי: ${c.newValue}`);
    } else {
      console.log(`  • ${c.field}: ${c.oldValue} → ${c.newValue}`);
    }
  }
}

function formatChangesTelegram(changes: FieldChange[]): string {
  const lines: string[] = [];
  for (const c of changes) {
    if (c.field === "תיאור") {
      lines.push(`  • ${c.field}:`);
      lines.push(`    לפני: ${c.oldValue}`);
      lines.push(`    אחרי: ${c.newValue}`);
    } else {
      lines.push(`  • ${c.field}: ${c.oldValue} → ${c.newValue}`);
    }
  }
  return lines.join("\n");
}

export class TelegramAlerter implements Alerter {
  private botToken: string;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  async notifyError(message: string): Promise<void> {
    const baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    await this.sendTextMessage(baseUrl, `❌ ${message}`);
  }

  async alert(payload: AlertPayload): Promise<void> {
    const { type, listing, previousPrice, changes } = payload;
    const { rooms, floor, sqm } = parseInfoLine2(listing.infoLine2);

    let header: string;
    if (type === AlertType.NEW_LISTING) {
      header = "🆕 *דירה חדשה!*";
    } else if (type === AlertType.LISTING_UPDATED) {
      header = "🟠 *עדכון מודעה!*";
    } else if (
      previousPrice !== undefined &&
      listing.price < previousPrice
    ) {
      header = `📉 *ירידת מחיר!*\n${RTL}מחיר קודם: ${previousPrice.toLocaleString()} ₪`;
    } else {
      header = `📈 *עליית מחיר!*\n${RTL}מחיר קודם: ${previousPrice?.toLocaleString()} ₪`;
    }

    const lines = [
      header,
      "",
      `${RTL}💰 ${listing.price.toLocaleString()} ₪`,
      `📍 ${listing.street}`,
      `📋 ${listing.infoLine1}`,
    ];
    if (rooms) lines.push(`🛏️ ${rooms}`);
    if (floor) lines.push(`🏢 ${floor}`);
    if (sqm) lines.push(`📐 ${sqm}`);
    lines.push(listing.isBroker ? "🔑 תיווך" : "🏠 פרטי");
    lines.push(listing.hasBalcony === undefined ? "⚪ מרפסת - לא צוין" : listing.hasBalcony ? "🌇 מרפסת" : "❌ מרפסת");
    lines.push(listing.hasElevator === undefined ? "⚪ מעלית - לא צוין" : listing.hasElevator ? "🛗 מעלית" : "❌ מעלית");
    lines.push(listing.hasShelter === undefined ? "⚪ ממ״ד - לא צוין" : listing.hasShelter ? "🛡️ ממ״ד" : "❌ ממ״ד");
    if (listing.publisherName) {
      lines.push(`👤 ${listing.publisherName}`);
    }
    if (listing.phoneNumber) {
      lines.push(`📞 ${listing.phoneNumber}`);
    }
    if (listing.publishedDate) {
      lines.push(`📅 פורסם ב-${listing.publishedDate}`);
    }
    if (listing.viewCount !== undefined) {
      lines.push(`👁️ נצפתה ${listing.viewCount} פעמים ב-${listing.daysListed} ימים`);
    }
    if (type !== AlertType.NEW_LISTING && changes && changes.length > 0) {
      lines.push("", "📋 שינויים:", formatChangesTelegram(changes));
    }
    lines.push("", `🔗 [לצפייה במודעה](${listing.listingUrl})`);

    const caption = lines.join("\n");
    const baseUrl = `https://api.telegram.org/bot${this.botToken}`;

    const allImages = listing.imageUrls ?? (listing.imageUrl ? [listing.imageUrl] : []);

    // Geocode for location pin (sent after photos)
    const geo = await geocodeAddress(listing.street, listing.infoLine1);

    if (allImages.length >= 2) {
      // sendMediaGroup captions are limited to 1024 chars.
      // If caption fits, attach it to the first photo.
      // Otherwise, send album without caption + separate text message.
      const captionFits = caption.length <= 1024;

      const media = allImages.slice(0, 10).map((url, i) => ({
        type: "photo" as const,
        media: url,
        ...(i === 0 && captionFits ? { caption, parse_mode: "Markdown" as const } : {}),
      }));

      const response = await fetch(`${baseUrl}/sendMediaGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, media }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`Telegram API error (sendMediaGroup): ${response.status} - ${body}`);
      }

      // Send caption as separate message if it didn't fit or album failed
      if (!captionFits || !response.ok) {
        await this.sendTextMessage(baseUrl, caption);
      }
    } else if (allImages.length === 1) {
      if (caption.length <= 1024) {
        await this.sendSinglePhoto(baseUrl, allImages[0], caption);
      } else {
        await this.sendSinglePhoto(baseUrl, allImages[0]);
        await this.sendTextMessage(baseUrl, caption);
      }
    } else {
      await this.sendTextMessage(baseUrl, caption);
    }

    // Send location pin after the alert
    if (geo) {
      await this.sendLocation(baseUrl, geo.lat, geo.lng);
    }
  }

  private async sendSinglePhoto(
    baseUrl: string,
    photo: string,
    caption?: string
  ): Promise<void> {
    const response = await fetch(`${baseUrl}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        photo,
        ...(caption ? { caption, parse_mode: "Markdown" } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error: ${response.status} - ${body}`);
    }
  }

  private async sendLocation(
    baseUrl: string,
    latitude: number,
    longitude: number
  ): Promise<void> {
    const response = await fetch(`${baseUrl}/sendLocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        latitude,
        longitude,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error (sendLocation): ${response.status} - ${body}`);
    }
  }

  private async sendTextMessage(
    baseUrl: string,
    text: string
  ): Promise<void> {
    const response = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram API error: ${response.status} - ${body}`);
    }
  }
}

export function createAlerters(config: AppConfig): Alerter[] {
  const alerters: Alerter[] = [new TerminalAlerter()];

  if (config.telegramBotToken && config.telegramChatId) {
    alerters.push(
      new TelegramAlerter(config.telegramBotToken, config.telegramChatId)
    );
    console.log("Telegram alerter enabled");
  }

  return alerters;
}
