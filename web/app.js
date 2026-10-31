import {
  EXAMPLE_BRIEFS,
  MOCK_BUYER,
  MOCK_OWNER,
  PRICE_YOCTO,
  createDesk,
  formatNear,
} from "./desk.js";
import { TESTNET_RPC_URL, fetchView, isAccountId } from "./rpc.js";

const skillsEl = document.querySelector("#skills");
const briefEl = document.querySelector("#brief");
const formEl = document.querySelector("#buy-form");
const errorEl = document.querySelector("#form-error");
const resultEl = document.querySelector("#result");
const treasuryEl = document.querySelector("#treasury");
const ordersEl = document.querySelector("#orders");
const sessionEl = document.querySelector("#session");
const lookupEl = document.querySelector("#lookup");
const lookupForm = document.querySelector("#lookup-form");
const orderIdEl = document.querySelector("#order-id");
const chainFactsEl = document.querySelector("#chain-facts");
const modeEl = document.querySelector("#mode");
const payEl = document.querySelector("#pay");
const withdrawEl = document.querySelector("#withdraw");
const resetEl = document.querySelector("#reset");

const state = {
  mode: "mock",
  contractId: null,
  skillId: "quote-brief",
  desk: createDesk({ nowMs: () => Date.now() }),
};

function setError(message) {
  errorEl.textContent = message;
}

function showNear(value) {
  try {
    return formatNear(value);
  } catch {
    return String(value);
  }
}

function setMode(message, tone) {
  modeEl.textContent = message;
  modeEl.classList.toggle("warn", tone === "warn");
}

function addFact(dl, term, value) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

function renderOrder(order) {
  const article = document.createElement("article");
  article.className = "order";
  const title = document.createElement("h3");
  title.textContent = `Order ${order.order_id}`;
  const facts = document.createElement("dl");
  addFact(facts, "Skill", order.skill_id);
  addFact(facts, "Buyer", order.buyer);
  addFact(facts, "Paid", showNear(order.paid_yocto));
  addFact(facts, "Brief", order.brief);
  if (typeof order.created_at_ms === "number" && order.created_at_ms > 0) {
    const clockLabel = state.mode === "testnet" ? "Block time" : "Browser clock";
    addFact(facts, clockLabel, new Date(order.created_at_ms).toISOString());
  }
  const label = document.createElement("p");
  label.className = "outcome-label";
  label.textContent = "Outcome";
  const pre = document.createElement("pre");
  pre.textContent = order.outcome;
  article.append(title, facts, label, pre);
  return article;
}

function renderSkills(skills, selectable) {
  skillsEl.replaceChildren();
  for (const skill of skills) {
    const card = document.createElement(selectable ? "label" : "div");
    card.className = "skill";
    if (selectable) {
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "skill";
      input.value = skill.id;
      input.checked = skill.id === state.skillId;
      input.addEventListener("change", () => {
        state.skillId = skill.id;
        const examples = new Set(Object.values(EXAMPLE_BRIEFS));
        if (briefEl.value.trim() === "" || examples.has(briefEl.value)) {
          briefEl.value = EXAMPLE_BRIEFS[skill.id] || "";
        }
        markSelected();
      });
      card.append(input);
      if (skill.id === state.skillId) {
        card.classList.add("selected");
      }
    }
    const text = document.createElement("span");
    text.className = "skill-text";
    const title = document.createElement("span");
    title.className = "skill-title";
    title.textContent = skill.title;
    const summary = document.createElement("span");
    summary.className = "skill-summary";
    summary.textContent = skill.summary;
    const price = document.createElement("span");
    price.className = "skill-price";
    price.textContent = showNear(skill.price_yocto);
    text.append(title, summary, price);
    card.append(text);
    skillsEl.append(card);
  }
}

function markSelected() {
  for (const card of skillsEl.querySelectorAll(".skill")) {
    const input = card.querySelector("input");
    card.classList.toggle("selected", Boolean(input && input.checked));
  }
}

function renderSession() {
  treasuryEl.textContent = `Desk balance: ${formatNear(state.desk.treasuryYocto())}`;
  const orders = state.desk.allOrders();
  ordersEl.replaceChildren();
  if (orders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No purchases in this session.";
    ordersEl.append(empty);
    return;
  }
  for (const order of orders) {
    ordersEl.append(renderOrder(order));
  }
}

