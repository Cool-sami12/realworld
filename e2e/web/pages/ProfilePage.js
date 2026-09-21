const { BasePage } = require("./BasePage");

class ProfilePage extends BasePage {
  constructor(page) {
    super(page);
    this.editProfileSettingsLink = page.getByRole("link", { name: /Edit Profile Settings/ });
    this.myArticlesTab = page.getByRole("link", { name: "My Articles" });
    this.favoritedArticlesTab = page.getByRole("link", { name: "Favorited Articles" });
  }

  async goto(username) {
    await this.page.goto(`/#/profile/${username}`);
  }

  async gotoFavorites(username) {
    await this.page.goto(`/#/profile/${username}/favorites`);
  }

  heading(username) {
    return this.page.getByRole("heading", { name: username });
  }

  followButtonFor(username) {
    return this.page.getByRole("button", { name: new RegExp(username) });
  }

  async follow(username) {
    await this.followButtonFor(username).click();
  }

  articleHeading(title) {
    return this.page.getByRole("heading", { name: title });
  }

  noArticlesMessage(username) {
    return this.page.getByText(`${username} doesn't have articles.`);
  }
}

module.exports = { ProfilePage };
