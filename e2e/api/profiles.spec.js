const { test, expect } = require("@playwright/test");
const { registerAndLogin, authHeader } = require("./helpers");

let userA;
let userB;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: "http://localhost:3001/api/" });
  userA = await registerAndLogin(request);
  userB = await registerAndLogin(request);
  await request.dispose();
});

test.describe("Profile visibility", () => {
  test("a user can view their own profile", async ({ request }) => {
    const res = await request.get(`profiles/${userA.username}`, { headers: authHeader(userA.token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).profile.username).toBe(userA.username);
  });

  test("SECURITY FINDING: another authenticated user can read this profile's email (BUG-002)", async ({ request }) => {
    const res = await request.get(`profiles/${userA.username}`, { headers: authHeader(userB.token) });
    expect((await res.json()).profile.email).toBe(userA.email);
  });

  test("SECURITY FINDING: an anonymous request can also read the profile's email (BUG-002)", async ({ request }) => {
    const res = await request.get(`profiles/${userA.username}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).profile.email).toBe(userA.email);
  });

  test("viewing a nonexistent profile returns 404", async ({ request }) => {
    const res = await request.get("profiles/no-such-pw-user");
    expect(res.status()).toBe(404);
  });
});

test.describe("Profile editing", () => {
  test("CRITICAL FINDING: editing bio without a password crashes with 500 (BUG-001)", async ({ request }) => {
    const res = await request.put("user", { headers: authHeader(userA.token), data: { user: { bio: "hi" } } });
    expect(res.status()).toBe(500);
  });

  test("CRITICAL FINDING: editing bio WITH password='' (what the real Settings form sends) silently resets the password (BUG-014)", async ({
    request,
  }) => {
    const user = await registerAndLogin(request);
    const update = await request.put("user", {
      headers: authHeader(user.token),
      data: { user: { bio: "hi", email: user.email, username: user.username, image: "", password: "" } },
    });
    expect(update.status()).toBe(200);

    const oldLogin = await request.post("users/login", { data: { user: { email: user.email, password: user.password } } });
    expect(oldLogin.status()).toBe(422);

    const emptyLogin = await request.post("users/login", { data: { user: { email: user.email, password: "" } } });
    expect(emptyLogin.status()).toBe(200);
  });

  test("editing a profile without a token is rejected", async ({ request }) => {
    const res = await request.put("user", { data: { user: { bio: "x" } } });
    expect(res.status()).toBe(401);
  });
});

test.describe("Follow / Unfollow", () => {
  test("follow increases followersCount and sets following=true", async ({ request }) => {
    const res = await request.post(`profiles/${userA.username}/follow`, { headers: authHeader(userB.token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).profile.following).toBe(true);
  });

  test("unfollow reverses it", async ({ request }) => {
    await request.post(`profiles/${userA.username}/follow`, { headers: authHeader(userB.token) });
    const res = await request.delete(`profiles/${userA.username}/follow`, { headers: authHeader(userB.token) });
    expect((await res.json()).profile.following).toBe(false);
  });

  test("FINDING: self-follow succeeds, no guard (BUG-011)", async ({ request }) => {
    const res = await request.post(`profiles/${userA.username}/follow`, { headers: authHeader(userA.token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).profile.following).toBe(true);
    await request.delete(`profiles/${userA.username}/follow`, { headers: authHeader(userA.token) });
  });
});
