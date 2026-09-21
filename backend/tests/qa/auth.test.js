import { describe, test, expect } from "vitest";
import { request, registerUser, registerAndLogin, qaEmail, RUN_ID } from "./helpers.js";

describe("Registration", () => {
  test("valid signup returns 201 with token and no password/id leaked", async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty("token");
    expect(res.body.user).toHaveProperty("email");
    expect(res.body.user).toHaveProperty("username");
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("id");
  });

  test("duplicate email is rejected", async () => {
    const first = await registerUser();
    const second = await request("POST", "/users", {
      body: { user: { email: first.credentials.email, username: `other${RUN_ID}`, password: "SecurePass123!" } },
    });
    expect(second.status).toBe(422);
  });

  test("duplicate username is rejected", async () => {
    const first = await registerUser();
    const second = await request("POST", "/users", {
      body: { user: { email: qaEmail(), username: first.credentials.username, password: "SecurePass123!" } },
    });
    expect(second.status).toBe(422);
  });

  test("missing username returns 422", async () => {
    const res = await request("POST", "/users", {
      body: { user: { email: qaEmail(), password: "SecurePass123!" } },
    });
    expect(res.status).toBe(422);
  });

  test("missing password returns 422", async () => {
    const res = await request("POST", "/users", {
      body: { user: { email: qaEmail(), username: `qauser${RUN_ID}x` } },
    });
    expect(res.status).toBe(422);
  });

  test("FINDING: malformed email format is accepted (no email format validation)", async () => {
    const res = await registerUser({ email: `not-an-email-${RUN_ID}`, username: `qabademail${RUN_ID}` });
    expect(res.status).toBe(201);
  });

  test("FINDING: single-character password is accepted (no password strength/length validation)", async () => {
    const res = await registerUser({ password: "a" });
    expect(res.status).toBe(201);
  });
});

describe("Login", () => {
  test("valid credentials return a token", async () => {
    const user = await registerAndLogin();
    const res = await request("POST", "/users/login", {
      body: { user: { email: user.email, password: user.password } },
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("token");
  });

  test("wrong password is rejected", async () => {
    const user = await registerAndLogin();
    const res = await request("POST", "/users/login", {
      body: { user: { email: user.email, password: "wrong-password" } },
    });
    expect(res.status).toBe(422);
  });

  test("unknown email is rejected", async () => {
    const res = await request("POST", "/users/login", {
      body: { user: { email: qaEmail(), password: "whatever" } },
    });
    expect(res.status).toBe(404);
  });

  test("FINDING: login JWT omits username claim (signIn signs raw request body, not the looked-up user)", async () => {
    const user = await registerAndLogin();
    const res = await request("POST", "/users/login", {
      body: { user: { email: user.email, password: user.password } },
    });
    const payload = JSON.parse(Buffer.from(res.body.user.token.split(".")[1], "base64").toString());
    expect(payload.email).toBe(user.email);
    expect(payload.username).toBeUndefined();
  });
});

describe("Authenticated access", () => {
  test("GET /user without a token returns 401", async () => {
    const res = await request("GET", "/user");
    expect(res.status).toBe(401);
  });

  test("GET /user with a valid token returns the current user", async () => {
    const user = await registerAndLogin();
    const res = await request("GET", "/user", { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  test("FINDING: malformed Authorization header ('Token' with no value) returns 500 instead of 401", async () => {
    const res = await fetch("http://localhost:3001/api/user", {
      headers: { Authorization: "Token" },
    });
    expect(res.status).toBe(500);
  });

  test("FINDING: a syntactically valid JWT for a since-deleted/nonexistent user crashes the auth middleware (double next()) after sending a 404", async () => {
    // A token signed with a well-formed payload for an email that has never been registered.
    const jwt = await import("jsonwebtoken");
    const fakeToken = jwt.default.sign({ email: "ghost.qa@example.test" }, "supersecretkey_example");
    const res = await request("GET", "/user", { token: fakeToken });
    // The client only ever observes the first response the server manages to flush (404).
    expect(res.status).toBe(404);
  });
});
