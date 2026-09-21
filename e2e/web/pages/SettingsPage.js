const { BasePage } = require("./BasePage");

class SettingsPage extends BasePage {
  constructor(page) {
    super(page);
    this.imageInput = page.getByPlaceholder("URL of profile picture");
    this.usernameInput = page.getByPlaceholder("Your Name");
    this.bioInput = page.getByPlaceholder("Short bio about you");
    this.emailInput = page.getByPlaceholder("Email");
    this.passwordInput = page.getByPlaceholder("Password");
    this.submitButton = page.getByRole("button", { name: "Update Settings" });
  }

  async goto() {
    await this.page.goto("/#/settings");
  }

  async fillForm(fields) {
    if (fields.image !== undefined) await this.imageInput.fill(fields.image);
    if (fields.username !== undefined) await this.usernameInput.fill(fields.username);
    if (fields.bio !== undefined) await this.bioInput.fill(fields.bio);
    if (fields.email !== undefined) await this.emailInput.fill(fields.email);
    if (fields.password !== undefined) await this.passwordInput.fill(fields.password);
  }

  async submit() {
    await this.submitButton.click();
  }

  // SettingsForm hides the submit button the instant it's clicked — setInactive(true) runs
  // synchronously, before the PUT request even resolves — so its disappearance only proves the
  // click registered, not that the save landed.
  async waitForSubmitButtonToHide() {
    await this.submitButton.waitFor({ state: "hidden" });
  }

  // The form's own success handler rewrites `loggedUser` in localStorage once the PUT actually
  // resolves. Waiting on that value (rather than the button's optimistic disappearance) is what
  // proves the async round trip has genuinely finished, which matters whenever a test needs to
  // act on the *result* of the save (e.g. logging out and checking whether a password changed).
  async waitForSyncedField(fieldName, expectedValue) {
    await this.page.waitForFunction(
      ({ name, value }) => {
        const stored = JSON.parse(localStorage.getItem("loggedUser") || "null");
        return stored?.loggedUser?.[name] === value;
      },
      { name: fieldName, value: expectedValue },
    );
  }

  // High-level, reliable action most tests should reach for: fill only the given fields, submit,
  // and don't return until the change has actually been confirmed by the server round trip —
  // never just until the button disappeared.
  async update(fields, { verifyField, verifyValue } = {}) {
    await this.fillForm(fields);
    await this.submit();
    await this.waitForSubmitButtonToHide();
    if (verifyField !== undefined) {
      await this.waitForSyncedField(verifyField, verifyValue);
    }
  }
}

module.exports = { SettingsPage };
