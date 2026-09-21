const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let counter = 0;

const uniqueEmail = () => {
  counter += 1;
  return `pw.${RUN_ID}.${counter}@example.test`;
};

const uniqueUsername = () => {
  counter += 1;
  return `pwuser${RUN_ID}${counter}`;
};

async function registerUser(request, overrides = {}) {
  const email = overrides.email ?? uniqueEmail();
  const username = overrides.username ?? uniqueUsername();
  const password = overrides.password ?? "SecurePass123!";

  const res = await request.post("users", {
    data: { user: { email, username, password, ...overrides } },
  });

  const body = await res.json();
  return { res, body, credentials: { email, username, password } };
}

async function registerAndLogin(request, overrides = {}) {
  const { res, body, credentials } = await registerUser(request, overrides);
  if (res.status() !== 201) {
    throw new Error(`Setup failed: signup returned ${res.status()}: ${JSON.stringify(body)}`);
  }
  return {
    token: body.user.token,
    email: credentials.email,
    username: credentials.username,
    password: credentials.password,
  };
}

const authHeader = (token) => ({ Authorization: `Token ${token}` });

async function createArticle(request, token, overrides = {}) {
  const title = overrides.title ?? `PW Article ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await request.post("articles", {
    headers: authHeader(token),
    data: {
      article: {
        title,
        description: "pw description",
        body: "pw body",
        tagList: ["pw"],
        ...overrides,
      },
    },
  });
  const body = await res.json();
  return { res, body };
}

module.exports = { RUN_ID, uniqueEmail, uniqueUsername, registerUser, registerAndLogin, authHeader, createArticle };
