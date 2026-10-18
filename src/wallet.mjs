// Ledger calls and the transactions the signer submits.
// The hook wasm is passkey_p256_firewall v2. The sealed family
// seed lives in the AppLoader document (ciphertext). The hook never sees it.

import {
  MAX_AUTH_LEN,
  MAX_CLIENT_DATA,
  MAGIC,
  asciiHex,
  bytesToHex,
  buildPaymentPayload,
  buildTxPayload,
  hexToBytes,
  readMeta,
  sha256,
  utf8,
} from "./protocol.mjs";

export const NETWORK_ID = 21339;
export const RPC_HTTP = "https://rpc.passkey.xahau-dev.net";
export const RPC_WSS = "wss://passkey.xahau-dev.net";
export const FAUCET = "https://faucet.passkey.xahau-dev.net/accounts";
export const PWA_HOST = "https://pwa.passkey.xahau-dev.net";
// One list per network id. The first entry is the link on a transaction.
// Mainnet can hold several explorers once each transaction path is known.
export const EXPLORERS = {
  21339: [
    { name: "Passkey devnet", origin: "https://explorer.passkey.xahau-dev.net", txPath: "/tx/" },
  ],
};
export const EXPLORER = EXPLORERS[NETWORK_ID][0].origin;

export function explorerUrls(hash, explorers) {
  const text = String(hash || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text) || !Array.isArray(explorers)) return [];
  return explorers.map((item) => ({
    name: item.name,
    url: `${item.origin}${item.txPath}${text}`,
  }));
}

export function explorerLinks(hash, networkId = NETWORK_ID) {
  return explorerUrls(hash, EXPLORERS[networkId] || []);
}

export function txUrl(hash, networkId = NETWORK_ID) {
  return explorerLinks(hash, networkId)[0]?.url || "";
}
// "p256boot" then zeros, last byte 0x01. 32 bytes. Not a hook name: the hook
// stays unnamed so a transaction cannot skip it by omitting HookName.
export const NAMESPACE = "70323536626F6F74000000000000000000000000000000000000000000000001";
// Every type except GenesisMint, Amendment, Fee, UNLModify, EmitFailure, UNLReport.
// Bit 22 (SetHook) is the one active-high bit, so the hook sees SetHook.
export const HOOK_ON = "00000000000000000000000000000000000001F1000000000000000000400000";
export const WASM_PATH = "/passkey_p256_firewall_v2.wasm";
// The on-ledger page carries this rev. public/wallet.js offers an install
// when the published page has a different one. Bump both with the loader.
export const INTERFACE_REV = "2";
// SHA-512 of public/passkey_p256_firewall_v2.wasm, first 32 bytes. That is
// the HookHash a SetHook of this file produces.
export const HOOK_HASH = "BBCBC4186CC7A73493D4CF1E175153E4245D2FC1ED60641B8B47E4A93BECFF6B";

export function accountBytes(api, address) {
  const raw = api.libraries.rippleAddressCodec.decodeAccountID(address);
  const bytes = new Uint8Array(raw);
  if (bytes.length !== 20) throw new Error("address did not decode to 20 bytes");
  return bytes;
}

export async function rpcHttp(command, params = {}, url = RPC_HTTP) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: command, params: [params] }),
  });
  const body = await response.json();
  const result = body.result ?? body;
  if (result.error) {
    const error = new Error(result.error_message || result.error);
    error.code = result.error;
    throw error;
  }
  return result;
}

