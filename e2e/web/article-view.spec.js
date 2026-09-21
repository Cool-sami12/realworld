const { test, expect } = require("./fixtures");

test.describe("Article view — as the owner", () => {
  test("shows Edit/Delete Article buttons, not Follow/Favorite", async ({ articlePage, loginAsNewUser, apiClient }) => {
    const user = await loginAsNewUser();
    const article = await apiClient.createArticle(user);

    await articlePage.goto(article.slug);
    await expect(articlePage.editArticleLink).toBeVisible();
    await expect(articlePage.deleteArticleButton).toBeVisible();
    await expect(articlePage.favoriteButton).toHaveCount(0);
    await expect(articlePage.page.getByRole("button", { name: /Follow/ })).toHaveCount(0);
  });

  test("deleting the article redirects home and it no longer exists", async ({
    page,
    articlePage,
    loginAsNewUser,
    apiClient,
  }) => {
    const user = await loginAsNewUser();
    const article = await apiClient.createArticle(user);

    await articlePage.goto(article.slug);
    await articlePage.deleteArticle();

    await expect(page).toHaveURL(/\/#\/$|\/$/);
    const check = await apiClient.getArticle(article.slug);
    expect(check.status).toBe(404);
  });
});

test.describe("Article view — as a different user", () => {
  test("shows Follow and Favorite buttons, and favoriting updates the count live", async ({
    articlePage,
    loginAsNewUser,
    apiClient,
  }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author);
    await loginAsNewUser();

    await articlePage.goto(article.slug);
    await expect(articlePage.followButtonFor(author.username)).toBeVisible();

    await expect(articlePage.favoriteButton).toContainText("( 0 )");
    await articlePage.favorite();
    await expect(articlePage.favoriteButton).toContainText("( 1 )");
  });

  test("following the author toggles the button text and count", async ({ articlePage, loginAsNewUser, apiClient }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author);
    await loginAsNewUser();

    await articlePage.goto(article.slug);
    const followButton = articlePage.followButtonFor(author.username);

    await expect(followButton).toContainText("Follow");
    await expect(followButton).toContainText("( 0 )");
    await articlePage.follow(author.username);
    await expect(followButton).toContainText("Unfollow");
    await expect(followButton).toContainText("( 1 )");
  });
});

test.describe("Comments", () => {
  test("an anonymous / logged-out visitor sees a sign-in prompt instead of a comment form", async ({
    articlePage,
    apiClient,
  }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author);

    await articlePage.goto(article.slug);
    await expect(articlePage.signInToCommentPrompt).toBeVisible();
    await expect(articlePage.commentInput).toHaveCount(0);
  });

  test("posting a comment shows it in the list immediately", async ({ articlePage, loginAsNewUser, apiClient }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author);
    await loginAsNewUser();

    await articlePage.goto(article.slug);
    await expect(articlePage.noCommentsMessage).toBeVisible();

    const commentText = "Great article, Playwright says hi.";
    await articlePage.postComment(commentText);

    await expect(articlePage.commentCard(commentText)).toBeVisible();
    await expect(articlePage.noCommentsMessage).toHaveCount(0);
  });

  test("the comment author can delete their own comment", async ({ articlePage, loginAsNewUser, apiClient }) => {
    const author = await apiClient.signup();
    const article = await apiClient.createArticle(author);
    await loginAsNewUser();

    await articlePage.goto(article.slug);
    await articlePage.postComment("delete me");
    await expect(articlePage.commentCard("delete me")).toBeVisible();

    await articlePage.deleteComment("delete me");
    await expect(articlePage.commentCard("delete me")).toHaveCount(0);
    await expect(articlePage.noCommentsMessage).toBeVisible();
  });
});
