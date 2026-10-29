// Behaviour that existing consumers (notably gc-connector) rely on.
// These tests must pass against both 1.1.0 and every later 1.x release.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCanary, startStub } = require("./helpers");

const passwordCreds = (baseURL) => ({ baseURL, username: "user", password: "pass" });

test("getUserToken(credentials) with no body uses the default application and time zone", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getUserToken(passwordCreds(stub.baseURL));

  assert.equal(result.userToken, "SESSION-TOKEN");
  assert.equal(result.statusCode, "Good");
  assert.deepEqual(stub.sent("getUserToken")[0], {
    application: "Web API",
    timeZone: "GMT Standard Time",
    username: "user",
    password: "pass",
  });
});

test("getUserToken(credentials, body) passes application and timezone through", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getUserToken(passwordCreds(stub.baseURL), {
    application: "Web API",
    timezone: "Eastern Standard Time",
  });

  assert.ok(result, "callers check `if (!tokenResult)`");
  assert.equal(stub.sent("getUserToken")[0].timeZone, "Eastern Standard Time");
});

test("data calls send the session userToken and ignore body.userToken", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);

  const tokenResult = await canary.getUserToken(creds);
  const tags = await canary.browseTags(creds);
  assert.deepEqual(tags.tags, ["Site.A", "Site.B"]);

  // gc-connector passes the whole getUserToken response as body.userToken.
  await canary.getProcessedData(creds, {
    userToken: tokenResult,
    tags: ["Site.A"],
    startTime: "x",
    endTime: "y",
    maxSize: 10000000,
    aggregateName: "Delta",
    aggregateInterval: "24 hours",
  });

  assert.equal(stub.sent("browseTags")[0].userToken, "SESSION-TOKEN");
  assert.equal(stub.sent("getTagData2")[0].userToken, "SESSION-TOKEN");
});

test("browseTags sends deep=true and an empty path by default", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);
  await canary.getUserToken(creds);

  await canary.browseTags(creds);

  const sent = stub.sent("browseTags")[0];
  assert.equal(sent.deep, true);
  assert.equal(sent.path, "");
});

test("getProcessedData returns { data } with nulls replaced by 0", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);
  await canary.getUserToken(creds);
  await canary.browseTags(creds);

  const raw = await canary.getProcessedData(creds, {
    tags: ["Site.A"],
    aggregateName: "TimeAverage2",
    aggregateInterval: "24 hours",
  });

  assert.deepEqual(canary.extractValues(raw.data["Site.A"]), [5, 0, 9]);
  const sent = stub.sent("getTagData2")[0];
  assert.equal(sent.aggregateName, "TimeAverage2");
  assert.equal(sent.aggregateInterval, "24 hours");
  assert.deepEqual(sent.tags, ["Site.A"]);
});

test("softTotalizer returns floor(sum * interval hours) as a number", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);
  await canary.getUserToken(creds);
  await canary.browseTags(creds);

  const total = await canary.softTotalizer(creds, {
    tags: ["Site.A"],
    aggregateName: "TimeAverage2",
    aggregateInterval: "24 hours",
  });

  assert.equal(total, 336); // (5 + 0 + 9) * 24
});

test("totalPeak returns the highest value across all pages", async (t) => {
  const stub = await startStub({
    getTagData2: (body, i) =>
      i === 0
        ? { data: { "Site.A": [{ v: 3 }, { v: 7 }] }, continuation: "PAGE-2" }
        : { data: { "Site.A": [{ v: 11 }, { v: 2 }] }, continuation: null },
  });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);
  await canary.getUserToken(creds);

  const peak = await canary.totalPeak(creds, { tags: ["Site.A"], startTime: "x", endTime: "y", maxSize: 10000000 });

  assert.equal(peak, 11);
  assert.equal(stub.sent("getTagData2")[1].continuation, "PAGE-2");
  assert.equal(stub.sent("getTagData2")[1].userToken, "SESSION-TOKEN");
});

test("totalPeak returns null when no value is found", async (t) => {
  const stub = await startStub({ getTagData2: () => ({ data: { "Site.A": [] }, continuation: null }) });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);
  await canary.getUserToken(creds);

  assert.equal(await canary.totalPeak(creds, { tags: ["Site.A"] }), null);
});

test("getLiveDataToken defaults to the tags from browseTags", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  const creds = passwordCreds(stub.baseURL);
  await canary.getUserToken(creds);
  await canary.browseTags(creds);

  const result = await canary.getLiveDataToken(creds);

  assert.equal(result.liveDataToken, "LIVE-TOKEN");
  assert.deepEqual(stub.sent("getLiveDataToken")[0].tags, ["Site.A", "Site.B"]);
  assert.equal(stub.sent("getLiveDataToken")[0].mode, "AllValues");
});

test("HTTP errors are thrown with the usual axios message", async (t) => {
  const stub = await startStub({ getUserToken: () => ({ __status: 401, body: { statusCode: "Unauthorized" } }) });
  t.after(stub.close);
  const canary = loadCanary();

  await assert.rejects(canary.getUserToken(passwordCreds(stub.baseURL)), {
    message: "Request failed with status code 401",
  });
});
