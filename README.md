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

#### Value processing

Automatically store all tag values in an object where the key:value = "Full.Tag_name123" : latest value for simple recall, I have found this very useful.

Usage:

```javascript
let tagValues = await canary.storeLatestValues(credentials);
```

Result:

```javascript

// example
var pressureTag1 = tagValues["Company.Site.Pressure.pressure1"]
console.log(pressureTag1+" bar")

// result 1.57 bar
```

This allows you to use the Axiom tag reference to directly call a live value without having to process it manually fro the API response.

#### Removal of null

The Canary API returns `null` on any processed data request i.e an average or delta request, if that tag has been sitting at 0 for the whole request period. This is also an issue with the API usage on the Axiom dashboard system, where averages and deltas etc return an error instead of 0 in value boxes. The main issue here is that will break subsquent calculations (as it does with the historian calcs), this means adding in your own error handling, so I have added this into the API with a simple helper function that will run on the returned data and sanitize `null` to `0`:

```javascript
function processTags(data, tags) {
 console.log(data.data);
  tags.forEach(tag => {
      if (data.data[tag]) {
          data.data[tag].forEach(item => {
            console.log("item",item);
              if (item.v === null) {
                  item.v = 0;
              }
          });
      }
  });
  return data;
}
```

#### Software Totalizer

If your flow sensor does not have a pulsed output totaliser you can use this function to return a totalizer figure for a given period. the body key of `aggregateInterval` will determine the accuracy of the total, and should be used carefully, an interval of 1 second will be very accruate, but over a period of the more than a few hours will return too many values. Whereas an interval of 1 hour will return fewer values, but will be less accurate as a total.

```javascript
// Dates should be mm-dd-yyyy, seconds, minutes, hours, days, weeks are also acceptable semantic start and end times.

       let totalizer = await canary.softTotalizer(credentials, {

        "userToken": "{{UserToken}}",
        "tags": ["Company.Site.Flow.FT1731_PV"],
        "startTime": "now - 2 hour",
        "endTime": "now",
        "maxSize": 10000000,
        "aggregateName": "TimeAverage2",
        "aggregateInterval": "30 seconds"

    });

    console.log("response; ",totalizer);

  };
```

### Documentation of the API

https://helpcenter.canarylabs.com/t/y4hvlzq/web-read-api-postman-example-version-23