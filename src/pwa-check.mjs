// The served-page check from harness-pwa. SHA-512Half is the first 32 bytes of
// SHA-512, uppercase hex. pwa_validate compares that digest with the account's
// current AppLoader. The caller supplies the document bytes and an rpc that
// returns the command result.

export const PORTAL_ZONES = [
  "pwa.exposed",
  "pwa.passkey.xahau-dev.net",
  "pwa.pwapp.xahau-dev.net",
];

export const NETWORKS = {
  21338: { name: "testnet", rpcs: ["https://xahau-test.net"] },
  21339: { name: "passkey-dev", rpcs: ["https://rpc.passkey.xahau-dev.net"] },
  21337: { name: "mainnet", rpcs: ["https://xahau.network", "https://xahau.org"] },
};

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const LABELED = /^pwa(\d+)\.(.+)$/;

export function defaultRpcs(networkId) {
  const known = NETWORKS[Number(networkId)];
  return known ? known.rpcs.slice() : NETWORKS[21338].rpcs.slice();
}

export function isPortalHost(host, zones = PORTAL_ZONES) {
  const name = String(host || "").toLowerCase().replace(/\.$/, "");
  if (zones.includes(name)) return true;
  const labeled = name.match(LABELED);
  return !!(labeled && zones.includes(labeled[2]));
}

export function parsePwaUrl(input) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  const account = parts.length === 1 && ADDRESS.test(parts[0]) ? parts[0] : null;
  const labeled = host.match(LABELED);
  return {
    href: url.href,
    host,
    account,
    accountIndex: labeled ? labeled[1] : null,
    zone: labeled ? labeled[2] : null,
  };
}

export function hexIndexToDecimal(hex) {
  return BigInt(`0x${String(hex).replace(/^0x/i, "")}`).toString(10);
}

export function stripEtag(value) {
  if (!value) return "";
  return String(value).trim().replace(/^W\//i, "").replaceAll('"', "").toUpperCase();
}

export function addressesFromTxt(chunks) {
  const found = [];
  for (const chunk of chunks) {
    const text = String(chunk).replace(/^"|"$/g, "");
    for (const hit of text.match(/r[1-9A-HJ-NP-Za-km-z]{24,34}/g) || []) found.push(hit);
  }
  const unique = [...new Set(found)];
  return unique.length === 1 ? unique[0] : null;
}

export async function sha512Half(bytes) {
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-512", data);
  let hex = "";
  for (const byte of new Uint8Array(digest).subarray(0, 32)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
}

function asBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  return new TextEncoder().encode(String(bytes ?? ""));
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!clean || clean.length % 2) throw new Error("AppLoader hex is malformed");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("AppLoader hex is malformed");
    out[i] = byte;
  }
  return out;
}