export function rpcSocket(url = RPC_WSS) {
  let socket = null;
  let next = 1;
  const pending = new Map();
  const listeners = new Set();
  const subscriptions = [];
  let opening = null;
  let retry = null;
  let retryWait = 1000;

  function failPending(error) {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }

  function send(command, params) {
    const id = next++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, command, ...params }));
    });
  }

  // Subscriptions are remembered so a dropped socket asks for them again.
  function announce() {
    if (!socket || socket.readyState !== 1) return;
    for (const sub of subscriptions) {
      if (sub.live) continue;
      sub.live = true;
      send("subscribe", sub.params).catch(() => {
        sub.live = false;
      });
    }
  }

  function connect() {
    if (socket && socket.readyState === 1) return Promise.resolve();
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const sock = new WebSocket(url);
      sock.onopen = () => {
        socket = sock;
        opening = null;
        retryWait = 1000;
        for (const sub of subscriptions) sub.live = false;
        resolve();
        announce();
      };
      sock.onerror = () => {
        opening = null;
        reject(new Error("cannot reach the network"));
      };
      sock.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        const waiter = message.id != null ? pending.get(message.id) : null;
        if (waiter) {
          pending.delete(message.id);
          if (message.status && message.status !== "success") {
            const error = new Error(message.error_message || message.error || message.status);
            error.code = message.error;
            waiter.reject(error);
          } else {
            waiter.resolve(message.result);
          }
          return;
        }
        for (const listener of listeners) {
          try {
            listener(message);
          } catch {
            // One listener cannot stop the others.
          }
        }
      };
      sock.onclose = () => {
        if (socket === sock) socket = null;
        failPending(new Error("connection closed"));
        if (!subscriptions.length) return;
        clearTimeout(retry);
        retry = setTimeout(() => {
          connect().catch(() => {});
        }, retryWait);
        retryWait = Math.min(retryWait * 2, 15000);
      };
    });
    return opening;
  }

  async function rpc(command, params = {}) {
    await connect();
    return send(command, params);
  }

  rpc.subscribe = (params, listener) => {
    const sub = { params, live: false };
    subscriptions.push(sub);
    listeners.add(listener);
    connect().then(announce).catch(() => {});
    return () => {
      const index = subscriptions.indexOf(sub);
      if (index >= 0) subscriptions.splice(index, 1);
      listeners.delete(listener);
      if (!subscriptions.length) clearTimeout(retry);
      if (socket && socket.readyState === 1) send("unsubscribe", params).catch(() => {});
    };
  };

  rpc.close = () => {
    subscriptions.splice(0, subscriptions.length);
    clearTimeout(retry);
    if (socket) socket.close();
    socket = null;
  };
  return rpc;
}

export async function networkDefinitions(api, rpc) {
  const raw = await rpc("server_definitions", {});
  const defs = raw.FIELDS ? raw : raw.result;
  if (!defs?.FIELDS) throw new Error("the network did not return protocol definitions");
  return new api.XrplDefinitions(defs);
}

export function hookEntries(namespace) {
  return namespace?.namespace_entries || namespace?.namespaceEntries || [];
}

// account_namespace returns a short key in the last bytes of the 32-byte key
// (5058 at the end for "PX"). A left-aligned key is accepted too.
export function stateValue(namespace, keyAscii) {
  const tag = asciiHex(keyAscii).toUpperCase();
  const aligned = tag.padStart(64, "0");
  const entry = hookEntries(namespace).find((item) => {
    const key = (item.HookStateKey || "").toUpperCase();
    return key === aligned || key.startsWith(tag);
  });
  return entry?.HookStateData || "";
}

// Unset LV is level 1. Level 3 gates SetHook, and the hook can only hash a
// transaction of at most 2048 bytes. Level 2 still gates payments and account
// changes, and it lets SetHook through, so an update can replace the hook in place.
export function hookLevel(namespace) {
  const raw = stateValue(namespace, "LV");
  if (!raw) return 1;
  const byte = Number.parseInt(raw.slice(0, 2), 16);
  return Number.isFinite(byte) ? byte : 3;
}

export function hookText(tx) {
  const meta = tx.meta || tx.metaData || {};
  const execs = meta.HookExecutions || [];
  return execs.map((entry) => {
    const ex = entry.HookExecution || entry;
    let text = ex.HookReturnString || "";
    if (/^[0-9A-Fa-f]+$/.test(text) && text.length % 2 === 0) {
      text = utf8(hexToBytes(text)).replace(/\0+$/, "");
    }
    return text;
  }).join(" | ");
}

