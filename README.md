# Bot Desk

Built at NEAR HACKATHON (Nov 2026).

An agent pays 1 testnet NEAR for one bot skill. The contract stores a receipt and a deterministic outcome in that same call. The local page runs the same rules with no account and no key. That mock is the path judges run.

Development ends **2026-11-14 23:59 UTC**. This entry has not been submitted. Nothing here is deployed. The draft X post is in [DEMO_POST.md](DEMO_POST.md). The demo post link is still `TODO_DEMO_VIDEO_URL`.

## Problem

A $1 bot skill needs one payment step a person can run: choose the skill, pay, and see the result. This repository is that step on NEAR testnet.

## How NEAR fits

`buy_skill` is one contract call. It checks that the attached deposit is exactly 1 NEAR, records the buyer, the brief, and the outcome, and adds 1 NEAR to the desk treasury. The owner withdraws that recorded total later. The outcome is computed in the contract, so the result does not depend on a hosted model or an API key.

The **$1 figure is the list price**. The charge in this project is **1 testnet NEAR**. No dollars move.

## Tracks

Primary: **Agent Economy** (`agents`). The demo is an agent listing a skill, paying for it, and reading the receipt.

Secondary: **Autonomous Business** (`business`). The catalog, the price, and the deadline are fixed in the contract. Only the owner can withdraw. The agent only buys.

Other tracks do not fit. There is no exchange, token, NFT, or game. NEAR Intents has no testnet (hackathon Q-007), so this project does not use Intents. An own contract is enough (Q-011). Testnet-only projects are eligible (Q-010).

## What this demo does not do

- No mainnet calls, deploys, or accounts.
- No private keys, seed phrases, or key fields in the page.
- No token, airdrop, or price chart.
- No claim about users, revenue, or a live dollar charge.
- No hackathon submission. The owner submits, after filling the placeholders below.

## Baseline

Hackathon Q-002: an existing product on another stack can be context. Only the NEAR integration built for the hackathon is the entry.

This repository is that integration. It does not contain the botsdothework.com store, VoiceToShip, or the earlier Base/x402 payment path. Those are prior context for the $1 bot idea.

## Try the mock

This is the judge path. No account, no key, and no network. You need Node.js 22 or newer. There is no `npm install`. From a fresh clone:

```sh
node --test
node agent/run.mjs
```

`node --test` exits 0. It checks the mock, the read-only testnet RPC client, and the static server.

`node agent/run.mjs` exits 0 and prints:

```text
Bot Desk agent (mock, no network)
No transaction was broadcast.
Listed 3 skills. Each price is 1 NEAR.
Bought quote-brief as demo-agent.testnet.
Order 1 outcome:
Quote 1
Job: Draft a one-page status note for the bot desk demo.
List price: $1
Testnet charge: 1 NEAR
Status: paid
Desk balance: 1 NEAR
Spent by demo-agent.testnet: 1 NEAR
```

Start the page in a second command. It keeps running:

```sh
node web/server.mjs
```

See `Bot Desk mock is at http://127.0.0.1:4173`, then open that URL. If port 4173 is taken, stop the other process or run `PORT=4174 node web/server.mjs` and open the URL it prints.

1. Leave the brief as `Draft a one-page status note for the bot desk demo.`
2. Click **Pay 1 NEAR**.
3. See order 1 and the quote text above.
4. See **Desk balance: 1 NEAR**.
5. Click **Withdraw treasury (mock owner)**.
6. See **Desk balance: 0 NEAR**. The order stays on the page.

The buyer label `demo-agent.testnet` and the owner label `desk-owner.testnet` exist only in the page. This project did not create them. Refreshing the page clears the mock. The banner on the page says that no transaction is sent.

To see a rejected brief, clear the text box and click **Pay 1 NEAR**. The page shows `brief must be 1 to 280 characters`.

