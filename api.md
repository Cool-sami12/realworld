# api.md — RealWorld / Conduit backend API reference (for Postman)

Documents every endpoint currently exposed by `backend/` (local Prisma/Neon working tree), with exact request/response payloads, so you can build a Postman collection directly from this file. All shapes below were confirmed against the live source (`backend/controllers/*.js`, `backend/routes/*.js`) on 2026-09-19, and every example response is either a literal capture from a real request made during this session's testing, or a byte-for-byte match to what the code constructs.

For known quirks/defects referenced inline (`BUG-00X`), see `BUG-REPORTS.md` in this repo for full repro details — they're noted here because they affect what you should actually expect back in Postman, not as a aside.

---

## 0. Postman setup

**Base URL:** `http://localhost:3001/api` (backend must be running: `cd backend && npm run dev`)

**Recommended Postman environment variables:**

| Variable | Example value | Set from |
|---|---|---|
| `baseUrl` | `http://localhost:3001/api` | manual |
| `token` | (JWT string) | Tests script on Register/Login requests — see below |

**Auth header format (not "Bearer"):**
```
Authorization: Token {{token}}
```
This app uses the literal word `Token`, not the more common `Bearer`. Sending `Bearer <jwt>` will be treated as no credentials at all (endpoints requiring auth will 401; anonymous-optional endpoints will silently treat you as logged out).

**Auto-capture the token in Postman:** on the Register and Login requests, add this to the request's **Tests** tab so every subsequent request can reuse `{{token}}`:
```js
const json = pm.response.json();
if (json.user && json.user.token) {
  pm.environment.set("token", json.user.token);
}
```

**Content-Type:** every request with a body needs `Content-Type: application/json`.

**Auth requirement legend:** 🔓 public · 🔒? auth optional (anonymous allowed, response differs if logged in) · 🔒 auth required (401 without a valid token).

---

## 1. Auth / Users

### 1.1 Register — 🔓 `POST /api/users`

**Request body:**
```json
{
  "user": {
    "username": "jake",
    "email": "jake@example.com",
    "password": "SecurePass123!"
  }
}
```
- `bio` and `image` are also accepted (optional, default to `null`).
- `username`, `email`, `password` are all required — missing any one returns `422`.
- **No format validation exists** on `email` (any non-empty string is accepted) and **no strength/length check** on `password` (a 1-character password is accepted) — `BUG-007`, `BUG-008`.

**Success — `201 Created`:**
```json
{
  "user": {
    "email": "jake@example.com",
    "username": "jake",
    "bio": null,
    "image": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
  }
}
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 422 | missing `username`/`email`/`password` | `{"errors":{"body":["A username is required"]}}` (message varies by field) |
| 422 | email already registered | `{"errors":{"body":["Email already exists.. try logging in"]}}` |
| 422 | username already registered | `{"errors":{"body":["Username already exists.. "]}}` |

---

### 1.2 Login — 🔓 `POST /api/users/login`

**Request body:**
```json
{
  "user": {
    "email": "jake@example.com",
    "password": "SecurePass123!"
  }
}
```

**Success — `200 OK`:**
```json
{
  "user": {
    "email": "jake@example.com",
    "username": "jake",
    "bio": null,
    "image": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
  }
}
```
⚠️ **`BUG-004`:** this token's payload is `{ email, iat }` only — it is missing the `username` claim that Register-issued tokens include. Not visible in the response body, only if you decode the JWT.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | email not registered | `{"errors":{"body":["Email not found sign in first"]}}` |
| 422 | wrong password | `{"errors":{"body":["Wrong email/password combination"]}}` |

---

### 1.3 Get current user — 🔒 `GET /api/user`

**Headers:** `Authorization: Token {{token}}`
**Body:** none

**Success — `200 OK`:**
```json
{
  "user": {
    "email": "jake@example.com",
    "username": "jake",
    "bio": null,
    "image": null,
    "token": "<the same token you sent>"
  }
}
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no `Authorization` header | `{"errors":{"body":["You need to login first!"]}}` |
| 500 | `Authorization: Token` header present but with **no token value** after it | `{"errors":{"body":["Token missing or malformed"]}}` — ⚠️ **`BUG-006`**: should be 401, is actually 500 |
| 404 | token is well-formed but names an email with no matching user (e.g., deleted account) | `{"errors":{"body":["User not found "]}}` — ⚠️ **`BUG-003`**: server also throws an unhandled exception after sending this response (visible only in server logs, not in the Postman response) |

