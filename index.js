"use strict";

const axios = require("axios");
const https = require("https");

// TLS verification is OFF by default for backwards compatibility: the Canary Web API
// port usually serves a self-signed certificate. Opt in per credentials object with
// `rejectUnauthorized: true`, plus `ca` (PEM) when the server uses a private CA.

const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});
const verifyingAgents = new Map();

function getAgent(credentials) {
  if (!credentials || credentials.rejectUnauthorized !== true) return insecureAgent;
  const ca = credentials.ca || undefined;
  if (!verifyingAgents.has(ca)) {
    verifyingAgents.set(ca, new https.Agent({ rejectUnauthorized: true, ca }));
  }
  return verifyingAgents.get(ca);
}

function buildURL(baseURL, endpoint) {
  return String(baseURL).replace(/\/+$/, "") + "/" + endpoint;
}

// Guards against servers that keep returning a continuation.
const MAX_PAGES = 10000;

// ERRORS
// Errors are rebuilt without the axios request config, which holds the request body
// (password / API token). Callers that log the whole error object stay safe.

const SECRET_KEYS = ["password", "apiToken", "accessToken", "userToken", "liveDataToken"];

class CanaryError extends Error {
  constructor(message) {
    super(message);
    this.name = "CanaryError";
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = SECRET_KEYS.includes(key) ? "[REDACTED]" : redact(value[key]);
    }
    return out;
  }
  return value;
}

function sanitizeError(error) {
  const safe = new CanaryError(error.message);
  if (error.code) safe.code = error.code;
  if (error.response) {
    safe.status = error.response.status;
    safe.response = {
      status: error.response.status,
      statusText: error.response.statusText,
      data: redact(error.response.data),
    };
  }
  return safe;
}

const makeRequest = async (credentials, endpoint, data) => {
  try {
    const response = await axios({
      url: buildURL(credentials.baseURL, endpoint),
      method: "POST",
      data: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
      httpsAgent: getAgent(credentials),
      timeout: credentials.timeout || 0,
    });
    return response.data;
  } catch (error) {
    console.error("Error:", error.message);
    throw sanitizeError(error);
  }
};

// AUTHENTICATION
// Two methods are supported:
//   - API token: credentials.apiToken (or credentials.token). Sent on every request;
//     no getUserToken round-trip is needed. Takes precedence when present.
//   - Username/password: getUserToken() logs in and stores a session userToken.

function getApiToken(credentials) {
  return (credentials && (credentials.apiToken || credentials.token)) || null;
}

function getAuthMode(credentials) {
  return getApiToken(credentials) ? "apiToken" : "userToken";
}

// API functions