export function txResultCode(tx) {
  return tx.meta?.TransactionResult || tx.metaData?.TransactionResult || tx.engine_result || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitTx(rpc, hash) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    try {
      const tx = await rpc("tx", { transaction: hash, binary: false });
      last = tx;
      if (tx.validated) return tx;
    } catch (error) {
      if (error.code && error.code !== "txnNotFound") throw error;
    }
    await sleep(1000);
  }
  if (last) return last;
  throw new Error("transaction was not validated");
}

export async function prepareFields(rpc, wallet, tx) {
  const ledger = await rpc("ledger", { ledger_index: "validated" });
  const prepared = {
    ...tx,
    Account: wallet.address,
    NetworkID: NETWORK_ID,
    Fee: tx.Fee || "0",
    LastLedgerSequence: tx.LastLedgerSequence ?? Number(ledger.ledger_index) + 100,
  };
  if (prepared.Sequence == null) {
    const info = await rpc("account_info", { account: wallet.address, ledger_index: "validated" });
    prepared.Sequence = info.account_data.Sequence;
  }
  return prepared;
}

// Worst passkey memo the hook will accept. The fee is one drop per memo byte,
// and a non-payment challenge includes Fee, so the quote has to cover the
// memo before the passkey exists.
function passkeyFeeMemo() {
  const dataBytes = 2 + MAX_AUTH_LEN + 2 + MAX_CLIENT_DATA + 64;
  return {
    Memo: {
      MemoType: asciiHex(MAGIC),
      MemoData: "00".repeat(dataBytes),
    },
  };
}

// A fee server can name any open_ledger_fee. Ordinary transactions stay under
// two XAH. Installing hook code pays 500 drops a byte, and twice that load
// still fits. Anything above this is refused before the seed signs.
const ORDINARY_FEE_CAP = 2n * 1000000n;

export function feeCeiling(tx) {
  const hooks = Array.isArray(tx?.Hooks) ? tx.Hooks : [];
  let bytes = 0n;
  for (const entry of hooks) {
    const code = entry?.Hook?.CreateCode;
    if (code == null || code === "") continue;
    if (typeof code !== "string" || code.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(code)) {
      throw new Error("hook code is not hex");
    }
    bytes += BigInt(code.length / 2);
  }
  if (bytes === 0n) return ORDINARY_FEE_CAP;
  return bytes * 500n * 2n + ORDINARY_FEE_CAP;
}

export async function requiredFee(api, rpc, tx, definitions) {
  const probe = { ...tx, Fee: "0", SigningPubKey: "" };
  delete probe.TxnSignature;
  delete probe.Signers;
  if (!probe.Memos) probe.Memos = [passkeyFeeMemo()];
  if (probe.Sequence == null) probe.Sequence = 1;
  if (probe.NetworkID == null) probe.NetworkID = NETWORK_ID;
  const cap = feeCeiling(probe);
  const blob = api.sign(probe, api.derive.passphrase(""), definitions).signedTransaction;
  const quoted = await rpc("fee", { tx_blob: blob });
  const drops = quoted.drops || {};
  if (drops.base_fee == null) throw new Error("the network did not return a fee");
  const base = BigInt(drops.base_fee);
  const open = BigInt(drops.open_ledger_fee ?? drops.base_fee);
  const fee = open > base ? open : base;
  if (fee <= 0n) throw new Error("the network did not return a fee");
  if (fee > cap) throw new Error("the network fee is higher than this transaction can cost");
  return fee.toString();
}

export async function submitTx(api, rpc, wallet, tx, definitions) {
  const prepared = await prepareFields(rpc, wallet, tx);
  if (!prepared.Fee || prepared.Fee === "0") {
    prepared.Fee = await requiredFee(api, rpc, prepared, definitions);
  }
  const signed = api.sign(prepared, wallet, definitions);
  const submitted = await rpc("submit", { tx_blob: signed.signedTransaction });
  const prelim = submitted.engine_result || "";
  if (/^te[mjlf]/.test(prelim)) {
    throw new Error(`${prelim} ${submitted.engine_result_message || ""}`.trim());
  }
  const validated = await waitTx(rpc, signed.id);
  return {
    hash: signed.id,
    prelim,
    result: txResultCode(validated),
    hook: hookText(validated),
    validated,
    sequence: prepared.Sequence,
  };
}

