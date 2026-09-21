import { describe, test, expect, beforeAll } from "vitest";
import { request, registerAndLogin } from "./helpers.js";

let userA;
let userB;

beforeAll(async () => {
  userA = await registerAndLogin();
  userB = await registerAndLogin();
});

describe("Profile visibility", () => {
  test("a user can view their own profile", async () => {
    const res = await request("GET", `/profiles/${userA.username}`, { token: userA.token });
    expect(res.status).toBe(200);
    expect(res.body.profile.username).toBe(userA.username);
  });

  test("SECURITY FINDING: an authenticated user can read ANOTHER user's email via the public profile endpoint", async () => {
    const res = await request("GET", `/profiles/${userA.username}`, { token: userB.token });
    expect(res.status).toBe(200);
    expect(res.body.profile.email).toBe(userA.email);
  });

  test("SECURITY FINDING: an unauthenticated (anonymous) request can also read a user's email via the profile endpoint", async () => {
    const res = await request("GET", `/profiles/${userA.username}`, {});
    expect(res.status).toBe(200);
    expect(res.body.profile.email).toBe(userA.email);
  });

  test("viewing a nonexistent profile returns 404", async () => {
    const res = await request("GET", "/profiles/no-such-qa-user", {});
    expect(res.status).toBe(404);
  });
});

describe("Profile editing", () => {
  test("CRITICAL FINDING: editing bio/image WITHOUT also sending a password crashes with 500 (profile editing is broken for the common case)", async () => {
    // The password-update guard ("password !== undefined || password !== \"\"") is always true,
    // so every profile update attempts bcrypt.hash(password) even when no password was sent.
    const res = await request("PUT", "/user", {
      token: userA.token,
      body: { user: { bio: "Updated by QA", image: "https://example.test/avatar.png" } },
    });
    expect(res.status).toBe(500);
  });

  test("editing bio/image succeeds only if a (possibly unrelated) password is also sent", async () => {
    const res = await request("PUT", "/user", {
      token: userA.token,
      body: { user: { bio: "Updated by QA", password: userA.password } },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBe("Updated by QA");

    const confirm = await request("GET", "/user", { token: userA.token });
    expect(confirm.body.user.bio).toBe("Updated by QA");
  });

  test("changing password takes effect on next login", async () => {
    const res = await request("PUT", "/user", {
      token: userA.token,
      body: { user: { password: "NewPassword456!" } },
    });
    expect(res.status).toBe(200);

    const loginOld = await request("POST", "/users/login", {
      body: { user: { email: userA.email, password: userA.password } },
    });
    expect(loginOld.status).toBe(422);

    const loginNew = await request("POST", "/users/login", {
      body: { user: { email: userA.email, password: "NewPassword456!" } },
    });
    expect(loginNew.status).toBe(200);
  });

  test("FINDING: updating a profile with an empty body crashes (bcrypt guard 'password !== undefined || password !== \"\"' is always true)", async () => {
    const res = await request("PUT", "/user", {
      token: userB.token,
      body: { user: {} },
    });
    expect(res.status).toBe(500);
  });

  test("editing a profile without a token is rejected", async () => {
    const res = await request("PUT", "/user", {
      body: { user: { bio: "should not apply" } },
    });
    expect(res.status).toBe(401);
  });

  test("MASS ASSIGNMENT PROBE: a client-supplied numeric id in the update payload does not redirect the write to another user's row", async () => {
    // The controller currently copies every non-password key from req.body.user into the
    // Prisma `data` object with no allowlist. This confirms that, despite that, the WHERE
    // clause is still derived from the authenticated user's own id server-side, so this
    // specific payload cannot be used to overwrite a different user's row.
    const res = await request("PUT", "/user", {
      token: userB.token,
      body: { user: { id: 999999, bio: "still me" } },
    });
    // Prisma rejects writing to the `id` field directly on update; document actual behavior.
    expect([200, 400, 422, 500]).toContain(res.status);

    const stillB = await request("GET", "/user", { token: userB.token });
    expect(stillB.body.user.email).toBe(userB.email);
  });
});

describe("Follow / Unfollow", () => {
  test("follow increases the target's followersCount and following flag", async () => {
    const follow = await request("POST", `/profiles/${userA.username}/follow`, { token: userB.token });
    expect(follow.status).toBe(200);
    expect(follow.body.profile.following).toBe(true);
    expect(follow.body.profile.followersCount).toBeGreaterThanOrEqual(1);
  });

  test("unfollow reverses it", async () => {
    await request("POST", `/profiles/${userA.username}/follow`, { token: userB.token });
    const unfollow = await request("DELETE", `/profiles/${userA.username}/follow`, { token: userB.token });
    expect(unfollow.status).toBe(200);
    expect(unfollow.body.profile.following).toBe(false);
  });

  test("following without a token is rejected", async () => {
    const res = await request("POST", `/profiles/${userA.username}/follow`, {});
    expect(res.status).toBe(401);
  });

  test("BOUNDARY: a user can follow themselves (no self-follow guard)", async () => {
    const res = await request("POST", `/profiles/${userA.username}/follow`, { token: userA.token });
    expect(res.status).toBe(200);
    expect(res.body.profile.following).toBe(true);
    // cleanup
    await request("DELETE", `/profiles/${userA.username}/follow`, { token: userA.token });
  });
});