`deadline-check` reads the first valid `YYYY-MM-DD` in the brief and compares it with `2026-11-14`. The example brief `Ship the testnet demo by 2026-11-14.` produces:

```text
Deadline check 1
Date: 2026-11-14
Result: on or before 2026-11-14
```

## Contract

You need Rust stable with the `wasm32-unknown-unknown` target. The root `rust-toolchain.toml` selects that toolchain. The first build downloads crates from crates.io. Tests use the SDK's in-process VM context. They do not use a network.

```sh
cd contract
cargo test
cargo build --target wasm32-unknown-unknown --release
```

`cargo test` passes, and the build writes:

```text
contract/target/wasm32-unknown-unknown/release/bot_desk.wasm
```

### Rules the contract and the mock share

- Skills, in order: `quote-brief`, `deadline-check`, `receipt-writer`. Titles and summaries are in `fixtures/catalog.json`.
- Price is exactly 1 NEAR (`1000000000000000000000000` yoctoNEAR). A short deposit or an overpay is rejected with `price is 1 NEAR`.
- The brief is trimmed. Spaces, tabs, and newlines inside it collapse to one space. After that it must be 1 to 280 characters. Other control characters are rejected.
- The first valid `YYYY-MM-DD` wins. Month lengths and leap days are checked. `2026-02-29` is not a date.
- Order ids start at 1.
- `withdraw` pays the owner the sum of skill payments and leaves the orders in place. Any other account gets `owner only`. An empty treasury gets `nothing to withdraw`.

### Contract-only rule

`new` must be called by the contract account (`predecessor` equals the contract account). That stops someone else from initializing the contract after it is deployed. The mock has no chain, so it does not model this check. The Rust tests do.

`orders_of` walks every order. That is sized for this demo.

### Methods

| Method | Kind | Behavior |
| --- | --- | --- |
| `new` | init | `{ "owner": "<account>" }`. Caller must be the contract account. |
| `list_skills` | view | The three skills and the price. |
| `price_yocto` | view | `"1000000000000000000000000"`. |
| `deadline` | view | `"2026-11-14"`. |
| `owner` | view | Owner account. |
| `treasury` | view | Recorded payments, in yoctoNEAR, as a string. |
| `spent_by` | view | `{ "buyer": "<account>" }`. |
| `order_count` | view | Number of orders. |
| `get_order` | view | `{ "order_id": 1 }`, or `null`. |
| `orders_of` | view | `{ "buyer": "<account>" }`. |
| `buy_skill` | call | `{ "skill_id": "quote-brief", "brief": "..." }` with exactly 1 NEAR attached. |
| `withdraw` | call | Owner only. Attached deposit 0. Transfers the recorded treasury. |

## Optional testnet deploy

Skip this section on a fresh clone. Judges do not need it. The commands below are examples for a later deploy, not the reproduction check. This repository did not create an account, call a faucet, or deploy. Use your own testnet account if you deploy. Do not deploy to mainnet. Do not paste a key or seed phrase into the repo, the page, or a committed shell history. `sign-with-keychain` uses the key NEAR CLI already stored on your machine.

The optional testnet contract account placeholder is `TODO_TESTNET_CONTRACT_ACCOUNT`. Replace it only after you deploy.

Public RPC used by the page and by NEAR CLI's testnet network: `https://rpc.testnet.near.org`.

Install NEAR CLI from the official docs if you want it: <https://docs.near.org/tools/near-cli>. The commands below match that CLI's `contract` syntax. Replace the placeholders with the testnet account you create.

```text
export CONTRACT_ID=TODO_TESTNET_CONTRACT_ACCOUNT
export SIGNER_ID=TODO_TESTNET_CONTRACT_ACCOUNT
```

Create and fund a testnet account with the faucet only if you do not already have one. The official CLI form is:

```text
near account create-account sponsor-by-faucet-service $CONTRACT_ID autogenerate-new-keypair save-to-keychain network-config testnet create
```

Deploy, then initialize. `new` is signed by the contract account, and that account is the owner:

