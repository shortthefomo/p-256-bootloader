// Transaction bodies the wallet can build. Payments use the hook's payment
// challenge. Every other type uses the generic transaction challenge, so the
// fields here must be the fields that will be signed.

import { uriToHex } from "./uri-tokens.mjs";

const RIPPLE_EPOCH = 946684800;

function address(value, label) {
  const text = String(value || "").trim();
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(text)) throw new Error(`enter a ${label} address`);
  return text;
}

function xah(value, label) {
  const text = String(value || "").trim();
  if (!/^\d+(\.\d{0,6})?$/.test(text)) throw new Error(`${label} needs at most 6 decimals`);
  const [whole, frac = ""] = text.split(".");
  const drops = BigInt(whole) * 1000000n + BigInt((frac + "000000").slice(0, 6));
  if (drops <= 0n) throw new Error(`${label} must be greater than 0`);
  return drops;
}

// A URI token sell may be 0 XAH when a recipient is named. That is a transfer
// the recipient accepts. Payments still use xah(), which rejects 0.
function tokenDrops(value, label) {
  const text = String(value ?? "").trim();
  if (text === "0") return "0";
  return String(xah(text, label));
}

// A URI token offer is XAH unless a currency is named. A free XAH transfer
// still needs a recipient. An issued currency uses the trust line's issuer.
function saleAmount(input, label) {
  const code = String(input.currency || "").trim();
  const buyer = String(input.destination || "").trim();
  if (!code || code.toUpperCase() === "XAH") {
    if (String(input.issuer || "").trim()) throw new Error(`${label} in XAH has no issuer`);
    const drops = tokenDrops(input.xah, label);
    return { amount: drops, text: `${String(input.xah).trim()} XAH`, buyer };
  }
  const cur = currency(code);
  const value = decimal(input.xah, label);
  return {
    amount: { currency: cur, issuer: address(input.issuer, `${label} issuer`), value },
    text: `${value} ${cur}`,
    buyer,
  };
}

function decimal(value, label) {
  const text = String(value || "").trim();
  if (!/^\d+(\.\d{1,15})?$/.test(text) || Number(text) <= 0) throw new Error(`${label} must be a positive amount`);
  return text;
}

function currency(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "XAH" || text === "") return "XAH";
  if (!/^[A-Z0-9]{3}$/.test(text) && !/^[A-F0-9]{40}$/.test(text)) {
    throw new Error("currency is 3 letters or 40 hex characters");
  }
  return text;
}

