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

test.describe("Article ownership", () => {
  test("owner can update their own article", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.put(`articles/${article.article.slug}`, {
      headers: authHeader(userA.token),
      data: { article: { body: "updated" } },
    });
    expect(res.status()).toBe(200);
  });

  test("non-owner cannot update another user's article", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.put(`articles/${article.article.slug}`, {
      headers: authHeader(userB.token),
      data: { article: { body: "hijacked" } },
    });
    expect(res.status()).toBe(403);
  });

  test("non-owner cannot delete another user's article", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.delete(`articles/${article.article.slug}`, { headers: authHeader(userB.token) });
    expect(res.status()).toBe(403);
  });

  test("owner can delete their own article", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.delete(`articles/${article.article.slug}`, { headers: authHeader(userA.token) });
    expect(res.status()).toBe(200);
    const gone = await request.get(`articles/${article.article.slug}`);
    expect(gone.status()).toBe(404);
  });

  test("anonymous cannot create an article", async ({ request }) => {
    const res = await request.post("articles", { data: { article: { title: "x", description: "d", body: "b" } } });
    expect(res.status()).toBe(401);
  });

  test("updating a nonexistent article returns 404, not 403", async ({ request }) => {
    const res = await request.put("articles/does-not-exist-pw", {
      headers: authHeader(userA.token),
      data: { article: { body: "x" } },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("Comment ownership", () => {
  test("comment author can delete their own comment", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const comment = await request.post(`articles/${article.article.slug}/comments`, {
      headers: authHeader(userB.token),
      data: { comment: { body: "hi" } },
    });
    const commentBody = await comment.json();
    const res = await request.delete(`articles/${article.article.slug}/comments/${commentBody.comment.id}`, {
      headers: authHeader(userB.token),
    });
    expect(res.status()).toBe(200);
  });

  test("BUSINESS RULE: the article's author cannot delete a comment they didn't write", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const comment = await request.post(`articles/${article.article.slug}/comments`, {
      headers: authHeader(userB.token),
      data: { comment: { body: "hi" } },
    });
    const commentBody = await comment.json();
    const res = await request.delete(`articles/${article.article.slug}/comments/${commentBody.comment.id}`, {
      headers: authHeader(userA.token),
    });
    expect(res.status()).toBe(403);
  });

  test("anonymous cannot post a comment", async ({ request }) => {
    const { body: article } = await createArticle(request, userA.token);
    const res = await request.post(`articles/${article.article.slug}/comments`, { data: { comment: { body: "hi" } } });
    expect(res.status()).toBe(401);
  });
});
