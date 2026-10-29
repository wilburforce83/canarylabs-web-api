const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { loadCanary, startStub } = require("./helpers");

const creds = (baseURL) => ({ baseURL, apiToken: "TOKEN" });

test("getRawData follows continuations, keeps the request, and returns every page", async (t) => {
  const stub = await startStub({
    getTagData2: (body, i) =>
      i === 0
        ? { statusCode: "Good", data: { "Site.A": [{ v: 1 }] }, continuation: { next: 2 } }
        : { statusCode: "Good", data: { "Site.A": [{ v: 2 }] }, continuation: null },
  });
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getRawData(creds(stub.baseURL), { tags: ["Site.A"], startTime: "now - 1 hour" });

  assert.deepEqual(result.data["Site.A"], [{ v: 1 }, { v: 2 }]);
  const [first, second] = stub.sent("getTagData2");
  assert.deepEqual(second.continuation, { next: 2 });
  assert.deepEqual(second.tags, ["Site.A"]);
  assert.equal(second.startTime, "now - 1 hour");
  assert.equal(first.continuation, null);
});

test("getProcessedData follows continuations and replaces nulls on every page", async (t) => {
  const stub = await startStub({
    getTagData2: (body, i) =>
      i === 0
        ? { data: { "Site.A": [{ v: null }] }, continuation: "C" }
        : { data: { "Site.A": [{ v: 4 }] }, continuation: null },
  });
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getProcessedData(creds(stub.baseURL), { tags: ["Site.A"], aggregateInterval: "1 hour" });

  assert.deepEqual(result.data["Site.A"], [{ v: 0 }, { v: 4 }]);
  assert.equal(stub.sent("getTagData2")[1].aggregateInterval, "1 hour");
});

test("getProcessedData without body.tags uses the browsed tags", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();
  await canary.browseTags(creds(stub.baseURL));

  const result = await canary.getProcessedData(creds(stub.baseURL), {});

  assert.deepEqual(canary.extractValues(result.data["Site.A"]), [5, 0, 9]);
});

test("getRawData and getProcessedData pass request errors to the caller", async (t) => {
  const stub = await startStub({ getTagData2: () => ({ __status: 500, body: {} }) });
  t.after(stub.close);
  const canary = loadCanary();

  await assert.rejects(canary.getRawData(creds(stub.baseURL), { tags: ["Site.A"] }), { status: 500 });
  await assert.rejects(canary.getProcessedData(creds(stub.baseURL), { tags: ["Site.A"] }), { status: 500 });
});

test("getCurrentValues works with explicit tags before browseTags", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getCurrentValues(creds(stub.baseURL), { tags: ["Site.A"] });

  assert.ok(result.data["Site.A"]);
  assert.deepEqual(stub.sent("getTagData2")[0].tags, ["Site.A"]);
});

test("a browseTags response without tags does not break later calls", async (t) => {
  const stub = await startStub({ browseTags: () => ({ statusCode: "Error", errors: ["denied"] }) });
  t.after(stub.close);
  const canary = loadCanary();

  await canary.browseTags(creds(stub.baseURL));

  assert.equal(await canary.getCurrentValues(creds(stub.baseURL)), undefined);
});

test("softTotalizer uses the same 1 Hour default interval as getProcessedData", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const total = await canary.softTotalizer(creds(stub.baseURL), { tags: ["Site.A"] });

  assert.equal(total, 14);
  assert.equal(stub.sent("getTagData2")[0].aggregateInterval, "1 Hour");
});

test("softRunHours counts samples above the threshold", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  const hours = await canary.softRunHours(creds(stub.baseURL), { tags: ["Site.A"], aggregateInterval: "1 hour" }, 4);

  assert.equal(hours, "2.00");
});

test("a trailing slash on baseURL does not produce a double slash", async (t) => {
  const stub = await startStub();
  t.after(stub.close);
  const canary = loadCanary();

  await canary.browseTags(creds(stub.baseURL + "/"));

  assert.equal(stub.requests[0].url, "/api/v2/browseTags");
});

test("totalPeak stops when the server repeats the same continuation", async (t) => {
  const stub = await startStub({ getTagData2: () => ({ data: { "Site.A": [{ v: 1 }] }, continuation: "SAME" }) });
  t.after(stub.close);
  const canary = loadCanary();

  assert.equal(await canary.totalPeak(creds(stub.baseURL), { tags: ["Site.A"] }), 1);
  assert.ok(stub.sent("getTagData2").length <= 2);
});

test("createClient keeps tokens and tags separate per client", async (t) => {
  const stubA = await startStub({
    getUserToken: () => ({ statusCode: "Good", userToken: "TOKEN-A" }),
    browseTags: () => ({ tags: ["A.1"] }),
  });
  const stubB = await startStub({
    getUserToken: () => ({ statusCode: "Good", userToken: "TOKEN-B" }),
    browseTags: () => ({ tags: ["B.1"] }),
  });
  t.after(stubA.close);
  t.after(stubB.close);
  const canary = loadCanary();
  const a = canary.createClient();
  const b = canary.createClient();
  const credsA = { baseURL: stubA.baseURL, username: "a", password: "a" };
  const credsB = { baseURL: stubB.baseURL, username: "b", password: "b" };

  await a.getUserToken(credsA);
  await b.getUserToken(credsB);
  await a.browseTags(credsA);
  await b.browseTags(credsB);
  await a.getLiveDataToken(credsA);

  assert.equal(stubA.sent("browseTags")[0].userToken, "TOKEN-A");
  assert.equal(stubB.sent("browseTags")[0].userToken, "TOKEN-B");
  assert.deepEqual(stubA.sent("getLiveDataToken")[0].tags, ["A.1"]);
});

// ---- TLS: self-signed certificates keep working by default; verification is opt-in ----

function makeSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canary-tls-"));
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
    "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

let tls = null;
try {
  tls = makeSelfSignedCert();
} catch {
  // openssl unavailable: TLS tests are skipped below.
}

test("self-signed certificates are accepted by default", { skip: !tls && "openssl not available" }, async (t) => {
  const stub = await startStub({}, { tls });
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.browseTags(creds(stub.baseURL));

  assert.deepEqual(result.tags, ["Site.A", "Site.B"]);
});

test("rejectUnauthorized: true refuses an untrusted certificate", { skip: !tls && "openssl not available" }, async (t) => {
  const stub = await startStub({}, { tls });
  t.after(stub.close);
  const canary = loadCanary();

  await assert.rejects(canary.browseTags({ ...creds(stub.baseURL), rejectUnauthorized: true }), {
    code: "DEPTH_ZERO_SELF_SIGNED_CERT",
  });
});

test("rejectUnauthorized: true with ca trusts a pinned certificate", { skip: !tls && "openssl not available" }, async (t) => {
  const stub = await startStub({}, { tls });
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.browseTags({ ...creds(stub.baseURL), rejectUnauthorized: true, ca: tls.cert });

  assert.deepEqual(result.tags, ["Site.A", "Site.B"]);
});
