const { BasePage } = require("./BasePage");

class SignUpPage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Sign up" });
    this.signInLink = page.getByRole("link", { name: "Sign in to your account" });
    this.usernameInput = page.getByPlaceholder("Your Name");
    this.emailInput = page.getByPlaceholder("Email");
    this.passwordInput = page.getByPlaceholder("Password");
    this.submitButton = page.getByRole("button", { name: "Sign up" });
    this.errorMessage = page.locator(".error-messages");
  }

  async goto() {
    await this.page.goto("/#/register");
  }

  async signUp(username, email, password) {
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

module.exports = { SignUpPage };
