import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEADLINE,
  EXAMPLE_BRIEFS,
  MOCK_BUYER,
  MOCK_OWNER,
  PRICE_YOCTO,
  createDesk,
  firstIsoDate,
  formatNear,
  normalizeBrief,
  renderOutcome,
} from "../web/desk.js";
import { runDemo } from "../agent/run.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, "fixtures/catalog.json"), "utf8"));

function desk() {
  return createDesk({ nowMs: () => 1762000000000 });
}

test("catalog matches the shared fixture and the 1 NEAR price", () => {
  const skills = desk().listSkills();
  assert.equal(skills.length, catalog.length);
  for (const [index, skill] of skills.entries()) {
    assert.equal(skill.id, catalog[index].id);
    assert.equal(skill.title, catalog[index].title);
    assert.equal(skill.summary, catalog[index].summary);
    assert.equal(skill.price_yocto, PRICE_YOCTO.toString());
  }
  assert.equal(desk().deadline(), DEADLINE);
  assert.equal(formatNear(PRICE_YOCTO), "1 NEAR");
  assert.equal(formatNear(0n), "0 NEAR");
  assert.equal(formatNear(PRICE_YOCTO * 2n), "2 NEAR");
});

test("quote purchase stores the receipt and outcome", () => {
  const state = desk();
  const brief = EXAMPLE_BRIEFS["quote-brief"];
  const order = state.buy({
    buyer: MOCK_BUYER,
    skillId: "quote-brief",
    brief,
    depositYocto: PRICE_YOCTO.toString(),
  });
  assert.equal(
    order.outcome,
    "Quote 1\nJob: Draft a one-page status note for the bot desk demo.\nList price: $1\nTestnet charge: 1 NEAR\nStatus: paid",
  );
  assert.equal(order.order_id, 1);
  assert.equal(order.buyer, MOCK_BUYER);
  assert.equal(order.paid_yocto, PRICE_YOCTO.toString());
  assert.equal(order.created_at_ms, 1762000000000);
  assert.deepEqual(state.getOrder(1), order);
  assert.equal(state.treasuryYocto(), PRICE_YOCTO.toString());
  assert.equal(state.spentBy(MOCK_BUYER), PRICE_YOCTO.toString());
  assert.equal(state.getOrder(1).brief, order.brief);
  state.getOrder(1).brief = "changed";
  assert.equal(state.getOrder(1).brief, brief);
});

test("deadline and receipt outcomes match the contract text", () => {
  const state = desk();
  const cases = [
    ["Ship the testnet demo by 2026-11-14.", "Deadline check 1\nDate: 2026-11-14\nResult: on or before 2026-11-14"],
    ["Ship by 2026-11-15 please", "Deadline check 2\nDate: 2026-11-15\nResult: after 2026-11-14"],
    ["no date here", "Deadline check 3\nDate: none\nResult: brief did not include a YYYY-MM-DD date"],
    ["Meet on 2026-02-29 then 2024-02-29", "Deadline check 4\nDate: 2024-02-29\nResult: on or before 2026-11-14"],
    ["2026-04-31 then 2026-04-30", "Deadline check 5\nDate: 2026-04-30\nResult: on or before 2026-11-14"],
    ["😀2026-11-01", "Deadline check 6\nDate: 2026-11-01\nResult: on or before 2026-11-14"],
  ];
  for (const [brief, outcome] of cases) {
    const order = state.buy({ skillId: "deadline-check", brief, depositYocto: PRICE_YOCTO });
    assert.equal(order.outcome, outcome);
  }
  const receipt = state.buy({
    skillId: "receipt-writer",
    brief: EXAMPLE_BRIEFS["receipt-writer"],
    depositYocto: PRICE_YOCTO,
  });
  assert.equal(
    receipt.outcome,
    "Receipt 7\nMemo: Bot desk demo receipt for a one-page brief.\nAmount: 1 NEAR\nNetwork: testnet",
  );
  assert.equal(firstIsoDate("😀2026-11-01"), "2026-11-01");
  assert.equal(firstIsoDate("2026-02-29"), null);
  assert.equal(renderOutcome("quote-brief", "Job", 4).startsWith("Quote 4\n"), true);
});

test("brief rules", () => {
  const state = desk();
  const collapsed = state.buy({
    skillId: "quote-brief",
    brief: "  Draft\n\ta   note  ",
    depositYocto: PRICE_YOCTO,
  });
  assert.equal(collapsed.brief, "Draft a note");
  assert.equal(normalizeBrief("a".repeat(280)).ok, true);
  assert.equal(normalizeBrief("é".repeat(280)).brief.length > 0, true);
  assert.equal(normalizeBrief("é".repeat(280)).ok, true);
  assert.throws(() => state.buy({ skillId: "quote-brief", brief: " \n\t", depositYocto: PRICE_YOCTO }), /brief must be 1 to 280 characters/);
  assert.throws(() => state.buy({ skillId: "quote-brief", brief: "a".repeat(281), depositYocto: PRICE_YOCTO }), /brief must be 1 to 280 characters/);
  assert.throws(() => state.buy({ skillId: "quote-brief", brief: "hello\u0007", depositYocto: PRICE_YOCTO }), /brief has unsupported characters/);
});

test("payment and owner rules", () => {
  const state = desk();
  assert.throws(() => state.buy({ skillId: "nope", brief: "A valid brief.", depositYocto: PRICE_YOCTO }), /unknown skill/);
  assert.throws(() => state.buy({ skillId: "quote-brief", brief: "A valid brief.", depositYocto: PRICE_YOCTO - 1n }), /price is 1 NEAR/);
  assert.throws(() => state.buy({ skillId: "quote-brief", brief: "A valid brief.", depositYocto: PRICE_YOCTO + 1n }), /price is 1 NEAR/);
  assert.throws(() => state.buy({ skillId: "quote-brief", brief: "A valid brief.", depositYocto: "nope" }), /price is 1 NEAR/);
  state.buy({ buyer: "agent-a.testnet", skillId: "quote-brief", brief: "First job.", depositYocto: PRICE_YOCTO });
  state.buy({ buyer: "agent-b.testnet", skillId: "receipt-writer", brief: "Second job.", depositYocto: PRICE_YOCTO });
  assert.equal(state.ordersOf("agent-a.testnet").length, 1);
  assert.equal(state.ordersOf("agent-b.testnet")[0].order_id, 2);
  assert.equal(state.getOrder(0), null);
  assert.equal(state.spentBy("nobody.testnet"), "0");
  assert.equal(state.treasuryYocto(), (PRICE_YOCTO * 2n).toString());
  assert.throws(() => state.withdraw("agent-a.testnet"), /owner only/);
  assert.equal(state.withdraw(MOCK_OWNER), (PRICE_YOCTO * 2n).toString());
  assert.equal(state.treasuryYocto(), "0");
  assert.equal(state.orderCount(), 2);
  assert.throws(() => state.withdraw(MOCK_OWNER), /nothing to withdraw/);
});

test("agent command prints the mock purchase and exits 0", () => {
  const expected = runDemo();
  assert.match(expected, /No transaction was broadcast\./);
  assert.match(expected, /Desk balance: 1 NEAR/);
  const result = spawnSync(process.execPath, ["agent/run.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, expected);
  assert.equal(result.stderr, "");
});
