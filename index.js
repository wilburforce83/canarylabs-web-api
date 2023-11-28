const axios = require("axios");
const https = require("https");

// Ingoring SSL failures - ONLY USE ON READONLY NON_SENSITIVE DATA

const agent = new https.Agent({
  rejectUnauthorized: false,
});

let _userToken = null;
let _tags = [];
let _liveDataToken = null;

const makeRequest = async (url, method, data) => {
  try {
    const response = await axios({
      url,
      method,
      data: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
      httpsAgent: agent,
    });
    return response.data;
  } catch (error) {
    console.error("Error:", error.message);
    throw error;
  }
};

// API functions

const api = {
  getTimeZones: async (credentials) => {
    const data = await makeRequest(
      credentials.baseURL + "/getTimeZones",
      "POST"
    );
    //console.log('getTimeZones', data);
    return data;
  },

  getUserToken: async (credentials, body) => {
    body = body !== undefined ? body : { blank: "value" };
    const data = await makeRequest(
      credentials.baseURL + "/getUserToken",
      "POST",
      {
        application:
          body.application !== undefined ? body.application : "Web API",
        timeZone:
          body.timezone !== undefined ? body.timezone : "GMT Standard Time",
        username: credentials.username,
        password: credentials.password,
      }
    );
    //console.log('getUserToken', data);
    _userToken = data.userToken;
    return data;
  },

  browseTags: async (credentials, body, continuation) => {
    body = body !== undefined ? body : { blank: "value" };
    //console.log(body);
    const data = await makeRequest(
      credentials.baseURL + "/browseTags",
      "POST",
      {
        userToken: _userToken,
        deep: body.deep !== undefined ? body.deep : true,
        path: body.path !== undefined ? body.path : "",
      }
    );
    //console.log('browseTags', data);
    _tags = data.tags;
    return data;
  },

  getCurrentValues: async (credentials, body) => {
    body = body !== undefined ? body : { blank: "value" };
    if (_tags.length === 0) {
      //console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    const data = await makeRequest(
      credentials.baseURL + "/getTagData2",
      "POST",
      {
        userToken: _userToken,
        tags: body.tags !== undefined ? body.tags : _tags,
      }
    );
    //console.log('getCurrentValues', data);
    return data;
  },

  getRawData: async (credentials, body, continuation) => {
    body = body !== undefined ? body : { blank: "value" };
    if (_tags.length === 0) {
      //console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    try {
      const data = await makeRequest(
        credentials.baseURL + "/getTagData2",
        "POST",
        {
          userToken: _userToken,
          tags: body.tags !== undefined ? body.tags : _tags,
          startTime:
            body.startTime !== undefined ? body.startTime : "Now - 24 Hours",
          endTime: body.endTime !== undefined ? body.endTime : "Now",
          maxSize: body.maxSize !== undefined ? body.maxSize : 100000,
          continuation: continuation !== undefined ? continuation : null,
        }
      );
      //console.log('getRawData', data);

      if (data.continuation !== null) {
        //console.log('CONTINUATION: getRawData', data.continuation);
        // do an array push maybe? need to understand how this works
        await api.getRawData(credentials, data.continuation);
      } else {
        //console.log('FINISHED: getRawData');
        return data;
      }
    } catch (error) {
      //console.log('error', error);
    }
  },

  getProcessedData: async (credentials, body, continuation) => {
    body = body !== undefined ? body : { blank: "value" };
    if (_tags.length === 0) {
      //console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    try {
      const data = await makeRequest(
        credentials.baseURL + "/getTagData2",
        "POST",
        {
          userToken: _userToken,
          tags: body.tags !== undefined ? body.tags : _tags,
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
        }
      );
      //console.log('getProcessedData', data);

      if (data.continuation !== null) {
        //console.log('CONTINUATION: getProcessedData', data.continuation);
        await api.getProcessedData(credentials, data.continuation);
      } else {
        //console.log('FINISHED: getProcessedData');
        if (data.data)

        var FixedData = processTags(data, body.tags);
        console.group("processed tags");
        return FixedData;
      }
    } catch (error) {
      //console.log('error', error);
    }
  },

  revokeUserToken: async (credentials) => {
    body = body !== undefined ? body : { blank: "value" };
    const data = await makeRequest(
      credentials.baseURL + "/revokeUserToken",
      "POST",
      {
        userToken: _userToken,
      }
    );
    //console.log('revokeUserToken', data);
    _userToken = null;
    return data;
  },

  browseNodes: async (credentials, path) => {
    const data = await makeRequest(
      credentials.baseURL + "/browseNodes",
      "POST",
      {
        userToken: _userToken,
        path: path !== undefined ? path : "",
      }
    );
    //console.log('browseNodes', data);

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
    const data = await makeRequest(
      credentials.baseURL + "/getAggregates",
      "POST",
      {
        userToken: _userToken,
      }
    );
    //console.log('getAggregates', data);
    return data;
  },

  getQualities: async (credentials, qualities) => {
    const data = await makeRequest(
      credentials.baseURL + "/getQualities",
      "POST",
      {
        userToken: _userToken,
        qualities: qualities !== undefined ? qualities : [192, "193", 32768],
      }
    );
    //console.log('getQualities', data);
    return data;
  },

  getTagProperties: async (credentials, body) => {
    body = body !== undefined ? body : { blank: "value" };
    const data = await makeRequest(
      credentials.baseURL + "/getTagProperties",
      "POST",
      {
        userToken: _userToken,
        tags: body.tags !== undefined ? body.tags : _tags,
      }
    );
    //console.log('getTagProperties', data);
    return data;
  },

  getLiveDataToken: async (credentials, body) => {
    body = body !== undefined ? body : { blank: "value" };
    if (_tags.length === 0) {
      //console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    const data = await makeRequest(
      credentials.baseURL + "/getLiveDataToken",
      "POST",
      {
        userToken: _userToken,
        tags: body.tags !== undefined ? body.tags : _tags,
        mode: body.mode !== undefined ? body.mode : "AllValues",
        includeQuality: true,
      }
    );
    //console.log('getLiveDataToken', data);
    _liveDataToken = data.liveDataToken;
    return data;
  },

  getLiveData: async (credentials, continuation) => {
    const data = await makeRequest(
      credentials.baseURL + "/getLiveData",
      "POST",
      {
        userToken: _userToken,
        liveDataToken: _liveDataToken,
        continuation: continuation !== undefined ? continuation : null,
      }
    );
    //console.log('getLiveData', data);
    return data;
  },

  revokeLiveDataToken: async (credentials) => {
    const data = await makeRequest(
      credentials.baseURL + "/revokeLiveDataToken",
      "POST",
      {
        userToken: _userToken,
        liveDataToken: _liveDataToken,
      }
    );
    //console.log('revokeLiveDataToken', data);
    _liveDataToken = null;
    return data;
  },

  storeLatestValues: async (credentials) => {
    let liveValues = await api.getCurrentValues(credentials);
  
    // Define an object to store the variables
    let result = {};
  
    // Iterate through each key in liveValues.data
    for (let key in liveValues.data) {
        if (liveValues.data.hasOwnProperty(key) && liveValues.data[key][0]) {
            // Allocate automatic variables with the key name
            result[key] = liveValues.data[key][0].v;
        }
    }
  
    return result;
  },




};

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







module.exports = api;
