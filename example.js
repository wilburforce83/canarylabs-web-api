require("dotenv").config({ path: "./process.env" });
const canary = require("./index.js"); // when using from npm use require('canarylabs-web-api')

// Basic running example

const credentials = {
  username: process.env.MY_USERNAME || "default_username",
  password: process.env.MY_PASSWORD || "default_password",
  baseURL:
    process.env.MY_BASE_URL ||
    "https://yourdomain.canarylabs.online:55236/api/v2",
};

let userTokenBody = {
  application: "Web API",
  timezone: "Eastern Standard Time",
};

// Example usage:

(async () => {
  try {
    let result = await canary.getUserToken(credentials, userTokenBody);
    console.log("getusertoken", result);

    // Make sure browseTags returns a promise
    let browseTagsResult = await canary.browseTags(credentials);
    console.log("Browse tags", browseTagsResult);
    // Check if browseTags was successful before calling getLiveDataToken
    if (browseTagsResult) {
      let liveDataResult = await canary.getLiveDataToken(credentials);
      console.log("Live Data Result", liveDataResult);
      if (liveDataResult) {
        let liveValues = await canary.getCurrentValues(credentials, {
          tags: ["Company.Site.Flow.FT1200_PV"],
        });
        const dataArray = liveValues.data["Company.Site.Flow.FT1200_PV"];
        const firstObject = dataArray[0].v;

        console.log('Flow Mater 1200:',firstObject);
      }
    } else {
      console.log("Error in browseTags. Cannot proceed to getLiveDataToken.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();
