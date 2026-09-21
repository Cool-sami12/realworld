const { test, expect } = require("@playwright/test");
const { registerAndLogin, createArticle, authHeader } = require("./helpers");

let userA;
let userB;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: "http://localhost:3001/api/" });
  userA = await registerAndLogin(request);
  userB = await registerAndLogin(request);
  await request.dispose();
});

test.describe("Favorites", () => {
  test("favoriting sets favorited=true and favoritesCount=1", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.post(`articles/${article.article.slug}/favorite`, { headers: authHeader(userB.token) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.article.favorited).toBe(true);
    expect(body.article.favoritesCount).toBe(1);
  });

  test("IDEMPOTENCY: favoriting twice does not double-count", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    await request.post(`articles/${article.article.slug}/favorite`, { headers: authHeader(userB.token) });
    const res = await request.post(`articles/${article.article.slug}/favorite`, { headers: authHeader(userB.token) });
    expect((await res.json()).article.favoritesCount).toBe(1);
  });

  test("unfavoriting reverses it", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    await request.post(`articles/${article.article.slug}/favorite`, { headers: authHeader(userB.token) });
    const res = await request.delete(`articles/${article.article.slug}/favorite`, { headers: authHeader(userB.token) });
    expect((await res.json()).article.favorited).toBe(false);
  });

  test("anonymous favorite attempt is rejected", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.post(`articles/${article.article.slug}/favorite`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Feed", () => {
  test("feed requires authentication", async ({ request }) => {
    const res = await request.get("articles/feed");
    expect(res.status()).toBe(401);
  });

  test("feed only shows articles from followed authors", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token, { title: `Feed-${Date.now()}` });

    const before = await request.get("articles/feed", { headers: authHeader(userB.token) });
    expect((await before.json()).articles.some((a) => a.slug === article.article.slug)).toBe(false);

    await request.post(`profiles/${userA.username}/follow`, { headers: authHeader(userB.token) });
    const after = await request.get("articles/feed", { headers: authHeader(userB.token) });
    expect((await after.json()).articles.some((a) => a.slug === article.article.slug)).toBe(true);

    await request.delete(`profiles/${userA.username}/follow`, { headers: authHeader(userB.token) });
  });
});

test.describe("Comment listing", () => {
  test("listing comments works anonymously and returns [] when there are none", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token, { title: `Comments-${Date.now()}` });
    const res = await request.get(`articles/${article.article.slug}/comments`);
    expect(res.status()).toBe(200);
    expect((await res.json()).comments).toEqual([]);
  });

  test("listing comments on a nonexistent article returns 404", async ({ request }) => {
    const res = await request.get("articles/does-not-exist-pw/comments");
    expect(res.status()).toBe(404);
  });
});

test.describe("Tags", () => {
  test("GET /tags works anonymously", async ({ request }) => {
    const res = await request.get("tags");
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).tags)).toBe(true);
  });
});