function createClient() {
  // Per-client state. The default export is one shared client, as in 1.x.
  const session = {
    userToken: null,
    tags: [],
    liveDataToken: null,
  };

  const auth = (credentials) => {
    const token = getApiToken(credentials);
    if (token) return { [credentials.tokenParam || "apiToken"]: token };
    return { userToken: session.userToken };
  };

  const resolveTags = (body) => (body.tags !== undefined ? body.tags : session.tags);

  // Requests getTagData2 and follows continuations, merging every page into the first.
  const getAllTagData = async (credentials, payload) => {
    let result = null;
    let continuation = payload.continuation;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await makeRequest(credentials, "getTagData2", { ...payload, continuation });
      if (result === null) {
        result = data;
      } else if (data && data.data) {
        result.data = result.data || {};
        for (const tag of Object.keys(data.data)) {
          result.data[tag] = (result.data[tag] || []).concat(data.data[tag]);
        }
      }
      const next = data && data.continuation !== undefined ? data.continuation : null;
      if (next === null || JSON.stringify(next) === JSON.stringify(continuation)) break;
      continuation = next;
    }
    if (result && typeof result === "object") result.continuation = null;
    return result;
  };

  const api = {
    getTimeZones: async (credentials) => {
      const data = await makeRequest(credentials, "getTimeZones");
      return data;
    },

    getUserToken: async (credentials, body) => {
      body = body !== undefined ? body : {};
      if (getApiToken(credentials)) {
        // API tokens need no session. Stay callable so existing scripts work unchanged.
        return { statusCode: "Good", userToken: null, authMode: "apiToken" };
      }
      const data = await makeRequest(credentials, "getUserToken", {
        application:
          body.application !== undefined ? body.application : "Web API",
        timeZone:
          body.timezone !== undefined ? body.timezone : "GMT Standard Time",
        username: credentials.username,
        password: credentials.password,
      });
      session.userToken = data.userToken;
      return { ...data, authMode: "userToken" };
    },

    browseTags: async (credentials, body) => {
      body = body !== undefined ? body : {};
      const data = await makeRequest(credentials, "browseTags", {
        ...auth(credentials),
        deep: body.deep !== undefined ? body.deep : true,
        path: body.path !== undefined ? body.path : "",
      });
      session.tags = (data && data.tags) || [];
      return data;
    },

    getCurrentValues: async (credentials, body) => {
      body = body !== undefined ? body : {};
      const tags = resolveTags(body);
      if (!tags || tags.length === 0) {
        // Call browseTags first or pass body.tags
        return;
      }

      const data = await makeRequest(credentials, "getTagData2", {
        ...auth(credentials),
        tags,
      });
      return data;
    },

    getRawData: async (credentials, body, continuation) => {
      body = body !== undefined ? body : {};
      const tags = resolveTags(body);
      if (!tags || tags.length === 0) {
        return;
      }

      return getAllTagData(credentials, {
        ...auth(credentials),
        tags,
        startTime:
          body.startTime !== undefined ? body.startTime : "Now - 24 Hours",
        endTime: body.endTime !== undefined ? body.endTime : "Now",
        maxSize: body.maxSize !== undefined ? body.maxSize : 100000,
        continuation: continuation !== undefined ? continuation : null,
      });
    },

    getProcessedData: async (credentials, body, continuation) => {
      body = body !== undefined ? body : {};
      const tags = resolveTags(body);
      if (!tags || tags.length === 0) {
        return;
      }

      const data = await getAllTagData(credentials, {
        ...auth(credentials),
        tags,
        startTime:
          body.startTime !== undefined ? body.startTime : "Now - 24 Hours",
        endTime: body.endTime !== undefined ? body.endTime : "Now",
        aggregateName:
          body.aggregateName !== undefined
            ? body.aggregateName
            : "TimeAverage2",
        aggregateInterval:
          body.aggregateInterval !== undefined
            ? body.aggregateInterval
            : "1 Hour",
        maxSize: body.maxSize !== undefined ? body.maxSize : 100000,
        continuation: continuation !== undefined ? continuation : null,
      });

      if (data && data.data) processTags(data, tags);
      return data;
    },

    revokeUserToken: async (credentials) => {
      if (getApiToken(credentials)) {
        // API tokens are managed in Canary Identity, not revoked through the Read API.
        return { statusCode: "Good" };
      }
      const data = await makeRequest(credentials, "revokeUserToken", {
        userToken: session.userToken,
      });
      session.userToken = null;
      return data;
    },

    browseNodes: async (credentials, path) => {
      const data = await makeRequest(credentials, "browseNodes", {
        ...auth(credentials),
        path: path !== undefined ? path : "",
      });

      const nodes = data.nodes;
      const keys = Object.keys(nodes);
      if (keys.length > 0) {
        const node = nodes[keys[0]];
        if (node.hasNodes) await api.browseNodes(credentials, node.fullPath);
        return data;
      }
      return data;
    },

    getAggregates: async (credentials) => {
      const data = await makeRequest(credentials, "getAggregates", {
        ...auth(credentials),
      });
      return data;
    },

    getQualities: async (credentials, qualities) => {
      const data = await makeRequest(credentials, "getQualities", {
        ...auth(credentials),
        qualities: qualities !== undefined ? qualities : [192, "193", 32768],
      });
      return data;
    },

    getTagProperties: async (credentials, body) => {
      body = body !== undefined ? body : {};
      const data = await makeRequest(credentials, "getTagProperties", {
        ...auth(credentials),
        tags: resolveTags(body),
      });
      return data;
    },

    getLiveDataToken: async (credentials, body) => {
      body = body !== undefined ? body : {};
      const tags = resolveTags(body);
      if (!tags || tags.length === 0) {
        return;
      }

      const data = await makeRequest(credentials, "getLiveDataToken", {
        ...auth(credentials),
        tags,
        mode: body.mode !== undefined ? body.mode : "AllValues",
        includeQuality: true,
      });
      session.liveDataToken = data.liveDataToken;
      return data;
    },

    getLiveData: async (credentials, continuation) => {
      const data = await makeRequest(credentials, "getLiveData", {
        ...auth(credentials),
        liveDataToken: session.liveDataToken,
        continuation: continuation !== undefined ? continuation : null,
      });
      return data;
    },

    revokeLiveDataToken: async (credentials) => {
      const data = await makeRequest(credentials, "revokeLiveDataToken", {
        ...auth(credentials),
        liveDataToken: session.liveDataToken,
      });
      session.liveDataToken = null;
      return data;
    },

    storeLatestValues: async (credentials) => {
      let liveValues = await api.getCurrentValues(credentials);

      // Define an object to store the variables
      let result = {};
      if (!liveValues || !liveValues.data) return result;

      // Iterate through each key in liveValues.data
      for (let key in liveValues.data) {
        if (Object.prototype.hasOwnProperty.call(liveValues.data, key) && liveValues.data[key][0]) {
          // Allocate automatic variables with the key name
          result[key] = liveValues.data[key][0].v;
        }
      }

      return result;
    },

    extractValues: (data) => {
      // Check if the input data is an array
      if (!Array.isArray(data)) {
        throw new Error("Input data must be an array");
      }

      // Use the map function to create a new array with only the "v" values
      const valuesArray = data.map((item) => item.v);

      return valuesArray;
    },

    softTotalizer: async (credentials, body) => {
      body = body !== undefined ? body : {};
      const aggregateInterval =
        body.aggregateInterval !== undefined ? body.aggregateInterval : "1 Hour";

      let rawData = await api.getProcessedData(credentials, { ...body, aggregateInterval });
      let dataValues = api.extractValues(rawData.data[resolveTags(body)[0]]);

      // Sum of array
      var sum = 0;
      for (var i = 0; i < dataValues.length; i++) {
        sum += dataValues[i];
      }

      var multiplier = convertTimeStringToHours(aggregateInterval);
      let totaliser = Math.floor(sum * multiplier);

      return totaliser;
    },

    softRunHours: async (credentials, body, threshold) => { // where threshold is the integer to trigger a time count
      body = body !== undefined ? body : {};
      const aggregateInterval =
        body.aggregateInterval !== undefined ? body.aggregateInterval : "1 Hour";

      let rawData = await api.getProcessedData(credentials, { ...body, aggregateInterval });
      let dataValues = api.extractValues(rawData.data[resolveTags(body)[0]]);

      // Count the samples above the threshold
      var sum = 0;
      for (var i = 0; i < dataValues.length; i++) {
        if (dataValues[i] > threshold) {
          sum++;
        }
      }

      var multiplier = convertTimeStringToHours(aggregateInterval);
      let runHours = (sum * multiplier).toFixed(2);

      return runHours;
    },

    /**
     * totalPeak: fuzzy totaliser
     * Returns the highest numeric value seen in the raw samples for the requested tag(s)
     * over the specified window, without needing to know reset times.
     *
     * @param {object} credentials - { baseURL, apiToken } or { baseURL, username, password }
     * @param {object} body - { tags: [string], startTime, endTime, maxSize }
     * @returns {number|null} - highest value found, or null if none
     */
    totalPeak: async (credentials, body) => {
      body = body !== undefined ? body : {};

      const tags = resolveTags(body);
      if (!tags || tags.length === 0) {
        // Call browseTags first or pass body.tags
        return null;
      }

      const startTime = body.startTime !== undefined ? body.startTime : "Now - 24 Hours";
      const endTime   = body.endTime   !== undefined ? body.endTime   : "Now";
      const maxSize   = body.maxSize   !== undefined ? body.maxSize   : 100000;

      let continuation = null;
      let peak = -Infinity;

      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await makeRequest(credentials, "getTagData2", {
          ...auth(credentials),
          tags,
          startTime,
          endTime,
          maxSize,
          continuation,
        });
        // Prefer the first tag (mirrors softTotalizer/softRunHours pattern)
        if (data && data.data && data.data[tags[0]]) {
          const arr = data.data[tags[0]];
          for (let i = 0; i < arr.length; i++) {
            const v = Number(arr[i]?.v);
            if (Number.isFinite(v) && v >= peak) {
              peak = v;
            }
          }
        }

        const next = data?.continuation ?? null;
        if (next === null || JSON.stringify(next) === JSON.stringify(continuation)) break;
        continuation = next;
      }

      return peak === -Infinity ? null : peak;
    },

    getAuthMode,
  };

  return api;
}


