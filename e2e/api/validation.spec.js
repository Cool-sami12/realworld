const { test, expect } = require("@playwright/test");
const { registerAndLogin, authHeader } = require("./helpers");

let user;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: "http://localhost:3001/api/" });
  user = await registerAndLogin(request);
  await request.dispose();
});

test.describe("Article validation", () => {
  test("missing title returns 422", async ({ request }) => {
    const res = await request.post("articles", {
      headers: authHeader(user.token),
      data: { article: { description: "d", body: "b" } },
    });
    expect(res.status()).toBe(422);
  });

  test("omitting tagList defaults to an empty list", async ({ request }) => {
    const res = await request.post("articles", {
      headers: authHeader(user.token),
      data: { article: { title: `NoTags-${Date.now()}`, description: "d", body: "b" } },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).article.tagList).toEqual([]);
  });

  test("FINDING: no length limit — a 20,000 char body is accepted (BUG-009)", async ({ request }) => {
    const res = await request.post("articles", {
      headers: authHeader(user.token),
      data: { article: { title: `Long-${Date.now()}`, description: "d", body: "x".repeat(20000) } },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).article.body.length).toBe(20000);
  });

  test("SECURITY FINDING: a <script> payload round-trips unescaped (BUG-010)", async ({ request }) => {
    const payload = '<script>alert(document.cookie)</script>';
    const res = await request.post("articles", {
      headers: authHeader(user.token),
      data: { article: { title: `XSS-${Date.now()}`, description: "d", body: payload } },
    });
    expect((await res.json()).article.body).toBe(payload);
  });

  test("duplicate title is rejected", async ({ request }) => {
    const title = `Dup-${Date.now()}`;
    await request.post("articles", { headers: authHeader(user.token), data: { article: { title, description: "d", body: "b" } } });
    const res = await request.post("articles", { headers: authHeader(user.token), data: { article: { title, description: "d2", body: "b2" } } });
    expect(res.status()).toBe(422);
  });
});

test.describe("Comment validation", () => {
  test("empty comment body returns 422", async ({ request }) => {
    const article = await request.post("articles", {
      headers: authHeader(user.token),
      data: { article: { title: `ForComment-${Date.now()}`, description: "d", body: "b" } },
    });
    const slug = (await article.json()).article.slug;
    const res = await request.post(`articles/${slug}/comments`, { headers: authHeader(user.token), data: { comment: { body: "" } } });
    expect(res.status()).toBe(422);
  });
});

test.describe("Pagination", () => {
  test("FINDING: offset is multiplied by limit server-side, not a raw skip count (BUG-012)", async ({ request }) => {
    const page0 = await request.get("articles?limit=2&offset=0");
    const page1 = await request.get("articles?limit=2&offset=1");
    const slugs0 = (await page0.json()).articles.map((a) => a.slug);
    const slugs1 = (await page1.json()).articles.map((a) => a.slug);
    expect(slugs0.filter((s) => slugs1.includes(s)).length).toBe(0);
  });
});
