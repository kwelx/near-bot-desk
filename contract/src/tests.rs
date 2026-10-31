use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const TEST_TIMESTAMP_NS: u64 = 1_762_000_000_000_000_000;
const TEST_TIMESTAMP_MS: u64 = 1_762_000_000_000;
const QUOTE_BRIEF: &str = "Draft a one-page status note for the bot desk demo.";

fn context(predecessor: &str, deposit_yocto: u128) {
    let account: AccountId = predecessor.parse().unwrap();
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id("desk.testnet".parse().unwrap())
        .signer_account_id(account.clone())
        .predecessor_account_id(account)
        .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
        .account_balance(NearToken::from_near(50))
        .block_timestamp(TEST_TIMESTAMP_NS);
    testing_env!(builder.build());
}

fn setup() -> Contract {
    context("desk.testnet", 0);
    Contract::new("desk.testnet".parse().unwrap())
}

fn buy(
    contract: &mut Contract,
    buyer: &str,
    skill_id: &str,
    brief: &str,
    deposit: u128,
) -> OrderView {
    context(buyer, deposit);
    contract.buy_skill(skill_id.to_string(), brief.to_string())
}

#[test]
fn catalog_matches_the_shared_fixture() {
    let contract = setup();
    let raw = include_str!("../../fixtures/catalog.json");
    let skills = contract.list_skills();
    assert_eq!(skills.len(), 3);
    for skill in &skills {
        assert!(raw.contains(&format!("\"id\": \"{}\"", skill.id)));
        assert!(raw.contains(&format!("\"title\": \"{}\"", skill.title)));
        assert!(raw.contains(&format!("\"summary\": \"{}\"", skill.summary)));
        assert_eq!(skill.price_yocto, PRICE_YOCTO.to_string());
    }
    assert_eq!(
        skills
            .iter()
            .map(|skill| skill.id.as_str())
            .collect::<Vec<_>>(),
        vec!["quote-brief", "deadline-check", "receipt-writer"]
    );
    assert_eq!(contract.price_yocto(), PRICE_YOCTO.to_string());
    assert_eq!(contract.deadline(), DEADLINE);
    assert_eq!(contract.order_count(), 0);
    assert_eq!(contract.treasury(), "0");
}

#[test]
fn quote_purchase_stores_the_receipt_and_outcome() {
    let mut contract = setup();
    let order = buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        QUOTE_BRIEF,
        PRICE_YOCTO,
    );
    let expected = format!(
        "Quote 1\nJob: {QUOTE_BRIEF}\nList price: $1\nTestnet charge: 1 NEAR\nStatus: paid"
    );
    assert_eq!(order.outcome, expected);
    assert_eq!(order.order_id, 1);
    assert_eq!(order.buyer.as_str(), "agent.testnet");
    assert_eq!(order.skill_id, "quote-brief");
    assert_eq!(order.brief, QUOTE_BRIEF);
    assert_eq!(order.paid_yocto, PRICE_YOCTO.to_string());
    assert_eq!(order.created_at_ms, TEST_TIMESTAMP_MS);
    assert_eq!(contract.get_order(1), Some(order.clone()));
    assert_eq!(contract.treasury(), PRICE_YOCTO.to_string());
    assert_eq!(
        contract.spent_by("agent.testnet".parse().unwrap()),
        PRICE_YOCTO.to_string()
    );
    assert_eq!(contract.order_count(), 1);
    let logs = get_logs();
    assert!(logs.iter().any(|line| {
        line.contains("skill_purchased")
            && line.contains("order_id=1")
            && line.contains("buyer=agent.testnet")
            && line.contains("skill_id=quote-brief")
    }));
    let json = near_sdk::serde_json::to_string(&order).unwrap();
    assert!(json.contains(&format!("\"paid_yocto\":\"{}\"", PRICE_YOCTO)));
}

#[test]
fn deadline_and_receipt_outcomes() {
    let mut contract = setup();
    let on_time = buy(
        &mut contract,
        "agent.testnet",
        "deadline-check",
        "Ship the testnet demo by 2026-11-14.",
        PRICE_YOCTO,
    );
    assert_eq!(
        on_time.outcome,
        "Deadline check 1\nDate: 2026-11-14\nResult: on or before 2026-11-14"
    );
    let late = buy(
        &mut contract,
        "agent.testnet",
        "deadline-check",
        "Ship by 2026-11-15 please",
        PRICE_YOCTO,
    );
    assert_eq!(
        late.outcome,
        "Deadline check 2\nDate: 2026-11-15\nResult: after 2026-11-14"
    );
    let missing = buy(
        &mut contract,
        "agent.testnet",
        "deadline-check",
        "no date here",
        PRICE_YOCTO,
    );
    assert_eq!(
        missing.outcome,
        "Deadline check 3\nDate: none\nResult: brief did not include a YYYY-MM-DD date"
    );
    let leap = buy(
        &mut contract,
        "agent.testnet",
        "deadline-check",
        "Meet on 2026-02-29 then 2024-02-29",
        PRICE_YOCTO,
    );
    assert_eq!(
        leap.outcome,
        "Deadline check 4\nDate: 2024-02-29\nResult: on or before 2026-11-14"
    );
    let invalid_day = buy(
        &mut contract,
        "agent.testnet",
        "deadline-check",
        "2026-04-31 then 2026-04-30",
        PRICE_YOCTO,
    );
    assert_eq!(
        invalid_day.outcome,
        "Deadline check 5\nDate: 2026-04-30\nResult: on or before 2026-11-14"
    );
    let emoji = buy(
        &mut contract,
        "agent.testnet",
        "deadline-check",
        "😀2026-11-01",
        PRICE_YOCTO,
    );
    assert!(emoji.outcome.contains("Date: 2026-11-01"));
    let receipt = buy(
        &mut contract,
        "agent.testnet",
        "receipt-writer",
        "Bot desk demo receipt for a one-page brief.",
        PRICE_YOCTO,
    );
    assert_eq!(
        receipt.outcome,
        "Receipt 7\nMemo: Bot desk demo receipt for a one-page brief.\nAmount: 1 NEAR\nNetwork: testnet"
    );
}

