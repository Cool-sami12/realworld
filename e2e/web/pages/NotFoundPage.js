// Deliberately does not extend BasePage: the 404 route is rendered as a sibling of the main
// app layout (see frontend/src/main.jsx), so it has no navbar — giving it a navbar via BasePage
// would misrepresent the page and invite tests to assert on something that can't exist here.
class NotFoundPage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "404 Not Found" });
    this.homeLink = page.getByRole("link", { name: "Go to home page" });
    this.navbar = page.locator("nav.navbar");
  }

  async goto(path) {
    await this.page.goto(`/#${path}`);
  }
}

module.exports = { NotFoundPage };
