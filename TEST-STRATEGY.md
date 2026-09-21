# TEST-STRATEGY.md — RealWorld / Conduit (qa-guru/realworld)

**Author:** Independent QA assessment (Claude Code, acting as Senior QA Engineer / Lead / Architect)
**Date:** 2026-09-17 (initial assessment), updated 2026-09-19 (coverage-gap closure + additional infrastructure-reliability evidence)
**Repository:** https://github.com/qa-guru/realworld
**Base commit assessed:** `151aac22d323c3592918c3e5375f0c77a9f74d28` (origin/main, 2026-07-13), **plus local, uncommitted working-tree changes** — see §2.1 for why this distinction is load-bearing for how to read this report.

**Companion documents:** this file covers strategy, architecture, risk, and process. Individual, reproducible test cases live in **`TEST-CASES.md`** (67 automated cases, one row each, cross-referenced to the exact test in `backend/tests/qa/`). Formal defect write-ups (repro steps, expected vs. actual, root cause, fix) live in **`BUG-REPORTS.md`** (13 bugs, `BUG-001`–`BUG-013`). All three documents were produced from the same investigation and cross-reference each other by ID; none was written independently of the others.

---

## 0. How to read this report (read this first)

This assessment does **not** describe the pristine, published `qa-guru/realworld` application. The local working tree used for this assessment has two layers of change on top of `origin/main`, made in this same working session, prior to the QA assessment being requested:

1. **A backend ORM/database migration**: the original Sequelize + MySQL/Postgres backend was replaced with Prisma + a hosted Neon Postgres instance. This is a real, substantive architecture change (new schema, new query layer, new error handling), not a cosmetic one.
2. **Six deliberately reintroduced defects**, requested explicitly by the repository owner after the migration, to restore specific original (buggy) behaviors for comparison purposes: unrestricted mass-assignment on profile update, a password-update crash bug, a JWT claim bug, a double-`next()` crash bug in the auth middleware, an N+1 query pattern, and an email-leak on profile responses.

Every defect in §4/§7 attributable to those six is labeled **[REINTRODUCED]**. Every other defect found here was newly discovered during this assessment by exercising the running application and is labeled **[NEW]**. This distinction matters: **[REINTRODUCED]** items are not representative of the current published upstream `main` branch; **[NEW]** items may or may not exist upstream and were not checked against the pristine Sequelize codebase (out of scope — see §3.2).

No bug, metric, or test result in this document was invented. Every finding below was either (a) reproduced against the actually-running application during this session with a command/response captured, or (b) read directly from the current source files, with the file path cited. Where something could not be verified, it is explicitly marked **Not verified** or **Unable to assess**, per the engagement's ground rules.

---

## 1. Objective

Perform an independent quality assessment of the RealWorld/Conduit application (as currently checked out, including the local modifications described above) to determine its readiness for release. This includes understanding the architecture and business rules from source, running the application end-to-end, exploring it as an adversarial/naive user would, automating the highest-value checks, and issuing a release recommendation backed by evidence.

## 2. Application overview

### 2.1 Architecture (verified by reading source, not assumed)

| Layer | Technology | Evidence |
|---|---|---|
| Frontend | React 18, Vite 4 (`@vitejs/plugin-react-swc`), React Router | `frontend/package.json`, `frontend/vite.config.js` |
| Backend | Node.js, Express 4 | `backend/package.json`, `backend/index.js` |
| ORM / DB (current local state) | **Prisma 5 → Neon (managed Postgres)**, via `DATABASE_URL` in `backend/.env` (gitignored, not committed) | `backend/prisma/schema.prisma`, `backend/prisma/client.js` |
| ORM / DB (upstream `origin/main`) | Sequelize 6, configurable MySQL/Postgres via `backend/config/config.js` (deleted locally as part of the migration) | `git show origin/main:backend/config/config.js` |
| Auth | Stateless JWT (`jsonwebtoken`), `Authorization: Token <jwt>` header, no refresh/expiry | `backend/helper/jwt.js`, `backend/middleware/authentication.js` |
| Password storage | bcrypt, 10 rounds | `backend/helper/bcrypt.js` |
| Frontend token storage | Browser `localStorage` (`context/AuthContext.jsx`) | verified by source read (not re-verified via browser this session; see §11) |
| Test tooling present | Vitest (root, jsdom, frontend unit tests); this assessment added a Node-environment Vitest config + suite for backend API testing | `vitest.config.js`, `backend/vitest.config.js` (new) |