```text
near contract deploy $CONTRACT_ID use-file contract/target/wasm32-unknown-unknown/release/bot_desk.wasm without-init-call network-config testnet sign-with-keychain send

near contract call-function as-transaction $CONTRACT_ID new json-args '{"owner":"'"$CONTRACT_ID"'"}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as $CONTRACT_ID network-config testnet sign-with-keychain send
```

Buy the quote skill. The signer pays 1 testnet NEAR from their own balance. Gas is separate from the 1 NEAR deposit.

```text
near contract call-function as-transaction $CONTRACT_ID buy_skill json-args '{"skill_id":"quote-brief","brief":"Draft a one-page status note for the bot desk demo."}' prepaid-gas '100.0 Tgas' attached-deposit '1 NEAR' sign-as $SIGNER_ID network-config testnet sign-with-keychain send
```

Read the order back:

```text
near contract call-function as-read-only $CONTRACT_ID get_order json-args '{"order_id":1}' network-config testnet now
```

The outcome text is the same quote block as in the mock.

Withdraw sends only the recorded skill payments to the owner. It does not sweep the whole account. Leave enough testnet NEAR on the contract account to cover storage. If the liquid balance is below the recorded treasury, the withdraw transaction fails and the orders stay.

```text
near contract call-function as-transaction $CONTRACT_ID withdraw json-args '{}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as $CONTRACT_ID network-config testnet sign-with-keychain send
```

### Read a deployed contract in the page

Start the page, then open:

```text
http://127.0.0.1:4173/?contract=TODO_TESTNET_CONTRACT_ACCOUNT
```

The page reads `list_skills`, `price_yocto`, `deadline`, `owner`, `treasury`, and `order_count` through the testnet RPC. Enter an order id and click **Read order** to call `get_order`. The pay button stays disabled. The page never asks for a key. If the account is missing or the contract is not initialized, the page shows the RPC error and points back at the mock (`http://127.0.0.1:4173` with no query).

## Accounts and the demo post link

| Item | Value |
| --- | --- |
| Mainnet prize payout account | `kwelx.near` |
| demo post link | `TODO_DEMO_VIDEO_URL` |
| Optional testnet contract account | `TODO_TESTNET_CONTRACT_ACCOUNT` |

`kwelx.near` is the mainnet account for a prize payout. This repository does not send a transaction to it. The demo post link stays `TODO_DEMO_VIDEO_URL` until the owner publishes the X post and pastes the URL. The testnet contract account is optional and unused by the mock.

Also still required from the owner before any submission: project name, lead name, contact email, team size, and agreement to the contact notice in `https://nearhackathon.com/HACKATHON.md`. Tracks to select: `agents` and `business`. The description to paste is in [DEMO_POST.md](DEMO_POST.md). This repository does not send the submission.

## Demo

Record the local mock, not a testnet deploy. One moment is enough: leave the prefilled brief, click **Pay 1 NEAR**, and show order 1 with **Desk balance: 1 NEAR**. The draft post text is in [DEMO_POST.md](DEMO_POST.md). It has not been posted.

## Form description

Not submitted. The same two sentences are in [DEMO_POST.md](DEMO_POST.md).

Bot Desk is a testnet contract where an agent pays exactly 1 NEAR for one bot skill and that call stores the receipt and the outcome. The $1 amount is the list price; the demo charge is 1 testnet NEAR, and the local page runs the same rules with no account.

## Libraries

- [near-sdk](https://docs.rs/near-sdk) 5.30, pinned in `contract/Cargo.lock`. The contract and its unit tests use it.
- Node.js built-in test runner, HTTP server, and modules. No npm packages.

Official references used while building: <https://nearhackathon.com/>, <https://nearhackathon.com/HACKATHON.md>, <https://docs.near.org/>, and <https://docs.near.org/tools/near-cli>.

## License

MIT. See [LICENSE](LICENSE).
