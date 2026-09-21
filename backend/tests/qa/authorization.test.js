import { describe, test, expect, beforeAll } from "vitest";
import { request, registerAndLogin } from "./helpers.js";

let userA;
let userB;

beforeAll(async () => {
  userA = await registerAndLogin();
  userB = await registerAndLogin();
});

const createArticle = async (token, overrides = {}) => {
  const title = overrides.title || `QA Article ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return request("POST", "/articles", {
    token,
    body: {
      article: {
        title,
        description: "qa description",
        body: "qa body",
        tagList: ["qa"],
        ...overrides,
      },
    },
  });
};

describe("Article ownership", () => {
  test("owner (User A) can update their own article", async () => {
    const created = await createArticle(userA.token);
    expect(created.status).toBe(201);
    const slug = created.body.article.slug;

    const update = await request("PUT", `/articles/${slug}`, {
      token: userA.token,
      body: { article: { body: "updated by owner" } },
    });
    expect(update.status).toBe(200);
    expect(update.body.article.body).toBe("updated by owner");
  });

  test("non-owner (User B) cannot update User A's article", async () => {
    const created = await createArticle(userA.token);
    const slug = created.body.article.slug;

    const update = await request("PUT", `/articles/${slug}`, {
      token: userB.token,
      body: { article: { body: "hijacked by B" } },
    });
    expect(update.status).toBe(403);
  });

  test("non-owner (User B) cannot delete User A's article", async () => {
    const created = await createArticle(userA.token);
    const slug = created.body.article.slug;

    const del = await request("DELETE", `/articles/${slug}`, { token: userB.token });
    expect(del.status).toBe(403);

    // Confirm it still exists afterwards.
    const stillThere = await request("GET", `/articles/${slug}`, {});
    expect(stillThere.status).toBe(200);
  });

  test("owner (User A) can delete their own article", async () => {
    const created = await createArticle(userA.token);
    const slug = created.body.article.slug;

    const del = await request("DELETE", `/articles/${slug}`, { token: userA.token });
    expect(del.status).toBe(200);

    const gone = await request("GET", `/articles/${slug}`, {});
    expect(gone.status).toBe(404);
  });

  test("anonymous (no token) cannot create an article", async () => {
    const res = await createArticle(undefined);
    expect(res.status).toBe(401);
  });

  test("updating/deleting a nonexistent article returns 404, not 403", async () => {
    const update = await request("PUT", "/articles/this-slug-does-not-exist-qa", {
      token: userA.token,
      body: { article: { body: "x" } },
    });
    expect(update.status).toBe(404);

    const del = await request("DELETE", "/articles/this-slug-does-not-exist-qa", { token: userA.token });
    expect(del.status).toBe(404);
  });
});

describe("Comment ownership", () => {
  test("comment author can delete their own comment", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const comment = await request("POST", `/articles/${slug}/comments`, {
      token: userB.token,
      body: { comment: { body: "nice article" } },
    });
    expect(comment.status).toBe(201);

    const del = await request("DELETE", `/articles/${slug}/comments/${comment.body.comment.id}`, {
      token: userB.token,
    });
    expect(del.status).toBe(200);
  });

  test("BUSINESS RULE: the article's author cannot delete a comment they didn't write (only the comment's author can)", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const comment = await request("POST", `/articles/${slug}/comments`, {
      token: userB.token,
      body: { comment: { body: "comment by B on A's article" } },
    });
    expect(comment.status).toBe(201);

    // User A owns the article but did not write the comment.
    const del = await request("DELETE", `/articles/${slug}/comments/${comment.body.comment.id}`, {
      token: userA.token,
    });
    expect(del.status).toBe(403);
  });

  test("anonymous (no token) cannot post a comment", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const res = await request("POST", `/articles/${slug}/comments`, {
      body: { comment: { body: "anon comment" } },
    });
    expect(res.status).toBe(401);
  });

  test("deleting a nonexistent comment returns 404", async () => {
    const article = await createArticle(userA.token);
    const slug = article.body.article.slug;

    const res = await request("DELETE", `/articles/${slug}/comments/999999999`, { token: userA.token });
    expect(res.status).toBe(404);
  });
});