### 2.2 Functional modules identified

Registration, login, current-user/profile fetch, profile edit, follow/unfollow, article list (global/by author/by tag/favorited-by/feed), article create/read/update/delete, comments (list/create/delete), favorite/unfavorite, tags list. Logout is **client-side only** (clearing `localStorage`); there is no server-side session/logout endpoint — this is expected given the stateless-JWT design, not a defect.

### 2.3 API surface (enumerated directly from the live route files, current working tree)

```
POST   /api/users                        signup                     public
POST   /api/users/login                  login                      public
GET    /api/user                         current user               auth required
PUT    /api/user                         update current user        auth required

GET    /api/profiles/:username           view profile               auth optional
POST   /api/profiles/:username/follow    follow                     auth required
DELETE /api/profiles/:username/follow    unfollow                   auth required

GET    /api/articles                     list (author/tag/favorited/ auth optional
                                          limit/offset filters)
POST   /api/articles                     create                     auth required
GET    /api/articles/feed                followed-authors' articles auth required
GET    /api/articles/:slug               single article             auth optional
PUT    /api/articles/:slug               update                     auth + ownership
DELETE /api/articles/:slug               delete                     auth + ownership

GET    /api/articles/:slug/comments      list comments               auth optional
POST   /api/articles/:slug/comments      add comment                 auth required
DELETE /api/articles/:slug/comments/:id  delete comment              auth + comment ownership

POST   /api/articles/:slug/favorite      favorite                    auth required
DELETE /api/articles/:slug/favorite      unfavorite                  auth required

GET    /api/tags                         list tags                   public
```

### 2.4 Business rules (read from controllers, then verified live — see §4 for the verification evidence)

- Only the logged-in user can create articles/comments/favorites/follows; enforced in each controller via an explicit `if (!loggedUser) throw new UnauthorizedError()` check, **not** solely by the auth middleware (the middleware treats a missing token as "anonymous," not "rejected").
- Only an article's author (`article.userId === loggedUser.id`) can update or delete it.
- Only a **comment's own author** can delete that comment — notably, **the article's author cannot delete other users' comments on their own article** (verified live, §4.3). This is a real, intentional-looking business rule in the code, worth confirming against the product's actual spec since it's a common point of divergence from the canonical RealWorld spec.
- Nonexistent resources return 404 before ownership is even checked (verified: updating/deleting a nonexistent slug returns 404, not 403).
- Anonymous (no `Authorization` header) requests are allowed for read endpoints (article list/detail, comments list, profile view, tags) and rejected for all write/mutation endpoints.

## 3. Scope

### 3.1 In scope
- Backend REST API: all endpoints listed in §2.3, exercised directly via HTTP. **Correction:** the first pass of automated testing (61 cases) missed two endpoints — `GET /api/articles/feed` and `GET /api/articles/:slug/comments` — which had sibling write endpoints tested but no test of their own. This was caught by an explicit endpoint-by-endpoint audit against §2.3 on 2026-09-19 (prompted by a direct question about coverage completeness), closed with 6 additional tests (`backend/tests/qa/coverage-gaps.test.js`), and both endpoints passed every case added. The suite is now 67 cases and every endpoint in §2.3 has at least one passing test — see `TEST-CASES.md` for the per-endpoint breakdown. This correction is recorded here deliberately, rather than silently fixed, because the original version of this document should not have implied complete coverage before it was actually checked.
- Authentication and authorization/ownership rules, including negative and boundary cases.
- Input validation behavior (missing fields, malformed data, oversized input, script-injection payloads).
- Data consistency across operations (favorite counts, follower counts, pagination).
- Build health of the frontend (`vite build`) and existing unit test suites (frontend + backend).
- Environment/infrastructure behavior of the currently-configured Neon database under light concurrent load.
- **Added 2026-09-20: browser-driven UI testing, using Playwright.** This closes what was originally listed as out of scope in §3.2 — a Chromium browser is now available in this environment. Every page in the frontend's route table (`frontend/src/main.jsx`) is covered: Home (logged in/out, feed tabs, popular tags, pagination), Login, Sign Up, Settings, Article Editor (create + edit), Article view (favorite, follow, comments, owner actions), Profile (own/other, articles/favorites tabs), and 404/Not Found. See `e2e/web/` and §7.

