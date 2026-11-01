import assert from "node:assert/strict";
import test from "node:test";
import {
  TESTNET_RPC_URL,
  buildViewRequest,
  decodeResult,
  encodeArgs,
  fetchView,
  isAccountId,
  rpcErrorMessage,
} from "../web/rpc.js";

test("account ids follow the NEAR account pattern", () => {
  assert.equal(isAccountId("desk.testnet"), true);
  assert.equal(isAccountId("demo-agent.testnet"), true);
  assert.equal(isAccountId("a".repeat(64)), true);
  assert.equal(isAccountId("ab"), true);
  assert.equal(isAccountId("a"), false);
  assert.equal(isAccountId("A.testnet"), false);
  assert.equal(isAccountId("-desk.testnet"), false);
  assert.equal(isAccountId("desk.testnet "), false);
  assert.equal(isAccountId(`${"a".repeat(65)}`), false);
});

test("view calls are built for testnet and never for mainnet", () => {
  assert.equal(TESTNET_RPC_URL, "https://rpc.testnet.near.org");
  assert.equal(TESTNET_RPC_URL.includes("mainnet"), false);
  const request = buildViewRequest("desk.testnet", "get_order", { order_id: 1 });
  assert.equal(request.method, "query");
  assert.equal(request.params.request_type, "call_function");
  assert.equal(request.params.finality, "final");
  assert.equal(request.params.account_id, "desk.testnet");
  assert.equal(request.params.method_name, "get_order");
  assert.equal(request.params.args_base64, encodeArgs({ order_id: 1 }));
  assert.equal(encodeArgs({}), btoa("{}"));
});

test("fetchView posts only to the testnet RPC", async () => {
  const calls = [];
  const payload = ["quote-brief"];
  const bytes = [...new TextEncoder().encode(JSON.stringify(payload))];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { result: { result: bytes } };
      },
    };
  };
  const value = await fetchView("desk.testnet", "list_skills", {}, fetchImpl);
  assert.deepEqual(value, payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TESTNET_RPC_URL);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(decodeResult(bytes)[0], "quote-brief");
});

test("fetchView surfaces RPC failures", async () => {
  await assert.rejects(
    () => fetchView("not valid", "list_skills", {}, async () => {
      throw new Error("should not be called");
    }),
    /contract id is not a NEAR account id/,
  );
  await assert.rejects(
    () =>
      fetchView("desk.testnet", "list_skills", {}, async () => ({
        ok: false,
        status: 503,
      })),
    /testnet RPC HTTP 503/,
  );
  await assert.rejects(
    () =>
      fetchView("desk.testnet", "list_skills", {}, async () => ({
        ok: true,
        async json() {
          return { error: { message: "Server error", data: "account does not exist" } };
        },
      })),
    /Server error: account does not exist/,
  );
  assert.equal(rpcErrorMessage(null), "testnet RPC error");
  assert.throws(() => decodeResult(null), /no result bytes/);
});
