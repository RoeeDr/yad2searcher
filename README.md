# Yad2 Searcher

Automated apartment rental crawler for [Yad2](https://www.yad2.co.il). Monitors search results, detects new listings and price changes, and sends alerts via Telegram.

## Features

- Scrapes Yad2 rental listings with anti-bot evasion (stealth Playwright)
- Detects new listings, price changes, and listing updates
- Sends Telegram alerts with photos, location pins, and listing details
- Two modes: **static** (fixed URLs) and **dynamic** (users register URLs via Telegram bot)
- Stores listing history in MongoDB with automatic 30-day TTL

## Prerequisites

- Node.js 22+
- Docker (for MongoDB)

## Setup

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Start MongoDB

```bash
docker-compose up -d mongo
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your settings. At minimum, set `YAD2_SEARCH_URL` to your Yad2 search URL (copy it from the browser after applying your filters).

### 4. Telegram setup

#### Create a bot and get `TELEGRAM_BOT_TOKEN`

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to name your bot
3. BotFather will reply with a token like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz` — this is your `TELEGRAM_BOT_TOKEN`

#### Get your `TELEGRAM_CHAT_ID`

1. Send any message to your newly created bot
2. Open `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` in a browser
3. Find the `"chat":{"id": ...}` field in the JSON response — this number is your `TELEGRAM_CHAT_ID`

Add both values to your `.env` file.

## Usage

### Build

```bash
npm run build
```

### Run continuously

```bash
npm start
```

The crawler will run in a loop, sleeping 10-20 minutes (configurable) between cycles.


### Run with Docker

```bash
docker-compose up -d
```

## Configuration

All configuration is done via environment variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `APP_MODE` | `static` | `static` (URLs from env) or `dynamic` (URLs from Telegram users) |
| `YAD2_SEARCH_URL` | — | Yad2 search URL(s), comma-separated. Required in static mode |
| `CRAWL_INTERVAL_MIN_MINUTES` | `20` | Minimum minutes between crawl cycles |
| `CRAWL_INTERVAL_MAX_MINUTES` | `35` | Maximum minutes between crawl cycles |
| `CRAWL_ONCE` | `false` | Run one cycle and exit |
| `HEADLESS` | `true` | Run browser in headless mode |
| `FETCH_DETAILS` | `false` | Navigate to each listing page for phone number, description, and more |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token from BotFather |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID (static mode only) |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |

