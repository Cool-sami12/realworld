const base = require("@playwright/test");
const { ApiClient } = require("./support/ApiClient");
const { HomePage } = require("./pages/HomePage");
const { LoginPage } = require("./pages/LoginPage");
const { SignUpPage } = require("./pages/SignUpPage");
const { SettingsPage } = require("./pages/SettingsPage");
const { ArticleEditorPage } = require("./pages/ArticleEditorPage");
const { ArticlePage } = require("./pages/ArticlePage");
const { ProfilePage } = require("./pages/ProfilePage");
const { NotFoundPage } = require("./pages/NotFoundPage");

const test = base.test.extend({
  apiClient: async ({ request }, use) => {
    await use(new ApiClient(request));
  },

  // Factory fixture. Call `await loginAsNewUser()` (or with overrides) from inside a test to get
  // a freshly-registered user AND have the current `page` behave as that user from its very next
  // navigation — via an init script writing the same localStorage shape AuthContext reads, not by
  // driving the login form. (The login/signup forms themselves are tested directly in
  // auth-pages.spec.js — this fixture is for every *other* test that just needs "a logged-in
  // user" as a precondition.)
  //
  // The injected session deliberately omits the plaintext password from `loggedUser` — the real
  // API never returns it either, and including it once caused SettingsPage's password field to
  // start pre-filled in a way the real app never is, silently invalidating a test.
  loginAsNewUser: async ({ page, apiClient }, use) => {
    await use(async (overrides) => {
      const user = await apiClient.signup(overrides);
      const { password, ...loggedUser } = user;
      const session = { headers: { Authorization: `Token ${user.token}` }, isAuth: true, loggedUser };
      await page.addInitScript((s) => window.localStorage.setItem("loggedUser", JSON.stringify(s)), session);
      return user;
    });
  },

  homePage: async ({ page }, use) => use(new HomePage(page)),
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  signUpPage: async ({ page }, use) => use(new SignUpPage(page)),
  settingsPage: async ({ page }, use) => use(new SettingsPage(page)),
  articleEditorPage: async ({ page }, use) => use(new ArticleEditorPage(page)),
  articlePage: async ({ page }, use) => use(new ArticlePage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  notFoundPage: async ({ page }, use) => use(new NotFoundPage(page)),
});

module.exports = { test, expect: base.expect };
