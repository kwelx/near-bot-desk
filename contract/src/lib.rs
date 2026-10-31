//! Bot Desk records one fixed-price skill purchase on NEAR.
//!
//! Every skill costs exactly 1 NEAR. The $1 figure is the product list price.
//! This contract does not move dollars, does not call mainnet, and does not
//! issue a token. `buy_skill` stores a receipt and a deterministic outcome in
//! the same call.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, log, near, require, AccountId, NearToken, Promise};

pub const PRICE_YOCTO: u128 = 1_000_000_000_000_000_000_000_000;
pub const DEADLINE: &str = "2026-11-14";
const MAX_BRIEF_CHARS: usize = 280;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct SkillView {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub price_yocto: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct OrderView {
    pub order_id: u64,
    pub buyer: AccountId,
    pub skill_id: String,
    pub brief: String,
    pub outcome: String,
    pub paid_yocto: String,
    pub created_at_ms: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
#[borsh(crate = "::near_sdk::borsh")]
struct Order {
    buyer: AccountId,
    skill_id: String,
    brief: String,
    outcome: String,
    paid_yocto: u128,
    created_at_ms: u64,
}

impl Order {
    fn to_view(&self, order_id: u64) -> OrderView {
        OrderView {
            order_id,
            buyer: self.buyer.clone(),
            skill_id: self.skill_id.clone(),
            brief: self.brief.clone(),
            outcome: self.outcome.clone(),
            paid_yocto: self.paid_yocto.to_string(),
            created_at_ms: self.created_at_ms,
        }
    }
}

#[derive(Clone, Copy)]
enum SkillKind {
    QuoteBrief,
    DeadlineCheck,
    ReceiptWriter,
}

const SKILL_KINDS: [SkillKind; 3] = [
    SkillKind::QuoteBrief,
    SkillKind::DeadlineCheck,
    SkillKind::ReceiptWriter,
];

impl SkillKind {
    fn id(self) -> &'static str {
        match self {
            Self::QuoteBrief => "quote-brief",
            Self::DeadlineCheck => "deadline-check",
            Self::ReceiptWriter => "receipt-writer",
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::QuoteBrief => "Quote a one-page brief",
            Self::DeadlineCheck => "Check a deadline",
            Self::ReceiptWriter => "Write a receipt",
        }
    }

    fn summary(self) -> &'static str {
        match self {
            Self::QuoteBrief => {
                "Turns a short job note into a paid quote. The list price is $1. The testnet charge is 1 NEAR."
            }
            Self::DeadlineCheck => {
                "Reads the first YYYY-MM-DD in the brief and compares it with 2026-11-14."
            }
            Self::ReceiptWriter => "Formats the brief as a receipt for the 1 NEAR testnet charge.",
        }
    }

    fn parse(id: &str) -> Option<Self> {
        SKILL_KINDS.into_iter().find(|kind| kind.id() == id)
    }

    fn to_view(self) -> SkillView {
        SkillView {
            id: self.id().to_string(),
            title: self.title().to_string(),
            summary: self.summary().to_string(),
            price_yocto: PRICE_YOCTO.to_string(),
        }
    }
}

/// Field order is the state schema. This demo does not migrate state.
#[near(contract_state)]
pub struct Contract {
    owner: AccountId,
    orders: Vector<Order>,
    spent: LookupMap<AccountId, u128>,
    treasury_yocto: u128,
}

impl Default for Contract {
    fn default() -> Self {
        env::panic_str("contract is not initialized")
    }
}

