const BASE_URL = process.env.QA_BASE_URL || "http://localhost:3001/api";
const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let userCounter = 0;
const createdEmails = [];

const qaEmail = () => {
  userCounter += 1;
  const email = `qa.${RUN_ID}.${userCounter}@example.test`;
  createdEmails.push(email);
  return email;
};

const request = async (method, path, { token, body } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Token ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { __rawText: text };
  }

  return { status: res.status, body: json };
};

const registerUser = async (overrides = {}) => {
  const email = overrides.email || qaEmail();
  const username = overrides.username || `qauser${RUN_ID}${userCounter}`;
  const password = overrides.password || "SecurePass123!";

  const res = await request("POST", "/users", {
    body: { user: { email, username, password, ...overrides } },
  });

  return { ...res, credentials: { email, username, password } };
};

const registerAndLogin = async (overrides = {}) => {
  const signup = await registerUser(overrides);
  if (signup.status !== 201) {
    throw new Error(`Setup failed: signup returned ${signup.status}: ${JSON.stringify(signup.body)}`);
  }
  return {
    token: signup.body.user.token,
    email: signup.credentials.email,
    username: signup.credentials.username,
    password: signup.credentials.password,
  };
};

module.exports = { BASE_URL, RUN_ID, request, registerUser, registerAndLogin, qaEmail, createdEmails };
