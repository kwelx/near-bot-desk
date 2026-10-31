import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const readme = readFileSync(join(root, "README.md"), "utf8");

test("README keeps the owner and demo placeholders empty", () => {
  assert.match(readme, /TODO_OWNER_NEAR_ACCOUNT/);
  assert.match(readme, /TODO_DEMO_VIDEO_URL/);
  assert.match(readme, /TODO_TESTNET_CONTRACT_ACCOUNT/);
  assert.match(readme, /Quote 1\nJob: Draft a one-page status note for the bot desk demo\./);
  assert.match(readme, /Desk balance: 1 NEAR/);
  assert.match(readme, /`agents`/);
  assert.match(readme, /`business`/);
  assert.equal(readme.includes("ed25519:"), false);
  assert.equal(readme.includes("rpc.mainnet.near.org"), false);
});
