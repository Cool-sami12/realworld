// Shared navbar, present on every page inside the main app layout (not on 404).
class NavbarComponent {
  constructor(page) {
    this.page = page;
    this.brandLink = page.getByRole("link", { name: "conduit" });
    this.homeLink = page.getByRole("link", { name: "Home" });
    this.loginLink = page.getByRole("link", { name: "Login" });
    this.signUpLink = page.getByRole("link", { name: "Sign up" });
    this.newArticleLink = page.getByRole("link", { name: "New Article" });
    this.dropdownToggle = page.locator(".dropdown-toggle");
    this.dropdownMenu = page.locator(".dropdown-menu");
    this.profileLink = page.getByRole("link", { name: /Profile/ });
    this.settingsLink = page.getByRole("link", { name: /Settings/ });
    this.logoutLink = page.getByRole("link", { name: /Logout/ });
  }

  // The dropdown is a plain click-to-toggle (DropdownMenu.jsx flips a boolean on every click,
  // with no "already open" guard) — a naive unconditional click here would close a menu a caller
  // already opened. Idempotent by design: calling this repeatedly, or after the caller already
  // opened it themselves, never accidentally closes it.
  async openUserMenu() {
    if (!(await this.dropdownMenu.isVisible())) {
      await this.dropdownToggle.click();
    }
    await this.dropdownMenu.waitFor({ state: "visible" });
  }

  async goToProfile() {
    await this.openUserMenu();
    await this.profileLink.click();
  }

  async goToSettings() {
    await this.openUserMenu();
    await this.settingsLink.click();
  }

  async logout() {
    await this.openUserMenu();
    await this.logoutLink.click();
    await this.loginLink.waitFor();
  }
}

module.exports = { NavbarComponent };
