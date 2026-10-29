const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCanary, startStub } = require("./helpers");

const MAP = { "GREENCREATE.Wijster.": "GCWJ.GCWJ.Wijster." };

// Answers getTagData2 with points keyed by whatever tag names were requested.
const echoTags = (body) => ({
  statusCode: "Good",
  data: Object.fromEntries(body.tags.map((t) => [t, [{ t: "x", v: 5 }, { t: "y", v: 9 }]])),
  continuation: null,
});

test("tagPrefixMap: requests use server names, responses use the caller's names", async (t) => {
  const stub = await startStub({ getTagData2: echoTags });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, apiToken: "T", tagPrefixMap: MAP };

  const result = await canary.getProcessedData(creds, {
    tags: ["GREENCREATE.Wijster.Digesters.AD1.FI-20-0102_PV", "GreenCreate.Wijster.Blending.Weightometer_PT", "Other.Tag"],
  });

  assert.deepEqual(stub.sent("getTagData2")[0].tags, [
    "GCWJ.GCWJ.Wijster.Digesters.AD1.FI-20-0102_PV",
    "GCWJ.GCWJ.Wijster.Blending.Weightometer_PT",
    "Other.Tag",
  ]);
  // Each caller gets back exactly the spelling it asked for.
  assert.deepEqual(Object.keys(result.data), [
    "GREENCREATE.Wijster.Digesters.AD1.FI-20-0102_PV",
    "GreenCreate.Wijster.Blending.Weightometer_PT",
    "Other.Tag",
  ]);
});

test("tagPrefixMap works through softTotalizer, totalPeak and getCurrentValues", async (t) => {
  const stub = await startStub({ getTagData2: echoTags });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, apiToken: "T", tagPrefixMap: MAP };
  const tag = "GREENCREATE.Wijster.Flare.FI-65-0001_Tot";

  assert.equal(await canary.softTotalizer(creds, { tags: [tag], aggregateInterval: "1 hour" }), 14);
  assert.equal(await canary.totalPeak(creds, { tags: [tag] }), 9);
  assert.ok((await canary.getCurrentValues(creds, { tags: [tag] })).data[tag]);
  for (const body of stub.sent("getTagData2")) assert.deepEqual(body.tags, ["GCWJ.GCWJ.Wijster.Flare.FI-65-0001_Tot"]);
});

test("tagPrefixMap maps browseTags results back to the caller's prefix", async (t) => {
  const stub = await startStub({
    browseTags: () => ({ statusCode: "Good", tags: ["GCWJ.GCWJ.Wijster.A", "GCWJ.GreenCreate.Wijster.B"] }),
    getLiveDataToken: () => ({ statusCode: "Good", liveDataToken: "L" }),
  });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, apiToken: "T", tagPrefixMap: MAP };

  const browsed = await canary.browseTags(creds);
  await canary.getLiveDataToken(creds);

  assert.deepEqual(browsed.tags, ["GREENCREATE.Wijster.A", "GCWJ.GreenCreate.Wijster.B"]);
  assert.deepEqual(stub.sent("getLiveDataToken")[0].tags, ["GCWJ.GCWJ.Wijster.A", "GCWJ.GreenCreate.Wijster.B"]);
});

test("without tagPrefixMap tag names are untouched", async (t) => {
  const stub = await startStub({ getTagData2: echoTags });
  t.after(stub.close);
  const canary = loadCanary();

  const result = await canary.getProcessedData({ baseURL: stub.baseURL, apiToken: "T" }, { tags: ["GREENCREATE.Wijster.X"] });

  assert.deepEqual(stub.sent("getTagData2")[0].tags, ["GREENCREATE.Wijster.X"]);
  assert.ok(result.data["GREENCREATE.Wijster.X"]);
});

test("token mode: the time zone given to getUserToken is sent on data requests", async (t) => {
  const stub = await startStub({ getTagData2: echoTags });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, apiToken: "T" };

  await canary.getProcessedData(creds, { tags: ["A"] });
  await canary.getUserToken(creds, { timezone: "Eastern Standard Time" });
  await canary.getProcessedData(creds, { tags: ["A"] });
  await canary.totalPeak(creds, { tags: ["A"] });
  await canary.getUserToken(creds);
  await canary.getCurrentValues(creds, { tags: ["A"] });

  const sent = stub.sent("getTagData2").map((b) => b.timeZone);
  assert.deepEqual(sent, [undefined, "Eastern Standard Time", "Eastern Standard Time", "GMT Standard Time"]);
});

test("credentials.timeZone overrides the session time zone", async (t) => {
  const stub = await startStub({ getTagData2: echoTags });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, apiToken: "T", timeZone: "W. Europe Standard Time" };

  await canary.getUserToken(creds, { timezone: "Eastern Standard Time" });
  await canary.getProcessedData(creds, { tags: ["A"] });

  assert.equal(stub.sent("getTagData2")[0].timeZone, "W. Europe Standard Time");
});

test("username/password mode does not send timeZone (the session already has it)", async (t) => {
  const stub = await startStub({ getTagData2: echoTags });
  t.after(stub.close);
  const canary = loadCanary();
  const creds = { baseURL: stub.baseURL, username: "u", password: "p" };

  await canary.getUserToken(creds, { timezone: "Eastern Standard Time" });
  await canary.getProcessedData(creds, { tags: ["A"] });

  assert.equal("timeZone" in stub.sent("getTagData2")[0], false);
});

test("strict: an Error statusCode (e.g. unknown tag) throws instead of returning empty data", async (t) => {
  const stub = await startStub({
    getTagData2: (body) => ({
      statusCode: "Error",
      errors: [`Tag Error (${body.tags[0]}): ViewNotFound`],
      data: { [body.tags[0]]: [] },
    }),
  });
  t.after(stub.close);
  const canary = loadCanary();
  const base = { baseURL: stub.baseURL, apiToken: "T", tagPrefixMap: MAP };

  // Default behaviour is unchanged: the empty result is returned.
  const loose = await canary.getProcessedData(base, { tags: ["GREENCREATE.Wijster.Missing"] });
  assert.deepEqual(loose.data["GREENCREATE.Wijster.Missing"], []);

  await assert.rejects(canary.getProcessedData({ ...base, strict: true }, { tags: ["GREENCREATE.Wijster.Missing"] }), (error) => {
    assert.equal(error.statusCode, "Error");
    assert.match(error.message, /GCWJ\.GCWJ\.Wijster\.Missing/);
    return true;
  });
  await assert.rejects(canary.totalPeak({ ...base, strict: true }, { tags: ["GREENCREATE.Wijster.Missing"] }), /ViewNotFound/);
});