---

### 1.4 Update current user — 🔒 `PUT /api/user`

**Headers:** `Authorization: Token {{token}}`

**Request body (any subset of these fields):**
```json
{
  "user": {
    "email": "newemail@example.com",
    "username": "newusername",
    "bio": "I write code.",
    "image": "https://example.com/avatar.png",
    "password": "NewPassword456!"
  }
}
```

⚠️ **`BUG-001` (critical, reproduces on almost every real Postman call to this endpoint):** if you omit `password` from the body — e.g. you only send `{"user":{"bio":"..."}}` to update a bio — this endpoint currently **crashes**:

**Actual response you will get, `500 Internal Server Error`:**
```json
{"errors":{"body":["data and salt arguments required"]}}
```
**Workaround to actually test a successful update in Postman today:** always include `password` in the body, even if unchanged, e.g.:
```json
{ "user": { "bio": "I write code.", "password": "SecurePass123!" } }
```

**Success — `200 OK`** (when the workaround above is used):
```json
{
  "user": {
    "email": "jake@example.com",
    "username": "jake",
    "bio": "I write code.",
    "image": null,
    "token": "<same token>"
  }
}
```

⚠️ **`BUG-005`:** there is no field allowlist server-side — any key you put in `user` (e.g. `"id": 1`) is forwarded to the database update call. It cannot currently be used to modify another account (the row targeted is always your own, derived from your token), but don't rely on the endpoint to reject unexpected fields — it won't.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 500 | password omitted (see above) | `{"errors":{"body":["data and salt arguments required"]}}` |
| 422 | new `email`/`username` collides with another account | `{"errors":{"body":["email already exists"]}}` (Prisma unique-constraint message) |

---

## 2. Profiles

### 2.1 Get profile — 🔒? `GET /api/profiles/:username`

**Headers:** `Authorization: Token {{token}}` (optional)

**Success — `200 OK`:**
```json
{
  "profile": {
    "username": "jake",
    "bio": null,
    "image": null,
    "following": false,
    "followersCount": 0,
    "email": "jake@example.com"
  }
}
```
⚠️ **`BUG-002` (critical):** the `email` field above is present **regardless of who's asking** — including a fully anonymous request with no `Authorization` header at all, and including a different, unrelated logged-in user. Per the RealWorld Profile schema, `email` should not appear here at all. This is real, current behavior — don't be surprised when Postman shows it.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | username doesn't exist | `{"errors":{"body":["User profile not found "]}}` |

---

### 2.2 Follow a user — 🔒 `POST /api/profiles/:username/follow`

**Headers:** `Authorization: Token {{token}}`
**Body:** none

**Success — `200 OK`:**
```json
{
  "profile": {
    "username": "jake",
    "bio": null,
    "image": null,
    "following": true,
    "followersCount": 1,
    "email": "jake@example.com"
  }
}
```
Idempotent — calling this again while already following returns the same `following: true`, `followersCount` does not double-increment.

⚠️ No self-follow guard (`BUG-011`) — you can `POST /api/profiles/<your own username>/follow` and it will succeed.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 404 | username doesn't exist | `{"errors":{"body":["User profile not found "]}}` |

### 2.3 Unfollow a user — 🔒 `DELETE /api/profiles/:username/follow`

Same headers/response shape as 2.2, with `"following": false` and `followersCount` decremented. Calling it when not currently following is a safe no-op (still `200`, still `following: false`).

---

## 3. Articles

### 3.1 List articles — 🔒? `GET /api/articles`

**Headers:** `Authorization: Token {{token}}` (optional)

**Query params (all optional):**
| Param | Type | Meaning |
|---|---|---|
| `author` | string | filter by author's `username` |
| `tag` | string | filter by tag name |
| `favorited` | string | filter to articles favorited by this `username` |
| `limit` | number | page size (default `3`) |
| `offset` | number | ⚠️ **`BUG-012`**: treated as a **page index**, not an item-skip count — the server computes `skip = offset × limit`. So `?limit=10&offset=1` skips **10** items, not 1. Plan your Postman pagination tests around this. |