#[test]
fn brief_whitespace_is_collapsed() {
    let mut contract = setup();
    let order = buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        "  Draft\n\ta   note  ",
        PRICE_YOCTO,
    );
    assert_eq!(order.brief, "Draft a note");
    assert!(order.outcome.contains("Job: Draft a note"));
}

#[test]
fn brief_of_280_characters_is_accepted() {
    let mut contract = setup();
    let brief = "a".repeat(280);
    let order = buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        &brief,
        PRICE_YOCTO,
    );
    assert_eq!(order.brief.chars().count(), 280);
}

#[test]
#[should_panic(expected = "brief must be 1 to 280 characters")]
fn empty_brief_is_rejected() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        "   \n\t",
        PRICE_YOCTO,
    );
}

#[test]
#[should_panic(expected = "brief must be 1 to 280 characters")]
fn brief_over_280_characters_is_rejected() {
    let mut contract = setup();
    let brief = "a".repeat(281);
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        &brief,
        PRICE_YOCTO,
    );
}

#[test]
#[should_panic(expected = "brief has unsupported characters")]
fn control_characters_are_rejected() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        "hello\u{0007}",
        PRICE_YOCTO,
    );
}

#[test]
#[should_panic(expected = "unknown skill")]
fn unknown_skill_is_rejected() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "not-a-skill",
        "A valid brief.",
        PRICE_YOCTO,
    );
}

#[test]
#[should_panic(expected = "price is 1 NEAR")]
fn short_deposit_is_rejected() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        QUOTE_BRIEF,
        PRICE_YOCTO - 1,
    );
}

#[test]
#[should_panic(expected = "price is 1 NEAR")]
fn overpay_is_rejected() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        QUOTE_BRIEF,
        PRICE_YOCTO + 1,
    );
}

#[test]
fn buyers_are_tracked_separately() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent-a.testnet",
        "quote-brief",
        "First job.",
        PRICE_YOCTO,
    );
    buy(
        &mut contract,
        "agent-b.testnet",
        "receipt-writer",
        "Second job.",
        PRICE_YOCTO,
    );
    let a = contract.orders_of("agent-a.testnet".parse().unwrap());
    let b = contract.orders_of("agent-b.testnet".parse().unwrap());
    assert_eq!(a.len(), 1);
    assert_eq!(b.len(), 1);
    assert_eq!(a[0].order_id, 1);
    assert_eq!(b[0].order_id, 2);
    assert_eq!(contract.get_order(0), None);
    assert_eq!(contract.get_order(3), None);
    assert_eq!(
        contract.spent_by("agent-a.testnet".parse().unwrap()),
        PRICE_YOCTO.to_string()
    );
    assert_eq!(contract.spent_by("nobody.testnet".parse().unwrap()), "0");
    let two = PRICE_YOCTO.checked_mul(2).unwrap().to_string();
    assert_eq!(contract.treasury(), two);
}

#[test]
fn owner_withdraws_recorded_payments_only() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        QUOTE_BRIEF,
        PRICE_YOCTO,
    );
    context("desk.testnet", 0);
    let withdrawn = contract.withdraw();
    assert_eq!(withdrawn, PRICE_YOCTO.to_string());
    assert_eq!(contract.treasury(), "0");
    assert_eq!(contract.order_count(), 1);
    assert!(contract.get_order(1).is_some());
}

#[test]
fn a_separate_owner_can_withdraw() {
    context("desk.testnet", 0);
    let mut contract = Contract::new("owner.testnet".parse().unwrap());
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        QUOTE_BRIEF,
        PRICE_YOCTO,
    );
    context("owner.testnet", 0);
    assert_eq!(contract.withdraw(), PRICE_YOCTO.to_string());
}

#[test]
#[should_panic(expected = "owner only")]
fn buyer_cannot_withdraw() {
    let mut contract = setup();
    buy(
        &mut contract,
        "agent.testnet",
        "quote-brief",
        QUOTE_BRIEF,
        PRICE_YOCTO,
    );
    context("agent.testnet", 0);
    contract.withdraw();
}

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn empty_treasury_cannot_be_withdrawn() {
    let mut contract = setup();
    context("desk.testnet", 0);
    contract.withdraw();
}

#[test]
#[should_panic(expected = "initialize from the contract account")]
fn init_rejects_a_different_predecessor() {
    context("alice.testnet", 0);
    let _ = Contract::new("alice.testnet".parse().unwrap());
}
