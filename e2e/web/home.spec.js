const { test, expect } = require("./fixtures");

test.describe("Home page — logged out", () => {
  test("shows the banner, Global Feed, popular tags, and Login/Sign up nav links", async ({ homePage }) => {
    await homePage.goto();

    await expect(homePage.bannerHeading).toBeVisible();
    await expect(homePage.bannerTagline).toBeVisible();
    await expect(homePage.globalFeedTab).toHaveClass(/active/);
    await expect(homePage.sidebar.getByRole("heading", { name: "Popular Tags" })).toBeVisible();

    await expect(homePage.navbar.loginLink).toBeVisible();
    await expect(homePage.navbar.signUpLink).toBeVisible();
    await expect(homePage.navbar.newArticleLink).toHaveCount(0);
  });

  test("does not show a 'Your Feed' tab when logged out", async ({ homePage }) => {
    await homePage.goto();
    await expect(homePage.yourFeedTab).toHaveCount(0);
  });

  test("clicking an article opens its detail page", async ({ page, homePage, apiClient }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author, { title: `Home Nav ${Date.now()}` });

    await homePage.goto();
    await homePage.openArticle(article.title);

    await expect(page).toHaveURL(new RegExp(`#/article/${article.slug}`));
    await expect(page.getByRole("heading", { name: article.title })).toBeVisible();
  });
});

test.describe("Home page — logged in", () => {
  test("shows 'New Article', the user's dropdown, and a 'Your Feed' tab", async ({ homePage, loginAsNewUser }) => {
    const user = await loginAsNewUser();
    await homePage.goto();

    await expect(homePage.navbar.newArticleLink).toBeVisible();
    await expect(homePage.yourFeedTab).toBeVisible();
    await expect(homePage.navbar.dropdownToggle).toHaveText(new RegExp(user.username));
    await expect(homePage.navbar.loginLink).toHaveCount(0);
  });

  test("navbar dropdown exposes Profile, Settings, and Logout, and logging out reverts to the logged-out navbar", async ({
    homePage,
    loginAsNewUser,
  }) => {
    await loginAsNewUser();
    await homePage.goto();

    await homePage.navbar.openUserMenu();
    await expect(homePage.navbar.profileLink).toBeVisible();
    await expect(homePage.navbar.settingsLink).toBeVisible();
    await expect(homePage.navbar.logoutLink).toBeVisible();

    await homePage.navbar.logout();
    await expect(homePage.navbar.loginLink).toBeVisible();
    await expect(homePage.navbar.dropdownToggle).toHaveCount(0);
  });

  test("clicking a popular tag switches to that tag's feed", async ({ homePage, loginAsNewUser, apiClient }) => {
    const author = await apiClient.signup();
    const tag = `pwtag${Date.now()}`;
    await apiClient.createArticle(author, { title: `Tagged ${Date.now()}`, tagList: [tag] });
    await loginAsNewUser();

    await homePage.goto();
    await homePage.selectPopularTag(tag);

    // The sidebar's tag pill and the feed-toggle's tag tab both render text matching the tag
    // name — only the feed-toggle tab actually receives the "active" class.
    await expect(homePage.feedTagTab(tag)).toHaveClass(/active/);
  });
});