### 3.2 Out of scope (and why)
- **Formal accessibility audit and cross-browser/mobile compatibility.** Playwright UI coverage (added 2026-09-20) uses a single Chromium/Desktop Chrome configuration only; no screen-reader/ARIA audit, no Firefox/WebKit/mobile-viewport testing was performed. See §11/§12.
- **Comparison against the pristine upstream Sequelize/MySQL backend.** The six **[REINTRODUCED]** defects and the Prisma migration itself were not diffed test-by-test against `origin/main`'s runtime behavior; only static comparison via `git show`/`git diff` was used to confirm what changed structurally.
- **Load/stress testing at scale.** Only light concurrency (a handful of parallel requests from a single automated test run) was observed; no dedicated load-testing tool (k6, Artillery, etc.) was used.
- **CI pipeline validation** (`.github/workflows/*.yml`) beyond reading them — they were not executed, since they deploy to real infrastructure (`realworld-runner` self-hosted runner, Docker Compose, GitHub secrets) that this assessment has no access to and should not touch.

## 4. Risk assessment

Ranked by (likelihood × impact), based on what was actually found, not a generic checklist. Full repro steps and evidence for every `BUG-XXX` reference are in `BUG-REPORTS.md`; the automated/exploratory test case behind each is in `TEST-CASES.md`.

