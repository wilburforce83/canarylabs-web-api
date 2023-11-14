const canary = require('./index.js'); // when using from npm use require('canarylabs-web-api')

// Basic running example

const credentials = {
    username : 'yourusername',
    password : 'yourpassword',
    baseURL : 'https://yourdomain.canarylabs.online:55236/api/v2' // This module only supports https requests
};

let userTokenBody = {
    application : "Web API",
    timezone: "Eastern Standard Time"
};

// Example usage:

let result = canary.getUserToken(credentials, userTokenBody);

console.log(result);




