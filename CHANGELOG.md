# Changelog

## 1.3.0

### Added
- `tagPrefixMap` credentials option. It translates tag-name prefixes to the server's names in requests, and back to the caller's names in responses (`data`, `properties` and `browseTags` results). Matching is case-insensitive.
- `strict` credentials option. A response whose `statusCode` is not `"Good"` (for example an unknown tag, which Canary otherwise answers with empty data) throws a `CanaryError` with `statusCode` and `errors`.
- `timeZone` credentials option.
- Token mode keeps the time zone passed to `getUserToken()` (default `"GMT Standard Time"`) and sends it as `timeZone` with data requests, matching how a username/password session behaves.

No change for username/password users unless the new options are set.

## 1.2.0

### Added
- API token authentication: pass `apiToken` (or `token`) in the credentials. Every request sends it, and no login is needed. It takes precedence over username/password. `getUserToken()` and `revokeUserToken()` become no-ops, so existing scripts work unchanged.
- `tokenParam` option (`"accessToken"` for Canary v23 servers).
- Opt-in TLS verification with `rejectUnauthorized: true` and `ca`. The default is unchanged (self-signed certificates accepted).
- `timeout` option.
- `createClient()` for isolated sessions, and the exported `CanaryError`.
- `getUserToken()` results include `authMode` (`"apiToken"` or `"userToken"`).
- Test suite (`npm test`) and live checks (`npm run test:live`).

### Fixed
- Security: thrown errors no longer carry the request body, which included the password (and now the API token).
- `revokeUserToken()` always threw `ReferenceError: body is not defined`.
- `getRawData()` / `getProcessedData()` pagination: continuations were never sent, the caller's tags and time window were dropped, and the result was `undefined`. Every page is now fetched and merged.
- `getRawData()` / `getProcessedData()` no longer swallow request errors and return `undefined`. Errors are thrown to the caller.
- `getCurrentValues()`, `getRawData()`, `getProcessedData()` and `getLiveDataToken()` work with explicit `tags` without calling `browseTags()` first.
- `getProcessedData()` without `body.tags` no longer returns `undefined`.
- `softTotalizer()` / `softRunHours()` crashed when `aggregateInterval` was omitted. They now use the same `"1 Hour"` default as `getProcessedData()`.
- A `browseTags()` response without `tags` no longer breaks later calls.
- A trailing slash on `baseURL` no longer produces `//endpoint` URLs.
- `totalPeak()` can no longer loop forever if the server repeats a continuation.
- `softRunHours()` no longer prints the whole dataset to the console.

### Dependencies
- axios 0.27.2 to ^1.20.0. This clears the critical/high/moderate `npm audit` findings in axios, form-data and follow-redirects.
- Removed the unused `https` npm package (Node's built-in module is used).
- The published package contains only `index.js`, the README, changelog and licence.
