# Gramalyzer admin workspace

A responsive channel overview, posting schedule, and bot settings interface for [GramalyzerBot](https://github.com/Halty323/GramalyzerBot). React talks to the **Spring backend inside GramalyzerBot**; the Telegram consumer, posting worker, and website share the same services and database. There is no separate Express backend.

## Development

The website and backend are two repositories. Clone both, keeping the checkouts beside one another. From the directory where you keep projects (for example, `~/Documents`):

```sh
git clone https://github.com/Halty323/GramalyzerVibe.git
git clone https://github.com/Halty323/GramalyzerBot.git
cd GramalyzerVibe
npm ci
npm run dev
```

Both repositories' `main` branches now include the shared-backend implementation. If you already cloned the admin panel, only clone the missing bot repository. If your existing bot checkout has `src.zip` but no `pom.xml`, update that checkout with `git pull --ff-only origin main`; do not extract the original archive over the new source.

The resulting layout is:

```text
Documents/
├── GramalyzerVibe/   # React UI, development launcher, browser tests
└── GramalyzerBot/    # Java/Spring API; contains pom.xml
```

Requirements: Node.js 24+, a full JDK 21, and Maven 3.9+. The cloud environment includes verified JDK/Maven distributions under `/workspace/tools`. `scripts/backend.ts` finds them, configures the provided HTTPS proxy for Maven, and preserves the system TLS trust store. On another machine it uses your local Maven/JDK. Override locations using `GRAMALYZER_BOT_DIR`, `MAVEN_BIN`, or `GRAMALYZER_JAVA_HOME`.

If the backend is somewhere else, supply its absolute directory, not the path to `pom.xml`:

```sh
GRAMALYZER_BOT_DIR=/absolute/path/to/GramalyzerBot npm run dev
```

**“GramalyzerBot backend was not found”** means the launcher could not find `pom.xml` in the expected backend directory. The error prints that exact path and the clone/update command. Node.js 24 satisfies the frontend requirement; installing npm packages does not download the separate Java repository.

This starts Vite on port 5173 and Spring on port 8080. `/api` requests proxy to Spring. Development always selects the `demo` profile, which seeds sample channels and posts once into `GramalyzerBot/.data/demo.mv.db`. Telegram polling and delivery are disabled in that profile, even if credentials exist. Drafts, settings, schedules, and API authentication are real backend features; sample analytics are labeled.

```sh
npm run build       # Type-check and build the UI
npm test            # Java integration/context tests
npm run test:e2e    # Chromium browser flows, including mobile
npm run build:api   # Build the executable Spring jar
```

The browser tests use `/usr/bin/chromium` in this cloud environment; set `CHROMIUM_PATH` for another installation. Tests create/remove a post and change/restore settings; run against the demo workspace. The original SQLite sample database from the initial UI prototype is preserved under `.data/` but is no longer used or migrated automatically.

## Shared backend

The API and domain code live in `GramalyzerBot/src/main/java/com/halty/gramalyzerbot/workspace/`. `WorkspaceService` owns validation and settings; `WorkspaceStore` persists them. `TelegramBot` feeds membership and channel-post updates into those services. `PostingWorker` reads the same saved queue and settings.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Readiness, demo status, backend identity |
| `POST /api/login` | Exchange the workspace token for an HttpOnly session |
| `GET /api/workspace` | Channels, posts, observed subscriber history, delivery configuration |
| `PATCH /api/channels/:id` | Partial update of editable settings |
| `POST /api/posts` | Create a draft or future scheduled text post |
| `PATCH /api/posts/:id` | Replace editable post fields; requires the full post input |
| `DELETE /api/posts/:id` | Remove an unsent post |
| `GET /api/channels/:id/insights` | The bot's analysis for one channel: best times, upcoming good slots, weekly heatmap, what content resonates, top posts (`ChannelInsights` in `shared/types.ts`). `status` is `ready`, `learning` (under 20 usable posts) or `not_connected`. Demo channels get sample analytics. |

Outside demo mode, requests require a browser session or `Authorization: Bearer <GRAMALYZER_API_TOKEN>`. Sessions last eight hours and reset when Spring restarts. This is a single administrative workspace with a shared access token; individual Telegram sign-in and channel-scoped moderator roles remain future work.

The worker atomically claims due posts, honors paused queues, appends channel signatures, and records Telegram message IDs. It disables network-level automatic retries. Definite rejections can be corrected and rescheduled; timeouts, interrupted deliveries, and uncertain server errors are held for manual review to avoid blind duplicate sends. Only run one active bot/worker instance during this initial rollout. It supports text posts; media attachments are not yet implemented.

## Live configuration

The supplied source archive contained a hardcoded Telegram token. **Revoke it with BotFather and provide a replacement securely.** The extracted `application.yml` has no credential defaults. The original committed archive and its Git history still contain the old credential; changing the extracted file does not revoke it.

Configure the runtime securely with:

- `GRAMALYZER_API_TOKEN`: a strong, random workspace login token; never a frontend build variable.
- `TELEGRAM_BOT_TOKEN`: the rotated BotFather token.
- `TELEGRAM_BOT_ENABLED=true`: opt into polling and scheduled delivery only when ready.
- `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`: the existing PostgreSQL database when connecting live data.

Then build the UI and run Spring without the demo profile using `npm start`. By default Spring also serves `../GramalyzerVibe/dist/`, so the website and API share an origin. `GRAMALYZER_WEB_ROOT` can point to another `file:/absolute/path/dist/` directory. Use an HTTPS reverse proxy; keep `HOST` at its default `127.0.0.1` unless your deployment requires otherwise. Set `GRAMALYZER_API_ORIGIN` only when developing against a backend at another address.

The local non-demo default is an isolated H2 database at `GramalyzerBot/.data/gramalyzer.mv.db`; production should explicitly use your PostgreSQL connection. Flyway retains the archived users migration and adds workspace tables without removing user data. H2 and PostgreSQL are supported by the SQL; PostgreSQL deployment against your existing database has not been exercised here.

Add the bot as a channel administrator with posting permission. Telegram membership updates register channels in the workspace. The backend collects current subscriber counts and one observation per UTC day; it records channel posts and delivery receipts. Charts use observed data in live mode, rather than generated sample history. The Telegram Bot API does not expose historical post view counts; the UI and exports mark those metrics unavailable until another supported analytics source is integrated. The interface refreshes workspace data every 15 seconds while visible.

Delivery notifications and service-message cleanup are explicitly marked planned; they need recipient/housekeeping policy before activation. No live Telegram requests or messages were sent during development. The rotated token, actual PostgreSQL connection, and controlled live-channel check are still required to validate your deployment.
