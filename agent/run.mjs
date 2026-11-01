import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXAMPLE_BRIEFS,
  MOCK_BUYER,
  PRICE_YOCTO,
  createDesk,
  formatNear,
} from "../web/desk.js";

const EXPECTED_OUTCOME = [
  "Quote 1",
  "Job: Draft a one-page status note for the bot desk demo.",
  "List price: $1",
  "Testnet charge: 1 NEAR",
  "Status: paid",
].join("\n");

export function runDemo() {
  const desk = createDesk({ nowMs: () => 0 });
  const skills = desk.listSkills();
  if (skills.length !== 3) {
    throw new Error(`expected 3 skills, got ${skills.length}`);
  }
  const brief = EXAMPLE_BRIEFS["quote-brief"];
  const order = desk.buy({
    buyer: MOCK_BUYER,
    skillId: "quote-brief",
    brief,
    depositYocto: PRICE_YOCTO,
  });
  if (order.outcome !== EXPECTED_OUTCOME) {
    throw new Error(`unexpected outcome:\n${order.outcome}`);
  }
  if (desk.treasuryYocto() !== PRICE_YOCTO.toString()) {
    throw new Error("treasury was not 1 NEAR");
  }
  const lines = [
    "Bot Desk agent (mock, no network)",
    "No transaction was broadcast.",
    "Listed 3 skills. Each price is 1 NEAR.",
    `Bought quote-brief as ${MOCK_BUYER}.`,
    `Order ${order.order_id} outcome:`,
    order.outcome,
    `Desk balance: ${formatNear(desk.treasuryYocto())}`,
    `Spent by ${MOCK_BUYER}: ${formatNear(desk.spentBy(MOCK_BUYER))}`,
  ];
  return `${lines.join("\n")}\n`;
}

function isDirectRun() {
  if (!process.argv[1]) {
    return false;
  }
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectRun()) {
  try {
    process.stdout.write(runDemo());
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent failed";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
