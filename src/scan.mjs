// What a scanned code can ask the wallet to sign. The phone still has to
// approve it with the passkey. The code never carries a seed.

import { dropsToXah } from "./protocol.mjs";

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const DETECT_HOSTS = new Set(["xaman.app", "www.xaman.app", "xumm.app", "www.xumm.app"]);

export function isAddress(value) {
  return ADDRESS.test(String(value || "").trim());
}

const SALE_ORIGIN = "https://shortthefomo.github.io";
const SALE_PATH = "/p-256-bootloader/sale.html";

// A public page. account is the owner. id, when present, is one URI token.
export function saleLink(account, id = "") {
  if (!isAddress(account)) return "";
  const url = new URL(SALE_PATH, SALE_ORIGIN);
  url.searchParams.set("account", account);
  const token = String(id || "").trim().toUpperCase();
  if (!token) return url.href;
  if (!/^[0-9A-F]{64}$/.test(token)) return "";
  url.searchParams.set("id", token);
  return url.href;
}

export function tweetLink(page, message) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", String(message || ""));
  url.searchParams.set("url", String(page || ""));
  return url.href;
}

function saleFromUrl(url) {
  if (url.protocol !== "https:" || url.hostname !== "shortthefomo.github.io") return null;
  if (url.pathname !== SALE_PATH) return null;
  const account = url.searchParams.get("account") || "";
  if (!isAddress(account)) return null;
  const id = String(url.searchParams.get("id") || "").trim().toUpperCase();
  if (id && !/^[0-9A-F]{64}$/.test(id)) return null;
  return { type: "sale", account, id };
}

export function shortAddress(address) {
  const text = String(address || "");
  if (text.length < 12) return text;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

export function currencyLabel(code) {
  const text = String(code || "");
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function formatAmount(value) {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value)) return "";
    return `${dropsToXah(value)} XAH`;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  if (value.value == null || value.currency == null) return "";
  const body = `${value.value} ${currencyLabel(value.currency)}`;
  return value.issuer ? `${body} · ${shortAddress(value.issuer)}` : body;
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  if (json.length > 1400) throw new Error("this transaction is too large for a QR code");
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(encoded) {
  const clean = String(encoded || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean || !/^[A-Za-z0-9+/]+$/.test(clean)) return null;
  const pad = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  let bin;
  try {
    bin = atob(pad);
  } catch {
    return null;
  }
  if (bin.length > 2000) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!body || body.v !== 1 || typeof body.k !== "string" || !body.f || typeof body.f !== "object" || Array.isArray(body.f)) {
    return null;
  }
  if (body.a && !isAddress(body.a)) return null;
  const values = {};
  for (const [key, value] of Object.entries(body.f)) {
    if (typeof value !== "string" || value.length > 200) return null;
    values[key] = value;
  }
  return {
    account: body.a || "",
    kind: body.k,
    values,
    returnTo: typeof body.r === "string" ? body.r : "",
  };
}

function pageUrl(page) {
  const url = new URL(page);
  url.search = "";
  url.hash = "";
  return url;
}

function shellParam(shell) {
  return shell === "phone" || shell === "desk" ? shell : "";
}

export function payLink({ page, account = "", dest, xah, returnTo = "", logged = false, shell = "" }) {
  const url = pageUrl(page);
  const query = new URLSearchParams();
  query.set("op", "pay");
  if (account) query.set("account", account);
  query.set("dest", dest);
  query.set("xah", xah);
  if (returnTo) query.set("return", returnTo);
  if (logged) query.set("logged", "1");
  if (shellParam(shell)) query.set("shell", shellParam(shell));
  url.search = query.toString();
  return url.href;
}

export function requestLink({ page, account, kind, values, returnTo = "", logged = false, shell = "" }) {
  const url = pageUrl(page);
  const query = new URLSearchParams();
  query.set("op", "qr");
  if (logged) query.set("logged", "1");
  if (shellParam(shell)) query.set("shell", shellParam(shell));
  url.search = query.toString();
  const payload = { v: 1, a: account, k: kind, f: values };
  if (returnTo) payload.r = returnTo;
  url.hash = `p=${encodePayload(payload)}`;
  return url.href;
}

const SIGNER_PAGE = "https://shortthefomo.github.io/p-256-bootloader/";
const WALLET_HOST = "https://pwa.passkey.xahau-dev.net";

// The working wallet is the account page. A section name is a hash on that
// page. This host only creates a wallet, attaches the bootloader, or signs.
export function walletLink(account, op = "") {
  if (!isAddress(account)) return "";
  const base = `${WALLET_HOST}/${account}`;
  if (!op || op === "home" || op === "shop") return base;
  return `${base}#${op}`;
}

// Camera and Face ID cannot run inside the sandboxed account page.
export function toolLink(account, op) {
  if (!isAddress(account) || !op) return "";
  const url = new URL(SIGNER_PAGE);
  url.searchParams.set("op", op);
  url.searchParams.set("account", account);
  url.searchParams.set("return", `${WALLET_HOST}/${account}`);
  return url.href;
}

