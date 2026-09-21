const { test, expect } = require("./fixtures");

test.describe("404 / Not Found", () => {
  test("an undefined route shows the 404 page with a link home", async ({ page, notFoundPage }) => {
    await notFoundPage.goto("/this-route-does-not-exist");

    await expect(notFoundPage.heading).toBeVisible();
    await notFoundPage.homeLink.click();
    await expect(page).toHaveURL(/\/#\/$|\/$/);
  });

  test("the 404 page has no navbar (it's outside the main app layout)", async ({ notFoundPage }) => {
    await notFoundPage.goto("/this-route-does-not-exist");
    await expect(notFoundPage.navbar).toHaveCount(0);
  });

  test("requesting a nonexistent article slug redirects to the 404 page", async ({ notFoundPage, articlePage }) => {
    await articlePage.goto("this-slug-does-not-exist-pw");
    await expect(notFoundPage.heading).toBeVisible();
  });
});
