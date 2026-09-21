const { BasePage } = require("./BasePage");

class HomePage extends BasePage {
  constructor(page) {
    super(page);
    this.bannerHeading = page.getByRole("heading", { name: "conduit" });
    this.bannerTagline = page.getByText("A place to share your knowledge.");
    this.sidebar = page.locator(".sidebar");
    this.feedToggle = page.locator(".feed-toggle");
    this.globalFeedTab = this.feedToggle.getByRole("button", { name: "Global Feed" });
    this.yourFeedTab = this.feedToggle.getByRole("button", { name: "Your Feed" });
  }

  async goto() {
    await this.page.goto("/");
  }

  // The sidebar's tag pill and the feed-toggle's active tag tab both render text
  // matching the tag name — callers usually want one or the other explicitly.
  popularTag(name) {
    return this.sidebar.getByRole("button", { name });
  }

  feedTagTab(name) {
    return this.feedToggle.getByRole("button", { name });
  }

  async selectPopularTag(name) {
    await this.popularTag(name).click();
  }

  articleHeading(title) {
    return this.page.getByRole("heading", { name: title });
  }

  async openArticle(title) {
    await this.articleHeading(title).click();
  }
}

module.exports = { HomePage };
