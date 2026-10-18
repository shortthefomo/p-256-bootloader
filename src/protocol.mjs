// Passkey payload, memo, and seed vault. Shared by the node tests and the signer page.
// The memo layout matches passkey_p256_firewall v2 (commit 17dc923).

export const MAGIC = "xahau.passkey.v2";
export const PAYLOAD_LEN = 53;
export const MAX_AUTH_LEN = 128;
export const MAX_CLIENT_DATA = 208;
export const TX_KIND = 2;
export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const DEVICE_FLAGS = FLAG_UP | FLAG_UV;

const subtle = () => globalThis.crypto.subtle;

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToHex(bytes) {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

export function hexToBytes(hex) {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function asciiHex(text) {
  return bytesToHex(new TextEncoder().encode(text));
}

export function utf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function writeU32(bytes, offset, value) {
  const n = Number(value);
  bytes[offset] = (n >>> 24) & 0xff;
  bytes[offset + 1] = (n >>> 16) & 0xff;
  bytes[offset + 2] = (n >>> 8) & 0xff;
  bytes[offset + 3] = n & 0xff;
}

function writeU64(bytes, offset, value) {
  let n = BigInt(value);
  for (let i = 7; i >= 0; i--) {
    bytes[offset + i] = Number(n & 0xffn);
    n >>= 8n;
  }
}

// 53-byte payment challenge. Sequence is a uint32 stored in the low half of a uint64.
export function buildPaymentPayload({ direction, sequence, counterparty, drops }) {
  if (direction !== 0 && direction !== 1) throw new Error("direction must be 0 or 1");
  const other = counterparty instanceof Uint8Array ? counterparty : new Uint8Array(counterparty);
  if (other.length !== 20) throw new Error("counterparty must be 20 bytes");
  const payload = new Uint8Array(PAYLOAD_LEN);
  payload.set(new TextEncoder().encode(MAGIC), 0);
  payload[16] = direction;
  writeU32(payload, 21, sequence);
  payload.set(other, 25);
  writeU64(payload, 45, drops);
  return payload;
}

// 53-byte challenge for every gated transaction that is not a payment.
export function buildTxPayload({ sequence, txHash }) {
  const hash = txHash instanceof Uint8Array ? txHash : new Uint8Array(txHash);
  if (hash.length !== 32) throw new Error("tx hash must be 32 bytes");
  const payload = new Uint8Array(PAYLOAD_LEN);
  payload.set(new TextEncoder().encode(MAGIC), 0);
  payload[16] = TX_KIND;
  writeU32(payload, 17, sequence);
  payload.set(hash, 21);
  return payload;
}

export function base64url(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(bytes) {
  return new Uint8Array(await subtle().digest("SHA-256", bytes));
}

export async function softwarePasskey() {
  const key = await subtle().generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const raw = new Uint8Array(await subtle().exportKey("raw", key.publicKey));
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error("expected uncompressed P-256 key");
  const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", key.privateKey));
  return { x: raw.slice(1, 33), y: raw.slice(33, 65), raw, pkcs8 };
}

export function clientDataJSON({ payload, origin, type = "webauthn.get" }) {
  const challenge = base64url(payload);
  if (challenge.length !== 71) throw new Error(`challenge must be 71 chars, got ${challenge.length}`);
  const json = `{"type":"${type}","challenge":"${challenge}","origin":"${origin}","crossOrigin":false}`;
  return new TextEncoder().encode(json);
}

export async function authenticatorData({ rpId, flags = DEVICE_FLAGS, signCount = 0 }) {
  const rpIdHash = await sha256(new TextEncoder().encode(rpId));
  const auth = new Uint8Array(37);
  auth.set(rpIdHash, 0);
  auth[32] = flags & 0xff;
  writeU32(auth, 33, signCount);
  return { auth, rpIdHash };
}

async function signP256(pkcs8, message) {
  const key = await subtle().importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, key, message),
  );
  if (sig.length !== 64) throw new Error(`expected 64-byte signature, got ${sig.length}`);
  return sig;
}

// Software stand-in for navigator.credentials.get. WebCrypto hashes `message`,
// so the signed bytes are authenticatorData || SHA-256(clientDataJSON).
export async function signWebAuthn({ pkcs8, payload, rpId, origin, flags = DEVICE_FLAGS }) {
  const clientData = clientDataJSON({ payload, origin });
  const { auth, rpIdHash } = await authenticatorData({ rpId, flags });
  const clientDataHash = await sha256(clientData);
  const message = concat([auth, clientDataHash]);
  const sig = await signP256(pkcs8, message);
  return { clientData, auth, rpIdHash, sig };
}

export function memoFromWebAuthn({ auth, clientData, sig }) {
  if (auth.length < 37 || auth.length > MAX_AUTH_LEN) {
    throw new Error(`authenticatorData must be 37 to ${MAX_AUTH_LEN} bytes`);
  }
  if (clientData.length < 1 || clientData.length > MAX_CLIENT_DATA) {
    throw new Error(`clientDataJSON must be 1 to ${MAX_CLIENT_DATA} bytes`);
  }
  if (sig.length !== 64) throw new Error("signature must be 64 bytes");
  const body = new Uint8Array(2 + auth.length + 2 + clientData.length + 64);
  body[0] = (auth.length >> 8) & 0xff;
  body[1] = auth.length & 0xff;
  body.set(auth, 2);
  const jsonAt = 2 + auth.length;
  body[jsonAt] = (clientData.length >> 8) & 0xff;
  body[jsonAt + 1] = clientData.length & 0xff;
  body.set(clientData, jsonAt + 2);
  body.set(sig, jsonAt + 2 + clientData.length);
  return {
    Memo: {
      MemoType: asciiHex(MAGIC),
      MemoData: bytesToHex(body),
    },
  };
}

function derInteger(bytes) {
  let value = bytes;
  if (value.length === 33) {
    if (value[0] !== 0x00) throw new Error("DER integer is too wide");
    value = value.slice(1);
  }
  if (value.length === 0 || value.length > 32) throw new Error("DER integer does not fit");
  const out = new Uint8Array(32);
  out.set(value, 32 - value.length);
  return out;
}

// WebAuthn assertion signatures are DER SEQUENCE { INTEGER r, INTEGER s }.
export function derToRaw(der) {
  const buf = der instanceof Uint8Array ? der : new Uint8Array(der);
  if (buf.length < 8 || buf[0] !== 0x30) throw new Error("DER signature must start with SEQUENCE");
  let i = 2;
  let seqLen = buf[1];
  if (buf[1] & 0x80) {
    if ((buf[1] & 0x7f) !== 1) throw new Error("DER length is too wide");
    seqLen = buf[2];
    i = 3;
  }
  if (i + seqLen !== buf.length) throw new Error("DER length mismatch");
  if (buf[i] !== 0x02) throw new Error("DER signature is missing r");
  const rLen = buf[i + 1];
  const r = buf.slice(i + 2, i + 2 + rLen);
  i += 2 + rLen;
  if (i >= buf.length || buf[i] !== 0x02) throw new Error("DER signature is missing s");
  const sLen = buf[i + 1];
  const s = buf.slice(i + 2, i + 2 + sLen);
  if (i + 2 + sLen !== buf.length) throw new Error("DER signature has trailing bytes");
  return concat([derInteger(r), derInteger(s)]);
}

export function xyFromSpki(spki) {
  const bytes = new Uint8Array(spki);
  if (bytes.length < 65 || bytes.at(-65) !== 0x04) throw new Error("passkey is not P-256");
  const point = bytes.slice(-65);
  return { x: point.slice(1, 33), y: point.slice(33, 65) };
}

export function xyFromAuthenticatorData(authData) {
  const bytes = new Uint8Array(authData);
  for (let i = 37; i + 70 <= bytes.length; i++) {
    if (
      bytes[i] === 0x21 &&
      bytes[i + 1] === 0x58 &&
      bytes[i + 2] === 0x20 &&
      bytes[i + 35] === 0x22 &&
      bytes[i + 36] === 0x58 &&
      bytes[i + 37] === 0x20
    ) {
      return { x: bytes.slice(i + 3, i + 35), y: bytes.slice(i + 38, i + 70) };
    }
  }
  throw new Error("could not read the passkey public key");
}

export async function prfSalt(accountId) {
  const prefix = new TextEncoder().encode("xahau.passkey.v2.vault\0");
  const material = new Uint8Array(prefix.length + accountId.length);
  material.set(prefix, 0);
  material.set(accountId, prefix.length);
  return sha256(material);
}

export async function sealSeed(prf, seed) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await subtle().importKey("raw", prf, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(seed)),
  );
  return concat([Uint8Array.of(1), iv, ct]);
}

export async function openSeed(prf, vault) {
  if (vault.length < 1 + 12 + 16 || vault[0] !== 1) throw new Error("sealed seed is not version 1");
  const key = await subtle().importKey("raw", prf, "AES-GCM", false, ["decrypt"]);
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: vault.slice(1, 13) },
    key,
    vault.slice(13),
  );
  return utf8(new Uint8Array(plain));
}

export function readMeta(html, name) {
  const match = html.match(new RegExp(`<meta name="${name}" content="([0-9A-Fa-f]*)">`));
  return match ? match[1] : "";
}

export function dropsToXah(drops) {
  const n = BigInt(drops);
  const whole = n / 1000000n;
  const frac = (n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

export function xahToDrops(text) {
  const trimmed = String(text).trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) throw new Error("enter an amount with at most 6 decimals");
  const [whole, frac = ""] = trimmed.split(".");
  const drops = BigInt(whole) * 1000000n + BigInt((frac + "000000").slice(0, 6));
  if (drops <= 0n) throw new Error("amount must be greater than 0");
  if (drops > 100000000000000000n) throw new Error("amount is too large");
  return drops;
}