| # | Risk | Likelihood | Impact | Who's affected | Bug Ref | Status |
|---|---|---|---|---|---|---|
| 1 | **[REINTRODUCED]** Profile edit (`PUT /api/user`) crashes (500) on any update that doesn't include a `password` field | Very High — happens on the *default*, most common use case (editing bio/image) | High — core account-management feature is unusable | Every user who edits their profile | BUG-001 | **Confirmed, live** |
| 2 | **[REINTRODUCED]** `GET /api/profiles/:username` leaks `email`, including to **anonymous, unauthenticated** requests | High — trivial, one GET request, no auth or prior relationship needed | High — PII/privacy exposure for every registered user; email harvesting at scale | Every user | BUG-002 | **Confirmed, live** |
| 3 | **[REINTRODUCED]** Auth middleware crashes with an unhandled `TypeError` and calls `next()` twice when a syntactically valid JWT names a since-deleted/nonexistent user | Medium — triggered whenever a token outlives its user (e.g. after account deletion, or by a forged/expired-key token) | Medium — ungraceful failure mode; indicates fragile error-handling under this exact condition | Any holder of such a token | BUG-003 | **Confirmed, live** (server log captured) |
| 4 | **[NEW]** Stored, unsanitized user content (article body / comment body) — no server-side sanitization exists, confirmed via API and browser | Medium — easy to trigger, but see impact | Medium (downgraded from High on 2026-09-20) — a `<script>`/`onerror`/`javascript:`-href payload does **not** achieve execution in this frontend stack (browser-tested: `markdown-to-jsx` strips `javascript:` hrefs, React doesn't execute injected `<script>` elements or wire up lowercase `onerror`); still a real missing-sanitization gap and a valid lead for a proper security review, not a demonstrated working XSS | Any reader of attacker-authored content; future maintainers if the rendering stack changes | BUG-010 | **Confirmed live, both API and browser** (Playwright) |
| 5 | **[REINTRODUCED]** Mass assignment on `PUT /api/user` (no field allowlist) | Currently Low (can't redirect the write to another user's row — verified) but **latent risk is High**: any future column added to the `User` model becomes silently client-writable | Low today / High if the schema grows | Future maintainers | BUG-005 | **Confirmed, live** |
| 6 | **[NEW]** Intermittent multi-second-to-timeout latency against the Neon database under even light concurrent/sequential automated load, with no app-level timeout/retry handling | Medium — reproduced 2 out of 3 full-suite runs | Medium — real users would see occasional hung requests / apparent freezes | All users, under load or during Neon cold-start | BUG-013 | **Confirmed, live** (see §9 evidence) |
| 7 | **[REINTRODUCED]** Login-issued JWT is missing the `username` claim | Low likelihood of user-visible impact today (nothing currently reads that claim client-side) but a latent correctness bug | Low today | Any future code trusting the JWT's `username` claim | BUG-004 | **Confirmed, live** |
| 8 | **[NEW]** Malformed `Authorization` header returns 500 instead of 401 | Low — requires a malformed header, not something a normal client sends | Low — information/architecture smell (uncaught `SyntaxError`), not user-facing harm at scale | Clients sending malformed auth headers | BUG-006 | **Confirmed, live** |
| 9 | **[NEW]** No email-format validation, no password-strength/length validation, no input-length limits on articles/comments | Medium — easy to trigger accidentally | Low-Medium — data quality / abuse potential (unbounded content size), not a breach | All users | BUG-007, BUG-008, BUG-009 | **Confirmed, live** |
| 10 | **[NEW]** No self-follow guard; **[NEW]** `offset` query param is multiplied by `limit` server-side (page-index semantics, not "items to skip" as the RealWorld API spec generally implies) | Low | Low — cosmetic/spec-conformance issues | Third-party API clients following the public spec | BUG-011, BUG-012 | **Confirmed, live** |
| 11 | Non-expiring JWTs; no rate limiting on login/signup; frontend has no PropTypes/TypeScript | N/A (pre-existing architecture, from earlier source review this session) | Medium (security hygiene) | All users | — (not in `BUG-REPORTS.md`; see §12) | **Source-verified, not re-verified live this session** |
| 12 | **[NEW]** Saving the Settings page for **any** field (bio, image, username, email — not just password) silently resets the account password to the hash of an empty string, and the Login page's own client-side validation (`minLength="5"`) then blocks the user from ever re-entering an empty password to recover — full, silent, self-inflicted account lockout via completely normal use | Very High — happens on literally the first ordinary Settings save that doesn't also retype the password | Critical — total loss of account access with no error shown and no self-service recovery path through the UI | Every user who edits their profile | BUG-014 | **Confirmed live via both the raw API and a full Playwright browser reproduction** (fill bio → save → log out → real Login form rejects the original password) — found by tracing frontend source while scoping browser-automation coverage |

## 5. Testing approach

Types actually performed, and why:

- **Functional (API-level):** every endpoint in §2.3 was exercised for its documented happy path.
- **Negative:** missing required fields, wrong credentials, unknown resources, malformed auth headers.
- **Boundary:** empty comment body, 20,000-character article body, pagination edges, empty profile-update payload.
- **Authorization / ownership:** two independently registered users (User A, User B) used throughout to verify cross-user access control on articles and comments — this was the single highest-priority category given it's a multi-tenant content app.
- **Security-adjacent (black-box, no exploitation attempted):** script-injection payload round-tripping (including live browser execution testing, not just storage/echo — see `BUG-010`), PII exposure via profile endpoint, mass-assignment probing. This is **not** a full security audit or penetration test — see §12.
- **State/consistency:** favorite/follow idempotency (repeat favorite, repeat unfollow), favorited/following flags observed correctly per-viewer (User A vs. User B seeing different `favorited` values for the same article).
- **UI (browser-driven, Playwright/Chromium):** every route in the frontend exercised end-to-end through real form fills, clicks, and navigations — registration/login via the actual forms, article create/edit/delete, commenting (including the native `confirm()` dialog on delete), favoriting/following with live count updates, profile tabs, and the 404 page. This is what surfaced `BUG-014` as a live, full-UI reproduction (not just an API-level one) and what allowed `BUG-010` to be re-assessed with real evidence instead of a source-only inference.
- **Exploratory:** manual `curl`/Node-script probing preceded and informed most automated tests above — e.g. the malformed-token, malformed-header, and Neon cold-start cases were found by hand before being automated or documented.
- **Not performed:** formal performance/load testing (only incidentally observed via automation, §9), a formal accessibility audit, cross-browser/mobile UI testing (Chromium only), full penetration testing.

## 6. Prioritization

Authorization and ownership testing (User A vs. User B) received the most attention because this is a multi-tenant application where every write endpoint's core value proposition depends on "you can only touch your own stuff" — a failure here (e.g., User B editing User A's article) would be a severe, headline-grade defect. It came back clean: **all article/comment ownership checks passed** (§7, authorization suite: 10/10 API, mirrored in the Playwright API suite). Profile/auth flows received the second-most attention because that's where the (deliberately reintroduced) defects turned out to live, and because authentication is the gate in front of everything else — this is also where the highest-severity finding in the whole assessment (`BUG-014`) was found. Performance/load testing received the least deliberate attention (not requested, no tooling available) but is reported anyway because it surfaced unprompted and materially affects release readiness. Browser/UI testing, once tooling became available, was scoped to cover every page at least once rather than exhaustively (e.g., one happy-path + the highest-value negative/edge cases per page), since the API layer underneath had already been thoroughly tested and the marginal value of the UI layer is mainly in catching rendering/wiring defects the API tests structurally cannot see.

