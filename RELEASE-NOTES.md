# RELEASE-NOTES.md — Release Readiness Communication & Recommendation

**Subject:** RealWorld/Conduit application — local working tree (Prisma/Neon backend migration + current frontend), assessed 2026-09-17 through 2026-09-21.
**Prepared for:** whoever owns the ship/no-ship decision for this build.
**Prepared from:** `TEST-STRATEGY.md`, `TEST-CASES.md`, `BUG-REPORTS.md`, and 149 passing automated tests (67 Vitest API + 48 Playwright API + 34 Playwright browser UI — see §5). This document doesn't repeat that evidence; it interprets it for a decision.

---

## Recommendation: **Do not release as-is.**

Three defects would ship broken or unsafe core functionality to every user. All three are already understood, and fixes exist or are straightforward — this is a **short, well-defined delay**, not an open-ended one. Everything else found is real but can reasonably wait for a fast-follow.

---

## 1. Executive summary

We tested this build thoroughly: every API endpoint, every page in the UI, ownership and permission rules across two independent users, input validation, and basic reliability under light load — 149 automated tests across two independent test frameworks, all passing, plus manual exploratory testing. The good news is structural: the parts of the app that are hardest to get right — who can edit or delete what, favoriting/following logic, ownership enforcement — all work correctly. We found no authorization bypass anywhere.

The bad news is that three defects sit directly on the two most common things a new user does — edit their profile, and view someone else's profile — and one of them silently locks users out of their own account. None of these require an attacker; they happen from completely ordinary use. That's why this isn't a judgment call: the recommendation is to fix these three before anyone relies on this build.

## 2. What "ready" looks like here, and what's missing

**What's already true of this build:**
- Every article/comment ownership rule was tested with two independent accounts and holds up (you cannot edit, delete, or otherwise interfere with another user's content).
- Favoriting and following are idempotent and correct from every angle tested.
- The frontend builds cleanly and every page has automated coverage.
- 82 browser-and-API Playwright tests plus 67 API-level Vitest tests all pass; CI now runs the Playwright suite automatically on every push/PR (`.github/workflows/qa-e2e.yml`).

**What's blocking release:**

| # | Issue, in plain terms | Who's affected | Reference |
|---|---|---|---|
| 1 | Editing your profile (bio, photo, anything) crashes with an error page — unless you also happen to retype your password. | Every user who edits their profile | `BUG-001` |
| 2 | Anyone — including someone not even logged in — can look up another user's email address just by knowing their username. | Every registered user's email | `BUG-002` |
| 3 | Saving your profile settings **silently resets your password to blank**, and the login page won't let you type a blank password back in to fix it. You find out you're locked out the next time you try to log in — with no warning at the time it happened. | Every user who saves their Settings page even once | `BUG-014` |

Issue 3 is the one to lose sleep over: it's not a crash, so nothing alerts the user or support team that anything went wrong. It happens on the single most routine account-management action there is.

## 3. Honest trade-offs and caveats (read before acting on this document)

We'd rather you know the edges of this assessment than assume it's more complete than it is:

- **This is not a test of the published, public version of the app.** The codebase we tested has a real architecture change layered on top (the database/ORM was migrated from Sequelize to Prisma+Neon), and — at the repository owner's explicit request, for comparison purposes — six specific old behaviors were deliberately restored, including the three blocking issues above. That was a deliberate choice made with full knowledge of what it would surface, not an accident, but it means: **if you're asking "is the app people currently see already broken this way," the honest answer is we don't know — we didn't test that version.** `TEST-STRATEGY.md` §0 has the full explanation.
- **Security testing was real but not exhaustive.** We found and manually verified an email-exposure bug and a missing-sanitization gap in user content, but this was black-box functional testing, not a penetration test. Treat both as leads for a real security review, not a clean bill of health beyond what's listed.
- **One infrastructure risk (`BUG-013`) is about the database, not the code.** We saw repeated, reproducible episodes of the Neon (hosted Postgres) connection being slow or briefly unreachable after idle periods. This didn't corrupt anything and the app recovered on its own every time, but it's worth resolving — or at least budgeting for — before pointing real traffic at this database configuration. Our CI pipeline sidesteps this entirely by using a disposable database instead, which is the right call for CI but means CI passing doesn't tell you anything about this specific risk.
- **Browser testing covers one browser.** All UI automation runs on Chromium only. No Firefox/Safari/mobile-viewport testing was done.
- **We didn't formally load-test.** Everything we know about performance came from ordinary functional testing, not a dedicated load test.

None of these caveats change the recommendation in §1 — the three blocking issues are proven, reproduced, and understood regardless of any of the above.

## 4. Suggested path to a "yes"

1. Fix `BUG-001` and `BUG-014` together — they share one root cause (the password-update logic treats "no password sent" the same as "hash this password"), and `BUG-014` additionally needs a small frontend change (don't send a password field at all when the user didn't type one).
2. Fix `BUG-002` (stop returning email on the public profile endpoint).
3. Re-run the automated suite (`npm run test:e2e`) — this is fast and already wired into CI, so this is a low-cost verification step, not a re-review from scratch.
4. Everything else in `BUG-REPORTS.md` (`BUG-003` through `BUG-013`, minus the three above) is real but reasonable to track and fix on a normal fast-follow cadence — none of it is release-blocking on its own. `TEST-STRATEGY.md`'s closing section has the full prioritized list.

## 5. Evidence backing this document

- 67 automated API tests (Vitest, `backend/tests/qa/`) — pass.
- 48 automated API tests (Playwright, `e2e/api/`) — pass.
- 34 automated browser UI tests covering every page (Playwright, `e2e/web/`) — pass.
- 14 formal defect reports with reproduction steps (`BUG-REPORTS.md`).
- Full architecture, risk, and methodology writeup (`TEST-STRATEGY.md`).

Nothing in this document was asserted without a corresponding automated test result or a manually reproduced, captured example in the files above — if you want to verify any claim here yourself, the exact command to reproduce it is in `TEST-CASES.md` or `BUG-REPORTS.md`.

---

## Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| QA | Independent assessment (this document) | Recommend: **No-Go**, conditional on §4 | 2026-09-21 |
| Engineering owner | _______________ | _______________ | _______________ |
| Release owner | _______________ | _______________ | _______________ |
