const { test, expect } = require("./fixtures");

test.describe("Sign up page", () => {
  test("registering through the real form logs the user in and redirects home", async ({ page, signUpPage, homePage }) => {
    await signUpPage.goto();
    await expect(signUpPage.heading).toBeVisible();

    const stamp = Date.now();
    const username = `pwform${stamp}`;
    await signUpPage.signUp(username, `pwform.${stamp}@example.test`, "SecurePass123!");

    await expect(page).toHaveURL(/\/#\/$|\/$/);
    await expect(homePage.navbar.dropdownToggle).toHaveText(new RegExp(username));
  });

  test("the 'Sign in to your account' link navigates to Login", async ({ signUpPage, loginPage }) => {
    await signUpPage.goto();
    await signUpPage.signInLink.click();
    await expect(loginPage.heading).toBeVisible();
  });
});

test.describe("Login page", () => {
  test("logging in through the real form redirects home and updates the navbar", async ({
    page,
    loginPage,
    homePage,
    apiClient,
  }) => {
    const user = await apiClient.signup();

    await loginPage.goto();
    await loginPage.login(user.email, user.password);

    await expect(page).toHaveURL(/\/#\/$|\/$/);
    await expect(homePage.navbar.dropdownToggle).toHaveText(new RegExp(user.username));
  });

  test("wrong password shows an inline error and does not log in", async ({ page, loginPage, apiClient }) => {
    const user = await apiClient.signup();

    await loginPage.goto();
    await loginPage.login(user.email, "wrong-password");

    await expect(loginPage.errorMessage).toHaveText("Wrong email/password combination");
    await expect(page).toHaveURL(/#\/login/);
  });

  test("the password field rejects submission under 5 characters (client-side minLength)", async ({
    page,
    loginPage,
    apiClient,
  }) => {
    const user = await apiClient.signup();

    await loginPage.goto();
    await loginPage.login(user.email, "ab");

    await expect(page).toHaveURL(/#\/login/);
    expect(await loginPage.isPasswordFieldValid()).toBe(false);
  });
});
