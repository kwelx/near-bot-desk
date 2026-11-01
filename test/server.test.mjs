import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "../web/server.mjs";

async function withServer(run) {
  const server = await startServer(0);
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("the local page is served with a testnet-only content security policy", async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Pay 1 NEAR/);
    assert.match(html, /Bot Desk/);
    assert.match(html, /src="\/app\.js"/);
    const policy = page.headers.get("content-security-policy");
    assert.match(policy, /https:\/\/rpc\.testnet\.near\.org/);
    assert.equal(policy.includes("mainnet"), false);
    const script = await fetch(`${base}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /javascript/);
    const style = await fetch(`${base}/styles.css`);
    assert.equal(style.status, 200);
  });
});

test("the server does not read files outside the web directory", async () => {
  await withServer(async (base) => {
    const missing = await fetch(`${base}/missing.js`);
    assert.equal(missing.status, 404);
    const escaped = await fetch(`${base}/%2e%2e/package.json`);
    assert.notEqual(escaped.status, 200);
    const body = await escaped.text();
    assert.equal(body.includes("near-bot-desk"), false);
  });
});