function sameBytes(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function headersFromGetter(get) {
  const read = (name) => get(name) || "";
  return {
    type: read("content-type"),
    csp: read("content-security-policy"),
    frame: read("x-frame-options"),
    cache: read("cache-control"),
    etag: read("etag"),
    networkId: read("x-networkid"),
    ledgerSeq: read("x-ledgerseq"),
    ledgerHash: read("x-ledgerhash"),
    pwaSeq: read("x-pwaseq"),
  };
}

function ledgerHashOf(result) {
  return String(result.ledger_hash || result.ledger?.ledger_hash || "").toUpperCase();
}

function loaderNode(result) {
  if (!result || typeof result !== "object") return null;
  return result.node || result;
}

async function inspectNode(rpc, { account, hash, bytes, domainName, headers }) {
  const node = {
    rpc: "wallet",
    hostid: "",
    networkId: null,
    valid: null,
    reason: "",
    ledgerIndex: null,
    appLoaderSequence: null,
    domainValid: null,
    domainReason: "",
    bytesMatch: null,
    previousTxnId: "",
    accountIndex: "",
    headerLedgerOk: null,
    histMatch: null,
    error: "",
  };
  const settled = await Promise.all([
    rpc("server_info", {}),
    rpc("pwa_validate", { account, hash }),
    rpc("pwa_validate", { account, hash, domain: domainName }),
    rpc("ledger_entry", { app_loader: account, ledger_index: "validated" }),
    rpc("account_info", { account, ledger_index: "validated" }),
  ].map((call) => call.then((result) => ({ result })).catch((error) => ({ error }))));

  const [info, validate, domain, entry, accountInfo] = settled;
  const infoBody = info.result?.info || info.result;
  if (infoBody && (infoBody.hostid || infoBody.network_id != null)) {
    node.hostid = infoBody.hostid || "";
    node.networkId = infoBody.network_id ?? null;
  }
  if (validate.error) node.error = validate.error.message;
  else if (validate.result?.status === "error") node.error = validate.result.error_message || validate.result.error;
  else if (validate.result) {
    node.valid = !!validate.result.valid;
    node.reason = validate.result.reason || "";
    node.ledgerIndex = validate.result.ledger_index ?? null;
    node.appLoaderSequence = validate.result.app_loader_sequence ?? null;
  }
  if (domain.result && domain.result.status !== "error") {
    node.domainValid = !!domain.result.valid;
    node.domainReason = domain.result.reason || "";
  }
  const published = loaderNode(entry.result);
  if (published?.AppLoader || published?.app_loader) {
    try {
      const blob = hexToBytes(published.AppLoader || published.app_loader);
      node.bytesMatch = sameBytes(blob, bytes);
      node.previousTxnId = String(published.PreviousTxnID || published.previous_txn_id || "").toUpperCase();
      node.appLoaderSequence = published.AppLoaderSequence ?? published.app_loader_sequence ?? node.appLoaderSequence;
    } catch (error) {
      node.error = node.error || error.message;
    }
  }
  const accountData = accountInfo.result?.account_data || accountInfo.result;
  if (accountData?.AccountIndex) node.accountIndex = hexIndexToDecimal(accountData.AccountIndex);

  if (headers.ledgerSeq && headers.ledgerHash && !node.error) {
    try {
      const ledger = await rpc("ledger", { ledger_index: Number(headers.ledgerSeq), transactions: false });
      if (ledger.status === "error") node.headerLedgerOk = null;
      else node.headerLedgerOk = ledgerHashOf(ledger) === headers.ledgerHash.toUpperCase();
    } catch {
      node.headerLedgerOk = null;
    }
  }

  if (node.bytesMatch === false && headers.ledgerSeq) {
    try {
      const historical = loaderNode(await rpc("ledger_entry", {
        app_loader: account,
        ledger_index: Number(headers.ledgerSeq),
      }));
      if (!historical?.AppLoader && !historical?.app_loader) node.histMatch = null;
      else node.histMatch = sameBytes(hexToBytes(historical.AppLoader || historical.app_loader), bytes);
    } catch {
      node.histMatch = null;
    }
  }
  return node;
}

function headerNotes(headers) {
  const notes = [];
  if (!headers.networkId) notes.push("Response had no X-NetworkID header.");
  if (!headers.ledgerSeq) notes.push("Response had no X-LedgerSeq header.");
  if (!headers.ledgerHash) notes.push("Response had no X-LedgerHash header.");
  if (!headers.pwaSeq) notes.push("Response had no X-PWASeq header.");
  if (!headers.etag) notes.push("ETag was absent on the document response. Proxies often strip it; the conditional check uses PreviousTxnID.");
  if (headers.csp && !/sandbox/i.test(headers.csp)) notes.push("Content-Security-Policy has no sandbox.");
  if (headers.csp && /allow-same-origin/i.test(headers.csp)) notes.push("Content-Security-Policy sandbox includes allow-same-origin.");
  if (!headers.csp) notes.push("Response had no Content-Security-Policy header.");
  if (headers.frame && headers.frame.toUpperCase() !== "DENY") notes.push(`X-Frame-Options is ${headers.frame}.`);
  if (!headers.frame) notes.push("Response had no X-Frame-Options header.");
  return notes;
}

export function judge(nodes, ctx) {
  const notes = [];
  const perNode = nodes.map((node) => judgeNode(node, ctx, notes));
  const live = perNode.filter((item) => item.verdict !== "unverifiable");
  if (!live.length) return { verdict: "unverifiable", notes };
  const rank = ["tampered", "header-mismatch", "unbound", "unendorsed", "no-loader", "stale", "ok"];
  for (const verdict of rank) {
    if (live.some((item) => item.verdict === verdict)) return { verdict, notes };
  }
  return { verdict: "unverifiable", notes };
}

function judgeNode(node, ctx, notes) {
  const tag = node.hostid ? `${node.rpc} (${node.hostid})` : node.rpc;
  if (node.error && node.valid == null && node.bytesMatch == null) {
    notes.push(`${tag}: ${node.error}`);
    return { verdict: "unverifiable" };
  }
  if (ctx.headers.networkId && node.networkId != null && Number(ctx.headers.networkId) !== Number(node.networkId)) {
    notes.push(`${tag}: node network ${node.networkId} is not X-NetworkID ${ctx.headers.networkId}.`);
    return { verdict: "unverifiable" };
  }
  if (ctx.urlIndex && node.accountIndex && ctx.urlIndex !== node.accountIndex) {
    notes.push(`${tag}: host pwa${ctx.urlIndex} is not this account's index ${node.accountIndex}.`);
    return { verdict: "tampered" };
  }

  const served = ctx.headers.ledgerSeq ? Number(ctx.headers.ledgerSeq) : null;
  const current = node.ledgerIndex == null ? null : Number(node.ledgerIndex);
  const mismatch = node.bytesMatch === false || (node.valid === false && node.reason === "hash mismatch");

  if (node.reason === "no loader" || (node.bytesMatch == null && node.valid === false && node.reason === "no loader")) {
    notes.push(`${tag}: account has no AppLoader.`);
    return { verdict: "no-loader" };
  }

  if (node.bytesMatch === true && node.valid === false) {
    notes.push(`${tag}: pwa_validate rejected bytes that match the AppLoader blob (${node.reason || "invalid"}).`);
    return { verdict: "tampered" };
  }
  if (node.bytesMatch === false && node.valid === true) {
    notes.push(`${tag}: pwa_validate accepted bytes that are not the AppLoader blob.`);
    return { verdict: "tampered" };
  }

  if (mismatch) {
    if (served != null && current != null && served > current) {
      notes.push(`${tag}: verify node is behind X-LedgerSeq ${served}.`);
      return { verdict: "unverifiable" };
    }
    if (node.histMatch === true) {
      notes.push(`${tag}: bytes match the document at ledger ${served}, not the current document.`);
      return { verdict: "stale" };
    }
    if (node.histMatch === false) {
      notes.push(`${tag}: bytes match neither the current document nor ledger ${served}.`);
      return { verdict: "tampered" };
    }
    if (served != null && current != null && served < current) {
      notes.push(`${tag}: hash mismatch, and X-LedgerSeq ${served} is behind ledger ${current}. History for that ledger was not available.`);
      return { verdict: "stale" };
    }
    notes.push(`${tag}: ${node.reason || "hash mismatch"}.`);
    return { verdict: "tampered" };
  }

  if (node.valid !== true && node.bytesMatch !== true) {
    notes.push(`${tag}: ${node.error || node.reason || "pwa_validate did not accept the hash"}.`);
    return { verdict: "unverifiable" };
  }

  if (ctx.requireDomain && node.domainValid !== true) {
    notes.push(node.domainValid === false
      ? `${tag}: bytes match, and Domain does not endorse ${ctx.domainName}.`
      : `${tag}: domain check did not succeed.`);
    return { verdict: node.domainValid === false ? "unendorsed" : "unverifiable" };
  }
  if (node.headerLedgerOk === false) {
    notes.push(`${tag}: X-LedgerHash is not the hash of ledger ${ctx.headers.ledgerSeq}.`);
    return { verdict: "header-mismatch" };
  }
  if (ctx.headers.pwaSeq && node.appLoaderSequence != null && Number(ctx.headers.pwaSeq) !== Number(node.appLoaderSequence)) {
    notes.push(`${tag}: X-PWASeq ${ctx.headers.pwaSeq} is not AppLoaderSequence ${node.appLoaderSequence}.`);
    return { verdict: "header-mismatch" };
  }
  const etag = stripEtag(ctx.headers.etag);
  if (etag && node.previousTxnId && etag !== node.previousTxnId) {
    notes.push(`${tag}: ETag is not PreviousTxnID ${node.previousTxnId}.`);
    return { verdict: "header-mismatch" };
  }
  if (node.bytesMatch == null) notes.push(`${tag}: pwa_validate accepted the hash. The AppLoader blob was not re-hashed locally.`);
  if (node.domainValid === false) notes.push(`${tag}: Domain does not endorse ${ctx.domainName}. A portal host does not need that endorsement.`);
  return { verdict: "ok" };
}

const EMPTY_HEADERS = {
  type: "", csp: "", frame: "", cache: "", etag: "", networkId: "", ledgerSeq: "", ledgerHash: "", pwaSeq: "",
};

export async function readDocument(url) {
  const response = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20000) });
  return {
    status: response.status,
    finalUrl: response.url || url,
    bytes: new Uint8Array(await response.arrayBuffer()),
    headers: headersFromGetter((name) => response.headers.get(name)),
  };
}

