import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const readme = readFileSync(join(root, "README.md"), "utf8");
const demoPost = readFileSync(join(root, "DEMO_POST.md"), "utf8");

test("README names the hackathon, the tracks, and the payout account", () => {
  assert.match(readme, /Built at NEAR HACKATHON \(Nov 2026\)/);
  assert.match(readme, /Agent Economy/);
  assert.match(readme, /Autonomous Business/);
  assert.match(readme, /1 testnet NEAR/);
  assert.match(readme, /kwelx\.near/);
  assert.equal(readme.includes("TODO_OWNER_NEAR_ACCOUNT"), false);
  assert.match(readme, /demo post link/);
  assert.match(readme, /TODO_DEMO_VIDEO_URL/);
  assert.match(readme, /Optional testnet contract account/);
  assert.match(readme, /TODO_TESTNET_CONTRACT_ACCOUNT/);
  assert.match(readme, /Quote 1\nJob: Draft a one-page status note for the bot desk demo\./);
  assert.match(readme, /Desk balance: 1 NEAR/);
  assert.match(readme, /`agents`/);
  assert.match(readme, /`business`/);
  assert.equal(readme.includes("ed25519:"), false);
  assert.equal(readme.includes("rpc.mainnet.near.org"), false);
});

test("the draft X post meets the demo-post rules and stays within 280 characters", () => {
  const match = demoPost.match(/```text\n([\s\S]*?)\n```/);
  assert.ok(match, "draft post code block missing");
  const post = match[1];
  assert.ok(post.length <= 280, `post is ${post.length} characters`);
  assert.match(post, /Built at NEAR HACKATHON/);
  assert.match(post, /@NEARProtocol/);
  assert.match(post, /#NEARHackathon/);
  assert.match(post, /1 testnet NEAR/);
  assert.match(post, /https:\/\/github.com\/kwelx\/near-bot-desk/);
  assert.match(demoPost, /TODO_DEMO_VIDEO_URL/);
  assert.match(demoPost, /demo post link/);
  assert.match(demoPost, /kwelx\.near/);
  assert.equal(demoPost.includes("TODO_OWNER_NEAR_ACCOUNT"), false);
});
