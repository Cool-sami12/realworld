const { test, expect } = require("./fixtures");

test.describe("Profile page — own profile", () => {
  test("shows 'Edit Profile Settings' instead of a Follow button, and lists your own articles", async ({
    profilePage,
    loginAsNewUser,
    apiClient,
  }) => {
    const user = await loginAsNewUser();
    const title = `My Article ${Date.now()}`;
    await apiClient.createArticle(user, { title });

    await profilePage.goto(user.username);
    await expect(profilePage.heading(user.username)).toBeVisible();
    await expect(profilePage.editProfileSettingsLink).toBeVisible();
    await expect(profilePage.followButtonFor(user.username)).toHaveCount(0);
    await expect(profilePage.articleHeading(title)).toBeVisible();
  });

  test("Favorited Articles tab shows only favorited articles, not authored ones", async ({
    page,
    profilePage,
    loginAsNewUser,
    apiClient,
  }) => {
    const user = await loginAsNewUser();
    const author = await apiClient.signup();

    const ownTitle = `Own ${Date.now()}`;
    await apiClient.createArticle(user, { title: ownTitle });

    const favTitle = `ToFavorite ${Date.now()}`;
    const favArticle = await apiClient.createArticle(author, { title: favTitle });
    await apiClient.favoriteArticle(user, favArticle.slug);

    await profilePage.goto(user.username);
    await profilePage.favoritedArticlesTab.click();
    await expect(page).toHaveURL(new RegExp(`#/profile/${user.username}/favorites`));

    await expect(profilePage.articleHeading(favTitle)).toBeVisible();
    await expect(profilePage.articleHeading(ownTitle)).toHaveCount(0);
  });
});

test.describe("Profile page — another user's profile", () => {
  test("shows a Follow button (not the settings link) and toggles on click", async ({
    profilePage,
    loginAsNewUser,
    apiClient,
  }) => {
    const author = await apiClient.signup();
    await loginAsNewUser();

    await profilePage.goto(author.username);
    await expect(profilePage.editProfileSettingsLink).toHaveCount(0);

    const followButton = profilePage.followButtonFor(author.username);
    await expect(followButton).toContainText("Follow");
    await profilePage.follow(author.username);
    await expect(followButton).toContainText("Unfollow");
  });

  test("shows an empty-state message when the user has no articles", async ({ profilePage, loginAsNewUser, apiClient }) => {
    const author = await apiClient.signup();
    await loginAsNewUser();

    await profilePage.goto(author.username);
    await expect(profilePage.noArticlesMessage(author.username)).toBeVisible();
  });
});
