// Live check against a real Canary server: `npm run test:live`.
// Reads ./process.env (MY_BASE_URL plus MY_TOKEN and/or MY_USERNAME/MY_PASSWORD).
// Read-only, and never prints credential values.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", "process.env") });
const { loadCanary } = require("./helpers");

const baseURL = process.env.MY_BASE_URL;
const token = process.env.MY_TOKEN;
const username = process.env.MY_USERNAME;
const password = process.env.MY_PASSWORD;
const hasLogin = username && password && username !== "my_username_value";

async function exercise(credentials, label) {
  const canary = loadCanary();

  const login = await canary.getUserToken(credentials);
  assert.equal(login.statusCode, "Good", `${label} login: ${JSON.stringify(login.errors || "")}`);

  const browsed = await canary.browseTags(credentials);
  assert.equal(browsed.statusCode, "Good");
  assert.ok(browsed.tags.length > 0, "browseTags returned no tags");

  // Find a few tags with current data, choosing a numeric one for the aggregate checks.
  const candidates = process.env.LIVE_TAG ? [process.env.LIVE_TAG] : browsed.tags.filter((t) => !t.includes("{Diagnostics}")).slice(0, 200);
  const current = await canary.getCurrentValues(credentials, { tags: candidates });
  const numeric = candidates.filter((t) => typeof current.data[t]?.[0]?.v === "number");
  const tag = numeric.find((t) => current.data[t][0].v !== 0) || numeric[0];
  assert.ok(tag, "no numeric tag with a current value found");

  const window = { tags: [tag], startTime: "now - 6 hours", endTime: "now", aggregateName: "TimeAverage2", aggregateInterval: "1 hour" };
  const processed = await canary.getProcessedData(credentials, window);
  assert.ok(processed.data[tag].length > 0, "getProcessedData returned no points");

  // Same raw window twice: once in one response, once forced through many small pages.
  const rawWindow = { tags: [tag], startTime: "now - 24 hours", endTime: "now" };
  const raw = await canary.getRawData(credentials, { ...rawWindow, maxSize: 100000 });
  const paged = await canary.getRawData(credentials, { ...rawWindow, maxSize: 5 });
  assert.ok(raw.data[tag].length > 0, "getRawData returned no points");
  assert.deepEqual(paged.data[tag], raw.data[tag], "paginated result differs from single response");

  const total = await canary.softTotalizer(credentials, window);
  assert.equal(typeof total, "number");

  const peak = await canary.totalPeak(credentials, { tags: [tag], startTime: "now - 6 hours", endTime: "now" });
  assert.ok(peak === null || typeof peak === "number");

  const revoke = await canary.revokeUserToken(credentials);
  assert.equal(revoke.statusCode, "Good");

  console.log(`  [${label}] ${browsed.tags.length} tags | ${tag} = ${current.data[tag][0].v} | ` +
    `6h hourly points: ${processed.data[tag].length} | raw 24h points: ${raw.data[tag].length} (also fetched in pages of 5) | ` +
    `softTotalizer: ${total} | totalPeak: ${peak}`);
}

test("live: API token", { skip: !(baseURL && token) && "MY_BASE_URL / MY_TOKEN not set" }, () =>
  exercise({ baseURL, apiToken: token }, "apiToken"));

test("live: API token as accessToken", { skip: !(baseURL && token) && "MY_BASE_URL / MY_TOKEN not set" }, () =>
  exercise({ baseURL, apiToken: token, tokenParam: "accessToken" }, "accessToken"));

test("live: username and password", { skip: !(baseURL && hasLogin) && "real MY_USERNAME / MY_PASSWORD not set" }, () =>
  exercise({ baseURL, username, password }, "userToken"));