export async function refetchConditional(url, previous) {
  const response = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: { "if-none-match": `"${previous}"` },
    signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, etag: response.headers.get("etag") || "" };
}

// `bytes` are the document the browser was served. `headers`, when present,
// are that response. The portal does not let page script read them, so the
// wallet passes the bytes it captured and leaves the header comparisons out.
// `page` is the wallet document itself: an opaque origin that is not framed.
export async function checkServedPage({ href, bytes, rpc, headers = null, refetch = null, page = null }) {
  const parsed = parsePwaUrl(href);
  const account = parsed.account || "";
  if (!account) throw new Error("no r-address in the URL");
  const body = asBytes(bytes);
  const hash = await sha512Half(body);
  const seen = headers || EMPTY_HEADERS;
  const portal = isPortalHost(parsed.host);
  const node = await inspectNode(rpc, {
    account,
    hash,
    bytes: body,
    domainName: parsed.host,
    headers: seen,
  });
  const judged = judge([node], {
    headers: seen,
    requireDomain: !portal,
    domainName: parsed.host,
    urlIndex: parsed.accountIndex,
  });
  const notes = judged.notes.slice();
  let verdict = judged.verdict;
  if (headers) notes.push(...headerNotes(headers));
  else notes.push("Portal headers are not visible from this page. The check uses the page bytes, the account index, and the ledger document.");

  if (node.previousTxnId && !seen.etag && refetch) {
    try {
      const conditional = await refetch(node.previousTxnId);
      if (conditional?.status === 304) notes.push(`If-None-Match of PreviousTxnID returned 304. ETag ${stripEtag(conditional.etag) || node.previousTxnId}.`);
      else if (conditional?.status) notes.push(`If-None-Match of PreviousTxnID returned ${conditional.status}.`);
    } catch (error) {
      notes.push(`If-None-Match of PreviousTxnID failed. ${error.message || error}`);
    }
  }

  if (page && page.origin != null && page.origin !== "null") {
    notes.push("This page origin is not opaque. The sandbox is missing or includes allow-same-origin.");
    if (verdict === "ok") verdict = "header-mismatch";
  }
  if (page && page.top === false) {
    notes.push("This page is framed.");
    if (verdict === "ok") verdict = "header-mismatch";
  }

  return {
    verdict,
    notes,
    account,
    host: parsed.host,
    accountIndexUrl: parsed.accountIndex,
    portal,
    bytes: body.length,
    hash,
    headers: seen,
    nodes: [node],
  };
}
