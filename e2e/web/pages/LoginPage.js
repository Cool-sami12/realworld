const { BasePage } = require("./BasePage");

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Sign in" });
    this.needAccountLink = page.getByRole("link", { name: "Need an account?" });
    this.emailInput = page.getByPlaceholder("Email");
    this.passwordInput = page.getByPlaceholder("Password");
    this.submitButton = page.getByRole("button", { name: "Login" });
    this.errorMessage = page.locator(".error-messages");
  }

  async goto() {
    await this.page.goto("/#/login");
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async isPasswordFieldValid() {
    return this.passwordInput.evaluate((el) => el.checkValidity());
  }
}

module.exports = { LoginPage };