#[near]
impl Contract {
    /// `predecessor` must be this contract account, so a third party cannot
    /// initialize it after deploy. `owner` is the account allowed to withdraw.
    #[init]
    pub fn new(owner: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "initialize from the contract account"
        );
        Self {
            owner,
            orders: Vector::new(b"o"),
            spent: LookupMap::new(b"p"),
            treasury_yocto: 0,
        }
    }

    pub fn list_skills(&self) -> Vec<SkillView> {
        SKILL_KINDS.into_iter().map(SkillKind::to_view).collect()
    }

    pub fn price_yocto(&self) -> String {
        PRICE_YOCTO.to_string()
    }

    pub fn deadline(&self) -> String {
        DEADLINE.to_string()
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn treasury(&self) -> String {
        self.treasury_yocto.to_string()
    }

    pub fn spent_by(&self, buyer: AccountId) -> String {
        self.spent.get(&buyer).copied().unwrap_or(0).to_string()
    }

    pub fn order_count(&self) -> u64 {
        u64::from(self.orders.len())
    }

    pub fn get_order(&self, order_id: u64) -> Option<OrderView> {
        let index = order_index(order_id)?;
        self.orders.get(index).map(|order| order.to_view(order_id))
    }

    /// Walks every order. Sized for this demo, not a large catalog.
    pub fn orders_of(&self, buyer: AccountId) -> Vec<OrderView> {
        self.orders
            .iter()
            .enumerate()
            .filter(|(_, order)| order.buyer == buyer)
            .map(|(index, order)| order.to_view(index as u64 + 1))
            .collect()
    }

    #[payable]
    pub fn buy_skill(&mut self, skill_id: String, brief: String) -> OrderView {
        let brief = match normalize_brief(&brief) {
            Ok(brief) => brief,
            Err(message) => env::panic_str(message),
        };
        let kind = match SkillKind::parse(&skill_id) {
            Some(kind) => kind,
            None => env::panic_str("unknown skill"),
        };
        require!(
            env::attached_deposit().as_yoctonear() == PRICE_YOCTO,
            "price is 1 NEAR"
        );

        let buyer = env::predecessor_account_id();
        let order_id = u64::from(self.orders.len()) + 1;
        let outcome = render_outcome(kind, &brief, order_id);
        let order = Order {
            buyer: buyer.clone(),
            skill_id: skill_id.clone(),
            brief: brief.clone(),
            outcome: outcome.clone(),
            paid_yocto: PRICE_YOCTO,
            created_at_ms: env::block_timestamp_ms(),
        };
        self.orders.push(order);

        let prior = self.spent.get(&buyer).copied().unwrap_or(0);
        let next = match prior.checked_add(PRICE_YOCTO) {
            Some(next) => next,
            None => env::panic_str("spent overflow"),
        };
        self.spent.insert(buyer.clone(), next);
        self.treasury_yocto = match self.treasury_yocto.checked_add(PRICE_YOCTO) {
            Some(next) => next,
            None => env::panic_str("treasury overflow"),
        };

        log!(
            "skill_purchased order_id={} buyer={} skill_id={} paid_yocto={}",
            order_id,
            buyer,
            skill_id,
            PRICE_YOCTO
        );

        OrderView {
            order_id,
            buyer,
            skill_id,
            brief,
            outcome,
            paid_yocto: PRICE_YOCTO.to_string(),
            created_at_ms: env::block_timestamp_ms(),
        }
    }

    /// Sends the recorded skill payments to `owner`. Storage stake stays on
    /// the contract account; this does not sweep the whole balance.
    pub fn withdraw(&mut self) -> String {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        require!(self.treasury_yocto > 0, "nothing to withdraw");
        let amount = self.treasury_yocto;
        self.treasury_yocto = 0;
        Promise::new(self.owner.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .detach();
        amount.to_string()
    }
}

fn order_index(order_id: u64) -> Option<u32> {
    let index = order_id.checked_sub(1)?;
    u32::try_from(index).ok()
}

fn normalize_brief(input: &str) -> Result<String, &'static str> {
    let mut out = String::new();
    let mut pending_space = false;
    for ch in input.chars() {
        let code = ch as u32;
        let is_space = ch == ' ' || ch == '\n' || ch == '\r' || ch == '\t';
        if is_space {
            if !out.is_empty() {
                pending_space = true;
            }
            continue;
        }
        if code < 32 || code == 127 {
            return Err("brief has unsupported characters");
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        out.push(ch);
    }
    let len = out.chars().count();
    if len == 0 || len > MAX_BRIEF_CHARS {
        return Err("brief must be 1 to 280 characters");
    }
    Ok(out)
}

fn render_outcome(kind: SkillKind, brief: &str, order_id: u64) -> String {
    match kind {
        SkillKind::QuoteBrief => format!(
            "Quote {order_id}\nJob: {brief}\nList price: $1\nTestnet charge: 1 NEAR\nStatus: paid"
        ),
        SkillKind::DeadlineCheck => {
            let (date, result) = deadline_parts(brief);
            format!("Deadline check {order_id}\nDate: {date}\nResult: {result}")
        }
        SkillKind::ReceiptWriter => {
            format!("Receipt {order_id}\nMemo: {brief}\nAmount: 1 NEAR\nNetwork: testnet")
        }
    }
}

fn deadline_parts(brief: &str) -> (String, String) {
    match first_iso_date(brief) {
        None => (
            "none".to_string(),
            "brief did not include a YYYY-MM-DD date".to_string(),
        ),
        Some(date) if date.as_str() <= DEADLINE => (date, format!("on or before {DEADLINE}")),
        Some(date) => (date, format!("after {DEADLINE}")),
    }
}

fn first_iso_date(brief: &str) -> Option<String> {
    let bytes = brief.as_bytes();
    if bytes.len() < 10 {
        return None;
    }
    let last = bytes.len() - 10;
    for start in 0..=last {
        if let Some(date) = parse_iso_date(&bytes[start..start + 10]) {
            return Some(date);
        }
    }
    None
}

fn parse_iso_date(window: &[u8]) -> Option<String> {
    if window.len() != 10 || window[4] != b'-' || window[7] != b'-' {
        return None;
    }
    let year = parse_digits(&window[0..4])?;
    let month = parse_digits(&window[5..7])?;
    let day = parse_digits(&window[8..10])?;
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return None;
    }
    String::from_utf8(window.to_vec()).ok()
}

fn parse_digits(bytes: &[u8]) -> Option<u32> {
    let mut value = 0u32;
    for byte in bytes {
        if !byte.is_ascii_digit() {
            return None;
        }
        value = value * 10 + u32::from(byte - b'0');
    }
    Some(value)
}

fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_leap(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

#[cfg(test)]
mod tests;