## 7. Automated test suite and results

See `TEST-CASES.md` for the full 67-row test case catalog (one row per automated test, with module grouping, priority, pass/fail result, and bug cross-reference). This section summarizes it.

A new automated API test suite was written for this assessment (it did not exist before): **`backend/tests/qa/`**, run via a dedicated Node-environment Vitest config (**`backend/vitest.config.js`** — the existing root `vitest.config.js` is jsdom-only, for frontend unit tests, and was left untouched).

| File | Tests | Focus |
|---|---:|---|
| `tests/qa/auth.test.js` | 15 | Registration, login, token validation, malformed-input handling |
| `tests/qa/authorization.test.js` | 10 | Cross-user article/comment ownership |
| `tests/qa/profiles.test.js` | 14 | Profile view/edit, email exposure, follow/unfollow |
| `tests/qa/favorites.test.js` | 7 | Favorite/unfavorite idempotency and cross-user visibility |
| `tests/qa/validation.test.js` | 15 | Input validation, XSS payload round-trip, pagination |
| `tests/qa/coverage-gaps.test.js` | 6 | Feed and comment-listing endpoints (added 2026-09-19 to close a coverage gap — see §3.1) |
| **Total** | **67** | |

**Result (2026-09-17, each file run in isolation, one at a time): 61/61 pass** (the original 5 files). **Result (2026-09-19, full suite including the 6 new cases, run together): 67/67 pass.** This is the authoritative correctness result — every assertion about actual application behavior in this document is backed by one of these 67 tests (or a manual `curl`/log capture cited inline).

**Result when the full suite was run back-to-back on 2026-09-17** (either with files in parallel, or sequentially with no pause): 3–4 individual tests intermittently failed with client-side 20-second timeouts (favorites and one pagination setup test). This was investigated, not just noted:
- Isolated per-request latency to the Neon database was sampled directly: a trivial `GET /api/tags` averaged **~300–700ms**, with one observed spike to **5.8s**, and no corresponding error in the server log for any of it.
- The backend process remained alive and responsive after every timeout; no crash, no Prisma error code (`P1001`/`P2024`/etc.) appeared in the server log for the timed-out requests, on that date.
- Disabling Vitest's cross-file parallelism did **not** eliminate the timeouts, ruling out "our own test suite is the sole source of concurrency" as the full explanation.
- Conclusion: this is most consistent with **Neon serverless compute cold-start/scale behavior** on the connected project, not an application-level defect. It is reported as risk #6 in §4 / **BUG-013** in `BUG-REPORTS.md`, not as a test failure, because the isolated-run results demonstrate the *application logic* is correct — the *infrastructure* is what's inconsistent.

