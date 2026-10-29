const http = require("http");
const https = require("https");
const path = require("path");

const INDEX = path.join(__dirname, "..", "index.js");

// Fresh copy of the package per test, so module-level state never leaks between tests.
function loadCanary() {
  delete require.cache[require.resolve(INDEX)];
  return require(INDEX);
}

// Minimal stand-in for the Canary Web API. `handlers` maps endpoint name to
// (body, requestIndex) => response object. Every request body is recorded.
async function startStub(handlers = {}, { tls } = {}) {
  const requests = [];
  const onRequest = (req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const endpoint = req.url.split("/").pop();
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ endpoint, url: req.url, body });
      const handler = handlers[endpoint] || defaultHandlers[endpoint];
      if (!handler) {
        res.writeHead(404);
        return res.end();
      }
      const out = handler(body, requests.filter((r) => r.endpoint === endpoint).length - 1);
      res.writeHead(out && out.__status ? out.__status : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out && out.__status ? out.body : out));
    });
  };
  const server = tls ? https.createServer(tls, onRequest) : http.createServer(onRequest);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const scheme = tls ? "https" : "http";
  return {
    baseURL: `${scheme}://127.0.0.1:${server.address().port}/api/v2`,
    requests,
    sent: (endpoint) => requests.filter((r) => r.endpoint === endpoint).map((r) => r.body),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const defaultHandlers = {
  getUserToken: () => ({ statusCode: "Good", userToken: "SESSION-TOKEN" }),
  revokeUserToken: () => ({ statusCode: "Good" }),
  browseTags: () => ({ statusCode: "Good", tags: ["Site.A", "Site.B"] }),
  getLiveDataToken: () => ({ statusCode: "Good", liveDataToken: "LIVE-TOKEN" }),
  getTagData2: () => ({
    statusCode: "Good",
    data: {
      "Site.A": [
        { t: "2026-01-01T00:00:00Z", v: 5 },
        { t: "2026-01-01T01:00:00Z", v: null },
        { t: "2026-01-01T02:00:00Z", v: 9 },
      ],
    },
    continuation: null,
  }),
};

module.exports = { loadCanary, startStub };
