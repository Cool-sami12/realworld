const { NavbarComponent } = require("./NavbarComponent");

// Common plumbing every page object shares: the page handle, the navbar
// component (present on every route except 404), and a couple of small
// waits that recur often enough to be worth centralizing once.
class BasePage {
  constructor(page) {
    this.page = page;
    this.navbar = new NavbarComponent(page);
  }

  async waitForUrl(pattern) {
    await this.page.waitForURL(pattern);
  }
}

module.exports = { BasePage };