// The stock firewall imports util_sha256 and util_verify_p256. The 2026.10
// release does not provide those calls (xahaud PR 511). hook_validate reports
// that before SetHook spends the creation fee.
export async function firewallBlock(rpc, wasmHex) {
  let result;
  try {
    result = await rpc("hook_validate", { code: wasmHex });
  } catch (error) {
    if (error.code === "unknownCmd" || error.code === "notSupported") return "";
    throw error;
  }
  if (result?.valid) return "";
  const log = (result?.log || []).join(" ");
  if (log.includes("util_sha256") || log.includes("util_verify_p256")) {
    return "This network cannot check an iPhone signature. Its hook API has no util_sha256 or util_verify_p256, so the passkey firewall cannot be installed. Those calls are still in xahaud PR 511 and are not in the 2026.10 release. The wallet was not published.";
  }
  return log || "The firewall wasm was rejected by the network.";
}

export function setHookTx(wasmHex) {
  return {
    TransactionType: "SetHook",
    Hooks: [
      {
        Hook: {
          CreateCode: wasmHex,
          Flags: 1,
          HookApiVersion: 0,
          HookNamespace: NAMESPACE,
          HookOn: HOOK_ON,
        },
      },
    ],
  };
}

export function invokeTx(pairs) {
  return {
    TransactionType: "Invoke",
    HookParameters: pairs.map(([name, valueHex]) => ({
      HookParameter: {
        HookParameterName: asciiHex(name),
        HookParameterValue: valueHex,
      },
    })),
  };
}

// LV is one raw byte. Level 2 keeps the hook installed and lets SetHook through.
export function levelTx(level) {
  const byte = Number(level);
  if (byte !== 1 && byte !== 2 && byte !== 3) throw new Error("firewall level must be 1, 2, or 3");
  return invokeTx([["LV", byte.toString(16).padStart(2, "0")]]);
}

export function accountSetLoaderTx(html) {
  const bytes = new TextEncoder().encode(html);
  return {
    TransactionType: "AccountSet",
    AppLoader: bytesToHex(bytes),
  };
}

export async function canonicalHash(api, tx, wallet, definitions) {
  const body = { ...tx, SigningPubKey: wallet.keypair.publicKey };
  delete body.Memos;
  delete body.TxnSignature;
  delete body.Signers;
  return sha256(hexToBytes(api.binary.encode(body, definitions)));
}

export async function paymentChallenge(api, { sequence, destination, drops }) {
  return buildPaymentPayload({
    direction: 0,
    sequence,
    counterparty: accountBytes(api, destination),
    drops,
  });
}

export async function txChallenge(api, tx, wallet, definitions) {
  const hash = await canonicalHash(api, tx, wallet, definitions);
  return buildTxPayload({ sequence: tx.Sequence, txHash: hash });
}

export function loaderHtmlFromEntry(entry) {
  const node = entry.node || entry;
  const hex = node.AppLoader || node.app_loader || "";
  if (!hex) throw new Error("this account has no bootloader");
  return utf8(hexToBytes(hex));
}

export function vaultFromHtml(html) {
  return {
    vault: readMeta(html, "vault"),
    cid: readMeta(html, "cid"),
    spk: readMeta(html, "spk"),
  };
}

export function safeReturn(url, account) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const hostOk = parsed.hostname === "pwa.passkey.xahau-dev.net"
    || /^pwa\d+\.passkey\.xahau-dev\.net$/.test(parsed.hostname)
    || /^pwa\d+\.pwa\.passkey\.xahau-dev\.net$/.test(parsed.hostname);
  if (!hostOk) return null;
  if (parsed.pathname.replace(/\/$/, "") !== `/${account}`) return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
}

export function pwaUrl(account) {
  return `${PWA_HOST}/${account}`;
}