// A listed token's QR is the buy the scanner signs. The buyer is chosen
// when the code is scanned, so the seller's account stays out of it.
export function buyOfferLink(token) {
  const id = String(token?.id || "").trim().toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) return "";
  const amount = token?.amount;
  const values = { id };
  if (typeof amount === "string") {
    if (!/^\d+$/.test(amount)) return "";
    values.xah = dropsToXah(amount);
  } else if (amount && typeof amount === "object" && !Array.isArray(amount) && amount.value && amount.currency) {
    values.xah = String(amount.value);
    values.currency = String(amount.currency);
    if (amount.issuer) values.issuer = String(amount.issuer);
  } else {
    return "";
  }
  return requestLink({ page: SIGNER_PAGE, account: "", kind: "URITokenBuy", values });
}

function hexBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function kindFromTx(tx) {
  if (!tx || typeof tx !== "object") return null;
  if (tx.TransactionType === "Payment" && isAddress(tx.Destination) && typeof tx.Amount === "string" && /^\d+$/.test(tx.Amount)) {
    return { kind: "Payment", values: { destination: tx.Destination, xah: dropsToXah(tx.Amount) } };
  }
  const limit = tx.LimitAmount;
  if (tx.TransactionType === "TrustSet" && limit && typeof limit === "object") {
    return {
      kind: "TrustSet",
      values: {
        issuer: String(limit.issuer || ""),
        currency: String(limit.currency || ""),
        limit: String(limit.value || ""),
      },
    };
  }
  return null;
}

function detectTx(url) {
  if (!DETECT_HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "detect" || !parts[1]) return null;
  const hex = parts[1];
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 || hex.length > 4000) return null;
  let tx;
  try {
    tx = JSON.parse(new TextDecoder().decode(hexBytes(hex)));
  } catch {
    return null;
  }
  return kindFromTx(tx);
}

export function parseScan(text) {
  const raw = String(text || "").trim();
  if (isAddress(raw)) return { type: "address", address: raw };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { type: "unknown" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { type: "unknown" };
  const sale = saleFromUrl(url);
  if (sale) return sale;
  const detected = detectTx(url);
  if (detected) return { type: "qr", account: "", returnTo: "", ...detected };
  const parts = url.pathname.split("/").filter(Boolean);
  if (DETECT_HOSTS.has(url.hostname) && parts[0] === "sign") return { type: "xaman-payload" };
  const op = url.searchParams.get("op");
  if (op === "pay") {
    return {
      type: "pay",
      account: url.searchParams.get("account") || "",
      dest: url.searchParams.get("dest") || "",
      xah: url.searchParams.get("xah") || "",
      returnTo: url.searchParams.get("return") || "",
    };
  }
  if (op === "qr") {
    const payload = decodePayload(new URLSearchParams(url.hash.replace(/^#/, "")).get("p") || "");
    if (!payload) return { type: "unknown" };
    return { type: "qr", ...payload };
  }
  if (op === "sign" || op === "scan" || op === "receive") {
    return { type: op, account: url.searchParams.get("account") || "" };
  }
  return { type: "unknown" };
}

export function describeTx(entry) {
  const tx = entry?.tx_json || entry?.tx || entry || {};
  const meta = entry?.meta || entry?.metaData || {};
  const type = tx.TransactionType || "Transaction";
  const hash = entry?.hash || tx.hash || "";
  const ledger = Number(entry?.ledger_index || tx.ledger_index || 0);
  const result = meta.TransactionResult || "";
  const ok = result === "" || result === "tesSUCCESS";
  const destination = tx.Destination || "";
  const amount = typeof tx.Amount === "string" ? tx.Amount : "";
  const tokenId = String(tx.URITokenID || "").toUpperCase();
  let shown = "";
  if (type === "OfferCreate") {
    const gives = formatAmount(tx.TakerGets);
    const wants = formatAmount(tx.TakerPays);
    shown = gives && wants ? `${gives} for ${wants}` : (gives || wants);
  } else {
    const delivered = type === "Payment" ? (meta.delivered_amount ?? meta.DeliveredAmount) : null;
    const moved = delivered && delivered !== "unavailable" ? formatAmount(delivered) : "";
    shown = moved || formatAmount(tx.Amount) || formatAmount(tx.LimitAmount) || formatAmount(tx.SendMax);
  }
  let line = type;
  if (shown) line += ` · ${shown}`;
  if (destination) line += ` to ${shortAddress(destination)}`;
  return { type, hash, ledger, ok, destination, amount, tokenId, line, account: tx.Account || "" };
}

export function samePayment(row, { dest, drops }) {
  return Boolean(row?.ok && row.hash)
    && row.type === "Payment"
    && row.destination === dest
    && row.amount === String(drops);
}

// A desktop handoff may confirm only the transaction it showed. Payments keep
// the amount check. Other types match the type, and the destination when the
// transaction has one.
export function sameTransaction(row, account, watch) {
  if (!row?.ok || !row.hash || row.account !== account) return false;
  if (watch?.drops != null) return samePayment(row, watch);
  if (!watch?.type || row.type !== watch.type) return false;
  if (watch.destination && row.destination !== watch.destination) return false;
  if (watch.token && String(row.tokenId || "").toUpperCase() !== String(watch.token).toUpperCase()) return false;
  return true;
}
