# canarylabs-web-api
Unofficial NodeJS package for the Canary Axiom Web API

### Install

`npm install canarylabs-web-api`

### Usage

The package supports two ways to authenticate with the Canary Web API:

| Method | Credentials | Notes |
|---|---|---|
| **API token** (recommended) | `{ baseURL, apiToken }` | Create one in Canary Admin under *Identity > Security > API Tokens*. No login request is needed. |
| **Username / password** | `{ baseURL, username, password }` | `getUserToken()` logs in and stores a session token. Canary v24+ only supports this with a Windows AD identity provider. |

If both are supplied, the API token is used.

```javascript
require("dotenv").config({ path: "./process.env" });
const canary = require("canarylabs-web-api");

const credentials = {
  baseURL: process.env.MY_BASE_URL, // e.g. https://yourdomain.canarylabs.online:55236/api/v2
  apiToken: process.env.MY_TOKEN,   // or leave unset and provide username/password
  username: process.env.MY_USERNAME,
  password: process.env.MY_PASSWORD,
};

(async () => {
  try {
    // With an API token this makes no request, so existing scripts keep working unchanged.
    const login = await canary.getUserToken(credentials, { timezone: "GMT Standard Time" });
    console.log("Authenticated using:", login.authMode); // "apiToken" or "userToken"

    const browse = await canary.browseTags(credentials);
    console.log(browse.tags.length, "tags");
  } catch (error) {
    console.error("Error:", error.message);
  }
})();
```

#### Credentials options

| Option | Default | Description |
|---|---|---|
| `baseURL` | — | Web API base URL, including `/api/v2`. A trailing slash is fine. |
| `apiToken` (alias `token`) | — | Canary API token. |
| `tokenParam` | `"apiToken"` | Request field used for the token. Set `"accessToken"` for Canary v23 servers. |
| `username`, `password` | — | Used by `getUserToken()` when no API token is set. |
| `rejectUnauthorized` | `false` | Set `true` to verify the server's TLS certificate. Off by default because the Web API port usually serves a self-signed certificate. |
| `ca` | — | PEM certificate(s) to trust when `rejectUnauthorized` is `true`, e.g. `fs.readFileSync("canary.pem")`. |
| `timeout` | `0` (none) | Request timeout in milliseconds. |
| `timeZone` | — | Windows time zone name for interpreting and returning times, e.g. `"GMT Standard Time"`. See *Time zones* below. |
| `tagPrefixMap` | — | Translate tag-name prefixes between your names and the server's, e.g. `{ "Old.Site.": "New.Site." }`. See *Renamed tags* below. |
| `strict` | `false` | Throw a `CanaryError` when Canary answers with a `statusCode` other than `"Good"` (for example an unknown tag), instead of returning the response. |

#### Time zones

Canary interprets times without an offset (e.g. `"10-28-2026 06:00:00"`) and returns timestamps in a time zone. With username/password, that is the zone passed to `getUserToken({ timezone })`, which the server ties to the session. API tokens have no session, so in token mode the package remembers the zone passed to `getUserToken()` (default `"GMT Standard Time"`) and sends it as `timeZone` on every data request. Scripts written for username/password therefore behave the same with a token. If `getUserToken()` is never called, the server's own time zone is used. Set `credentials.timeZone` to choose a zone explicitly.

#### Renamed tags

If a server's tag names change (for example after a migration), `tagPrefixMap` lets existing code keep using the old names:

```javascript
const credentials = {
  baseURL, apiToken,
  tagPrefixMap: { "GREENCREATE.Wijster.": "GCWJ.GCWJ.Wijster." },
};
const result = await canary.getProcessedData(credentials, { tags: ["GREENCREATE.Wijster.Lagoons.LT-51-0102"] });
result.data["GREENCREATE.Wijster.Lagoons.LT-51-0102"]; // requested as GCWJ.GCWJ.Wijster.Lagoons.LT-51-0102
```

Prefixes match case-insensitively, and each tag comes back exactly as you spelled it. `browseTags()` results are mapped back to your prefix too. Combine it with `strict: true` so a tag that does not exist on the server raises an error instead of returning empty data.

#### Errors

Failed requests throw a `CanaryError` with the usual message (e.g. `Request failed with status code 401`), plus `status`, `code` and `response: { status, statusText, data }`. The request body is never attached, so logging the whole error cannot expose your password or API token.

Canary can also report problems inside a successful response, as `statusCode: "Error"` with an `errors` array (for example a failed username/password login). Check `statusCode` where that matters.

#### Separate clients

The default export keeps one shared session (session token, browsed tags, live data token). To use several servers or accounts in one process, give each its own client:

```javascript
const siteA = canary.createClient();
const siteB = canary.createClient();
await siteA.browseTags(credentialsA);
await siteB.browseTags(credentialsB);
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
  tags.forEach(tag => {
    if (data.data[tag]) {
      data.data[tag].forEach(item => {
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

#### Software runHours

For calculating the run hours of equipment based on a key production parameter, such as flowrate, pressure, power, frequency etc.

Identical to the soft totalizer with an additional paratmeter of `threshold` which is there to account for noise i.e. a flow meter might have a threshold of "1" to avoid reading of <1 from triggering the run count:

```javascript
let threshold = 1 // where the threshold is the lowest value that the parameter might read when not running

let runHours = await canary.softRunHours(credentials, {

            "tags": ["company.site.Flow.FT2900_PV"],
          "startTime": "12-01-2023",
          "endTime": "now",
          "maxSize": 10000000,
          "aggregateName": "TimeAverage2",
          "aggregateInterval": "10 seconds"

        }, threshold);

        console.log("response; ", runHours);
```

#### Paged results

`getRawData`, `getProcessedData` and `totalPeak` follow Canary's `continuation` automatically and return every page, so large windows come back complete.

### Testing

```
npm test            # offline tests against a local stub server
npm run test:live   # read-only checks against the server in ./process.env
```

### Documentation of the API

https://helpcenter.canarylabs.com/t/y4hvlzq/web-read-api-postman-example-version-23