function uint(value, label, max) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a whole number`);
  const n = Number(text);
  if (n < 1 || n > max) throw new Error(`${label} must be from 1 to ${max}`);
  return n;
}

function hex64(value, label) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(text)) throw new Error(`${label} must be 64 hex characters`);
  return text;
}

function amount(value, code, issuer, label) {
  const cur = currency(code);
  if (cur === "XAH") {
    if (String(issuer || "").trim()) throw new Error(`${label} in XAH has no issuer`);
    return String(xah(value, label));
  }
  return { currency: cur, issuer: address(issuer, `${label} issuer`), value: decimal(value, label) };
}

export const TX_KINDS = [
  {
    id: "Payment",
    label: "Payment",
    blurb: "Send XAH",
    fields: [
      { key: "destination", label: "Destination", kind: "address" },
      { key: "xah", label: "Amount XAH", kind: "xah" },
    ],
  },
  {
    id: "TrustSet",
    label: "Trust line",
    blurb: "Allow an issued currency",
    fields: [
      { key: "issuer", label: "Issuer", kind: "address" },
      { key: "currency", label: "Currency", kind: "text" },
      { key: "limit", label: "Limit", kind: "text" },
    ],
  },
  {
    id: "OfferCreate",
    label: "Offer",
    blurb: "Trade XAH or an issued currency",
    fields: [
      { key: "pays", label: "You pay", kind: "text" },
      { key: "paysCurrency", label: "Pay currency (XAH or code)", kind: "text" },
      { key: "paysIssuer", label: "Pay issuer, blank for XAH", kind: "text" },
      { key: "gets", label: "You get", kind: "text" },
      { key: "getsCurrency", label: "Get currency (XAH or code)", kind: "text" },
      { key: "getsIssuer", label: "Get issuer, blank for XAH", kind: "text" },
    ],
  },
  {
    id: "OfferCancel",
    label: "Cancel offer",
    blurb: "Cancel one of your offers",
    fields: [{ key: "sequence", label: "Offer sequence", kind: "uint" }],
  },
  {
    id: "EscrowCreate",
    label: "Create escrow",
    blurb: "Lock XAH until a finish time",
    fields: [
      { key: "destination", label: "Destination", kind: "address" },
      { key: "xah", label: "Amount XAH", kind: "xah" },
      { key: "seconds", label: "Finish after seconds", kind: "seconds" },
    ],
  },
  {
    id: "EscrowFinish",
    label: "Finish escrow",
    blurb: "Release an escrow that is ready",
    fields: [
      { key: "owner", label: "Escrow owner", kind: "address" },
      { key: "sequence", label: "Offer sequence", kind: "uint" },
    ],
  },
  {
    id: "EscrowCancel",
    label: "Cancel escrow",
    blurb: "Cancel an escrow after its cancel time",
    fields: [
      { key: "owner", label: "Escrow owner", kind: "address" },
      { key: "sequence", label: "Offer sequence", kind: "uint" },
    ],
  },
  {
    id: "CheckCreate",
    label: "Create check",
    blurb: "Write a check for XAH",
    fields: [
      { key: "destination", label: "Destination", kind: "address" },
      { key: "xah", label: "Amount XAH", kind: "xah" },
    ],
  },
  {
    id: "CheckCash",
    label: "Cash check",
    blurb: "Cash a check for XAH",
    fields: [
      { key: "checkId", label: "Check ID", kind: "hex64" },
      { key: "xah", label: "Amount XAH", kind: "xah" },
    ],
  },
  {
    id: "CheckCancel",
    label: "Cancel check",
    blurb: "Cancel a check",
    fields: [{ key: "checkId", label: "Check ID", kind: "hex64" }],
  },
  {
    id: "AccountSet",
    label: "Account domain",
    blurb: "Set the account domain",
    fields: [{ key: "domain", label: "Domain", kind: "text" }],
  },
  {
    id: "SetRegularKey",
    label: "Regular key",
    blurb: "Set or clear the regular key",
    fields: [{ key: "regular", label: "Regular key, blank to clear", kind: "text" }],
  },
  {
    id: "DepositPreauth",
    label: "Preauthorize",
    blurb: "Authorize an account to deposit",
    fields: [{ key: "authorize", label: "Account to authorize", kind: "address" }],
  },
  {
    id: "DepositPreauthRevoke",
    label: "Revoke preauthorization",
    blurb: "Stop an account from depositing",
    fields: [{ key: "unauthorize", label: "Account to revoke", kind: "address" }],
  },
  {
    id: "TicketCreate",
    label: "Tickets",
    blurb: "Create ticket sequences",
    fields: [{ key: "count", label: "How many tickets", kind: "uint" }],
  },
  {
    id: "Invoke",
    label: "Invoke",
    blurb: "Call a hook. Blank destination calls your own",
    fields: [{ key: "destination", label: "Destination, optional", kind: "text" }],
  },
  {
    id: "AccountDelete",
    label: "Delete account",
    blurb: "Send the remaining balance and delete the account",
    fields: [{ key: "destination", label: "Destination", kind: "address" }],
  },
  {
    id: "URITokenCreateSellOffer",
    label: "URI token offer",
    blurb: "Offer a URI token you own. Leave the currency blank for XAH, and the buyer blank to offer it to anyone.",
    fields: [
      { key: "id", label: "URI token ID", kind: "hex64" },
      { key: "xah", label: "Price", kind: "xah" },
      { key: "currency", label: "Currency, blank for XAH", kind: "text" },
      { key: "issuer", label: "Currency issuer, blank for XAH", kind: "text" },
      { key: "destination", label: "Only this buyer, optional", kind: "text" },
    ],
  },
  {
    id: "URITokenCancelSellOffer",
    label: "Cancel URI token offer",
    blurb: "Take your URI token off sale",
    fields: [{ key: "id", label: "URI token ID", kind: "hex64" }],
  },
  {
    id: "URITokenBuy",
    label: "Buy URI token",
    blurb: "Buy a URI token that is already for sale. The price has to match that offer.",
    fields: [
      { key: "id", label: "URI token ID", kind: "hex64" },
      { key: "xah", label: "Price", kind: "xah" },
      { key: "currency", label: "Currency, blank for XAH", kind: "text" },
      { key: "issuer", label: "Currency issuer, blank for XAH", kind: "text" },
    ],
  },
];

export function transactionFromKind(kind, values, nowSec = Math.floor(Date.now() / 1000)) {
  const input = values || {};
  if (kind === "Payment") {
    // The payment challenge counts drops. An issued currency on this path rolls back.
    const destination = address(input.destination, "destination");
    const drops = xah(input.xah, "amount");
    return {
      summary: `Send ${input.xah.trim()} XAH to ${destination}`,
      payment: { destination, drops },
      tx: { TransactionType: "Payment", Destination: destination, Amount: String(drops) },
    };
  }
  if (kind === "TrustSet") {
    const issuer = address(input.issuer, "issuer");
    const code = currency(input.currency);
    if (code === "XAH") throw new Error("a trust line is for an issued currency");
    const value = decimal(input.limit, "limit");
    return {
      summary: `Trust ${value} ${code} from ${issuer}`,
      payment: null,
      tx: { TransactionType: "TrustSet", LimitAmount: { currency: code, issuer, value }, Flags: 131072 },
    };
  }
  if (kind === "OfferCreate") {
    const pays = amount(input.pays, input.paysCurrency, input.paysIssuer, "pay amount");
    const gets = amount(input.gets, input.getsCurrency, input.getsIssuer, "get amount");
    return {
      summary: "Create an offer",
      payment: null,
      // TakerGets leaves this account. TakerPays is what it receives.
      tx: { TransactionType: "OfferCreate", TakerPays: gets, TakerGets: pays },
    };
  }
  if (kind === "OfferCancel") {
    return {
      summary: `Cancel offer ${input.sequence}`,
      payment: null,
      tx: { TransactionType: "OfferCancel", OfferSequence: uint(input.sequence, "offer sequence", 0xffffffff) },
    };
  }
  if (kind === "EscrowCreate") {
    const destination = address(input.destination, "destination");
    const drops = xah(input.xah, "amount");
    const seconds = uint(input.seconds, "finish delay", 366 * 24 * 60 * 60);
    const finish = nowSec + seconds - RIPPLE_EPOCH;
    if (finish <= 0) throw new Error("finish time is not on this ledger clock");
    return {
      summary: `Escrow ${input.xah.trim()} XAH to ${destination}`,
      payment: null,
      tx: { TransactionType: "EscrowCreate", Destination: destination, Amount: String(drops), FinishAfter: finish },
    };
  }
  if (kind === "EscrowFinish" || kind === "EscrowCancel") {
    const owner = address(input.owner, "owner");
    const sequence = uint(input.sequence, "offer sequence", 0xffffffff);
    return {
      summary: `${kind === "EscrowFinish" ? "Finish" : "Cancel"} escrow ${sequence}`,
      payment: null,
      tx: { TransactionType: kind, Owner: owner, OfferSequence: sequence },
    };
  }
  if (kind === "CheckCreate") {
    const destination = address(input.destination, "destination");
    const drops = xah(input.xah, "amount");
    return {
      summary: `Check for ${input.xah.trim()} XAH to ${destination}`,
      payment: null,
      tx: { TransactionType: "CheckCreate", Destination: destination, SendMax: String(drops) },
    };
  }
  if (kind === "CheckCash") {
    return {
      summary: `Cash check for ${input.xah.trim()} XAH`,
      payment: null,
      tx: { TransactionType: "CheckCash", CheckID: hex64(input.checkId, "check ID"), Amount: String(xah(input.xah, "amount")) },
    };
  }
  if (kind === "CheckCancel") {
    return {
      summary: "Cancel check",
      payment: null,
      tx: { TransactionType: "CheckCancel", CheckID: hex64(input.checkId, "check ID") },
    };
  }
  if (kind === "AccountSet") {
    const domain = String(input.domain || "").trim();
    if (!/^[A-Za-z0-9.-]{1,128}$/.test(domain)) throw new Error("enter a domain such as example.com");
    const hex = [...domain].map((char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
    return { summary: `Set domain ${domain}`, payment: null, tx: { TransactionType: "AccountSet", Domain: hex } };
  }
  if (kind === "SetRegularKey") {
    const regular = String(input.regular || "").trim();
    const tx = { TransactionType: "SetRegularKey" };
    if (regular) tx.RegularKey = address(regular, "regular key");
    return { summary: regular ? `Set regular key ${regular}` : "Clear the regular key", payment: null, tx };
  }
  if (kind === "DepositPreauth") {
    const authorize = address(input.authorize, "authorized account");
    return { summary: `Preauthorize ${authorize}`, payment: null, tx: { TransactionType: "DepositPreauth", Authorize: authorize } };
  }
  if (kind === "DepositPreauthRevoke") {
    const unauthorize = address(input.unauthorize, "account");
    return { summary: `Revoke ${unauthorize}`, payment: null, tx: { TransactionType: "DepositPreauth", Unauthorize: unauthorize } };
  }
  if (kind === "TicketCreate") {
    const count = uint(input.count, "ticket count", 250);
    return { summary: `Create ${count} tickets`, payment: null, tx: { TransactionType: "TicketCreate", TicketCount: count } };
  }
  if (kind === "Invoke") {
    const destination = String(input.destination || "").trim();
    const tx = { TransactionType: "Invoke" };
    if (destination) tx.Destination = address(destination, "destination");
    return { summary: destination ? `Invoke ${destination}` : "Invoke your own hook", payment: null, tx };
  }
  if (kind === "AccountDelete") {
    const destination = address(input.destination, "destination");
    return { summary: `Delete account and send the remainder to ${destination}`, payment: null, tx: { TransactionType: "AccountDelete", Destination: destination } };
  }
  if (kind === "URITokenMint") {
    const uri = String(input.uri || "").trim();
    const tx = { TransactionType: "URITokenMint", URI: uriToHex(uri) };
    if (input.burnable === "1" || input.burnable === "true") tx.Flags = 1;
    const price = String(input.xah || "").trim();
    if (price) tx.Amount = String(xah(price, "price"));
    const buyer = String(input.destination || "").trim();
    if (buyer) tx.Destination = address(buyer, "buyer");
    if (tx.Destination && !tx.Amount) throw new Error("a private sale needs a price");
    return { summary: `Mint ${uri}`, payment: null, tx };
  }
  if (kind === "URITokenBurn") {
    const id = hex64(input.id, "token");
    return { summary: `Burn URI token ${id}`, payment: null, tx: { TransactionType: "URITokenBurn", URITokenID: id } };
  }
  if (kind === "URITokenCreateSellOffer") {
    const id = hex64(input.id, "token");
    const priced = saleAmount(input, "price");
    if (priced.amount === "0" && !priced.buyer) throw new Error("a free transfer needs a recipient");
    const tx = {
      TransactionType: "URITokenCreateSellOffer",
      URITokenID: id,
      Amount: priced.amount,
    };
    if (priced.buyer) tx.Destination = address(priced.buyer, "buyer");
    return { summary: `Sell URI token ${id} for ${priced.text}`, payment: null, tx };
  }
  if (kind === "URITokenCancelSellOffer") {
    const id = hex64(input.id, "token");
    return { summary: `Cancel the sale of URI token ${id}`, payment: null, tx: { TransactionType: "URITokenCancelSellOffer", URITokenID: id } };
  }
  if (kind === "URITokenBuy") {
    const id = hex64(input.id, "token");
    const priced = saleAmount(input, "price");
    if (priced.amount === "0" && priced.buyer) throw new Error("a buy has no recipient");
    return {
      summary: `Buy URI token ${id} for ${priced.text}`,
      payment: null,
      tx: { TransactionType: "URITokenBuy", URITokenID: id, Amount: priced.amount },
    };
  }
  throw new Error("choose a transaction type");
}
