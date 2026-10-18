// Xahau URI tokens. A Xahau Cards URI looks like
// xahaucards://XC-01-500-L-20-20-1 and the artwork is the code without the edition.

import { dropsToXah } from "./protocol.mjs";

const CARD = /^xahaucards:\/\/(XC-\d{2}-\d{3}-[A-Za-z]-\d{2}-\d{2})-(\d+)$/i;

export function uriToHex(text) {
  const bytes = new TextEncoder().encode(String(text || "").trim());
  if (!bytes.length || bytes.length > 256) throw new Error("the URI must be 1 to 256 bytes");
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function uriFromHex(hex) {
  const text = String(hex || "").trim();
  if (!text || !/^[0-9A-Fa-f]+$/.test(text) || text.length % 2) return text;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  const decoded = new TextDecoder().decode(bytes);
  return decoded.includes("\uFFFD") ? text.toUpperCase() : decoded;
}

export function cardCode(uri) {
  const match = CARD.exec(String(uri || "").trim());
  return match ? match[1].toUpperCase() : "";
}

export function cardEdition(uri) {
  const match = CARD.exec(String(uri || "").trim());
  return match ? match[2] : "";
}

export function cardArt(uri) {
  const code = cardCode(uri);
  return code ? `https://xahaucards.com/card/${code}.webp` : "";
}

export function normalizeUriToken(object) {
  const uri = uriFromHex(object?.URI || "");
  return {
    id: String(object?.index || "").toUpperCase(),
    uri,
    issuer: object?.Issuer || "",
    owner: object?.Owner || "",
    amount: object?.Amount ?? "",
    destination: object?.Destination || "",
    burnable: (Number(object?.Flags) & 1) === 1,
    art: cardArt(uri),
    code: cardCode(uri),
    edition: cardEdition(uri),
  };
}

// The token is on offer to this account right now. The owner cannot accept it.
export function heldOffer(account, token) {
  if (!account || !token || token.owner === account || token.destination !== account) return null;
  if (typeof token.amount !== "string" || !/^\d+$/.test(token.amount)) return null;
  return {
    id: token.id,
    drops: token.amount,
    xah: dropsToXah(token.amount),
    key: `${token.id}:${token.owner}:${token.amount}`,
  };
}

// A private sell offer still open for this account. The recipient accepts it
// with URITokenBuy. The ledger has no decline: only the owner can cancel.
export function incomingOffer(row, account, token) {
  if (!row?.ok || row.type !== "URITokenCreateSellOffer" || !token) return null;
  if (row.tokenId !== token.id || row.account !== token.owner || row.destination !== account) return null;
  if (row.amount !== token.amount) return null;
  return heldOffer(account, token);
}
