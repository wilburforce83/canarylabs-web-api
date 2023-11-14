// index.js

const axios = require('axios');
const https = require('https');

// Ingoring SSL failures - ONLY USE ON READONLY NON_SENSITIVE DATA

const agent = new https.Agent({
  rejectUnauthorized: false
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
        'Content-Type': 'application/json',
      },
      httpsAgent: agent,
    });
    return response.data;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
};

// API functions

const api = {
  getTimeZones: async (credentials) => {
    const data = await makeRequest(credentials.baseURL + '/getTimeZones', 'POST');
    console.log('getTimeZones', data);
  },

  getUserToken: async (credentials,body) => {
    const data = await makeRequest(credentials.baseURL + '/getUserToken', 'POST', {
      application: body.application,
      timeZone: body.timezone,
      username: credentials.username,
      password: credentials.password,
    });
    console.log('getUserToken', data);
    _userToken = data.userToken;
  },

  browseTags: async (credentials, continuation) => {
    const data = await makeRequest(credentials.baseURL + '/browseTags', 'POST', {
      userToken: _userToken,
      deep: true,
      search: '{Diagnostics}',
    });
    console.log('browseTags', data);
    _tags = data.tags;
  },

  getCurrentValues: async (credentials) => {
    if (_tags.length === 0) {
      console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    const data = await makeRequest(credentials.baseURL + '/getTagData2', 'POST', {
      userToken: _userToken,
      tags: _tags,
    });
    console.log('getCurrentValues', data);
  },

  getRawData: async (credentials, continuation) => {
    if (_tags.length === 0) {
      console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    try {
      const data = await makeRequest(credentials.baseURL + '/getTagData2', 'POST', {
        userToken: _userToken,
        tags: _tags,
        startTime: 'Now - 24 Hours',
        endTime: 'Now',
        maxSize: 10000,
        continuation: continuation || null,
      });
      console.log('getRawData', data);

      if (data.continuation !== null) {
        console.log('CONTINUATION: getRawData', data.continuation);
        await apiMethods.getRawData(credentials, data.continuation);
      } else {
        console.log('FINISHED: getRawData');
      }
    } catch (error) {
      console.log('error', error);
    }
  },

  getProcessedData: async (credentials, continuation) => {
    if (_tags.length === 0) {
      console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    try {
      const data = await makeRequest(credentials.baseURL + '/getTagData2', 'POST', {
        userToken: _userToken,
        tags: _tags,
        startTime: 'Now - 1 Day',
        endTime: 'Now',
        aggregateName: 'TimeAverage2',
        aggregateInterval: '1 Hour',
        maxSize: 10000,
        continuation: continuation || null,
      });
      console.log('getProcessedData', data);

      if (data.continuation !== null) {
        console.log('CONTINUATION: getProcessedData', data.continuation);
        await apiMethods.getProcessedData(credentials, data.continuation);
      } else {
        console.log('FINISHED: getProcessedData');
      }
    } catch (error) {
      console.log('error', error);
    }
  },

  revokeUserToken: async (credentials) => {
    const data = await makeRequest(credentials.baseURL + '/revokeUserToken', 'POST', {
      userToken: _userToken,
    });
    console.log('revokeUserToken', data);
    _userToken = null;
  },

  browseNodes: async (credentials, path) => {
    const data = await makeRequest(credentials.baseURL + '/browseNodes', 'POST', {
      userToken: _userToken,
      path: path || '',
    });
    console.log('browseNodes', data);

    const nodes = data.nodes;
    const keys = Object.keys(nodes);
    if (keys.length > 0) {
      const node = nodes[keys[0]];
      if (node.hasNodes) await apiMethods.browseNodes(credentials, node.fullPath);
    }
  },

  getAggregates: async (credentials) => {
    const data = await makeRequest(credentials.baseURL + '/getAggregates', 'POST', {
      userToken: _userToken,
    });
    console.log('getAggregates', data);
  },

  getQualities: async (credentials, qualities) => {
    const data = await makeRequest(credentials.baseURL + '/getQualities', 'POST', {
      userToken: _userToken,
      qualities: qualities !== undefined ? qualities : [192, '193', 32768],
    });
    console.log('getQualities', data);
  },

  getTagProperties: async (credentials) => {
    const data = await makeRequest(credentials.baseURL + '/getTagProperties', 'POST', {
      userToken: _userToken,
      tags: _tags,
    });
    console.log('getTagProperties', data);
  },

  getLiveDataToken: async (credentials) => {
    if (_tags.length === 0) {
      console.log('Call "BrowseTags" first to build an array of tags used to get data.');
      return;
    }

    const data = await makeRequest(credentials.baseURL + '/getLiveDataToken', 'POST', {
      userToken: _userToken,
      tags: _tags,
      mode: 'AllValues',
      includeQuality: true,
    });
    console.log('getLiveDataToken', data);

    _liveDataToken = data.liveDataToken;
  },

  getLiveData: async (credentials, continuation) => {
    const data = await makeRequest(credentials.baseURL + '/getLiveData', 'POST', {
      userToken: _userToken,
      liveDataToken: _liveDataToken,
      continuation: continuation || null,
    });
    console.log('getLiveData', data);
  },

  revokeLiveDataToken: async (credentials) => {
    const data = await makeRequest(credentials.baseURL + '/revokeLiveDataToken', 'POST', {
      userToken: _userToken,
      liveDataToken: _liveDataToken,
    });
    console.log('revokeLiveDataToken', data);
    _liveDataToken = null;
  },
};

module.exports = api;
