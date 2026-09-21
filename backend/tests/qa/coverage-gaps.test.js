import { describe, test, expect, beforeAll } from "vitest";
import { request, registerAndLogin } from "./helpers.js";

// These two endpoints (GET /articles/feed, GET /articles/:slug/comments) were
// missed by the original test suite. Added after an explicit gap-check confirmed
// no existing test called either one.

let userA;
let userB;

beforeAll(async () => {
  userA = await registerAndLogin();
  userB = await registerAndLogin();
});

const createArticle = async (token, title) =>
  request("POST", "/articles", {
    token,
    body: { article: { title, description: "d", body: "b", tagList: [] } },
  });

describe("GET /articles/feed", () => {
  test("feed requires authentication", async () => {
    const res = await request("GET", "/articles/feed", {});
    expect(res.status).toBe(401);
  });

  test("feed is empty when the caller follows no one", async () => {
    const res = await request("GET", "/articles/feed", { token: userB.token });
    expect(res.status).toBe(200);
    expect(res.body.articlesCount).toBe(0);
    expect(res.body.articles).toEqual([]);
  });

  test("feed shows articles from a followed author, and none from a non-followed author", async () => {
    const title = `Feed-${Date.now()}`;
    const article = await createArticle(userA.token, title);
    expect(article.status).toBe(201);

    // Not following yet: article should not appear.
    const before = await request("GET", "/articles/feed", { token: userB.token });
    expect(before.body.articles.some((a) => a.slug === article.body.article.slug)).toBe(false);

    await request("POST", `/profiles/${userA.username}/follow`, { token: userB.token });

    const after = await request("GET", "/articles/feed", { token: userB.token });
    expect(after.status).toBe(200);
    expect(after.body.articles.some((a) => a.slug === article.body.article.slug)).toBe(true);

    await request("DELETE", `/profiles/${userA.username}/follow`, { token: userB.token });
  });
});

describe("GET /articles/:slug/comments", () => {
  let slug;

  beforeAll(async () => {
    const article = await createArticle(userA.token, `CommentsList-${Date.now()}`);
    slug = article.body.article.slug;
  });

  test("listing comments on an article with none returns an empty array, not an error", async () => {
    const res = await request("GET", `/articles/${slug}/comments`, {});
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual([]);
  });

  test("listing comments works anonymously and includes previously posted comments", async () => {
    const posted = await request("POST", `/articles/${slug}/comments`, {
      token: userB.token,
      body: { comment: { body: "first comment" } },
    });
    expect(posted.status).toBe(201);

    const res = await request("GET", `/articles/${slug}/comments`, {});
    expect(res.status).toBe(200);
    expect(res.body.comments.length).toBe(1);
    expect(res.body.comments[0].body).toBe("first comment");
    expect(res.body.comments[0].author.username).toBe(userB.username);
  });

  test("listing comments on a nonexistent article returns 404", async () => {
    const res = await request("GET", "/articles/does-not-exist-qa/comments", {});
    expect(res.status).toBe(404);
  });
});
