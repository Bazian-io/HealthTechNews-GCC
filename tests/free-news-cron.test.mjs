import assert from "node:assert/strict";
import test from "node:test";
import { runFreeNewsCron } from "../lib/free-news-cron.mjs";

const url = "https://example.com/api/cron/collect-free-news";
const env = { CRON_SECRET: "test-cron-secret" };
const logger = { info() {}, error() {} };
const successfulResult = {
  source: "FreeNewsAPI.ai",
  saved: 2,
  duplicates: 3,
  failed: 0,
  searches: { planned: 18, succeeded: 18, failed: 0, skipped: 0 },
};

function request(authorization) {
  return new Request(url, {
    headers: authorization ? { authorization } : {},
  });
}

test("cron endpoint requires the configured bearer secret", async () => {
  for (const [authorization, configuredEnv] of [
    [undefined, env],
    ["Bearer wrong", env],
    ["Bearer undefined", {}],
  ]) {
    const response = await runFreeNewsCron(request(authorization), {
      env: configuredEnv,
      collect: () => assert.fail("Unauthorized requests must not collect"),
      createClient: () => assert.fail("Unauthorized requests must not access Supabase"),
      logger,
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, error: "Unauthorized" });
  }
});

test("authorized cron requests run the existing collector", async () => {
  const database = { name: "test database" };
  let receivedEnv;
  let receivedOptions;
  const response = await runFreeNewsCron(request(`Bearer ${env.CRON_SECRET}`), {
    env,
    createClient(value) { receivedEnv = value; return database; },
    async collect(options) { receivedOptions = options; return successfulResult; },
    logger,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(receivedEnv, env);
  assert.deepEqual(receivedOptions, { supabase: database });
  assert.deepEqual(await response.json(), { success: true, result: successfulResult });
});

test("partial collection failures return an error status for Vercel logs", async () => {
  const result = {
    ...successfulResult,
    searches: { planned: 18, succeeded: 17, failed: 1, skipped: 0 },
  };
  const response = await runFreeNewsCron(request(`Bearer ${env.CRON_SECRET}`), {
    env,
    createClient: () => ({}),
    collect: async () => result,
    logger,
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { success: false, result });
});

test("unexpected failures do not expose private error details", async () => {
  const response = await runFreeNewsCron(request(`Bearer ${env.CRON_SECRET}`), {
    env,
    createClient: () => { throw new Error("PRIVATE_DATABASE_DETAIL"); },
    logger,
  });

  assert.equal(response.status, 500);
  const body = await response.text();
  assert.doesNotMatch(body, /PRIVATE_DATABASE_DETAIL/);
  assert.match(body, /Check the Vercel function logs/);
});
