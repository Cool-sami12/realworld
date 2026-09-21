import { describe, test, expect, beforeAll } from "vitest";
import { request, registerAndLogin } from "./helpers.js";

let userA;
let userB;

beforeAll(async () => {
  userA = await registerAndLogin();
  userB = await registerAndLogin();
});

const createArticle = async (token) => {
  const title = `QA Fav Article ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return request("POST", "/articles", {
    token,
    body: { article: { title, description: "d", body: "b", tagList: [] } },
  });
};

describe("Favorites", () => {
  test("favoriting an article sets favorited=true and favoritesCount=1", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const fav = await request("POST", `/articles/${slug}/favorite`, { token: userB.token });
    expect(fav.status).toBe(200);
    expect(fav.body.article.favorited).toBe(true);
    expect(fav.body.article.favoritesCount).toBe(1);
  });

  test("IDEMPOTENCY: favoriting the same article twice does not double-count", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    await request("POST", `/articles/${slug}/favorite`, { token: userB.token });
    const second = await request("POST", `/articles/${slug}/favorite`, { token: userB.token });
    expect(second.status).toBe(200);
    expect(second.body.article.favoritesCount).toBe(1);
  });

  test("unfavoriting reverses it", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    await request("POST", `/articles/${slug}/favorite`, { token: userB.token });
    const unfav = await request("DELETE", `/articles/${slug}/favorite`, { token: userB.token });
    expect(unfav.status).toBe(200);
    expect(unfav.body.article.favorited).toBe(false);
    expect(unfav.body.article.favoritesCount).toBe(0);
  });

  test("unfavoriting an article that was never favorited is a no-op, not an error", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const res = await request("DELETE", `/articles/${slug}/favorite`, { token: userB.token });
    expect(res.status).toBe(200);
    expect(res.body.article.favorited).toBe(false);
  });

  test("anonymous favorite attempt is rejected", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const res = await request("POST", `/articles/${slug}/favorite`, {});
    expect(res.status).toBe(401);
  });

  test("favoriting a nonexistent article returns 404", async () => {
    const res = await request("POST", "/articles/does-not-exist-qa/favorite", { token: userA.token });
    expect(res.status).toBe(404);
  });

  test("favorited state is visible to a second reader who did not favorite it", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;
    await request("POST", `/articles/${slug}/favorite`, { token: userB.token });

    const asA = await request("GET", `/articles/${slug}`, { token: userA.token });
    expect(asA.body.article.favorited).toBe(false);
    expect(asA.body.article.favoritesCount).toBe(1);

    const asB = await request("GET", `/articles/${slug}`, { token: userB.token });
    expect(asB.body.article.favorited).toBe(true);
    expect(asB.body.article.favoritesCount).toBe(1);
  });
});
