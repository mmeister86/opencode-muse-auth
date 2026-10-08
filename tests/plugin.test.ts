import { test } from "node:test"
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"

// Isolate the plugin credential cache before the compiled plugin resolves it.
const home = mkdtempSync(join(tmpdir(), "muse-v2-home-"))
process.env.HOME = home
const cachePath = join(home, ".config", "opencode", "muse-code-sub.json")

type Handler = (url: string) => { status: number; body: unknown }

function stubFetch(handler: Handler): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const { status, body } = handler(url)
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
}

const DEVICE_OK = {
  device_code: "dc",
  user_code: "ABCD-EFGH",
  verification_uri: "https://auth.meta.com/device",
  verification_uri_complete: "https://auth.meta.com/device?user_code=ABCD-EFGH",
  interval: 5,
  expires_in: 600,
}

const KEY_OK = {
  api_key: "LLM|fresh",
  user_email: "User@Example.com",
  user_id: "uid-1",
  is_subs_active: true,
}

function stubFlow(): void {
  stubFetch((url) => {
    if (url.includes("device/authorization")) return { status: 200, body: DEVICE_OK }
    if (url.includes("device/token")) return { status: 200, body: { access_token: "dca-new" } }
    return { status: 200, body: KEY_OK }
  })
}

interface Captured {
  methods: Array<{ integrationID: string; method: { id: string; type: string }; authorize: (answer: unknown) => Promise<any>; refresh?: (cred: any) => Promise<any> }>
  providerUpdates: Array<{ providerID: string; apiKey: unknown }>
  reloads: number
}

function fakeCtx(activeConnection: unknown, captured: Captured): any {
  return {
    integration: {
      transform: async (cb: (editor: any) => void) => {
        cb({
          method: {
            update: (input: any) => {
              captured.methods.push(input)
            },
          },
        })
      },
      connection: { active: async () => activeConnection },
      connect: { key: async () => {} },
    },
    provider: {
      transform: async (cb: (editor: any) => void) => {
        cb({
          update: (providerID: string, update: (provider: any) => void) => {
            const draft: any = { settings: {} }
            update(draft)
            captured.providerUpdates.push({ providerID, apiKey: draft.settings?.apiKey })
          },
        })
      },
      reload: async () => {
        captured.reloads += 1
      },
    },
  }
}

const plugin = (await import("../dist/index.js")).default

test("exports a V2 plugin definition", () => {
  assert.equal(typeof plugin?.id, "string")
  assert.equal(typeof plugin?.setup, "function")
})

test("registers a meta oauth method and completes device login", async () => {
  stubFlow()
  const captured: Captured = { methods: [], providerUpdates: [], reloads: 0 }
  await plugin.setup(fakeCtx(undefined, captured))

  const registration = captured.methods.find((m) => m.integrationID === "meta" && m.method.type === "oauth")
  assert.ok(registration, "expected an oauth method on the meta integration")

  const auth = await registration.authorize({})
  assert.ok(auth.url.includes("auth.meta.com"), `unexpected url ${auth.url}`)
  assert.ok(String(auth.instructions).includes("ABCD-EFGH"))
  assert.equal(auth.mode, "auto")

  const credential = await auth.callback
  assert.equal(credential?.type, "oauth")
  assert.equal(credential?.access, "LLM|fresh")

  const raw = readFileSync(cachePath, "utf8")
  assert.ok(!raw.includes("dca-new"), "oauth token must never touch disk")
  assert.ok(raw.includes("LLM|fresh"))
})

test("injects the cached key into the meta provider without an active connection", async () => {
  stubFlow()
  const captured: Captured = { methods: [], providerUpdates: [], reloads: 0 }
  await plugin.setup(fakeCtx(undefined, captured))
  const update = captured.providerUpdates.find((u) => u.providerID === "meta")
  assert.ok(update, "expected a meta provider update")
  assert.equal(update.apiKey, "LLM|fresh")
})

test("skips provider injection when a meta connection is active", async () => {
  stubFlow()
  const captured: Captured = { methods: [], providerUpdates: [], reloads: 0 }
  await plugin.setup(fakeCtx({ id: "conn-1" }, captured))
  assert.equal(captured.providerUpdates.length, 0)
})

test("refresh keeps the stored key and fails without a cache", async () => {
  stubFlow()
  const captured: Captured = { methods: [], providerUpdates: [], reloads: 0 }
  await plugin.setup(fakeCtx(undefined, captured))
  const registration = captured.methods.find((m) => m.integrationID === "meta")
  assert.ok(registration?.refresh, "expected a refresh handler")

  const refreshed = await registration.refresh({ type: "oauth", access: "old" })
  assert.equal(refreshed.access, "LLM|fresh")

  rmSync(cachePath)
  await assert.rejects(registration.refresh({ type: "oauth", access: "old" }), /connect/)
})
