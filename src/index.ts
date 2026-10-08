// opencode-muse-auth (V2): Muse Spark in opencode billed to the Muse Code
// monthly subscription (Meta device login, no API key, no third-party CLI).
import { Plugin } from "@opencode/plugin"
import { deviceAuthorize, mintKey, pollToken, readCache, writeCache } from "./auth.js"

const INTEGRATION_ID = "meta"
const METHOD_ID = "muse-subscription"
// Minted keys carry no expiry; keep the stored OAuth credential valid
// long-term and force re-login through refresh() once the key is revoked.
const CREDENTIAL_TTL_S = 10 * 365 * 24 * 3600

function credentialExpires(): number {
  return Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_S
}

export default Plugin.define({
  id: "muse-auth",
  async setup(ctx) {
    // V1 loader equivalent: preload the file cache before the sync transform.
    const state = { apiKey: await readCache() }
    const active = await ctx.integration.connection.active(INTEGRATION_ID).catch(() => undefined)

    await ctx.integration.transform((editor) => {
      editor.method.update({
        integrationID: INTEGRATION_ID,
        method: { id: METHOD_ID, type: "oauth", label: "Muse Code subscription (Meta device login)" },
        authorize: async () => {
          const device = await deviceAuthorize()
          const url = device.verification_uri_complete || device.verification_uri
          return {
            url,
            instructions: `Open ${url}\nEnter code: ${device.user_code}`,
            expiresAt: Date.now() + device.expires_in * 1000,
            mode: "auto" as const,
            callback: (async () => {
              const access = await pollToken(device.device_code, device.interval, device.expires_in)
              const minted = await mintKey(access)
              await writeCache(minted)
              state.apiKey = minted.apiKey
              await ctx.provider.reload().catch(() => {})
              return {
                type: "oauth" as const,
                // Branded upstream; this is the method registered above.
                methodID: METHOD_ID as never,
                access: minted.apiKey,
                refresh: minted.accountId,
                expires: credentialExpires(),
                metadata: { accountId: minted.accountId, ...(minted.email ? { email: minted.email } : {}) },
              }
            })(),
          }
        },
        refresh: async (credential) => {
          const apiKey = await readCache()
          // The mint endpoint is aggressively rate-limited: never re-mint here.
          if (!apiKey) throw new Error("Muse Code subscription key is missing, run /connect again")
          state.apiKey = apiKey
          return { ...credential, access: apiKey, expires: credentialExpires() }
        },
      })
    })

    // File-cache fallback for users without a stored meta connection.
    // A stored connection always wins over the legacy cache file.
    if (!active && state.apiKey) {
      const apiKey = state.apiKey
      await ctx.provider.transform((editor) => {
        editor.update(INTEGRATION_ID, (provider) => {
          provider.settings = { ...(provider.settings ?? {}), apiKey }
        })
      })
    }
  },
})
