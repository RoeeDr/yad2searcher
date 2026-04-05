import { AlertPayload, AlertType, AppConfig } from "./types";

export interface Alerter {
  alert(payload: AlertPayload): Promise<void>;
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
  async alert(payload: AlertPayload): Promise<void> {
    const { type, listing, previousPrice } = payload;
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
    }

    console.log(`${RTL}💰 ${listing.price.toLocaleString()} ₪`);
    console.log(`📍 ${listing.street}`);
    console.log(`📋 ${listing.infoLine1}`);
    if (rooms) console.log(`🛏️ ${rooms}`);
    if (floor) console.log(`🏢 ${floor}`);
    if (sqm) console.log(`📐 ${sqm}`);

    console.log(listing.isBroker ? "🔑 תיווך" : "🏠 פרטי");

    if (listing.publishedDate) {
      console.log(`📅 פורסם ב-${listing.publishedDate}`);
    }
    if (listing.viewCount !== undefined) {
      console.log(`👁️ נצפתה ${listing.viewCount} פעמים ב-${listing.daysListed} ימים`);
    }

    console.log(`🔗 ${listing.listingUrl}`);
    console.log(separator);
  }
}

export class TelegramAlerter implements Alerter {
  private botToken: string;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  async alert(payload: AlertPayload): Promise<void> {
    const { type, listing, previousPrice } = payload;
    const { rooms, floor, sqm } = parseInfoLine2(listing.infoLine2);

    let header: string;
    if (type === AlertType.NEW_LISTING) {
      header = "🆕 *דירה חדשה!*";
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
    if (listing.publishedDate) {
      lines.push(`📅 פורסם ב-${listing.publishedDate}`);
    }
    if (listing.viewCount !== undefined) {
      lines.push(`👁️ נצפתה ${listing.viewCount} פעמים ב-${listing.daysListed} ימים`);
    }
    lines.push("", `🔗 [לצפייה במודעה](${listing.listingUrl})`);

    const caption = lines.join("\n");
    const baseUrl = `https://api.telegram.org/bot${this.botToken}`;

    let response: Response;

    if (listing.imageUrl) {
      response = await fetch(`${baseUrl}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          photo: listing.imageUrl,
          caption,
          parse_mode: "Markdown",
        }),
      });
    } else {
      response = await fetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: caption,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
      });
    }

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