// HELPER FUNCTIONS

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

function convertTimeStringToHours(inputString) {
  // Regular expression to extract number and unit from the input string
  const regex = /^(\d+)\s+(\w+)$/;

  // Use regex to match the input string
  const match = String(inputString).match(regex);

  if (!match) {
    // If the input string does not match the expected format
    console.error("Invalid input format. Please use the format: '10 seconds', '12 hours', '17 minutes', '10 days', etc.");
    return null;
  }

  // Extract number and unit from the match
  const number = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // Define conversion factors
  const conversionFactors = {
    second: 1 / 3600,
    minute: 1 / 60,
    hour: 1,
    day: 24,
    week: 24 * 7,
    seconds: 1 / 3600,
    minutes: 1 / 60,
    hours: 1,
    days: 24,
    weeks: 24 * 7,
  };

  // Check if the unit is a valid key in the conversionFactors object
  if (!(unit in conversionFactors)) {
    console.error("Invalid time unit. Please use 'second(s)', 'minute(s)', 'hour(s)', 'day(s)', or 'week(s)'.");
    return null;
  }

  // Calculate the result in hours
  const resultInHours = number * conversionFactors[unit];

  return resultInHours;
}


const api = createClient();
api.createClient = createClient;
api.CanaryError = CanaryError;

module.exports = api;
