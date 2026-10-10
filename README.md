# opencode-muse-auth

Use Meta **Muse Spark** in [opencode](https://opencode.ai) billed to your
**Muse Code monthly subscription** — no pay-as-you-go API key, no third-party CLI.

## Install

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-muse-auth"]
}
```

Then run `/connect` in opencode, pick the `meta` provider and the
*Muse Code subscription* method: it shows a Meta device page URL and a code.
Enter the code in your browser (your own Meta account) and the login
completes by itself.

Verified end-to-end against the published package: isolated project with
only `"plugins": ["opencode-muse-auth"]`, live chat on `meta/muse-spark-1.3`
billed to subscription.

## Requirements

- opencode v2 with plugin support (V1 is no longer supported as of v0.2.0)
- A Meta account with an active Muse Code subscription

## How it works

The plugin registers a *Muse Code subscription* login method on the
built-in `meta` integration (Routes through the Responses API, `meta.txt`
system prompt applies automatically to `muse-*` model ids):

- **Login** — Meta device-code exchange (RFC 8628) inside `/connect`, then
  mints the stable account-bound inference key via the Model API. The key is
  cached locally (`~/.config/opencode/muse-code-sub.json`, owner-only
  permissions where supported) and never printed. The cache stores exactly
  `apiKey`, `accountId`, and `email` — the OAuth access token from the
  login flow is kept in memory only and never written to disk.
- **Runtime** — a provider transform injects the cached key on startup
  when no stored `meta` connection exists (a stored connection always
  wins over the legacy cache file). The mint endpoint is aggressively
  rate-limited, so the plugin never re-mints on its own; re-run
  `/connect` only if access is revoked (401).

Flow parameters are compatible with the published behavior of oh-my-pi (MIT);
see [NOTICE](NOTICE).

## Development

```sh
npm install
npm run compile
npm test
```

The build script is named `compile` (not `build`) on purpose: opencode's
plugin installer cannot prepare a git dependency that declares a
`build`/`prepare`/`install` script (anomalyco/opencode#49704), and `dist/` is
committed, so no build runs at install time.

## License

MIT — see [LICENSE](LICENSE).
