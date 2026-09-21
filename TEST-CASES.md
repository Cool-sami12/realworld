# TEST-CASES.md — RealWorld / Conduit (local Prisma/Neon working tree)

Every test case below is backed by an executable, automated Vitest test in `backend/tests/qa/` (file:line given in the **Automated** column) run against the live backend at `http://localhost:3001`. Where a case documents a defect, the exact fresh reproduction evidence lives in `BUG-REPORTS.md` under the referenced Bug ID — that evidence was captured independently, in this session, not copied from the automated run.

**Result** reflects the case's actual, observed outcome — for FINDING/defect cases, "Fail" means "the application did not behave as a correct implementation should," which is the point of the case; it does not mean the automated test itself is broken (the test correctly asserts the buggy behavior it found, and passes).

**Run command:** `cd backend && npx vitest run --config vitest.config.js` — full suite: **67/67 pass** (most recent full run, 2026-09-19; see `TEST-STRATEGY.md` §7 for the concurrency/latency caveat observed on earlier runs).

**Coverage correction (2026-09-19):** an explicit endpoint-by-endpoint audit against `TEST-STRATEGY.md` §2.3 found that `GET /api/articles/feed` and `GET /api/articles/:slug/comments` had **zero** test coverage in the original 61-case suite — only the sibling `POST`/write endpoints on those paths had been tested. `tests/qa/coverage-gaps.test.js` (6 new cases, TC-FEED-001–003 and TC-CLIST-001–003 below) was added to close this; both endpoints passed every case. The suite is now 67 cases across 6 files, and every endpoint in the documented API surface has at least one passing test.

Legend — Priority: P0 (blocker) · P1 (high) · P2 (medium) · P3 (low). Result: ✅ Pass (correct behavior) · ⚠️ Fail (defect confirmed, see Bug Ref).

---

## Module: Registration

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-REG-001 | Valid signup returns 201 with token, no password/id leaked | P1 | `auth.test.js:5` | ✅ Pass | — |
| TC-REG-002 | Duplicate email is rejected (422) | P1 | `auth.test.js:15` | ✅ Pass | — |
| TC-REG-003 | Duplicate username is rejected (422) | P1 | `auth.test.js:23` | ✅ Pass | — |
| TC-REG-004 | Missing username returns 422 | P2 | `auth.test.js:31` | ✅ Pass | — |
| TC-REG-005 | Missing password returns 422 | P2 | `auth.test.js:38` | ✅ Pass | — |
| TC-REG-006 | Malformed email format (e.g. `not-an-email`) should be rejected | P3 | `auth.test.js:45` | ⚠️ Fail — accepted with 201 | BUG-007 |
| TC-REG-007 | Single-character password should be rejected | P3 | `auth.test.js:50` | ⚠️ Fail — accepted with 201 | BUG-008 |

## Module: Login

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-LOGIN-001 | Valid credentials return a token (200) | P0 | `auth.test.js:57` | ✅ Pass | — |
| TC-LOGIN-002 | Wrong password is rejected (422) | P1 | `auth.test.js:66` | ✅ Pass | — |
| TC-LOGIN-003 | Unknown email is rejected (404) | P1 | `auth.test.js:74` | ✅ Pass | — |
| TC-LOGIN-004 | Login-issued JWT should contain the `username` claim | P2 | `auth.test.js:81` | ⚠️ Fail — claim is absent | BUG-004 |

## Module: Authenticated access / token handling

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-AUTHN-001 | `GET /api/user` without a token returns 401 | P0 | `auth.test.js:93` | ✅ Pass | — |
| TC-AUTHN-002 | `GET /api/user` with a valid token returns the current user | P0 | `auth.test.js:98` | ✅ Pass | — |
| TC-AUTHN-003 | Malformed `Authorization: Token` header (no value) should return 401 | P2 | `auth.test.js:105` | ⚠️ Fail — returns 500 | BUG-006 |
| TC-AUTHN-004 | A well-formed JWT for a nonexistent user should fail cleanly (404, no server-side exception) | P1 | `auth.test.js:112` | ⚠️ Fail — 404 is returned to the client, but the server throws an unhandled `TypeError` and double-fires `next()` (confirmed via server log) | BUG-003 |

