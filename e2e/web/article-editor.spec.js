const { test, expect } = require("./fixtures");

test.describe("Article Editor — create", () => {
  test("redirects home when not authenticated", async ({ page, articleEditorPage }) => {
    await articleEditorPage.gotoCreate();
    await expect(page).toHaveURL(/\/#\/$|\/$/);
  });

  test("publishing a new article via the form navigates to the article page with the right content", async ({
    page,
    articleEditorPage,
    articlePage,
    loginAsNewUser,
  }) => {
    await loginAsNewUser();
    await articleEditorPage.gotoCreate();

    const title = `Editor Create ${Date.now()}`;
    await articleEditorPage.publish({
      title,
      description: "A test description",
      body: "Some **markdown** body content.",
      tags: "playwright testing",
    });

    await expect(page).toHaveURL(/#\/article\//);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(articlePage.tagList).toContainText("playwright");
    await expect(articlePage.tagList).toContainText("testing");
  });

  test("submitting a duplicate title shows an inline error and does not navigate away", async ({
    page,
    articleEditorPage,
    loginAsNewUser,
    apiClient,
  }) => {
    const user = await loginAsNewUser();
    const title = `Dup Editor ${Date.now()}`;
    await apiClient.createArticle(user, { title });

    await articleEditorPage.gotoCreate();
    await articleEditorPage.publish({ title, description: "d2", body: "b2" });

    await expect(articleEditorPage.errorMessage).toHaveText("Title already exists.. ");
    await expect(page).toHaveURL(/#\/editor/);
  });
});

test.describe("Article Editor — edit existing", () => {
  test("editing your own article pre-fills the form and persists changes", async ({
    page,
    articleEditorPage,
    loginAsNewUser,
    apiClient,
  }) => {
    const user = await loginAsNewUser();
    const title = `Editor Edit ${Date.now()}`;
    const article = await apiClient.createArticle(user, {
      title,
      description: "original desc",
      body: "original body",
    });

    await articleEditorPage.gotoEdit(article.slug);
    await expect(articleEditorPage.titleInput).toHaveValue(title);
    await expect(articleEditorPage.descriptionInput).toHaveValue("original desc");

    await articleEditorPage.update({ body: "updated body content" });

    await expect(page).toHaveURL(/#\/article\//);
    await expect(page.locator(".article-content")).toContainText("updated body content");
  });

  test("navigating directly to another user's edit URL redirects home", async ({
    page,
    articleEditorPage,
    loginAsNewUser,
    apiClient,
  }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author, { title: `NotYours ${Date.now()}` });

    await loginAsNewUser();
    await articleEditorPage.gotoEdit(article.slug);

    await expect(page).toHaveURL(/\/#\/$|\/$/);
  });
});
