const { BasePage } = require("./BasePage");

// Article.jsx renders the author/action row TWICE — once in the top banner, once below the
// body — as two independent component instances sharing the same state. Every locator that
// matches both is deliberately scoped with `.first()` here so test authors never have to
// rediscover that duplication themselves or hit a strict-mode violation.
class ArticlePage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.locator("h1");
    this.body = page.locator(".article-content");
    this.tagList = page.locator(".tag-list").first();

    this.editArticleLink = page.getByRole("link", { name: /Edit Article/ }).first();
    this.deleteArticleButton = page.getByRole("button", { name: /Delete Article/ }).first();
    this.favoriteButton = page.getByRole("button", { name: /Favorite/ }).first();

    this.commentInput = page.getByPlaceholder("Write a comment...");
    this.postCommentButton = page.getByRole("button", { name: "Post Comment" });
    this.noCommentsMessage = page.getByText("There are no comments yet...");
    this.signInToCommentPrompt = page.getByText("to add comments on this article.");
  }

  async goto(slug) {
    await this.page.goto(`/#/article/${slug}`);
  }

  followButtonFor(username) {
    return this.page.getByRole("button", { name: new RegExp(username) }).first();
  }

  async favorite() {
    await this.favoriteButton.click();
  }

  async follow(username) {
    await this.followButtonFor(username).click();
  }

  async postComment(body) {
    await this.commentInput.fill(body);
    await this.postCommentButton.click();
  }

  commentCard(body) {
    return this.page.locator(".card").filter({ hasText: body });
  }

  // Comment deletion goes through a native window.confirm(); accepting it here keeps that
  // browser-dialog detail out of every test that just wants to delete a comment.
  async deleteComment(body) {
    this.page.once("dialog", (dialog) => dialog.accept());
    await this.commentCard(body).getByRole("button").click();
  }

  async deleteArticle() {
    this.page.once("dialog", (dialog) => dialog.accept());
    await this.deleteArticleButton.click();
  }
}

module.exports = { ArticlePage };
