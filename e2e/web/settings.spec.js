const { test, expect } = require("./fixtures");

test.describe("Settings page", () => {
  test("redirects to home when not authenticated", async ({ page, settingsPage }) => {
    await settingsPage.goto();
    await expect(page).toHaveURL(/\/#\/$|\/$/);
  });

  test("form is pre-filled with the logged-in user's username and email", async ({ settingsPage, loginAsNewUser }) => {
    const user = await loginAsNewUser();
    await settingsPage.goto();

    await expect(settingsPage.usernameInput).toHaveValue(user.username);
    await expect(settingsPage.emailInput).toHaveValue(user.email);
  });

  test("CRITICAL, LIVE BROWSER REPRODUCTION (BUG-014): saving Settings after only changing the bio silently resets the password and locks the user out", async ({
    page,
    settingsPage,
    loginPage,
    loginAsNewUser,
  }) => {
    const user = await loginAsNewUser();
    await settingsPage.goto();

    // Exactly what a real user does: change only the bio, leave the password field untouched.
    const bio = `Hello, I'm testing Playwright ${Date.now()}.`;
    await settingsPage.update({ bio }, { verifyField: "bio", verifyValue: bio });

    // The app showed no error at all — the request "succeeded" from the user's point of view.
    // Now prove the account is actually locked, through the real Login form.
    await settingsPage.navbar.logout();

    await loginPage.goto();
    await loginPage.login(user.email, user.password);
    await expect(loginPage.errorMessage).toHaveText("Wrong email/password combination");
    await expect(page).toHaveURL(/#\/login/);

    // And there is no self-service recovery: the Login form's own client-side minLength="5"
    // validation refuses to submit an empty password, so the reset (to "") can't be undone by
    // simply retyping it.
    await loginPage.login(user.email, "");
    expect(await loginPage.isPasswordFieldValid()).toBe(false);
  });

  test("updating the profile picture URL and re-saving with the current password persists correctly", async ({
    page,
    settingsPage,
    loginPage,
    homePage,
    loginAsNewUser,
  }) => {
    const user = await loginAsNewUser();
    await settingsPage.goto();

    // Demonstrates the (only) currently-working path: re-supplying the real password.
    await settingsPage.update(
      { image: "https://example.test/avatar.png", password: user.password },
      { verifyField: "image", verifyValue: "https://example.test/avatar.png" },
    );

    await settingsPage.navbar.logout();
    await loginPage.goto();
    await loginPage.login(user.email, user.password);
    await expect(page).toHaveURL(/\/#\/$|\/$/);
    await expect(homePage.navbar.dropdownToggle).toHaveText(new RegExp(user.username));
  });
});
