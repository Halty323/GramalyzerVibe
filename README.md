# Gramalyzer admin workspace

A responsive channel overview, posting schedule, channel viewer, public-channel watchlist, and bot settings interface for [GramalyzerBot](https://github.com/Halty323/GramalyzerBot), in light and dark themes and 12 languages. React talks to the **Spring backend inside GramalyzerBot**; the Telegram consumer, posting worker, and website share the same services and database. There is no separate Express backend.

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
npm test            # Launcher and translation checks, then the Java tests
npm run test:i18n   # Every language has every key, placeholder and plural form
npm run test:ai     # AI streaming, planner parsing and prompts
npm run test:e2e    # Chromium browser flows, including mobile
npm run build:api   # Build the executable Spring jar
```

The browser tests use `/usr/bin/chromium` in this cloud environment; set `CHROMIUM_PATH` for another installation. Tests create/remove a post, change/restore settings, remove and re-add a demo channel on the watchlist, and switch theme and language; run them against the demo workspace. The original SQLite sample database from the initial UI prototype is preserved under `.data/` but is no longer used or migrated automatically.

## Channel viewer and watchlist

**Channel viewer** shows any channel the way Telegram does: a chat list on the left (your channels and watched ones, plus a search box that also takes any public `@username` or `t.me` link), the channel's posts as message bubbles with views, reactions, comments and forwards, and an info panel with statistics: subscribers and their 7/30-day change, average views, ER (average views ÷ subscribers), reactions per 100 views, posts a day, posting hours and weekdays, content mix, popular hashtags and the most viewed posts. Your own channels can also show their scheduled queue; clicking a scheduled post edits it.

**Watchlist** keeps public channels you don't run in one sortable table, with highlights for the fastest growing, most engaging and most active. Adding one needs only its username: no admin rights, and the bot doesn't join. The numbers come from the channel's public `t.me/s/<username>` page, which is what Telegram shows anyone without logging in, so channels with that preview turned off show only their size. The backend refreshes watched channels every couple of hours and keeps a daily subscriber history from the day a channel is first watched. The bot has the same watchlist for each person in Telegram (`/track`, `/watchlist`).

## AI writing

The AI tools from Gramalyzer Studio work here too, on any OpenAI-compatible provider. **Settings → AI writing** picks one (Groq, Google Gemini, OpenRouter, Cerebras, Mistral and GitHub Models have free keys; Ollama runs locally; any other compatible endpoint works), and can load the provider's model list and test the connection. The key stays in this browser or phone; requests go straight from it to the provider, not through the Gramalyzer server. On the website that means the provider must accept requests from browsers (CORS): one that doesn't shows “Couldn’t reach the AI provider”, and Ollama needs `OLLAMA_ORIGINS` set to the site's address. The phone and desktop app have no such limit.

- **Copilot** in the post editor drafts a post from a brief, or improves, shortens, expands, fixes, retones, translates the text, suggests a hook, hashtags or titles.
- **AI planner** on the Schedule writes the next few posts in full for the channel's best upcoming times, to review and save as drafts.
- **Assistant** is a chat that knows the channel's analytics, queue and watchlist; any answer opens as a new post.
- **AI review** on Insights, **AI breakdown** of any channel in the viewer, and **Compare with AI** on the watchlist.

Every prompt carries the channel's description, its most engaging and newest posts, its house style (length, emoji, hashtags), what Insights says works, and the brand voice from settings, so drafts stay on the channel's subject. Prompts live in `src/ai/prompts.ts`, a port of Studio's `desktop/src/prompts.rs`; change both together.

## Phone app (Android and iOS)

The same interface ships as a phone app built with [Tauri 2](https://v2.tauri.app) (`src-tauri/`). It opens to a sign-in screen that asks for the Gramalyzer server's address and its API token (`GRAMALYZER_API_TOKEN`, which the server needs anyway once it is public), then works like the website: the app sends the token with every request, so the server needs no changes. Outside links open in the phone's browser.

**Getting the app.** GitHub Actions (`.github/workflows/mobile.yml`) builds both on every pull request that touches the app and on `main`; download them from the run's **Artifacts**. Pushing a tag such as `app-v0.1.0` also attaches them to a GitHub release.

- **Android:** `Gramalyzer-<version>.apk`. Open it on the phone and allow installing from that app when asked. To let new builds update an installed one, the APKs must share a signing key: create one with `keytool -genkeypair -keystore release.jks -alias gramalyzer -keyalg RSA -keysize 2048 -validity 10000` and add the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`. Without them each build is signed with a one-off key.
- **iOS:** `Gramalyzer-<version>-unsigned.ipa`. Apple only installs signed apps, so sign it on install with [AltStore](https://altstore.io) or [Sideloadly](https://sideloadly.io) and a free Apple ID (such installs last 7 days), or build it signed from a Mac with an Apple developer account.

**Building locally.** The app needs Rust and the Tauri prerequisites for the platform ([Android](https://v2.tauri.app/start/prerequisites/#android): Android Studio, the NDK and `NDK_HOME`; [iOS](https://v2.tauri.app/start/prerequisites/#ios): a Mac with Xcode). The Android and iOS projects are generated, not committed:

```sh
npx tauri android init            # once; then copy src-tauri/icons/android into gen/android/app/src/main/res
npm run app:android               # run on a connected phone or emulator, with hot reload
npx tauri android build --apk     # release APK in src-tauri/gen/android/app/build/outputs/apk

npx tauri ios init                # once, on a Mac; then copy src-tauri/icons/ios/*.png into gen/apple/Assets.xcassets/AppIcon.appiconset
npm run app:ios                   # run in the simulator or on a phone
npm run app:dev                   # the desktop app (Windows, macOS, Linux)
```

During development the app loads the Vite dev server, so changes show at once; point it at a backend your phone can reach (for `npm run dev`, your computer's LAN address and port 8080). App icons are drawn in `src-tauri/icons/source/` (`npx tauri icon src-tauri/icons/source/icons.json` regenerates them; the iOS set comes from `ios.svg`). Inside the app, `src/platform.ts` sends requests through Tauri's HTTP client instead of the browser's, which removes CORS and lets one build talk to any server and AI provider.

## Themes and languages

The theme follows the system until someone picks one with the sun/moon button; the choice is remembered and applied before the first paint. Colors are `light-dark()` pairs switched by `color-scheme` on `<html data-theme>`, so this needs a 2024-or-newer browser (Chrome 123, Safari 17.5, Firefox 120). Animations are skipped under `prefers-reduced-motion`.

The interface speaks English, Russian, Ukrainian, Hindi, Indonesian, Portuguese (Brazil), Spanish, Arabic, Persian, Uzbek, Turkish and Vietnamese: the languages Telegram is used in most, matching the bot. It starts in the browser's language (Belarusian, Kazakh, Kyrgyz and Tajik get Russian, Malay gets Indonesian) and the language menu beside the theme button changes it. Arabic and Persian switch the layout to right-to-left. Numbers, dates and relative times use `Intl` in the chosen language.

Strings live in `src/locales/<code>.ts`; `en.ts` is the source and the list of keys, and TypeScript rejects a locale that misses one. Placeholders look like `{name}`. Counted phrases are objects with one entry per `Intl.PluralRules` category the language uses (`one`/`other` in English, `one`/`few`/`many`/`other` in Russian and Ukrainian, six in Arabic). `npm run test:i18n` checks all of that.

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
| `GET /api/channels/:id/feed?tz=` | One of your channels for the viewer: posts (from its public page when it has one, otherwise what the bot collected or Gramalyzer sent), the scheduled queue, and stats when known (`ChannelFeed`) |
| `GET /api/channels/:id/photo` | The channel's Telegram profile photo, fetched by the bot (404 when it has none or the bot hasn't seen the channel yet; the avatar then shows initials) |
| `GET /api/tracked?tz=` | The website's watchlist (`TrackedSummary[]`) |
| `POST /api/tracked` | `{"username": "@name"}` or a `t.me` link: add a public channel, returns `TrackedDetail` |
| `GET /api/tracked/:username?tz=` | Any public channel, watched or not: info, stats, top and latest posts (`TrackedDetail`) |
| `POST /api/tracked/:username/refresh` | Fetch it again now |
| `DELETE /api/tracked/:username` | Remove it from the watchlist |
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
