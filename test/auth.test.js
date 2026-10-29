const test = require("node:test");
const assert = require("node:assert/strict");
const util = require("node:util");
const { loadCanary, startStub } = require("./helpers");

const TOKEN = "11111111-2222-3333-4444-555555555555";

test("API token: getUserToken makes no request and returns a truthy result", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getUserToken({ baseURL: stub.baseURL, apiToken: TOKEN }, { timezone: "GMT Standard Time" });

  assert.ok(result);
  assert.equal(result.statusCode, "Good");
  assert.equal(result.authMode, "apiToken");
  assert.equal(stub.sent("getUserToken").length, 0);
});

test("API token: every data call sends apiToken and no userToken", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, apiToken: TOKEN };

  await canary.getUserToken(creds);
  await canary.browseTags(creds);
  await canary.getLiveDataToken(creds);
  await canary.getProcessedData(creds, { tags: ["Site.A"] });
  await canary.totalPeak(creds, { tags: ["Site.A"] });

  for (const { endpoint, body } of stub.requests) {
    assert.equal(body.apiToken, TOKEN, `${endpoint} should send apiToken`);
    assert.equal("userToken" in body, false, `${endpoint} should not send userToken`);
  }
});

test("API token: credentials.token is accepted as an alias", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  await canary.browseTags({ baseURL: stub.baseURL, token: TOKEN });

  assert.equal(stub.sent("browseTags")[0].apiToken, TOKEN);
});

test("API token: tokenParam 'accessToken' supports older Canary servers", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  await canary.browseTags({ baseURL: stub.baseURL, apiToken: TOKEN, tokenParam: "accessToken" });

  const sent = stub.sent("browseTags")[0];
  assert.equal(sent.accessToken, TOKEN);
  assert.equal("apiToken" in sent, false);
});

test("API token takes precedence when username and password are also set", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, username: "user", password: "pass", apiToken: TOKEN };

  await canary.getUserToken(creds);
  await canary.browseTags(creds);

  assert.equal(stub.sent("getUserToken").length, 0);
  assert.equal(stub.sent("browseTags")[0].apiToken, TOKEN);
});

test("an empty MY_TOKEN falls back to username and password", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, username: "user", password: "pass", apiToken: "" };

  await canary.getUserToken(creds);
  await canary.browseTags(creds);

  assert.equal(stub.sent("getUserToken").length, 1);
  assert.equal(stub.sent("browseTags")[0].userToken, "SESSION-TOKEN");
});

test("revokeUserToken revokes the session token", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, username: "user", password: "pass" };
  await canary.getUserToken(creds);

  const result = await canary.revokeUserToken(creds);

  assert.equal(result.statusCode, "Good");
  assert.equal(stub.sent("revokeUserToken")[0].userToken, "SESSION-TOKEN");
});

test("revokeUserToken is a no-op with an API token", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.revokeUserToken({ baseURL: stub.baseURL, apiToken: TOKEN });

  assert.equal(result.statusCode, "Good");
  assert.equal(stub.sent("revokeUserToken").length, 0);
});

test("thrown errors never contain the password or API token", async (t) => {
  const fail = () => ({ __status: 401, body: { statusCode: "Unauthorized" } });
  const stub = await startStub({ getUserToken: fail, browseTags: fail });
  t.after(stub.close);
  const canary = loadCanary();

  const errors = [];
  await canary.getUserToken({ baseURL: stub.baseURL, username: "user", password: "S3cret-Pass" }).catch((e) => errors.push(e));
  await canary.browseTags({ baseURL: stub.baseURL, apiToken: TOKEN }).catch((e) => errors.push(e));

  assert.equal(errors.length, 2);
  for (const error of errors) {
    const dump = util.inspect(error, { depth: 10 }) + JSON.stringify(error);
    assert.equal(dump.includes("S3cret-Pass"), false);
    assert.equal(dump.includes(TOKEN), false);
    assert.equal(error.response.status, 401);
    assert.equal(error.status, 401);
  }
});
