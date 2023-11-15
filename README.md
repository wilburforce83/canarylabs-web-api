# canarylabs-web-api
Unofficial NodeJS package for the Canary Axiom Web API

### Install

`npm install canarylabs-web-api`

### Usage


```javascript
require("dotenv").config({ path: "./process.env" });
const canary = require("canarylabs-web-api");

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
    console.log("User Token : " + result.userToken);
  } catch (error) {
    console.error("Error:", error);
  }
})();

```

### Additional useful functions

Automatically store all tag values in an object where the key:value = "Tag_name123" : latest value for simple recall

Usage:

```javascript
let tagValues = await canary.storeLatestValues(credentials);
```

Result:

```javascript
{
    Company: {
        Site: {
            PlantItem1: {
                sensor1: /* Corresponding value for "Company.Site.PlantItem1.sensor1" */,
            },
            Flow: {
                FT1: /* Corresponding value for "Company.Site.Flow.FT1" */,
            },
            PlantItem2: {
                Power: /* Corresponding value for "Company.Site.PlantItem2.Power" */,
            },
            Pressure: {
                PT1: /* Corresponding value for "Company.Site.Pressure.PT1" */,
                PT2: /* Corresponding value for "Company.Site.Pressure.PT2" */,
                PT3: /* Corresponding value for "Company.Site.Pressure.PT3" */,
                PT4: /* Corresponding value for "Company.Site.Pressure.PT4" */,
            },
        },
    },
}
```
This allows you to use the Axiom tag reference to directly call a live value without having to process it manually fro the API response.

### Documentation of the API

https://helpcenter.canarylabs.com/t/y4hvlzq/web-read-api-postman-example-version-23