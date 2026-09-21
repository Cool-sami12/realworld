const { BasePage } = require("./BasePage");

class ArticleEditorPage extends BasePage {
  constructor(page) {
    super(page);
    this.titleInput = page.getByPlaceholder("Article Title");
    this.descriptionInput = page.getByPlaceholder("What's this article about?");
    this.bodyInput = page.getByPlaceholder("Write your article (in markdown)");
    this.tagsInput = page.getByPlaceholder("Enter tags");
    this.publishButton = page.getByRole("button", { name: "Publish Article" });
    this.updateButton = page.getByRole("button", { name: "Update Article" });
    this.errorMessage = page.locator(".error-messages");
  }

  async gotoCreate() {
    await this.page.goto("/#/editor");
  }

  async gotoEdit(slug) {
    await this.page.goto(`/#/editor/${slug}`);
  }

  async fillForm({ title, description, body, tags } = {}) {
    if (title !== undefined) await this.titleInput.fill(title);
    if (description !== undefined) await this.descriptionInput.fill(description);
    if (body !== undefined) await this.bodyInput.fill(body);
    if (tags !== undefined) await this.tagsInput.fill(tags);
  }

  async publish(fields) {
    await this.fillForm(fields);
    await this.publishButton.click();
  }

  async update(fields) {
    await this.fillForm(fields);
    await this.updateButton.click();
  }

  // Resolves once the app has navigated to the newly created/edited article, returning its slug —
  // callers shouldn't have to know the app redirects to `#/article/<slug>` on success.
  async waitForRedirectToArticle() {
    await this.page.waitForURL(/#\/article\//);
    return this.page.url().split("#/article/")[1];
  }
}

module.exports = { ArticleEditorPage };
