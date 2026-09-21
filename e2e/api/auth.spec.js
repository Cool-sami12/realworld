const { test, expect } = require("@playwright/test");
const { registerUser, registerAndLogin, uniqueEmail, authHeader } = require("./helpers");

test.describe("Registration", () => {
  test("valid signup returns 201 with a token and no password/id leaked", async ({ request }) => {
    const { res, body } = await registerUser(request);
    expect(res.status()).toBe(201);
    expect(body.user).toHaveProperty("token");
    expect(body.user).not.toHaveProperty("password");
    expect(body.user).not.toHaveProperty("id");
  });

  test("duplicate email is rejected", async ({ request }) => {
    const first = await registerUser(request);
    const second = await request.post("users", {
      data: { user: { email: first.credentials.email, username: "other-" + Date.now(), password: "SecurePass123!" } },
    });
    expect(second.status()).toBe(422);
  });

  test("duplicate username is rejected", async ({ request }) => {
    const first = await registerUser(request);
    const second = await request.post("users", {
      data: { user: { email: uniqueEmail(), username: first.credentials.username, password: "SecurePass123!" } },
    });
    expect(second.status()).toBe(422);
  });

  test("missing username returns 422", async ({ request }) => {
    const res = await request.post("users", { data: { user: { email: uniqueEmail(), password: "SecurePass123!" } } });
    expect(res.status()).toBe(422);
  });

  test("missing password returns 422", async ({ request }) => {
    const res = await request.post("users", { data: { user: { email: uniqueEmail(), username: "u" + Date.now() } } });
    expect(res.status()).toBe(422);
  });

  test("FINDING: malformed email format is accepted (BUG-007)", async ({ request }) => {
    const { res } = await registerUser(request, { email: `not-an-email-${Date.now()}` });
    expect(res.status()).toBe(201);
  });
});

test.describe("Login", () => {
  test("valid credentials return a token", async ({ request }) => {
    const user = await registerAndLogin(request);
    const res = await request.post("users/login", { data: { user: { email: user.email, password: user.password } } });
    expect(res.status()).toBe(200);
    expect((await res.json()).user).toHaveProperty("token");
  });

  test("wrong password is rejected", async ({ request }) => {
    const user = await registerAndLogin(request);
    const res = await request.post("users/login", { data: { user: { email: user.email, password: "wrong" } } });
    expect(res.status()).toBe(422);
  });

  test("unknown email is rejected", async ({ request }) => {
    const res = await request.post("users/login", { data: { user: { email: uniqueEmail(), password: "x" } } });
    expect(res.status()).toBe(404);
  });

  test("FINDING: login JWT omits the username claim (BUG-004)", async ({ request }) => {
    const user = await registerAndLogin(request);
    const res = await request.post("users/login", { data: { user: { email: user.email, password: user.password } } });
    const token = (await res.json()).user.token;
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    expect(payload.username).toBeUndefined();
  });
});

test.describe("Authenticated access", () => {
  test("GET /user without a token returns 401", async ({ request }) => {
    const res = await request.get("user");
    expect(res.status()).toBe(401);
  });

  test("GET /user with a valid token returns the current user", async ({ request }) => {
    const user = await registerAndLogin(request);
    const res = await request.get("user", { headers: authHeader(user.token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).user.email).toBe(user.email);
  });

  test("FINDING: malformed Authorization header returns 500 instead of 401 (BUG-006)", async ({ request }) => {
    const res = await request.get("user", { headers: { Authorization: "Token" } });
    expect(res.status()).toBe(500);
  });
});