function bootMock() {
  state.mode = "mock";
  state.contractId = null;
  state.desk = createDesk({ nowMs: () => Date.now() });
  state.skillId = "quote-brief";
  sessionEl.hidden = false;
  lookupEl.hidden = true;
  payEl.disabled = false;
  payEl.textContent = "Pay 1 NEAR";
  briefEl.value = EXAMPLE_BRIEFS["quote-brief"];
  setMode(
    `Mock desk in this browser. Purchases stay in memory and are not sent to testnet. Buyer label: ${MOCK_BUYER}. Owner label: ${MOCK_OWNER}. These accounts were not created.`,
    "ok",
  );
  renderSkills(state.desk.listSkills(), true);
  renderSession();
  resultEl.replaceChildren();
  setError("");
}

async function loadContract(contractId) {
  const [skills, price, deadline, owner, treasury, orderCount] = await Promise.all([
    fetchView(contractId, "list_skills", {}),
    fetchView(contractId, "price_yocto", {}),
    fetchView(contractId, "deadline", {}),
    fetchView(contractId, "owner", {}),
    fetchView(contractId, "treasury", {}),
    fetchView(contractId, "order_count", {}),
  ]);
  return { skills, price, deadline, owner, treasury, orderCount };
}

function bootTestnetShell(contractId) {
  state.mode = "testnet";
  state.contractId = contractId;
  sessionEl.hidden = true;
  lookupEl.hidden = false;
  payEl.disabled = true;
  payEl.textContent = "Testnet payment uses NEAR CLI";
  skillsEl.replaceChildren();
  chainFactsEl.replaceChildren();
  resultEl.replaceChildren();
  setError("");
}

function renderChain(details) {
  renderSkills(details.skills, false);
  chainFactsEl.replaceChildren();
  addFact(chainFactsEl, "Contract", state.contractId);
  addFact(chainFactsEl, "Owner", String(details.owner));
  addFact(chainFactsEl, "Price", showNear(details.price));
  addFact(chainFactsEl, "Deadline", String(details.deadline));
  addFact(chainFactsEl, "Desk balance", showNear(details.treasury));
  addFact(chainFactsEl, "Orders", String(details.orderCount));
  addFact(chainFactsEl, "RPC", TESTNET_RPC_URL);
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.mode !== "mock") {
    setError("This page does not send testnet transactions. Use the NEAR CLI steps in the README.");
    return;
  }
  try {
    const order = state.desk.buy({
      buyer: MOCK_BUYER,
      skillId: state.skillId,
      brief: briefEl.value,
      depositYocto: PRICE_YOCTO,
    });
    setError("");
    resultEl.replaceChildren(renderOrder(order));
    renderSession();
    resultEl.scrollIntoView({ block: "nearest" });
  } catch (error) {
    setError(error instanceof Error ? error.message : "purchase failed");
  }
});

withdrawEl.addEventListener("click", () => {
  try {
    const amount = state.desk.withdraw(MOCK_OWNER);
    setError("");
    const note = document.createElement("p");
    note.textContent = `Withdrew ${formatNear(amount)} to ${MOCK_OWNER} in the mock. No transaction was broadcast.`;
    resultEl.replaceChildren(note);
    renderSession();
  } catch (error) {
    setError(error instanceof Error ? error.message : "withdraw failed");
  }
});

resetEl.addEventListener("click", () => {
  bootMock();
});

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const orderId = Number(orderIdEl.value);
  if (!Number.isInteger(orderId) || orderId < 1) {
    setError("Order id must be a positive integer.");
    return;
  }
  try {
    const order = await fetchView(state.contractId, "get_order", { order_id: orderId });
    if (!order) {
      setError(`No order ${orderId} on this contract.`);
      resultEl.replaceChildren();
      return;
    }
    setError("");
    resultEl.replaceChildren(renderOrder(order));
  } catch (error) {
    setError(error instanceof Error ? error.message : "read failed");
  }
});

const contractParam = new URLSearchParams(window.location.search).get("contract");
if (!contractParam) {
  bootMock();
} else if (!isAccountId(contractParam)) {
  bootTestnetShell(contractParam);
  setMode(
    "That contract parameter is not a NEAR account id. Open this page without it to use the mock desk.",
    "warn",
  );
} else {
  bootTestnetShell(contractParam);
  setMode(`Reading ${contractParam} on testnet. This page does not send transactions.`, "warn");
  try {
    const details = await loadContract(contractParam);
    renderChain(details);
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    const detail = message.endsWith(".") ? message : `${message}.`;
    setMode(
      `Could not read ${contractParam} on testnet. ${detail} Open this page without ?contract= to use the mock desk.`,
      "warn",
    );
  }
}