Example: `GET {{baseUrl}}/articles?limit=5&offset=0&tag=dragons`

**Success — `200 OK`:**
```json
{
  "articles": [
    {
      "slug": "how-to-train-your-dragon",
      "title": "How to train your dragon",
      "description": "Ever wonder how?",
      "body": "It takes a Jacobian",
      "tagList": ["dragons", "training"],
      "createdAt": "2026-09-17T11:06:46.148Z",
      "updatedAt": "2026-09-17T11:06:46.148Z",
      "favorited": false,
      "favoritesCount": 0,
      "author": {
        "username": "jake",
        "bio": null,
        "image": null,
        "following": false,
        "followersCount": 0
      }
    }
  ],
  "articlesCount": 1
}
```
Note: article `author` objects here do **not** include `email` (only the direct `/profiles/:username` endpoint leaks it, per `BUG-002`).

---

### 3.2 Create article — 🔒 `POST /api/articles`

**Headers:** `Authorization: Token {{token}}`

**Request body:**
```json
{
  "article": {
    "title": "How to train your dragon",
    "description": "Ever wonder how?",
    "body": "It takes a Jacobian",
    "tagList": ["dragons", "training"]
  }
}
```
- `title`, `description`, `body` are required (missing any → `422`).
- `tagList` is optional — omit it entirely for a tag-less article (defaults to `[]`); do not send `null`.
- The article's `slug` is auto-generated from `title` (lowercased, non-word characters replaced with `-`). Creating a second article whose title slugifies to the same value returns `422` ("Title already exists..").
- ⚠️ **`BUG-009`:** no length limit on `title`/`description`/`body` — a 20,000+ character `body` is accepted as-is.
- ⚠️ **`BUG-010`:** no sanitization — HTML/`<script>` content in `body` is stored and returned verbatim (confirmed via API; see `BUG-REPORTS.md` for the browser-rendering caveat).

**Success — `201 Created`:** same article shape as in 3.1's list, single object under `"article"`.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 422 | missing `title`/`description`/`body` | `{"errors":{"body":["A title is required"]}}` (varies) |
| 422 | duplicate title/slug | `{"errors":{"body":["Title already exists.. "]}}` |

---

### 3.3 Feed — 🔒 `GET /api/articles/feed`

**Headers:** `Authorization: Token {{token}}`
**Query params:** `limit`, `offset` (same semantics/caveat as 3.1)

Returns only articles authored by users **you follow**. Same response shape as 3.1. If you follow no one, or none of the people you follow have posted, you'll get `{"articles": [], "articlesCount": 0}` (not an error).

**Errors:** `401` if no token — same shape as above.

---

### 3.4 Get single article — 🔒? `GET /api/articles/:slug`

**Headers:** `Authorization: Token {{token}}` (optional)

**Success — `200 OK`:** single article object (same shape as list items).

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | slug doesn't exist | `{"errors":{"body":["Article not found "]}}` |

---

### 3.5 Update article — 🔒 `PUT /api/articles/:slug`