## Module: Article ownership & lifecycle (User A vs. User B)

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-ART-001 | Owner (User A) can update their own article | P0 | `authorization.test.js:29` | ✅ Pass | — |
| TC-ART-002 | Non-owner (User B) cannot update User A's article (403) | P0 | `authorization.test.js:42` | ✅ Pass | — |
| TC-ART-003 | Non-owner (User B) cannot delete User A's article (403); article still exists after | P0 | `authorization.test.js:53` | ✅ Pass | — |
| TC-ART-004 | Owner (User A) can delete their own article; subsequent GET returns 404 | P0 | `authorization.test.js:65` | ✅ Pass | — |
| TC-ART-005 | Anonymous (no token) cannot create an article (401) | P1 | `authorization.test.js:76` | ✅ Pass | — |
| TC-ART-006 | Updating/deleting a nonexistent article returns 404, not 403 (existence checked before ownership) | P2 | `authorization.test.js:81` | ✅ Pass | — |

## Module: Comment ownership

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-COM-001 | Comment author can delete their own comment | P0 | `authorization.test.js:94` | ✅ Pass | — |
| TC-COM-002 | Business rule: an article's author **cannot** delete a comment they didn't personally write (only the comment's own author can) — confirmed as the app's actual, consistent behavior | P1 | `authorization.test.js:110` | ✅ Pass (behavior confirmed; flagged in `TEST-STRATEGY.md` as worth validating against product intent, since it diverges from some RealWorld spec implementations where the article owner may also moderate comments) | — |
| TC-COM-003 | Anonymous (no token) cannot post a comment (401) | P1 | `authorization.test.js:127` | ✅ Pass | — |
| TC-COM-004 | Deleting a nonexistent comment returns 404 | P2 | `authorization.test.js:137` | ✅ Pass | — |

## Module: Profile visibility

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-PROF-001 | A user can view their own profile | P1 | `profiles.test.js:13` | ✅ Pass | — |
| TC-PROF-002 | An authenticated, unrelated user viewing someone else's profile should NOT see their email | P0 | `profiles.test.js:19` | ⚠️ Fail — email is exposed | BUG-002 |
| TC-PROF-003 | An anonymous request viewing a profile should NOT see the owner's email | P0 | `profiles.test.js:25` | ⚠️ Fail — email is exposed | BUG-002 |
| TC-PROF-004 | Viewing a nonexistent profile returns 404 | P2 | `profiles.test.js:31` | ✅ Pass | — |

## Module: Profile editing

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-EDIT-001 | Editing bio/image without sending a password should succeed | P0 | `profiles.test.js:38` | ⚠️ Fail — crashes with 500 | BUG-001 |
| TC-EDIT-002 | Editing bio/image succeeds when a password happens to also be sent (confirms the workaround / root cause) | P2 | `profiles.test.js:48` | ✅ Pass (this is the diagnostic case, not the desired UX) | BUG-001 (context) |
| TC-EDIT-003 | Changing password takes effect on next login; old password stops working | P0 | `profiles.test.js:60` | ✅ Pass | — |
| TC-EDIT-004 | Submitting an empty update body (`{}`) should be a safe no-op | P2 | `profiles.test.js:78` | ⚠️ Fail — crashes with 500 (same root cause as BUG-001) | BUG-001 |
| TC-EDIT-005 | Editing a profile without a token is rejected (401) | P1 | `profiles.test.js:86` | ✅ Pass | — |
| TC-EDIT-006 | A client-supplied `id` in the update payload must not redirect the write to another user's row | P0 | `profiles.test.js:93` | ✅ Pass for the specific attack tried (row-hijack not possible; the WHERE clause is server-derived) — but see BUG-005 for the underlying mass-assignment design gap this case does not fully close | BUG-005 (related) |

## Module: Follow / Unfollow

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-FOL-001 | Following a user increases their `followersCount` and sets `following: true` | P1 | `profiles.test.js:111` | ✅ Pass | — |
| TC-FOL-002 | Unfollowing reverses it | P1 | `profiles.test.js:118` | ✅ Pass | — |
| TC-FOL-003 | Following without a token is rejected (401) | P1 | `profiles.test.js:125` | ✅ Pass | — |
| TC-FOL-004 | A user should not be able to follow themselves | P3 | `profiles.test.js:130` | ⚠️ Fail — self-follow succeeds, no guard | BUG-011 |

## Module: Favorites

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-FAV-001 | Favoriting an article sets `favorited: true` and `favoritesCount: 1` | P0 | `favorites.test.js:21` | ✅ Pass | — |
| TC-FAV-002 | Favoriting the same article twice does not double-count (idempotency) | P1 | `favorites.test.js:31` | ✅ Pass | — |
| TC-FAV-003 | Unfavoriting reverses favorited state and count | P0 | `favorites.test.js:41` | ✅ Pass | — |
| TC-FAV-004 | Unfavoriting an article never favorited is a safe no-op, not an error | P2 | `favorites.test.js:52` | ✅ Pass | — |
| TC-FAV-005 | Anonymous favorite attempt is rejected (401) | P1 | `favorites.test.js:61` | ✅ Pass | — |
| TC-FAV-006 | Favoriting a nonexistent article returns 404 | P2 | `favorites.test.js:69` | ✅ Pass | — |
| TC-FAV-007 | `favorited` is per-viewer: User A (who didn't favorite) sees `false`, User B (who did) sees `true`, on the same article | P1 | `favorites.test.js:74` | ✅ Pass | — |

## Module: Article input validation

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-AVAL-001 | Missing title returns 422 | P1 | `validation.test.js:11` | ✅ Pass | — |
| TC-AVAL-002 | Missing description returns 422 | P1 | `validation.test.js:19` | ✅ Pass | — |
| TC-AVAL-003 | Missing body returns 422 | P1 | `validation.test.js:27` | ✅ Pass | — |
| TC-AVAL-004 | Omitting `tagList` entirely defaults to an empty tag list, not an error | P2 | `validation.test.js:35` | ✅ Pass | — |
| TC-AVAL-005 | A 20,000-character body should be rejected or truncated | P3 | `validation.test.js:44` | ⚠️ Fail — accepted verbatim, no limit | BUG-009 |
| TC-AVAL-006 | A `<script>` payload in the article body should be sanitized before storage/echo | P1 | `validation.test.js:54` | ⚠️ Fail — stored and echoed raw | BUG-010 |
| TC-AVAL-007 | Duplicate article title (same generated slug) is rejected (422) | P1 | `validation.test.js:67` | ✅ Pass | — |

## Module: Comment input validation

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-CVAL-001 | Empty comment body returns 422 | P1 | `validation.test.js:94` | ✅ Pass | — |
| TC-CVAL-002 | Missing comment body (`{}`) returns 422 | P1 | `validation.test.js:102` | ✅ Pass | — |
| TC-CVAL-003 | An HTML/script payload in a comment should be sanitized before storage/echo | P1 | `validation.test.js:110` | ⚠️ Fail — stored and echoed raw | BUG-010 |
| TC-CVAL-004 | Commenting on a nonexistent article returns 404 | P2 | `validation.test.js:120` | ✅ Pass | — |

## Module: Article listing & pagination

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-LIST-001 | Default/explicit `limit=3` returns at most 3 articles | P2 | `validation.test.js:139` | ✅ Pass | — |
| TC-LIST-002 | `offset` should behave as "items to skip," not "page index" | P3 | `validation.test.js:145` | ⚠️ Fail — server computes `skip = offset × limit` (page-index semantics); confirmed non-overlapping pages, so internally consistent but spec-deviating | BUG-012 |
| TC-LIST-003 | Anonymous article listing works; every article shows `favorited: false` (no viewer context) | P1 | `validation.test.js:157` | ✅ Pass | — |

## Module: Tags

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-TAG-001 | `GET /api/tags` works anonymously and returns a plain array of tag-name strings | P2 | `validation.test.js:167` | ✅ Pass | — |

## Module: Article feed (`GET /api/articles/feed`)

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-FEED-001 | Feed requires authentication (401 anonymous) | P1 | `coverage-gaps.test.js:16` | ✅ Pass | — |
| TC-FEED-002 | Feed is empty when the caller follows no one | P2 | `coverage-gaps.test.js:21` | ✅ Pass | — |
| TC-FEED-003 | Feed shows articles from a followed author and excludes non-followed authors' articles | P0 | `coverage-gaps.test.js:29` | ✅ Pass | — |

## Module: Comment listing (`GET /api/articles/:slug/comments`)

| TC ID | Title | Priority | Automated test | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-CLIST-001 | Listing comments on an article with none returns an empty array, not an error | P2 | `coverage-gaps.test.js:53` | ✅ Pass | — |
| TC-CLIST-002 | Listing comments works anonymously and includes previously posted comments with author info | P1 | `coverage-gaps.test.js:59` | ✅ Pass | — |
| TC-CLIST-003 | Listing comments on a nonexistent article returns 404 | P2 | `coverage-gaps.test.js:73` | ✅ Pass | — |

## Module: Infrastructure / non-functional (exploratory, not part of the 67-test suite proper)

| TC ID | Title | Priority | Method | Result | Bug Ref |
|---|---|---|---|---|---|
| TC-PERF-001 | Repeated simple `GET /api/tags` calls should have stable, low latency | P2 | Manual `curl` timing samples, 5–8 consecutive calls, multiple passes | ⚠️ Fail — mostly 0.27–0.73s, one sample spiked to 5.78s with no app-level error | BUG-013 |
| TC-PERF-002 | The full automated suite should complete without individual request timeouts when run back-to-back | P2 | `npx vitest run` (full suite, twice on 2026-09-17) | ⚠️ Fail — 3–4 tests timed out per run (20s ceiling); server remained healthy throughout and immediately after | BUG-013 |
| TC-PERF-003 | A backend process idle for an extended period should reconnect to the database without a persistent outage | P2 | Manual: after ~2 days idle (2026-09-17 → 2026-09-19), first requests failed | ⚠️ Fail — first several requests returned `500`/`P1001` ("Can't reach database server") even immediately after a full backend restart; raw TCP to the DB host succeeded throughout; the app recovered on its own within roughly a minute with no code change | BUG-013 |
| TC-BUILD-001 | Frontend production build (`vite build`) completes without errors | P1 | `npm run build -w frontend` | ✅ Pass — 174 modules, built in 871ms, no warnings | — |
| TC-BUILD-002 | Pre-existing frontend unit tests pass | P2 | `npx vitest run frontend/src` | ✅ Pass — 6/6 (`dateFormatter`, `errorHandler`) | — |
| TC-BUILD-003 | Pre-existing backend unit tests pass | P2 | `npx vitest run backend/helper/helpers.test.js` | ✅ Pass — 6/6 (`slugify`) | — |

---

## Module: Playwright suite (API + full browser UI, added 2026-09-20)

A second, independently-written automation suite lives under **`e2e/`** (Playwright, not Vitest) — 48 API tests (`e2e/api/`) covering the same ground as the table above via a different framework, plus **34 browser-driven UI tests (`e2e/web/`) that exercise every page in the frontend** (Home, Login, Sign Up, Settings, Article Editor create/edit, Article view, Profile, 404), something no test in this document above could do without a browser. Full breakdown, rationale, and the three test-authoring bugs caught and fixed along the way are in `TEST-STRATEGY.md` §7.1 — not duplicated here to avoid two documents drifting out of sync on the same 82 rows. Headlines:

- **82/82 pass** (`npx playwright test`, most recent full run, 2026-09-20).
- `BUG-014` was reproduced as a **full end-to-end browser test** (real Settings form → real Login form), not just an API call — see `e2e/web/settings.spec.js`.
- `BUG-010`'s severity was revised (High → Medium) after live browser testing — see `BUG-REPORTS.md`.

---

## Totals

- **67** automated API test cases (`backend/tests/qa/`, 6 files), **67/67 pass** (most recent full run).
- **82** additional automated tests in the Playwright suite (48 API + 34 browser UI), **82/82 pass** — see the module above.
- Every endpoint in the documented API surface (`TEST-STRATEGY.md` §2.3) now has at least one passing automated test — confirmed by an explicit endpoint-by-endpoint audit on 2026-09-19, which is what surfaced and closed the `feed`/comment-listing gap described above.
- **12** of those 67 cases document a confirmed defect (Result = ⚠️ Fail against correct expected behavior) — these map to 10 of the 13 entries in `BUG-REPORTS.md` (BUG-001 through BUG-012, excluding BUG-013 which is infrastructure-only and not expressible as a single deterministic API assertion).
- **6** additional non-functional/exploratory cases (performance + build/regression health), of which 3 surfaced or reinforced BUG-013.
- **0** fabricated results — every ✅/⚠️ above corresponds to an actual test run or manual reproduction captured during this session (see `BUG-REPORTS.md` for the raw evidence behind every ⚠️ row, and `TEST-STRATEGY.md` §7 for the full suite console output summary).
