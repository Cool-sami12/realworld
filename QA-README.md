# QA-README.md — how the QA work on this repo fits together

This is the starting point for anyone (engineer, QA, reviewer) picking up the QA work on this repo. It tells you what exists, how to run it, and where to look for what.

## 1. What's here

| File | What it is |
|---|---|
| **`TEST-STRATEGY.md`** | The full assessment: architecture, scope, risk analysis, testing approach, environment, assumptions, limitations. Start here for the *why*. |
| **`TEST-CASES.md`** | Every automated test case, one row each, cross-referenced to the exact test file/line and to any bug it found. |
| **`BUG-REPORTS.md`** | Formal defect write-ups — repro steps, expected vs. actual, root cause, suggested fix — for every confirmed issue (`BUG-001`–`BUG-014`). |
| **`api.md`** | Full REST API reference (every endpoint, request/response payloads, error shapes) — written for plugging straight into Postman. |
| **`RELEASE-NOTES.md`** | The release recommendation, written for whoever decides whether this ships — not a rehash of the above, a decision document. |
| **`backend/tests/qa/`** | Vitest-based API test suite (67 tests) — the original automation from this assessment. |
| **`e2e/`** | Playwright-based automation (48 API tests + 34 full-browser UI tests, 82 total) — see §3 below. |

If you only read one thing, read `TEST-STRATEGY.md` §0 first — it explains that this repo's working tree has intentional, documented modifications (a Sequelize→Prisma/Neon migration, plus some deliberately reintroduced bugs) that make it *not* the same thing as the published upstream repo. Every other document assumes you already know that.

## 2. Prerequisites

- Node.js v18+ (developed/verified on v22.13.1)
- A Postgres database reachable via a `DATABASE_URL` connection string (Neon or any Postgres works locally; CI uses a disposable Postgres container — see §5)
- Chromium via Playwright (`npx playwright install chromium` — one-time, see §3)

## 3. First-time setup

```bash
npm install                                   # installs root + backend + frontend workspaces
cp backend/.env.example backend/.env          # then fill in DATABASE_URL, JWT_KEY, PORT
cd backend && npx prisma migrate deploy && npx prisma generate && cd ..
npx playwright install chromium               # downloads the browser Playwright drives
```

`backend/.env` is git-ignored — never commit it. Never paste a real `DATABASE_URL` into a shared doc, chat, or commit either; treat it like any other credential.

## 4. Running the app locally

```bash
npm run dev          # starts backend (:3001) and frontend (:5173) together
```
Or individually: `npm run dev -w backend` / `npm run dev -w frontend`.

## 5. Running the tests

### Playwright (API + full browser UI) — the primary suite
```bash
npm run test:e2e                       # both projects, headless
npx playwright test --project=api      # 48 API-only tests, no browser
npx playwright test --project=web      # 34 UI tests, headless Chromium
npx playwright test --project=web --headed   # same, with a visible browser window
npx playwright show-report             # open the last HTML report
```
`playwright.config.js`'s `webServer` entries start the backend and frontend for you if they aren't already running (and reuse them if they are — convenient for local iteration, this is also exactly what CI relies on). No manual "start the app first" step is required to run tests.

The `web` project is a Page Object Model (see `e2e/web/pages/`) — see §6 if you're adding a test.

### Vitest — backend API suite (the original 67-test suite)
```bash
cd backend && npx vitest run --config vitest.config.js
```
This one **does** require the backend already running (`npm run dev -w backend` in another terminal) — it doesn't have Playwright's auto-start capability.

### Vitest — pre-existing unit tests (not written by this assessment)
```bash
npx vitest run frontend/src            # 6 tests
npx vitest run backend/helper/helpers.test.js   # 6 tests
npm run build -w frontend              # production build sanity check
```

## 6. Test data conventions

Every test creates its own user(s) via unique, namespaced emails (`*@example.test` for the Vitest suite, `pwweb.*@example.test`/`pwuser*` for Playwright) — never reuses fixed accounts, never touches real data. Locally, this data accumulates in your database across runs; clean it up with:
```bash
cd backend && node -e "
const prisma = require('./prisma/client');
(async () => {
  const del = await prisma.user.deleteMany({ where: { email: { contains: '@example.test' } } });
  console.log('deleted:', del.count);
  await prisma.\$disconnect();
})();
"
```
(Cascading deletes on the Prisma schema mean deleting a user also removes their articles/comments/favorites/follows.) **In CI this isn't needed** — the database is a fresh container destroyed at the end of every run (§7).

## 7. CI

`.github/workflows/qa-e2e.yml` runs the full Playwright suite (`api` + `web`) on every push/PR to `main`/`dev`, plus on demand via "Run workflow". It uses a disposable Postgres service container rather than the Neon database used for local dev/exploration — deliberately, to avoid `BUG-013`'s documented Neon cold-start latency making CI results noisy. Reports are uploaded as workflow artifacts (`playwright-report`, `test-results` on failure); failures also show up as inline annotations on the run/PR via Playwright's `github` reporter.

## 8. Extending the suite

**Adding a web (UI) test:** put it in `e2e/web/*.spec.js`, import `{ test, expect }` from `./fixtures` (not `@playwright/test` directly — the custom fixtures are what wire up the page objects and `loginAsNewUser`/`apiClient`). If a page you need doesn't have a page object yet, add one under `e2e/web/pages/` following the existing ones (constructor takes `page`, locators as properties, actions as async methods — extend `BasePage` unless the page genuinely has no navbar, like `NotFoundPage`), then register it in `fixtures.js`.

**Adding an API test:** put it in `e2e/api/*.spec.js`, use the `request` fixture with **relative paths with no leading slash** (e.g. `request.post("articles", ...)`, not `"/articles"`) — the project's `baseURL` already includes `/api/`, and a leading slash silently drops that path segment (this bit us once; see the git history on `e2e/api/helpers.js` if you want the full story).

**Found a new defect?** Add it to `BUG-REPORTS.md` following the existing format (severity, repro steps, expected vs. actual, root cause, suggested fix), add a row to `TEST-CASES.md` if there's a corresponding automated case, and reproduce it fresh before writing it down — don't infer from source alone if you can run the app instead.

## 9. Known environment quirks

- **Neon cold starts (`BUG-013`):** if you've been away from the app for a while, the first request or two against a Neon-backed `DATABASE_URL` may fail or hang for tens of seconds before recovering. Not a bug in this codebase; see `BUG-REPORTS.md`.
- **Auth header format:** this API uses `Authorization: Token <jwt>`, not the more common `Bearer <jwt>`. See `api.md` §0.
- **HashRouter:** the frontend uses hash-based routing (`/#/login`, `/#/article/:slug`, etc.) — `page.goto()` calls in the web suite need the `#`.
