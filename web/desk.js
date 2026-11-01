// Mock desk. Keep the catalog, brief rules, and outcome text aligned with
// contract/src/lib.rs and fixtures/catalog.json. Purchases stay in memory.

export const PRICE_YOCTO = 1000000000000000000000000n;
export const DEADLINE = "2026-11-14";
export const MOCK_BUYER = "demo-agent.testnet";
export const MOCK_OWNER = "desk-owner.testnet";
export const MAX_BRIEF_CHARS = 280;

export const SKILLS = [
  {
    id: "quote-brief",
    title: "Quote a one-page brief",
    summary:
      "Turns a short job note into a paid quote. The list price is $1. The testnet charge is 1 NEAR.",
  },
  {
    id: "deadline-check",
    title: "Check a deadline",
    summary: "Reads the first YYYY-MM-DD in the brief and compares it with 2026-11-14.",
  },
  {
    id: "receipt-writer",
    title: "Write a receipt",
    summary: "Formats the brief as a receipt for the 1 NEAR testnet charge.",
  },
];

export const EXAMPLE_BRIEFS = {
  "quote-brief": "Draft a one-page status note for the bot desk demo.",
  "deadline-check": "Ship the testnet demo by 2026-11-14.",
  "receipt-writer": "Bot desk demo receipt for a one-page brief.",
};

function requireSkill(skillId) {
  switch (skillId) {
    case "quote-brief":
    case "deadline-check":
    case "receipt-writer":
      return skillId;
    default:
      throw new Error("unknown skill");
  }
}

export function formatNear(yocto) {
  const value = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  if (value < 0n) {
    throw new Error("amount is negative");
  }
  const whole = value / PRICE_YOCTO;
  const rest = value % PRICE_YOCTO;
  if (rest === 0n) {
    return `${whole.toString()} NEAR`;
  }
  return `${value.toString()} yoctoNEAR`;
}

export function normalizeBrief(input) {
  let out = "";
  let pendingSpace = false;
  for (const ch of input) {
    const code = ch.codePointAt(0);
    const isSpace = ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
    if (isSpace) {
      if (out.length > 0) {
        pendingSpace = true;
      }
      continue;
    }
    if (code < 32 || code === 127) {
      return { ok: false, error: "brief has unsupported characters" };
    }
    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }
    out += ch;
  }
  const length = Array.from(out).length;
  if (length === 0 || length > MAX_BRIEF_CHARS) {
    return { ok: false, error: "brief must be 1 to 280 characters" };
  }
  return { ok: true, brief: out };
}

function isLeap(year) {
  const by4 = year % 4 === 0;
  const by100 = year % 100 === 0;
  const by400 = year % 400 === 0;
  return (by4 && !by100) || by400;
}

function daysInMonth(year, month) {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeap(year) ? 29 : 28;
    default:
      return 0;
  }
}

function parseDigits(text) {
  if (text.length === 0) {
    return null;
  }
  let value = 0;
  for (const ch of text) {
    if (ch < "0" || ch > "9") {
      return null;
    }
    value = value * 10 + (ch.codePointAt(0) - 48);
  }
  return value;
}

function parseIsoDate(window) {
  if (window.length !== 10 || window[4] !== "-" || window[7] !== "-") {
    return null;
  }
  const year = parseDigits(window.slice(0, 4));
  const month = parseDigits(window.slice(5, 7));
  const day = parseDigits(window.slice(8, 10));
  if (year === null || month === null || day === null) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return window;
}

export function firstIsoDate(brief) {
  if (brief.length < 10) {
    return null;
  }
  for (let start = 0; start + 10 <= brief.length; start += 1) {
    const date = parseIsoDate(brief.slice(start, start + 10));
    if (date) {
      return date;
    }
  }
  return null;
}

function deadlineParts(brief) {
  const date = firstIsoDate(brief);
  if (date === null) {
    return { date: "none", result: "brief did not include a YYYY-MM-DD date" };
  }
  if (date <= DEADLINE) {
    return { date, result: `on or before ${DEADLINE}` };
  }
  return { date, result: `after ${DEADLINE}` };
}

export function renderOutcome(skillId, brief, orderId) {
  switch (skillId) {
    case "quote-brief":
      return `Quote ${orderId}\nJob: ${brief}\nList price: $1\nTestnet charge: 1 NEAR\nStatus: paid`;
    case "deadline-check": {
      const parts = deadlineParts(brief);
      return `Deadline check ${orderId}\nDate: ${parts.date}\nResult: ${parts.result}`;
    }
    case "receipt-writer":
      return `Receipt ${orderId}\nMemo: ${brief}\nAmount: 1 NEAR\nNetwork: testnet`;
    default:
      throw new Error("unknown skill");
  }
}

function copyOrder(order) {
  return { ...order };
}

function asDeposit(depositYocto) {
  try {
    return typeof depositYocto === "bigint" ? depositYocto : BigInt(depositYocto);
  } catch {
    return null;
  }
}

export function createDesk({ owner = MOCK_OWNER, nowMs = () => 0 } = {}) {
  const orders = [];
  const spent = new Map();
  let treasury = 0n;

  return {
    owner() {
      return owner;
    },
    listSkills() {
      return SKILLS.map((skill) => ({
        ...skill,
        price_yocto: PRICE_YOCTO.toString(),
      }));
    },
    priceYocto() {
      return PRICE_YOCTO.toString();
    },
    deadline() {
      return DEADLINE;
    },
    treasuryYocto() {
      return treasury.toString();
    },
    spentBy(buyer) {
      return (spent.get(buyer) ?? 0n).toString();
    },
    orderCount() {
      return orders.length;
    },
    getOrder(orderId) {
      const order = orders.find((item) => item.order_id === orderId);
      return order ? copyOrder(order) : null;
    },
    ordersOf(buyer) {
      return orders.filter((order) => order.buyer === buyer).map(copyOrder);
    },
    allOrders() {
      return orders.map(copyOrder);
    },
    buy({ buyer = MOCK_BUYER, skillId, brief, depositYocto }) {
      const normalized = normalizeBrief(String(brief ?? ""));
      if (!normalized.ok) {
        throw new Error(normalized.error);
      }
      requireSkill(skillId);
      const deposit = asDeposit(depositYocto);
      if (deposit === null || deposit !== PRICE_YOCTO) {
        throw new Error("price is 1 NEAR");
      }
      const orderId = orders.length + 1;
      const order = {
        order_id: orderId,
        buyer,
        skill_id: skillId,
        brief: normalized.brief,
        outcome: renderOutcome(skillId, normalized.brief, orderId),
        paid_yocto: PRICE_YOCTO.toString(),
        created_at_ms: nowMs(),
      };
      orders.push(order);
      spent.set(buyer, (spent.get(buyer) ?? 0n) + PRICE_YOCTO);
      treasury += PRICE_YOCTO;
      return copyOrder(order);
    },
    withdraw(caller) {
      if (caller !== owner) {
        throw new Error("owner only");
      }
      if (treasury === 0n) {
        throw new Error("nothing to withdraw");
      }
      const amount = treasury;
      treasury = 0n;
      return amount.toString();
    },
  };
}
