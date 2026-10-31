// Read-only NEAR testnet RPC. This module does not sign, and it does not
// call mainnet. The page content-security policy allows only TESTNET_RPC_URL.

export const TESTNET_RPC_URL = "https://rpc.testnet.near.org";

const ACCOUNT_ID = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isAccountId(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 && ACCOUNT_ID.test(value);
}

export function encodeArgs(args) {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeResult(resultBytes) {
  if (!Array.isArray(resultBytes)) {
    throw new Error("testnet RPC returned no result bytes");
  }
  const json = new TextDecoder().decode(Uint8Array.from(resultBytes));
  return JSON.parse(json);
}

export function buildViewRequest(contractId, methodName, args) {
  return {
    jsonrpc: "2.0",
    id: "bot-desk",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: methodName,
      args_base64: encodeArgs(args),
    },
  };
}

export function rpcErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return "testnet RPC error";
  }
  const message = typeof error.message === "string" ? error.message : "testnet RPC error";
  const data = typeof error.data === "string" ? error.data : "";
  if (data && !message.includes(data) && data.length < 300) {
    return `${message}: ${data}`;
  }
  return message;
}

export async function fetchView(contractId, methodName, args, fetchImpl = fetch) {
  if (!isAccountId(contractId)) {
    throw new Error("contract id is not a NEAR account id");
  }
  const body = buildViewRequest(contractId, methodName, args);
  const response = await fetchImpl(TESTNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`testnet RPC HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(rpcErrorMessage(payload.error));
  }
  return decodeResult(payload.result && payload.result.result);
}
