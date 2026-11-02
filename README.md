# Helixo Countdown Timer

Helixo Countdown Timer is an embedded Shopify app for creating fixed-date and evergreen countdown timers, placing them on product pages, and reviewing storefront impressions.

Merchants manage timers in the Shopify admin. The online store renders one Theme App Extension block. That block loads eligible timers through a signed Shopify App Proxy and records one impression when the timer becomes visible.

## Features

- Fixed timers with a start and end time.
- Evergreen timers that keep a per-browser deadline for a configured duration.
- Targeting for the whole catalog, selected products, or selected collections.
- Shopify Resource Picker for product and collection selection.
- Appearance controls for colors, size, position, and an optional urgency message.
- Product-page Theme App Extension.
- Signed App Proxy responses that include only the fields the storefront needs.
- Impression totals, per-timer totals, and daily counts in the timer manager.
- Shop-scoped admin APIs. A request without a session token receives HTTP 401.

## Tech stack

- Shopify CLI app, embedded in the Shopify admin.
- Node.js, TypeScript, and Express.
- React 18, Vite, React Router, React Query, Polaris, and App Bridge.
- MongoDB and Mongoose for timer and impression documents.
- SQLite for Shopify OAuth sessions.
- Preact and esbuild for the storefront widget.
- Shopify Admin GraphQL for collection membership on the storefront. Product and collection selection in the admin uses the Resource Picker.

## Architecture

```text
Shopify admin
  └─ embedded React app (/timers)
       └─ authenticated /api/timers and /api/analytics

Online store product page
  └─ Theme App Extension block
       └─ extensions/countdown-timer/assets/countdown-timer.js
            ├─ GET  /apps/helixo-countdown
            └─ POST /apps/helixo-countdown/impressions
                 └─ App Proxy → /api/storefront/timers
                      └─ MongoDB (helixo_countdown)
```

The widget source and its build script live in `countdown-timer/`, outside the theme extension. The build writes the production bundle to `extensions/countdown-timer/assets/countdown-timer.js`. The Liquid block references that filename.

Shopify session records stay in `web/database.sqlite`. Countdown documents stay in MongoDB. The App Proxy route is mounted before admin session authentication because Shopify signs those requests instead of sending an admin session token.

## Prerequisites

- Node.js 18 or newer. The web workspace declares `>=16.13.0`; the Docker image uses Node 18.
- npm workspaces.
- Shopify CLI.
- A Shopify Partner account and a development store.
- MongoDB reachable with a connection string.

## Local setup

From the repository root:

```shell
npm install
```

Create a gitignored `.env` in the repository root:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/helixo_countdown
```

The backend reads `MONGODB_URI` from the environment first. When the Shopify CLI starts the process with `web/` as the working directory and does not forward the variable, the backend also reads `.env` from `web/` and from the repository root.

Start the app:

```shell
npm run dev
```

The CLI supplies `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, and `HOST`, updates the app URL, and opens the development preview.

Install the app on the development store from that preview, then open **Countdown Timer Manager**.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. Required for timer and impression storage. |
| `SHOPIFY_API_KEY` | App client ID. The CLI sets this during `npm run dev`. A production frontend build fails without it. |
| `SHOPIFY_API_SECRET` | App secret used to verify OAuth and App Proxy signatures. The CLI sets this during development. |
| `SCOPES` | Admin scopes. This app requests `write_products`. |
| `HOST` | Public app URL assigned by the CLI. |
| `BACKEND_PORT` | Port the CLI expects the Express server to bind. The server listens on `127.0.0.1`. |
| `FRONTEND_PORT` | Vite port used by the CLI. |
| `PORT` | Fallback listen port when `BACKEND_PORT` is unset. Defaults to `3000`. |
| `NODE_ENV` | `development` or `production`. |

Do not commit `.env`. `.env` and `.env.*` are listed in `.gitignore`.

## Shopify development setup

`shopify.app.toml` configures:

- Embedded admin.
- Scope `write_products`.
- App Proxy prefix `apps`, subpath `helixo-countdown`, forwarding to `/api/storefront/timers`.
- Webhook API version `2027-01`.

On the development store:

1. Run `npm run dev` and install the app.
2. In **Countdown Timer Manager**, create a timer.
3. Open the theme editor for a product template.
4. Add the **Countdown Timer** app block.
5. Save the theme and open a product that matches the timer.

The block reserves its initial line of text so the page does not jump when the widget replaces the loading message.

## Database setup

Shopify OAuth sessions are stored in `web/database.sqlite`. The Shopify library creates that file on startup. It is listed in `.gitignore` and must stay uncommitted.

Timer and impression documents use MongoDB. Use any MongoDB server the app can reach. The local database name used during development is `helixo_countdown`.

Collections:

- `timers` — merchant timer configuration, including the shop domain.
- `timerimpressions` — one document per shop, timer, and UTC date.

The impression collection has a unique index on `shop`, `timerId`, and `date`. Increments use an atomic upsert.

## API documentation

Admin routes require the Shopify session token that App Bridge attaches inside the embedded app. The shop is taken from that session. Clients cannot choose the shop in the body.

Missing or invalid bearer tokens receive:

```json
{ "error": "Shop session is required" }
```

with HTTP 401. Responses do not include access tokens or exception text.

### Timers

`GET /api/timers`

Optional query: `enabled=true|false`, `type=FIXED|EVERGREEN`.

`POST /api/timers`

`GET /api/timers/:id`

`PATCH /api/timers/:id`

`DELETE /api/timers/:id`

A timer body includes:

