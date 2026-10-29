require("dotenv").config({ path: "./process.env" });
const canary = require("./index.js"); // when using from npm use require('canarylabs-web-api')

// Basic running example. Set MY_TOKEN to use an API token, or MY_USERNAME and
// MY_PASSWORD to log in. When both are set, the API token is used.

const credentials = {
  baseURL: process.env.MY_BASE_URL,
  apiToken: process.env.MY_TOKEN,
  username: process.env.MY_USERNAME,
  password: process.env.MY_PASSWORD,
};

let userTokenBody = {
  application: "Web API",
  timezone: "Eastern Standard Time",
};

// Example usage:

(async () => {
  try {
    // With an API token this makes no request; it is safe to keep calling it.
    let result = await canary.getUserToken(credentials, userTokenBody);
    console.log("Authenticated using:", result.authMode);

    let browseTagsResult = await canary.browseTags(credentials);
    console.log("Browse tags:", browseTagsResult.tags.length, "tags");

    let liveValues = await canary.getCurrentValues(credentials, {
      tags: ["Company.Site.Flow.FT1200_PV"],
    });
    const dataArray = liveValues.data["Company.Site.Flow.FT1200_PV"];
    console.log("Flow Meter 1200:", dataArray[0].v);
  } catch (error) {
    console.error("Error:", error.message);
  }
})();
