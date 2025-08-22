// totalPeak-example.js
require("dotenv").config({ path: "./process.env" });
const canary = require("./index.js"); // when using from npm use: require("canarylabs-web-api")

// Basic running example

const credentials = {
  username: process.env.API_USERNAME || "default_username",
  password: process.env.API_PASSWORD || "default_password",
  baseURL:
    process.env.MY_BASE_URL ||
    "https://greencreate.canarylabs.online:55236/api/v2",
};

const userTokenBody = {
  application: "Web API",
  timezone: process.env.MY_TIMEZONE || "GMT Standard Time",
};

// Configure the test tag/time window via env or defaults
const TEST_TAG =
  process.env.MY_TAG || "Company.Site.Flow.FT1731_PV";

// NOTE: Dates can be absolute (MM-DD-YYYY HH:mm) or relative ("now - 24 hour")
const START_TIME = process.env.START_TIME || "now - 24 hour";
const END_TIME = process.env.END_TIME || "now";

(async () => {
  try {
    // 1) Authenticate
    const token = await canary.getUserToken(credentials, userTokenBody);
    // console.log("User token:", token);

    // 2) Build tag list (optional if you pass tags explicitly)
    const browseTagsResult = await canary.browseTags(credentials);
    // console.log("Browse tags:", browseTagsResult);

    if (!browseTagsResult) {
      console.error("Error in browseTags. Cannot proceed to totalPeak.");
      return;
    }

    // (Optional) Live data token step shown in your example, not required for totalPeak:
    // const liveDataResult = await canary.getLiveDataToken(credentials);
    // console.log("Live Data Result:", liveDataResult);

    // 3) Call totalPeak (fuzzy totaliser)
    const peak = await canary.totalPeak(credentials, {
      tags: [TEST_TAG],
      startTime: START_TIME,
      endTime: END_TIME,
      maxSize: 10000000, // large to allow full pagination if needed
    });

    console.log("=== totalPeak Example ===");
    console.log("Tag:       ", TEST_TAG);
    console.log("StartTime: ", START_TIME);
    console.log("EndTime:   ", END_TIME);
    console.log("Peak value:", peak);

    // 4) (Optional) Revoke user token when done
    // await canary.revokeUserToken(credentials);
  } catch (error) {
    console.error("Error:", error?.message || error);
  }
})();