| Field | Rules |
| --- | --- |
| `name` | Required on create. 1–120 characters. |
| `type` | `FIXED` or `EVERGREEN`. |
| `enabled` | Boolean. Defaults to `true`. |
| `startAt`, `endAt` | Required for `FIXED`. `endAt` must be later than `startAt`. |
| `durationSeconds` | Required positive integer for `EVERGREEN`. |
| `targeting.type` | `ALL`, `PRODUCTS`, or `COLLECTIONS`. |
| `targeting.productIds` | Required and non-empty when targeting products. |
| `targeting.collectionIds` | Required and non-empty when targeting collections. |
| `appearance.backgroundColor`, `appearance.textColor` | Hex colors. |
| `appearance.timerSize` | `SMALL`, `MEDIUM`, or `LARGE`. |
| `appearance.position` | `ABOVE_BUTTON`, `BELOW_PRICE`, or `BELOW_TITLE`. |
| `urgencyMessage` | Optional, up to 280 characters. |

`shop` cannot be set by the client. List, read, update, and delete queries include the session shop. Unknown IDs for another shop return 404.

### Impression analytics

`GET /api/analytics/impressions`

Optional `from` and `to` query values use `YYYY-MM-DD`. The default range is the last 30 UTC days, including today. An inverted or malformed range returns 400.

```json
{
  "from": "2026-10-03",
  "to": "2026-11-01",
  "totalImpressions": 12,
  "days": [{ "date": "2026-11-01", "impressions": 4 }],
  "timers": [{ "timerId": "…", "name": "Launch", "impressions": 12 }]
}
```

A deleted timer is labeled `Deleted timer`. Days with no impressions are omitted. Analytics errors stay inside the impressions card; the timer list still renders.

### Storefront App Proxy

Shopify forwards these paths to the app:

- `GET /apps/helixo-countdown` → `GET /api/storefront/timers`
- `POST /apps/helixo-countdown/impressions` → `POST /api/storefront/timers/impressions`

The shop and `product_id` must be in the signed query. Impression requests also include `timer_id` in that signed query. The handler does not accept shop ownership from a request body.

`GET` returns:

```json
{
  "timers": [
    {
      "id": "…",
      "type": "FIXED",
      "startAt": "2026-11-01T00:00:00.000Z",
      "endAt": "2026-11-02T00:00:00.000Z",
      "urgencyMessage": "Ends soon",
      "appearance": {
        "backgroundColor": "#111111",
        "textColor": "#eeeeee",
        "timerSize": "MEDIUM",
        "position": "BELOW_PRICE"
      }
    }
  ]
}
```

An evergreen timer includes `durationSeconds` instead of `startAt` and `endAt`. The payload omits the shop, access token, targeting lists, and merchant-only fields.

Only enabled timers that are eligible now are returned. A fixed timer must have started and must not yet have reached `endAt`. Collection targeting is checked with the shop’s offline Admin GraphQL session, and only when a collection timer is eligible.

`POST /api/storefront/timers/impressions` checks the signature, checks that the timer belongs to the signed shop, and increments the UTC day’s count. The same shop, timer, and IP is accepted once per 60 seconds. A duplicate returns `{ "recorded": false }`. The first accepted call returns `{ "recorded": true }`.

## Theme extension installation

The extension directory contains only theme files:

```text
extensions/countdown-timer/
  assets/countdown-timer.js
  assets/countdown-timer.css
  blocks/countdown-timer.liquid
  locales/en.default.json
  shopify.extension.toml
```

Rebuild the widget after changing `countdown-timer/src`:

```shell
npm run build --workspace=countdown-timer
```

That command overwrites `extensions/countdown-timer/assets/countdown-timer.js`. The Liquid schema keeps `"javascript": "countdown-timer.js"`.

In the theme editor, add **Countdown Timer** to a product template. The block is limited to product templates.

## Testing commands

From the repository root:

```shell
npm run typecheck --workspace=web
npm run typecheck --workspace=web/frontend
npm run typecheck --workspace=countdown-timer
npm test --workspace=shopify-app-template-node
npm run build --workspace=web/frontend
npm run build --workspace=countdown-timer
npm run build
```

Set `SHOPIFY_API_KEY` before `npm run build --workspace=web/frontend` when the CLI has not exported it. `npm run build` runs `shopify app build`. The backend package is still named `shopify-app-template-node`, so the test command uses that workspace name. `--workspace=web` also selects the frontend workspace.

On PowerShell, chain commands with `;` rather than `&&`.

## Known limitations and assumptions

- The storefront API returns a fixed timer only while `startAt <= now < endAt`. The widget can still show “This offer has ended.” after `endAt` passes during the same page view. A fixed timer that has not started is not sent to the storefront.
- An evergreen deadline is stored in the browser’s `localStorage`. It is not tied to a Shopify customer account. A new browser starts its own countdown. After expiry, the same browser session stays expired; a later session can start again.
- An impression is recorded once per browser session when at least half of the timer panel is visible. The server also ignores a repeat from the same shop, timer, and IP for 60 seconds. Loading, empty, and error states do not count.
- Theme Check reports `AssetSizeAppBlockJavaScript` because the raw widget bundle is larger than its 10 KB source threshold. The minified gzip size is under 10 KB, and `shopify app build` still completes.
- A request to the storefront timer URL with no App Proxy signature is rejected. The logged message is the signature failure, and the public response does not include a session token.
- The Docker image builds the admin app from `web/`. It does not build the theme widget. Deploy the extension with the Shopify CLI, and provide `MONGODB_URI` to the container at runtime.
- Restart `npm run dev` if Shopify reports that the development preview has ended. The CLI clears and rebuilds `.shopify/dev-bundle` on startup.