**Headers:** `Authorization: Token {{token}}` (must belong to the article's author)

**Request body (any subset):**
```json
{
  "article": {
    "title": "Did you train your dragon?",
    "body": "Updated body text"
  }
}
```
Changing `title` regenerates `slug` — the URL you use for subsequent requests changes too. `description`/`body` can be updated independently.

**Success — `200 OK`:** updated article object.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 403 | token belongs to someone other than the article's author | `{"errors":{"body":["You are not the author of this article"]}}` |
| 404 | slug doesn't exist (checked **before** the ownership check) | `{"errors":{"body":["Article not found "]}}` |

---

### 3.6 Delete article — 🔒 `DELETE /api/articles/:slug`

**Headers:** `Authorization: Token {{token}}` (must belong to the article's author)
**Body:** none

**Success — `200 OK`:**
```json
{ "message": { "body": ["Article deleted successfully"] } }
```

**Errors:** same 401/403/404 shapes as 3.5.

---

## 4. Comments

### 4.1 List comments — 🔒? `GET /api/articles/:slug/comments`

**Headers:** `Authorization: Token {{token}}` (optional)

**Success — `200 OK`:**
```json
{
  "comments": [
    {
      "id": 1,
      "body": "Great article!",
      "createdAt": "2026-09-17T11:10:19.338Z",
      "updatedAt": "2026-09-17T11:10:19.338Z",
      "author": {
        "username": "jane",
        "bio": null,
        "image": null,
        "following": false,
        "followersCount": 0
      }
    }
  ]
}
```
An article with no comments returns `{"comments": []}`, not an error.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 404 | article slug doesn't exist | `{"errors":{"body":["Article not found "]}}` |

---

### 4.2 Create comment — 🔒 `POST /api/articles/:slug/comments`

**Headers:** `Authorization: Token {{token}}`

**Request body:**
```json
{ "comment": { "body": "Great article!" } }
```
- `body` is required and must be non-empty — missing/empty → `422`.
- ⚠️ **`BUG-010`:** no sanitization here either — HTML/script content round-trips verbatim.

**Success — `201 Created`:**
```json
{
  "comment": {
    "id": 1,
    "body": "Great article!",
    "createdAt": "2026-09-17T11:10:19.338Z",
    "updatedAt": "2026-09-17T11:10:19.338Z",
    "author": { "username": "jane", "bio": null, "image": null, "following": false, "followersCount": 0 }
  }
}
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 422 | missing/empty `body` | `{"errors":{"body":["Comment body is required"]}}` |
| 404 | article slug doesn't exist | `{"errors":{"body":["Article not found "]}}` |

---

### 4.3 Delete comment — 🔒 `DELETE /api/articles/:slug/comments/:commentId`

**Headers:** `Authorization: Token {{token}}` (must belong to the **comment's** author — note: the article's author cannot delete someone else's comment on their own article; only the comment's own author can)

**Success — `200 OK`:**
```json
{ "message": { "body": ["Comment deleted successfully"] } }
```

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 403 | token belongs to someone other than the comment's author | `{"errors":{"body":["You are not the author of this comment"]}}` |
| 404 | `commentId` doesn't exist | `{"errors":{"body":["Comment not found "]}}` |

---

## 5. Favorites

### 5.1 Favorite article — 🔒 `POST /api/articles/:slug/favorite`

**Headers:** `Authorization: Token {{token}}`
**Body:** none

**Success — `200 OK`:** full article object (same shape as 3.4) with `"favorited": true` and `favoritesCount` incremented. Idempotent — favoriting twice does not double-count.

**Errors:**
| Status | Cause | Body |
|---|---|---|
| 401 | no token | `{"errors":{"body":["You need to login first!"]}}` |
| 404 | slug doesn't exist | `{"errors":{"body":["Article not found "]}}` |

### 5.2 Unfavorite article — 🔒 `DELETE /api/articles/:slug/favorite`

Same shapes as 5.1, with `"favorited": false` and `favoritesCount` decremented. Calling it when not currently favorited is a safe no-op.

---

## 6. Tags

### 6.1 List tags — 🔓 `GET /api/tags`

**Body:** none

**Success — `200 OK`:**
```json
{ "tags": ["dragons", "training"] }
```
Plain array of tag-name strings, alphabetically sorted. No pagination, no auth.

---

## Appendix: error status codes at a glance

| Status | Meaning in this API | Example body shape |
|---|---|---|
| 401 | Not authenticated (no/invalid token, or an action that requires login) | `{"errors":{"body":["You need to login first!"]}}` |
| 403 | Authenticated, but not the resource's owner | `{"errors":{"body":["You are not the author of this article"]}}` |
| 404 | Resource doesn't exist | `{"errors":{"body":["Article not found "]}}` |
| 422 | Validation failure (missing field, duplicate email/username/title, wrong password) | `{"errors":{"body":["A title is required"]}}` |
| 500 | Uncaught server error — includes two known bugs you'll actually hit in normal Postman testing: `PUT /api/user` without `password` (`BUG-001`), and a malformed `Authorization` header (`BUG-006`) | `{"errors":{"body":["<raw error message>"]}}` |

Every error response, across every endpoint, has the same envelope: `{"errors":{"body":["<message>"]}}` — a single-element array. Build one Postman test assertion for this shape and reuse it across the whole collection.