**Independent second occurrence (2026-09-19):** after the backend process sat idle for ~2 days, the first several requests (including the app's own startup DB check, after a full process restart) failed outright with `PrismaClientInitializationError` / `P1001` ("Can't reach database server"), while a raw TCP socket to the same host:port succeeded immediately. The condition cleared on its own within roughly a minute with no code change, after which the full 67-test suite passed cleanly. This is now a second, independently-timed reproduction of the same underlying pattern, at a longer idle interval — see `BUG-REPORTS.md` BUG-013 for the full detail. It meaningfully raises confidence that this is a real, recurring characteristic of the current Neon setup rather than a one-off fluke.

Pre-existing test suites were also run (not written by this assessment):
- `backend/helper/helpers.test.js` — 6/6 pass (`slugify` cases).
- `frontend/src/helpers/{dateFormatter,errorHandler}.test.js` — 6/6 pass.
- `npm run build -w frontend` — succeeds (Vite production build, 871ms, no errors/warnings).

### 7.1 Playwright suite (added 2026-09-20): API + full browser UI

A second, independent automated suite was added under **`e2e/`**, run via **`playwright.config.js`** (root) — two projects, `api` (Playwright's `request` fixture, no browser) and `web` (Chromium/Desktop Chrome). This suite exists alongside the Vitest suite in §7 above rather than replacing it; the two were written independently (different framework, different session) and agreeing with each other is itself a form of cross-validation.

| Project | Files | Tests | Focus |
|---|---|---:|---|
| `api` | `e2e/api/*.spec.js` (5 files) | 48 | Same ground as the Vitest suite (auth, ownership, profiles, favorites/feed, validation) re-implemented independently in Playwright |
| `web` | `e2e/web/*.spec.js` (7 files) | 34 | **Every page in the frontend's route table**, browser-driven: Home, Login, Sign Up, Settings, Article Editor (create/edit), Article view (favorite/follow/comment/owner actions), Profile (own/other, both tabs), 404 |

**Result: 82/82 pass** (`npx playwright test`, run 2026-09-20). Run individually with `npx playwright test --project=api` / `--project=web`. An HTML report is generated at `playwright-report/` (gitignored) after each run.

This suite is what upgraded two existing findings from source-inferred to browser-verified:
- **`BUG-014`** was reproduced through the *actual Settings/Login forms* (fill bio → save → log out → real login form rejects the original password), not just via raw API calls — this is a materially stronger form of evidence for a defect this severe.
- **`BUG-010`**'s severity was **revised down** (High → Medium) after live testing showed the specific `<script>`/`onerror`/`javascript:`-href payloads do not achieve execution in this app's actual rendering pipeline — a correction that could only be made once a browser was available; see `BUG-REPORTS.md` for the detailed before/after.

Writing this suite also surfaced and fixed **three bugs in the test code itself**, worth recording because it illustrates exactly the kind of self-verification this assessment tries to model throughout: a URL-resolution bug in the API helpers (`baseURL` + leading-slash paths silently dropping the `/api` path segment, causing several early "passes" to be false positives against the wrong URL), a race condition in the Settings/BUG-014 test (asserting on the UI's optimistic button-hide instead of waiting for the actual network response to fully resolve), and a test-fixture bug where the injected login session accidentally included a plaintext password field that the real API never returns, which happened to make the Settings form behave differently than it does for real users. All three were caught by the test's own assertions failing, investigated with the same rigor as an application defect, and fixed before being counted as a pass — none were papered over to make the suite green.

### 7.2 `web` suite refactor to Page Object Model (2026-09-21)

The `web` project (§7.1) was restructured from flat spec files with inline locators into a proper Page Object Model, at the user's request, to improve maintainability, independence, and reliability:

```
e2e/web/
  fixtures.js              custom test/expect: auto-injects page objects, apiClient, loginAsNewUser
  pages/
    BasePage.js             shared plumbing (page handle + navbar composition)
    NavbarComponent.js       navbar dropdown, present on every page but 404
    HomePage.js, LoginPage.js, SignUpPage.js, SettingsPage.js,
    ArticleEditorPage.js, ArticlePage.js, ProfilePage.js, NotFoundPage.js
  support/
    ApiClient.js            backend calls used only for test setup (signup, seed an article, etc.)
  *.spec.js                 7 files, same 34 tests, now written against page objects only
```

What changed in substance, not just file layout:
- **Sensible abstractions:** every locator lives in exactly one page object; spec files contain no CSS/role selectors at all. `ArticlePage`'s constructor comments explain *why* several locators are scoped with `.first()` (the article page genuinely renders its author/action row twice — top banner and bottom — as independent component instances), so that fact is documented once instead of rediscovered per test.
- **Reliable execution, by construction:** the exact race condition fixed ad hoc in the original `BUG-014` test (asserting on the Settings form's optimistic button-hide instead of the async save actually completing) is now impossible to reintroduce by accident — `SettingsPage.update()` always waits for the persisted value to round-trip back into `localStorage` before returning, so every caller gets the safe behavior automatically. A second, similar bug was caught and fixed *during this refactor*: `NavbarComponent.openUserMenu()` unconditionally toggled the dropdown, so a test that opened the menu once and then called the `logout()` helper (which also opens it) silently closed it again and the click on "Logout" timed out (45s, reproduced and fixed live). `openUserMenu()` is now idempotent.
- **Independence:** the `loginAsNewUser` fixture and `ApiClient` give every test its own freshly-registered user with no shared state; nothing changed here functionally, but it's now provided as a fixture rather than an imported helper function, which is the idiomatic Playwright form and makes the dependency explicit in each test's parameter list.
- **Stronger assertions:** several tests were tightened while being ported — e.g. the login-error test now asserts the exact error string (`toHaveText`) instead of a substring, and the favorite/follow tests now assert the count text at each step of the toggle (`( 0 )` → `( 1 )`) rather than only the final state.
- **Result: 34/34 pass**, confirmed on two consecutive full runs after the refactor (no flakiness observed). Test coverage is unchanged from §7.1 — this was an internal-quality refactor, not a coverage change.

## 8. Test data strategy

- Each test run generates uniquely-namespaced users via a per-run identifier (`qa.<timestamp><random>.<counter>@example.test`), so runs are independently repeatable without colliding with each other or with real data.
- **User A / User B** patterns are created fresh per test file (`beforeAll`) for authorization tests, matching the two-user ownership-testing approach requested for this engagement.
- Prisma's cascading deletes (`onDelete: Cascade` from `Article`/`Comment`/`Favorite`/`Follow` back to `User`) mean deleting a test user cleans up everything they created; this was used for cleanup after every test run (51 QA-generated users from the Vitest suite + 3 from the manual bug-reproduction pass + 18 from the Playwright API suite + 129 from the Playwright web suite = **201 total** test users deleted across this assessment, each cleanup verified by row counts before/after). The Playwright web suite generates more users than the API suite because most UI tests need their own freshly-authenticated browser session rather than sharing one.
- The Playwright web suite authenticates fast test setup (anything that isn't specifically testing the Login/Sign Up forms themselves) by signing up via a direct API call and injecting the resulting session into `localStorage` via `page.addInitScript`, rather than re-driving the login form for every single test — the login/signup forms themselves are still tested directly via real form fills in `e2e/web/auth-pages.spec.js`.
- **Pre-existing, non-QA data was found in the database at the start of this assessment** (one user `"Test "`, one article `"test"`, one tag `"hen"`, timestamped earlier the same day — most likely from prior manual/browser exploration, not from this assessment's own scripts). This was deliberately **left untouched** rather than deleted, since it wasn't created by this assessment and its ownership/purpose wasn't confirmed.
- No production or real user data was used or touched at any point.

## 9. Automation strategy

**What was automated:**
- All functional, negative, boundary, and authorization **API** testing — 67 Vitest tests (§7) plus 48 independently-written Playwright API tests (§7.1), covering every endpoint in the documented API surface (§2.3/§3.1):
  ```
  cd backend && npx vitest run --config vitest.config.js   # 67 tests
  npx playwright test --project=api                        # 48 tests
  ```
- **Full browser UI testing** — 34 Playwright tests covering every page (§7.1):
  ```
  npx playwright test --project=web
  ```
This is real, re-runnable automation that becomes a regression safety net going forward — not one-off scripts. Two independently-written suites (Vitest and Playwright) covering overlapping API ground, both passing, is itself a small piece of cross-validation that the documented behavior is accurate and not an artifact of one particular test's assumptions.

**What was not automated, and why:**
- **Performance/load testing:** the latency findings in §4/§7 were incidental (surfaced by ordinary functional automation), not the product of a dedicated load-testing tool. A proper k6/Artillery run against a fixed concurrency profile would be needed to characterize this rigorously.
- **Security/penetration testing:** the script-injection and PII-exposure findings are black-box observations from functional testing, not the output of a dedicated security tool (ZAP, Burp, etc.) or a credentialed audit. Treat `BUG-002` and `BUG-010` as leads for a real security review, not as a substitute for one.
- **Cross-browser/mobile UI automation:** the Playwright `web` project runs Chromium/Desktop Chrome only. Adding Firefox/WebKit projects to `playwright.config.js` would be a low-effort next step given the suite already exists.
- **Formal accessibility automation** (e.g. `@axe-core/playwright`): not wired in; would be a natural addition now that Playwright is set up, given the UI review earlier in this engagement flagged missing `<label>`s and a keyboard-inaccessible nav dropdown.

## 10. Environment

| Item | Value |
|---|---|
| OS | Darwin 25.5.0, arm64 (macOS) |
| Node.js | v22.13.1 |
| npm | 10.9.2 |
| Git commit (upstream base) | `151aac22d323c3592918c3e5375f0c77a9f74d28` (`origin/main`, 2026-07-13), **plus local uncommitted changes** (§0/§2.1) |
| Backend URL | `http://localhost:3001` (`npm run dev`/`node index.js` in `backend/`) |
| Frontend URL | `http://localhost:5173` (`npx vite` in `frontend/`, confirmed HTTP 200) |
| Database | Neon (managed Postgres), connected via `DATABASE_URL` in `backend/.env` (gitignored; not committed, not printed in this report) |
| Backend dependency versions (as installed) | Express 4.18.2, Prisma/`@prisma/client` 5.22.0, `jsonwebtoken` 9.x, `bcrypt` 5.1.0 |
| Frontend dependency versions (as installed) | React (via Vite 4.2.1), `@vitejs/plugin-react-swc` 3.x |
| Browser (added 2026-09-20) | Chromium (Chrome for Testing 149.0.7827.55) via `@playwright/test` 1.61.1, headless, Desktop Chrome viewport |

## 11. Assumptions

- The repository owner's stated intent — assess the current local working tree, including the Prisma migration and the six reintroduced defects, rather than resetting to pristine `origin/main` first — was taken as the deliberate scope of this assessment (confirmed explicitly before starting).
- "Logout" was assumed to be client-side-only by design (clearing `localStorage`), consistent with a stateless-JWT architecture, and was not treated as a missing feature.
- The pre-existing `"Test "` user/article/tag found in the database was assumed to be prior manual exploration rather than seed data, and was left alone rather than guessed-at and deleted.

## 12. Limitations

- **Browser testing is Chromium-only.** All UI-attributed findings are now live-verified in a real (headless Chromium) browser rather than inferred from source, but Firefox/WebKit and mobile viewports were not tested. Visual/layout regression, responsive design, and a formal accessibility (ARIA/screen-reader) audit remain **Unable to assess** in this engagement.
- **No comparison to the pristine upstream backend was performed.** This report cannot say which of the **[NEW]** findings, if any, also exist on `origin/main`'s original Sequelize backend — only that they exist in the current local build.
- **The Neon latency finding (§4 #6) is diagnosed, not root-caused to certainty.** It was narrowed down to "not an application bug" and "consistent with serverless cold-start behavior" using log inspection and repeated latency sampling, but Neon-side metrics/logs were not available to this assessment to confirm definitively.
- **This is not a formal security audit.** Findings labeled "security-adjacent" are real, reproduced black-box observations, but this assessment did not attempt exploitation, did not use dedicated security tooling, and should not be treated as exhaustive.
- **Test data cleanup is best-effort.** QA-generated users/articles were actively cleaned up between runs and at the end of this session (verified via row counts), but any test run that itself crashes before cleanup could theoretically leave residue; none was observed to do so in this session.

---

## Release recommendation

**Not ready for release in its current state.** Three **CRITICAL**, live-confirmed defects — profile editing crashing on the common case (**BUG-001**), email disclosure to anonymous/any users via the profile endpoint (**BUG-002**), and Settings saves silently locking users out of their own accounts (**BUG-014**) — are the highest-priority blockers. **BUG-014 is arguably the single most damaging finding in this assessment**: it destroys account access through completely ordinary use (editing a bio), fails silently, and the frontend's own client-side validation prevents users from recovering on their own. Recommended before release:

1. Fix **BUG-001**, **BUG-002**, and **BUG-014** (blocking). Note **BUG-001** and **BUG-014** share the same backend root cause (the password-update guard) and should be fixed together; **BUG-014** additionally needs a frontend fix (don't send `password` at all when the field was left blank).
2. Fix or explicitly accept **BUG-003** (auth middleware crash path) and **BUG-004** (JWT claim bug) — both are also **[REINTRODUCED]** and have known-good prior implementations.
3. Decide on and address the stored-content sanitization question (**BUG-010**, now Medium severity after browser verification showed the tested payloads don't currently execute) — this is a **[NEW]** finding independent of the reintroduced-bug set and needs a real product/security decision (sanitize on write? on render? both?), not just a revert. Not release-blocking on its own, but worth fixing before it's relied upon as "safe."
4. Investigate the Neon latency behavior (**BUG-013**) before relying on this database for production traffic, or add request-level timeout/retry handling to absorb it gracefully.
5. **BUG-005, BUG-006, BUG-007, BUG-008, BUG-009, BUG-011, BUG-012** are minor/hygiene and can reasonably be deferred to a fast-follow, provided they're tracked.

Full defect detail: `BUG-REPORTS.md`. Full test case catalog: `TEST-CASES.md`.
