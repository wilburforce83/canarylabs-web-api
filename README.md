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

### Documentation of the API

https://helpcenter.canarylabs.com/t/y4hvlzq/web-read-api-postman-example-version-23