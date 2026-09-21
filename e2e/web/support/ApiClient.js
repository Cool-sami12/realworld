const BACKEND_API = "http://localhost:3001/api";

// Thin wrapper around Playwright's APIRequestContext for the backend calls the web suite uses
// purely for test setup (seeding an article, favoriting it, etc.) — never for assertions. Using
// fully-qualified URLs here is deliberate: Playwright's `request` fixture in the `web` project is
// scoped to the frontend's baseURL, and joining a path starting with "/" against a baseURL that
// has its own path component silently drops that component (bit us once already — see git log).
class ApiClient {
  constructor(request) {
    this.request = request;
  }

  authHeader(user) {
    return { Authorization: `Token ${user.token}` };
  }

  async signup(overrides = {}) {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = overrides.email ?? `pwweb.${stamp}@example.test`;
    const username = overrides.username ?? `pwweb${stamp}`;
    const password = overrides.password ?? "SecurePass123!";

    const res = await this.request.post(`${BACKEND_API}/users`, {
      data: { user: { email, username, password } },
    });
    const body = await res.json();
    if (res.status() !== 201) {
      throw new Error(`Signup failed (${res.status()}): ${JSON.stringify(body)}`);
    }
    return { ...body.user, password };
  }

  async createArticle(user, overrides = {}) {
    const title = overrides.title ?? `E2E Article ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await this.request.post(`${BACKEND_API}/articles`, {
      headers: this.authHeader(user),
      data: { article: { title, description: "d", body: "b", tagList: [], ...overrides } },
    });
    const body = await res.json();
    if (res.status() !== 201) {
      throw new Error(`Article creation failed (${res.status()}): ${JSON.stringify(body)}`);
    }
    return body.article;
  }

  async favoriteArticle(user, slug) {
    await this.request.post(`${BACKEND_API}/articles/${slug}/favorite`, { headers: this.authHeader(user) });
  }

  async followUser(user, username) {
    await this.request.post(`${BACKEND_API}/profiles/${username}/follow`, { headers: this.authHeader(user) });
  }

  async getArticle(slug) {
    const res = await this.request.get(`${BACKEND_API}/articles/${slug}`);
    return { status: res.status(), body: res.ok() ? (await res.json()).article : null };
  }
}

module.exports = { ApiClient, BACKEND_API };
