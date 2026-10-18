import { loaderChanged, renderBootloader } from "./bootloader.mjs";
import { decodeImage, encodeQr } from "./qr.mjs";
import {
  currencyLabel,
  describeTx,
  isAddress,
  parseScan,
  payLink,
  requestLink,
  sameTransaction,
  shortAddress,
} from "./scan.mjs";
import { TX_KINDS, transactionFromKind } from "./tx-forms.mjs";
import { heldOffer, incomingOffer, normalizeUriToken } from "./uri-tokens.mjs";
import {
  asciiHex,
  base64url,
  bytesToHex,
  derToRaw,
  hexToBytes,
  memoFromWebAuthn,
  openSeed,
  prfSalt,
  readMeta,
  sealSeed,
  sha256,
  utf8,
  xahToDrops,
  xyFromAuthenticatorData,
  xyFromSpki,
} from "./protocol.mjs";
import { AMOUNT_FORMATS, LANGUAGES, canonicalAmount, formatDrops, translate } from "./locale.mjs";
import {
  FAUCET,
  HOOK_HASH,
  INTERFACE_REV,
  NAMESPACE,
  accountBytes,
  accountSetLoaderTx,
  explorerLinks,
  invokeTx,
  loaderHtmlFromEntry,
  networkDefinitions,
  paymentChallenge,
  prepareFields,
  pwaUrl,
  requiredFee,
  rpcSocket,
  safeReturn,
  txUrl,
  firewallBlock,
  hookLevel,
  levelTx,
  setHookTx,
  stateValue,
  submitTx,
  txChallenge,
  vaultFromHtml,
} from "./wallet.mjs";

const rpc = rpcSocket();
const app = document.querySelector("#app");
const nav = document.querySelector("#nav");
const params = new URLSearchParams(location.search);
const SEED_KEY = "p256-seed";
const ACCOUNT_KEY = "p256-account";
const SHELL_KEY = "p256-shell";
const THEME_KEY = "p256-theme";
const LANG_KEY = "p256-lang";
const FORMAT_KEY = "p256-format";
const RESTORE_KEY = "p256-restore-level";
let viewGen = 0;
let stopCamera = () => {};
let stopWatch = () => {};

function shell() {
  return document.documentElement.dataset.shell === "desk" ? "desk" : "phone";
}

function applyShell() {
  const saved = localStorage.getItem(SHELL_KEY);
  const auto = window.matchMedia("(max-width: 860px), (pointer: coarse)").matches ? "phone" : "desk";
  document.documentElement.dataset.shell = saved === "phone" || saved === "desk" ? saved : auto;
}

function savedAccount() {
  const text = localStorage.getItem(ACCOUNT_KEY) || "";
  return isAddress(text) ? text : "";
}

function rememberAccount(account) {
  if (isAddress(account)) localStorage.setItem(ACCOUNT_KEY, account);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function preference(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (allowed.includes(value)) return value;
  } catch {
    // This page keeps the default.
  }
  return fallback;
}

function language() {
  return preference(LANG_KEY, LANGUAGES.map((item) => item.id), "en");
}

function amountFormat() {
  return preference(FORMAT_KEY, AMOUNT_FORMATS.map((item) => item.id), "plain");
}

function text(key, vars) {
  return translate(language(), key, vars);
}

function showAmount(drops) {
  return formatDrops(drops, amountFormat());
}

function displayAmount(plain) {
  if (!plain) return "";
  try {
    return formatDrops(xahToDrops(plain), amountFormat());
  } catch {
    return plain;
  }
}

function themeLabel() {
  return document.documentElement.dataset.theme === "light" ? text("dark") : text("light");
}

function applyThemeLabels() {
  for (const button of document.querySelectorAll("button.theme")) button.textContent = themeLabel();
}

function themeButton() {
  return el("button", {
    class: "theme",
    type: "button",
    onclick: () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch { /* the page keeps the chosen theme */ }
      applyThemeLabels();
    },
  }, [themeLabel()]);
}

function screen(title, nodes, mode = "") {
  stopCamera();
  stopWatch();
  stopWatch = () => {};
  viewGen += 1;
  const heading = el("h1", {}, [title]);
  app.replaceChildren(
    el("header", { class: "top" }, shell() === "phone" ? [heading, themeButton()] : [heading]),
    el("div", { class: "view" }, nodes.filter(Boolean)),
  );
  if (mode) renderNav(mode);
  else {
    nav.hidden = true;
    nav.replaceChildren();
  }
}

async function pageIsStale(account) {
  try {
    const entry = await rpc("ledger_entry", { app_loader: account, ledger_index: "validated" });
    const published = loaderHtmlFromEntry(entry);
    const meta = vaultFromHtml(published);
    return loaderChanged(published, {
      signer: `${location.origin}${location.pathname}`,
      vault: meta.vault,
      cid: meta.cid,
      spk: meta.spk,
    });
  } catch {
    return false;
  }
}

function updateBanner(account) {
  const back = safeReturn(params.get("return") || "", account) || pwaUrl(account);
  return el("div", { class: "banner" }, [
    el("p", {}, [text("interfaceDiffers")]),
    el("button", {
      type: "button",
      onclick: () => republish(account, back).catch((error) => rejected(account, back, error)),
    }, [text("updateWallet")]),
  ]);
}

function chooseShell(value) {
  if (value !== "phone" && value !== "desk") return;
  if (value === shell()) return;
  try { localStorage.setItem(SHELL_KEY, value); } catch { /* the next load keeps the automatic layout */ }
  location.reload();
}

function say(parent, text, className = "muted") {
  const p = el("p", { class: className }, [text]);
  parent.append(p);
  return p;
}

function originOk() {
  const origin = location.origin;
  if (location.protocol !== "https:") {
    return "Open https://shortthefomo.github.io/p-256-bootloader/ in Safari. Face ID needs that https origin.";
  }
  if (origin.length < 8 || origin.length > 64) {
    return `This origin is ${origin.length} characters. The hook stores origins of 8 to 64 characters, and this one does not fit.`;
  }
  return "";
}

function prfResult(credential) {
  const first = credential.getClientExtensionResults?.().prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}

function publicXY(credential) {
  const spki = credential.response.getPublicKey?.();
  if (spki) return xyFromSpki(spki);
  return xyFromAuthenticatorData(credential.response.getAuthenticatorData?.() || credential.response.authenticatorData);
}

async function createPasskey(address, accountId, salt) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Xahau", id: location.hostname },
      user: { id: accountId, name: address, displayName: address },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      timeout: 60000,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  if (!credential) throw new Error("no passkey was created");
  return credential;
}

async function getPasskey(challenge, salt, credentialId) {
  const publicKey = {
    challenge,
    rpId: location.hostname,
    userVerification: "required",
    timeout: 60000,
    extensions: { prf: { eval: { first: salt } } },
  };
  if (credentialId?.length) {
    publicKey.allowCredentials = [{ type: "public-key", id: credentialId }];
  }
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error("the passkey was not used");
  return credential;
}

function assertionParts(credential) {
  const response = credential.response;
  const auth = new Uint8Array(response.authenticatorData);
  const clientData = new Uint8Array(response.clientDataJSON);
  const sig = derToRaw(new Uint8Array(response.signature));
  return memoFromWebAuthn({ auth, clientData, sig });
}

// The seed signs only after this assertion names this transaction, this site,
// and a user the authenticator verified. The browser bytes still go to the hook.
async function assertAssertion(credential, challenge) {
  const response = credential?.response;
  let client;
  try {
    client = JSON.parse(new TextDecoder().decode(response.clientDataJSON));
  } catch {
    throw new Error("the passkey approved a different transaction");
  }
  if (!client || client.type !== "webauthn.get" || client.challenge !== base64url(challenge)) {
    throw new Error("the passkey approved a different transaction");
  }
  if (client.origin !== location.origin) throw new Error("the passkey was used for a different site");
  if (client.crossOrigin !== false) throw new Error("the passkey was used inside another site");
  const auth = new Uint8Array(response.authenticatorData || []);
  if (auth.length < 37) throw new Error("the passkey did not verify you");
  const rp = await sha256(new TextEncoder().encode(location.hostname));
  for (let i = 0; i < 32; i += 1) {
    if (auth[i] !== rp[i]) throw new Error("the passkey was used for a different site");
  }
  if ((auth[32] & 0x05) !== 0x05) throw new Error("the passkey did not verify you");
}

function idb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("p256-wallet", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("seeds");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberSeed(account, seed) {
  const db = await idb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("seeds", "readwrite");
    tx.objectStore("seeds").put(seed, account);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function recallSeed(account) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("seeds", "readonly");
    const request = tx.objectStore("seeds").get(account);
    request.onsuccess = () => resolve(request.result || "");
    request.onerror = () => reject(request.error);
  });
}

async function wasmHex() {
  const response = await fetch(new URL("../passkey_p256_firewall_v2.wasm", import.meta.url));
  if (!response.ok) throw new Error("the firewall hook is missing from this wallet");
  return bytesToHex(new Uint8Array(await response.arrayBuffer()));
}

function walletFromSeed(seed) {
  const wallet = globalThis.XrplAccountLib.derive.familySeed(seed.trim());
  if (!wallet?.address || !wallet.keypair?.privateKey) throw new Error("that seed is not a family seed");
  return wallet;
}

async function runSteps(lines, steps) {
  const list = el("ol", { id: "log" });
  screen("Working", [list]);
  for (const step of steps) {
    const item = el("li", {}, [`${step.label}…`]);
    list.append(item);
    try {
      const detail = await step.run();
      const link = detail ? txUrl(detail) : "";
      item.replaceChildren(document.createTextNode(detail ? `${step.label}. ` : `${step.label}.`));
      if (link) item.append(el("a", { href: link, target: "_blank", rel: "noopener" }, [shortAddress(detail)]));
      else if (detail) item.append(document.createTextNode(detail));
      if (detail) lines.push(detail);
    } catch (error) {
      item.textContent = `${step.label} failed. ${error.message}`;
      throw error;
    }
  }
}

async function attach(seed, { account, lock }) {
  const api = globalThis.XrplAccountLib;
  const wallet = walletFromSeed(seed);
  if (account && wallet.address !== account) {
    throw new Error(`this seed belongs to ${wallet.address}, not ${account}`);
  }
  const bad = originOk();
  if (bad) throw new Error(bad);
  const idBytes = accountBytes(api, wallet.address);
  const salt = await prfSalt(idBytes);
  let created;
  let prf;
  let xy;
  let credentialId;
  // The passkey sheet has to open before the ledger calls. A round trip first
  // spends the tap, and Safari will refuse the prompt.
  created = await createPasskey(wallet.address, idBytes, salt);
  xy = publicXY(created);
  credentialId = new Uint8Array(created.rawId);
  prf = prfResult(created);
  if (!prf) {
    try {
      const assertion = await getPasskey(crypto.getRandomValues(new Uint8Array(32)), salt, credentialId);
      prf = prfResult(assertion);
    } catch {
      prf = null;
    }
  }
  const definitions = await networkDefinitions(api, rpc);

  await runSteps([], [
    {
      label: "Passkey created",
      run: async () => prf
        ? "Face ID will also unlock the account seed."
        : "This browser has no PRF extension. The seed stays in this browser, and the hook still requires the passkey.",
    },
    {
      label: "Install the passkey firewall",
      run: async () => {
        const code = await wasmHex();
        const block = await firewallBlock(rpc, code);
        if (block) throw new Error(block);
        const tx = await submitTx(api, rpc, wallet, setHookTx(code), definitions);
        if (tx.result && tx.result !== "tesSUCCESS") throw new Error(tx.result + (tx.hook ? ` ${tx.hook}` : ""));
        return tx.hash;
      },
    },
    {
      label: "Store the passkey",
      run: async () => {
        const pairs = [
          ["PX", bytesToHex(xy.x)],
          ["PY", bytesToHex(xy.y)],
          ["RP", bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(location.hostname))))],
          ["OR", asciiHex(location.origin)],
        ];
        const tx = await submitTx(api, rpc, wallet, invokeTx(pairs), definitions);
        if (tx.result !== "tesSUCCESS") throw new Error(`${tx.result} ${tx.hook}`.trim());
        return tx.hook || tx.hash;
      },
    },
    {
      label: "Publish the wallet",
      run: async () => {
        let vault = "";
        if (prf) vault = bytesToHex(await sealSeed(prf, seed.trim()));
        else await rememberSeed(wallet.address, seed.trim());
        const cid = credentialId.length <= 256 ? bytesToHex(credentialId) : "";
        const html = renderBootloader({
          signer: `${location.origin}${location.pathname}`,
          vault,
          cid,
          spk: wallet.keypair.publicKey,
        });
        const tx = await submitTx(api, rpc, wallet, accountSetLoaderTx(html), definitions);
        if (tx.result !== "tesSUCCESS") throw new Error(`${tx.result} ${tx.hook}`.trim());
        return `${html.length} bytes on ledger`;
      },
    },
    {
      label: lock ? "Require the passkey for every transaction" : "Require the passkey for payments and account changes",
      run: async () => {
        const tx = await submitTx(api, rpc, wallet, invokeTx([["LV", lock ? "03" : "02"]]), definitions);
        if (tx.result !== "tesSUCCESS") throw new Error(`${tx.result} ${tx.hook}`.trim());
        return tx.hook || tx.hash;
      },
    },
  ]);

  sessionStorage.removeItem(SEED_KEY);
  rememberAccount(wallet.address);
  screen("Wallet is live", [
    el("p", {}, ["This account now refuses a transaction the passkey did not approve."]),
    el("p", { class: "mono" }, [wallet.address]),
    el("p", { class: "warn" }, [
      lock
        ? "Level 3 is on. Losing this passkey locks the account. The seed cannot remove the hook."
        : "Level 2 is on. The seed can still remove the hook with a SetHook. Payments and account changes need the iPhone.",
    ]),
    el("button", { onclick: () => location.assign(pwaUrl(wallet.address)) }, ["Open the wallet"]),
  ]);
}

async function unlockSeed(account, credential, vaultHex) {
  const prf = prfResult(credential);
  if (prf && vaultHex) return openSeed(prf, hexToBytes(vaultHex));
  const stored = await recallSeed(account);
  if (!stored) {
    throw new Error("the sealed seed is not on this account and not in this browser. Attach the iPhone again from a funded account.");
  }
  return stored;
}

async function loadAccount(account) {
  const info = await rpc("account_info", { account, ledger_index: "validated" });
  const namespace = await rpc("account_namespace", { account, namespace_id: NAMESPACE, ledger_index: "validated" });
  const originHex = stateValue(namespace, "OR");
  if (!originHex) throw new Error("this account has no passkey yet. Attach the iPhone first.");
  const sealedOrigin = utf8(hexToBytes(originHex));
  if (sealedOrigin !== location.origin) throw new Error(`this passkey belongs to ${sealedOrigin}. Open that wallet.`);
  const entry = await rpc("ledger_entry", { app_loader: account, ledger_index: "validated" });
  const { vault, cid, spk } = vaultFromHtml(loaderHtmlFromEntry(entry));
  return { balance: BigInt(info.account_data.Balance), vault, credentialId: cid ? hexToBytes(cid) : null, spk };
}

function sent(account, back, hash, result) {
  const next = back || pwaUrl(account);
  const url = txUrl(hash);
  const where = url ? el("a", { href: url, target: "_blank", rel: "noopener" }, [shortAddress(hash)]) : shortAddress(hash);
  const backBtn = el("button", { onclick: () => location.assign(`${next}#tx=${hash}`) }, ["Back to wallet"]);
  screen("Result", [
    el("p", {}, ["Sent ", where, "."]),
    el("details", { class: "raw" }, [
      el("summary", {}, ["Details"]),
      el("pre", { class: "json" }, [JSON.stringify(result, null, 2)]),
    ]),
    backBtn,
  ]);
}

function txJson(prepared, pubkey) {
  const view = { ...prepared };
  if (pubkey) view.SigningPubKey = pubkey;
  return JSON.stringify(view, null, 2);
}

function rejected(account, back, error, retry) {
  screen("Transaction was not sent", [
    el("p", {}, [error.message || String(error)]),
    el("button", {
      class: "ghost",
      onclick: () => {
        if (retry) retry();
        else if (back) location.assign(back);
        else composer({ account, back });
      },
    }, [retry ? text("backToSettings") : "Back"]),
  ]);
}

async function approve({ account, back, make, needsPublicKey, next, note, retry, hint, pending }) {
  const loaded = await loadAccount(account);
  const api = globalThis.XrplAccountLib;
  const idBytes = accountBytes(api, account);
  const salt = await prfSalt(idBytes);
  let seed = "";
  try {
    seed = await recallSeed(account);
  } catch {
    seed = "";
  }
  let spk = loaded.spk || (seed ? walletFromSeed(seed).keypair.publicKey : "");
  const fresh = await rpc("account_info", { account, ledger_index: "validated" });
  const made = make(fresh.account_data.Sequence);
  const holder = { address: account, keypair: { publicKey: spk } };
  const definitions = await networkDefinitions(api, rpc);
  const prepared = await prepareFields(rpc, holder, { ...made.tx, Sequence: fresh.account_data.Sequence });
  // The non-payment challenge covers Fee, so the quote is fixed before the passkey signs.
  prepared.Fee = await requiredFee(api, rpc, prepared, definitions);
  const pre = el("pre", { class: "json" });
  const paint = () => { pre.textContent = txJson(prepared, spk); };
  paint();
  const go = el("button", {}, ["Approve"]);
  screen(made.summary || "Approve", [
    hint ? el("p", {}, [hint]) : null,
    el("p", {}, [`${text("networkFee")} ${showAmount(prepared.Fee)} XAH`]),
    el("details", { class: "raw" }, [el("summary", {}, ["Transaction details"]), pre]),
    go,
  ]);

  async function finish() {
    go.disabled = true;
    const challenge = made.payment
      ? await paymentChallenge(api, { sequence: prepared.Sequence, destination: made.payment.destination, drops: made.payment.drops })
      : await txChallenge(api, prepared, holder, definitions);
    const assertion = await getPasskey(challenge, salt, loaded.credentialId);
    await assertAssertion(assertion, challenge);
    if (!seed) seed = await unlockSeed(account, assertion, loaded.vault);
    const wallet = walletFromSeed(seed);
    if (wallet.address !== account) throw new Error("the sealed seed does not match this account");
    if (spk && wallet.keypair.publicKey.toUpperCase() !== spk.toUpperCase()) {
      throw new Error("the account key does not match the key stored with this passkey");
    }
    const tx = await submitTx(api, rpc, wallet, { ...prepared, Memos: [assertionParts(assertion)] }, definitions);
    if (tx.result !== "tesSUCCESS") throw new Error(`${tx.result} ${tx.hook}`.trim());
    if (next) {
      if (pending) go.textContent = pending;
      try {
        await next({ wallet, api, definitions, tx });
      } catch (error) {
        const detail = error.message || String(error);
        throw new Error(note && !detail.includes(note) ? `${note} ${detail}` : detail);
      }
      return;
    }
    sent(account, back, tx.hash, tx.validated);
  }

  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      if (needsPublicKey && !spk) {
        const warm = await getPasskey(crypto.getRandomValues(new Uint8Array(32)), salt, loaded.credentialId);
        seed = await unlockSeed(account, warm, loaded.vault);
        spk = walletFromSeed(seed).keypair.publicKey;
        holder.keypair.publicKey = spk;
        paint();
        go.disabled = false;
        go.textContent = "Face ID again to approve this transaction";
        return;
      }
      await finish();
    } catch (error) {
      const detail = error.message || String(error);
      rejected(account, back, new Error(note && !detail.includes(note) ? `${note} ${detail}` : detail), retry);
    }
  });
}

async function republish(account, back) {
  const loaded = await loadAccount(account);
  const html = renderBootloader({
    signer: `${location.origin}${location.pathname}`,
    vault: loaded.vault,
    cid: loaded.credentialId ? bytesToHex(loaded.credentialId) : "",
    spk: loaded.spk,
  });
  const tx = accountSetLoaderTx(html);
  await approve({
    account,
    back: back || pwaUrl(account),
    needsPublicKey: true,
    make: () => ({ summary: "Publish the wallet page", payment: null, tx }),
  });
}

function composer({ account, back }) {
  const kindSelect = el("select");
  for (const kind of TX_KINDS) kindSelect.append(el("option", { value: kind.id }, [`${kind.label}`]));
  const fields = el("div");
  const inputs = new Map();
  function draw() {
    const kind = TX_KINDS.find((item) => item.id === kindSelect.value);
    inputs.clear();
    fields.replaceChildren(el("p", { class: "muted" }, [kind.blurb]));
    for (const field of kind.fields) {
      const input = el("input", { type: "text", placeholder: field.label, autocomplete: "off", spellcheck: "false" });
      if (field.kind === "xah" || field.kind === "uint" || field.kind === "seconds") input.inputMode = "decimal";
      inputs.set(field.key, input);
      fields.append(input);
    }
  }
  kindSelect.addEventListener("change", draw);
  draw();
  const review = el("button", {}, ["Review"]);
  const body = [kindSelect, fields, review, el("button", {
    class: "link",
    type: "button",
    onclick: () => sendForm(account),
  }, ["Back to send"])];
  screen("Other transaction", shell() === "desk" ? [el("div", { class: "card form" }, body)] : body, shell() === "phone" ? "transfer" : "send");
  review.addEventListener("click", () => {
    const values = Object.fromEntries([...inputs].map(([key, input]) => [key, input.value]));
    try {
      const preview = transactionFromKind(kindSelect.value, values);
      if (shell() === "desk") {
        openBuilt({ account, kind: kindSelect.value, values, back }).catch((error) => rejected(account, back, error));
        return;
      }
      approve({
        account,
        back,
        needsPublicKey: !preview.payment,
        make: () => transactionFromKind(kindSelect.value, values),
      }).catch((error) => rejected(account, back, error));
    } catch (error) {
      rejected(account, back, error);
    }
  });
}

function renderNav(active) {
  const account = savedAccount();
  if (!account) {
    nav.hidden = true;
    nav.replaceChildren();
    return;
  }
  nav.hidden = false;
  const phone = shell() === "phone";
  const items = phone
    ? ["home", "transfer", "nfts", "scan", "settings"]
    : ["home", "send", "receive", "nfts", "activity", "scan", "settings"];
  const buttons = items.map((id) => {
    const label = text(id);
    return el("button", {
      class: id === active ? "tab on" : "tab",
      type: "button",
      title: label,
      onclick: () => route(id, account),
    }, [label]);
  });
  if (phone) {
    nav.replaceChildren(...buttons);
    return;
  }
  nav.replaceChildren(
    el("div", { class: "brand" }, [
      el("strong", {}, ["Xahau"]),
      el("span", {}, [shortAddress(account)]),
    ]),
    ...buttons,
    el("div", { class: "nav-foot" }, [themeButton()]),
  );
}

function versionRows(pairs) {
  return el("div", { class: "kv" }, pairs.flatMap(([label, value]) => [
    el("span", {}, [label]),
    el("span", { class: "mono" }, [value || "—"]),
  ]));
}

async function installedHook(account) {
  const page = await rpc("account_objects", { account, type: "hook", ledger_index: "validated" });
  let hash = "";
  for (const object of page.account_objects || []) {
    for (const item of object.Hooks || []) {
      const found = item?.Hook?.HookHash;
      if (found) {
        hash = String(found).toUpperCase();
        break;
      }
    }
    if (hash) break;
  }
  if (!hash) return { hash: "", fee: "" };
  try {
    const entry = await rpc("ledger_entry", { hook_definition: hash, ledger_index: "validated" });
    const node = entry.node || entry;
    return { hash, fee: node.Fee != null ? String(node.Fee) : "" };
  } catch {
    return { hash, fee: "" };
  }
}

async function pageStatus(account) {
  try {
    const entry = await rpc("ledger_entry", { app_loader: account, ledger_index: "validated" });
    const published = loaderHtmlFromEntry(entry);
    const meta = vaultFromHtml(published);
    return {
      published: true,
      rev: readMeta(published, "rev"),
      stale: loaderChanged(published, {
        signer: `${location.origin}${location.pathname}`,
        vault: meta.vault,
        cid: meta.cid,
        spk: meta.spk,
      }),
    };
  } catch {
    return { published: false, rev: "", stale: false };
  }
}

function rememberPreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice lasts until this page is replaced.
  }
}

function choice(label, value, options, onChange) {
  const select = el("select");
  for (const option of options) select.append(el("option", { value: option.id }, [option.name]));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return el("label", { class: "setting" }, [el("span", {}, [label]), select]);
}

function settings(account, section = "version") {
  rememberAccount(account);
  const seg = (id) => el("button", {
    class: id === section ? "tab on" : "tab",
    type: "button",
    onclick: () => settings(account, id),
  }, [text(id)]);
  const body = el("div", { class: "settings" });
  screen(text("settings"), [
    el("div", { class: "seg" }, [seg("version"), seg("general")]),
    body,
  ], "settings");
  if (section === "general") paintGeneral(body, account);
  else paintVersion(body, account);
}

function paintGeneral(body, account) {
  body.replaceChildren(el("section", { class: "card" }, [
    choice(text("language"), language(), LANGUAGES, (value) => {
      rememberPreference(LANG_KEY, value);
      settings(account, "general");
    }),
    choice(text("currencyFormat"), amountFormat(), AMOUNT_FORMATS.map((item) => ({ id: item.id, name: item.example })), (value) => {
      rememberPreference(FORMAT_KEY, value);
      settings(account, "general");
    }),
    el("p", { class: "muted" }, [text("formatHint")]),
    el("label", { class: "setting" }, [
      el("span", {}, [text("layout")]),
      el("div", { class: "seg" }, [
        el("button", { class: shell() === "phone" ? "tab on" : "tab", type: "button", onclick: () => chooseShell("phone") }, [text("mobile")]),
        el("button", { class: shell() === "desk" ? "tab on" : "tab", type: "button", onclick: () => chooseShell("desk") }, [text("desktop")]),
      ]),
    ]),
  ]));
}

async function accountLevel(account) {
  const namespace = await rpc("account_namespace", { account, namespace_id: NAMESPACE, ledger_index: "validated" });
  return hookLevel(namespace);
}

function restorePending(account) {
  try {
    return localStorage.getItem(RESTORE_KEY) === account;
  } catch {
    return false;
  }
}

function rememberRestore(account) {
  try {
    localStorage.setItem(RESTORE_KEY, account);
  } catch {
    // The Version tab can still finish the update in this tab.
  }
}

function clearRestore(account) {
  try {
    if (localStorage.getItem(RESTORE_KEY) === account) localStorage.removeItem(RESTORE_KEY);
  } catch {
    // The level is already restored on the ledger.
  }
}

async function quoteHookFee(account, parts) {
  const api = globalThis.XrplAccountLib;
  const [code, info, definitions] = await Promise.all([
    parts.includes("install") ? wasmHex() : "",
    rpc("account_info", { account, ledger_index: "validated" }),
    networkDefinitions(api, rpc),
  ]);
  const sequence = info.account_data.Sequence;
  let total = 0n;
  for (const part of parts) {
    const tx = part === "install" ? setHookTx(code) : levelTx(part === "lower" ? 2 : 3);
    total += BigInt(await requiredFee(api, rpc, {
      ...tx,
      Account: account,
      Sequence: sequence,
    }, definitions));
  }
  return total.toString();
}

async function installFirewall(account, back) {
  const code = await wasmHex();
  const block = await firewallBlock(rpc, code);
  if (block) throw new Error(block);
  await approve({
    account,
    back,
    needsPublicKey: true,
    make: () => ({ summary: text("installFirewall"), payment: null, tx: setHookTx(code) }),
  });
}

async function raiseFirewall(account, back) {
  const retry = () => settings(account, "version");
  await approve({
    account,
    back,
    needsPublicKey: true,
    retry,
    note: text("firewallLevel2"),
    hint: text("firewallLevel2"),
    make: () => ({ summary: text("restoreLevel"), payment: null, tx: levelTx(3) }),
    next: ({ tx }) => {
      clearRestore(account);
      sent(account, back, tx.hash, tx.validated);
    },
  });
}

// Level 3 cannot hash a SetHook that carries the wasm. Level 2 still requires
// the passkey for payments and account changes, and it accepts SetHook, so the
// replacement lands while the current firewall is installed.
async function updateInPlace(account, back) {
  const code = await wasmHex();
  const block = await firewallBlock(rpc, code);
  if (block) throw new Error(block);
  const api = globalThis.XrplAccountLib;
  const [info, definitions] = await Promise.all([
    rpc("account_info", { account, ledger_index: "validated" }),
    networkDefinitions(api, rpc),
  ]);
  const ledger = await rpc("ledger", { ledger_index: "validated" });
  const lastLedger = Number(ledger.ledger_index) + 100;
  const installFee = await requiredFee(api, rpc, {
    ...setHookTx(code),
    Account: account,
    Sequence: info.account_data.Sequence,
    LastLedgerSequence: lastLedger,
  }, definitions);
  rememberRestore(account);
  const retry = () => settings(account, "version");
  await approve({
    account,
    back,
    needsPublicKey: true,
    retry,
    hint: text("firewallTwoStep"),
    pending: text("installingFirewall"),
    note: text("firewallLevel2"),
    make: () => ({ summary: text("lowerFirewall"), payment: null, tx: levelTx(2) }),
    next: async ({ wallet, api: lib, definitions: defs }) => {
      const installed = await submitTx(lib, rpc, wallet, {
        ...setHookTx(code),
        Fee: installFee,
        LastLedgerSequence: lastLedger,
      }, defs);
      if (installed.result !== "tesSUCCESS") throw new Error(`${installed.result} ${installed.hook}`.trim());
      await raiseFirewall(account, back);
    },
  });
}

async function installThenRaise(account, back) {
  const code = await wasmHex();
  const block = await firewallBlock(rpc, code);
  if (block) throw new Error(block);
  const retry = () => settings(account, "version");
  await approve({
    account,
    back,
    needsPublicKey: true,
    retry,
    note: text("firewallLevel2"),
    hint: text("firewallLevel2"),
    make: () => ({ summary: text("installFirewall"), payment: null, tx: setHookTx(code) }),
    next: () => raiseFirewall(account, back),
  });
}

async function startHookUpdate(account) {
  const back = safeReturn(params.get("return") || "", account) || pwaUrl(account);
  const hook = await installedHook(account);
  if (!hook.hash) {
    await installFirewall(account, back);
    return;
  }
  const level = await accountLevel(account);
  const pending = restorePending(account);
  if (level >= 3 && hook.hash !== HOOK_HASH) {
    await updateInPlace(account, back);
    return;
  }
  if (pending && level < 3 && hook.hash === HOOK_HASH) {
    await raiseFirewall(account, back);
    return;
  }
  if (pending && level < 3) {
    await installThenRaise(account, back);
    return;
  }
  await installFirewall(account, back);
}

async function paintVersion(body, account) {
  const hookCard = el("section", { class: "card" }, [
    el("h2", {}, [text("firewall")]),
    el("p", { class: "muted" }, [text("loading")]),
  ]);
  const pageCard = el("section", { class: "card" }, [
    el("h2", {}, [text("walletInterface")]),
    el("p", { class: "muted" }, [text("loading")]),
  ]);
  body.replaceChildren(hookCard, pageCard);
  const gen = viewGen;
  const back = safeReturn(params.get("return") || "", account) || pwaUrl(account);
  const [hook, page] = await Promise.all([
    installedHook(account).catch(() => null),
    pageStatus(account),
  ]);
  if (gen !== viewGen) return;
  const hookKey = !hook ? "hookUnreadable" : !hook.hash ? "hookMissing" : hook.hash === HOOK_HASH ? "hookMatches" : "hookDiffers";
  const hookRows = [
    [text("installed"), hook?.hash || "—"],
    [text("shipped"), HOOK_HASH],
  ];
  if (hook?.fee) hookRows.push([text("executionFee"), `${showAmount(hook.fee)} XAH · ${hook.fee} ${text("drops")}`]);
  const hookNodes = [
    el("h2", {}, [text("firewall")]),
    el("p", { class: hookKey === "hookDiffers" ? "warn" : "muted" }, [text(hookKey === "hookDiffers" ? "updateAvailable" : hookKey === "hookMatches" ? "current" : hookKey === "hookMissing" ? "notInstalled" : "hookUnreadable")]),
    el("p", {}, [text(hookKey)]),
    versionRows(hookRows),
  ];
  const replace = Boolean(hook?.hash && hook.hash !== HOOK_HASH);
  let level = null;
  if (hook?.hash) {
    try {
      level = await accountLevel(account);
    } catch {
      level = null;
    }
  }
  let restore = false;
  if (hook && !hook.hash) {
    try {
      const namespace = await rpc("account_namespace", { account, namespace_id: NAMESPACE, ledger_index: "validated" });
      restore = Boolean(stateValue(namespace, "PX"));
    } catch {
      restore = false;
    }
  }
  const pending = restorePending(account);
  const raiseOnly = Boolean(pending && hook?.hash === HOOK_HASH && level != null && level < 3);
  const finish = Boolean(pending && replace && level != null && level < 3);
  if (gen !== viewGen) return;
  if (pending && level != null && level < 3) hookNodes.push(el("p", { class: "warn" }, [text("firewallLevel2")]));
  if (replace || restore || raiseOnly) {
    const label = text(raiseOnly ? "restoreLevel" : finish ? "finishUpdate" : replace ? "updateFirewall" : "installFirewall");
    const parts = raiseOnly ? ["raise"] : level >= 3 && replace ? ["lower", "install", "raise"] : finish ? ["install", "raise"] : ["install"];
    const button = el("button", { type: "button" }, [level == null && replace ? label : text("checkingFee")]);
    button.addEventListener("click", () => {
      button.disabled = true;
      startHookUpdate(account).catch((error) => rejected(account, back, error));
    });
    hookNodes.push(button);
    if (level != null || !replace) {
      quoteHookFee(account, parts).then((fee) => {
        if (gen === viewGen) button.textContent = `${label} · ${showAmount(fee)} XAH`;
      }).catch(() => {
        if (gen === viewGen) button.textContent = label;
      });
    }
  }
  hookCard.replaceChildren(...hookNodes);
  const pageKey = !page.published ? "interfaceMissing" : page.stale ? "interfaceDiffers" : "interfaceMatches";
  const pageNodes = [
    el("h2", {}, [text("walletInterface")]),
    el("p", { class: page.stale ? "warn" : "muted" }, [text(page.stale ? "updateAvailable" : page.published ? "current" : "notPublished")]),
    el("p", {}, [text(pageKey)]),
    versionRows([
      [text("shipped"), INTERFACE_REV],
      [text("installed"), page.published ? (page.rev || "—") : "—"],
    ]),
  ];
  if (page.stale) {
    pageNodes.push(el("button", {
      type: "button",
      onclick: () => republish(account, back).catch((error) => rejected(account, back, error)),
    }, [text("updateWallet")]));
  }
  pageCard.replaceChildren(...pageNodes);
}

function route(id, account) {
  if (id === "home") walletHome(account);
  else if (id === "send" || id === "transfer") sendForm(account);
  else if (id === "scan") scan(account);
  else if (id === "receive") receive(account);
  else if (id === "nfts") uriTokens(account);
  else if (id === "settings") settings(account);
  else activity(account);
}

function qrCanvas(text) {
  const qr = encodeQr(text);
  const quiet = 4;
  const scale = 6;
  const size = (qr.size + quiet * 2) * scale;
  const canvas = el("canvas", { class: "qr", width: String(size), height: String(size) });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#102117";
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.modules[row * qr.size + col]) continue;
      ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
    }
  }
  return canvas;
}

function copyButton(text) {
  return el("button", {
    class: "ghost",
    type: "button",
    onclick: async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy failed";
      }
    },
  }, ["Copy"]);
}

function addressRow(account) {
  return el("div", { class: "addr" }, [
    el("span", { class: "mono" }, [account]),
    copyButton(account),
  ]);
}

function txDetail(type, line) {
  const prefix = `${type} · `;
  if (line === type) return "";
  return line.startsWith(prefix) ? line.slice(prefix.length) : line;
}

const DECLINED_KEY = "p256-declined-offers";

function declinedOffers() {
  try {
    const list = JSON.parse(sessionStorage.getItem(DECLINED_KEY) || "[]");
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function declineOffer(key) {
  const set = declinedOffers();
  set.add(key);
  try { sessionStorage.setItem(DECLINED_KEY, JSON.stringify([...set])); } catch { /* session storage can be unavailable */ }
}

async function offerMap(account, rows) {
  const ids = [];
  for (const row of rows || []) {
    if (row?.ok && row.type === "URITokenCreateSellOffer" && row.destination === account && row.tokenId && !ids.includes(row.tokenId)) {
      ids.push(row.tokenId);
    }
  }
  const map = new Map();
  await Promise.all(ids.map(async (id) => {
    try {
      const entry = await rpc("ledger_entry", { index: id, ledger_index: "validated" });
      const node = entry.node || {};
      map.set(id, normalizeUriToken({ ...node, index: entry.index || node.index || id }));
    } catch {
      // A spent offer is no longer a ledger entry.
    }
  }));
  return map;
}

function txRow(row, offer, account, token) {
  const type = row.type || "Transaction";
  const links = explorerLinks(row.hash);
  const ok = Boolean(row.ok);
  const detail = txDetail(type, row.line || "");
  const end = [];
  if (!ok) end.push(el("span", { class: "tx-flag" }, ["Failed"]));
  const hash = offer && token && links[0]
    ? el("a", { class: "tx-hash", href: links[0].url, target: "_blank", rel: "noopener" }, [shortAddress(row.hash)])
    : el("span", { class: "tx-hash" }, [shortAddress(row.hash)]);
  if (offer && token) hash.addEventListener("click", (event) => event.stopPropagation());
  end.push(hash);
  if (offer && token) {
    const title = token.code || token.uri || shortAddress(token.id);
    const sale = priceLabel(token.amount);
    const node = el("div", { class: ok ? "tx offer" : "tx bad offer", tabindex: "0" }, [
      token.art
        ? el("img", { class: "tx-art", src: token.art, alt: title })
        : el("span", { class: "tx-art tx-art-fallback" }, [(token.code || title).slice(0, 2)]),
      el("span", { class: "tx-type" }, [title]),
      el("span", { class: "tx-main" }, [`${text("nftForSale")} ${sale}`]),
      el("span", { class: "tx-end" }, end),
    ]);
    const open = () => uriTokens(account, { id: offer.id });
    node.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      open();
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
    return node;
  }
  const body = [
    el("span", { class: "tx-type" }, [type]),
    el("span", { class: "tx-main" }, detail ? [detail] : []),
    el("span", { class: "tx-end" }, end),
  ];
  const attrs = { class: ok ? "tx" : "tx bad" };
  if (links[0]) {
    attrs.href = links[0].url;
    attrs.target = "_blank";
    attrs.rel = "noopener";
  }
  return links[0] ? el("a", attrs, body) : el("div", attrs, body);
}

function txList(rows, account = "", offers = new Map()) {
  if (!rows.length) return el("p", { class: "muted" }, [text("emptyActivity")]);
  const head = shell() === "desk"
    ? el("div", { class: "tx-head", "aria-hidden": "true" }, [
      el("span", {}, [text("type")]),
      el("span", {}, [text("detail")]),
      el("span", {}, [text("hash")]),
    ])
    : null;
  const declined = declinedOffers();
  const seen = new Set();
  const nodes = rows.map((row) => {
    const token = offers.get(row.tokenId);
    const offer = incomingOffer(row, account, token);
    if (!offer || seen.has(offer.id) || declined.has(offer.key)) return txRow(row);
    seen.add(offer.id);
    return txRow(row, offer, account, token);
  });
  return el("div", { class: "tx-list" }, [head, ...nodes]);
}

function holdsBalance(line) {
  const balance = String(line?.balance ?? "");
  return balance !== "" && !/^0(?:\.0+)?$/.test(balance);
}

function issuedNodes(lines) {
  return (lines || []).filter(holdsBalance).map((line) => el("li", {}, [
    `${line.balance} ${currencyLabel(line.currency)} · ${shortAddress(line.account)}`,
  ]));
}

async function issuedLines(account) {
  try {
    const page = await rpc("account_lines", { account, ledger_index: "validated" });
    return page.lines || [];
  } catch {
    return null;
  }
}

async function recent(account, limit) {
  const page = await rpc("account_tx", { account, limit });
  return (page.transactions || []).map(describeTx);
}

// Validated balance and history move when a ledger closes. The watch ends
// when the home screen is replaced.
function followLedgers(account, gen, paint) {
  let busy = false;
  let again = false;
  const refresh = () => {
    if (gen !== viewGen) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    Promise.all([
      rpc("account_info", { account, ledger_index: "validated" }),
      recent(account, 6).then(async (rows) => ({ rows, offers: await offerMap(account, rows) })).catch(() => null),
      issuedLines(account),
    ]).then(([info, pack, lines]) => {
      if (gen !== viewGen) return;
      paint(showAmount(info.account_data.Balance), pack && pack.rows, lines, pack && pack.offers);
    }).catch(() => {}).finally(() => {
      busy = false;
      if (again && gen === viewGen) {
        again = false;
        refresh();
      }
    });
  };
  stopWatch = rpc.subscribe({ accounts: [account], streams: ["ledger"] }, (message) => {
    if (gen !== viewGen) {
      stopWatch();
      return;
    }
    if (message.type === "ledgerClosed") refresh();
  });
}

function askAccount(done) {
  const input = el("input", { type: "text", placeholder: "Your account r…", autocomplete: "off", spellcheck: "false" });
  const go = el("button", { type: "button" }, ["Continue"]);
  screen("Which wallet pays?", [
    el("p", { class: "muted" }, ["This code names the payment. Enter the account this iPhone approves."]),
    input,
    go,
  ]);
  go.addEventListener("click", () => {
    const account = input.value.trim();
    if (!isAddress(account)) {
      fail(new Error("enter the account address"));
      return;
    }
    rememberAccount(account);
    done(account);
  });
}

async function walletHome(account) {
  rememberAccount(account);
  screen(text("wallet"), [el("p", { class: "muted" }, [text("loadingAccount")])], "home");
  const gen = viewGen;
  try {
    const [info, pack, lines] = await Promise.all([
      rpc("account_info", { account, ledger_index: "validated" }),
      recent(account, 6).then(async (rows) => ({ rows, offers: await offerMap(account, rows) })).catch(() => ({ rows: [], offers: new Map() })),
      issuedLines(account),
    ]);
    if (gen !== viewGen) return;
    const stale = await pageIsStale(account);
    if (gen !== viewGen) return;
    const amount = document.createTextNode(showAmount(info.account_data.Balance));
    const linesBox = el("ul", { class: "lines" });
    const feed = el("div", { class: "feed" });
    let shownRows = null;
    let shownLines = null;
    const paint = (balance, nextRows, nextLines, offers) => {
      if (amount.data !== balance) amount.data = balance;
      if (nextLines != null) {
        const lineSig = nextLines.map((line) => `${line.currency}:${line.account}:${line.balance}`).join(" ");
        if (lineSig !== shownLines) {
          shownLines = lineSig;
          linesBox.replaceChildren(...issuedNodes(nextLines));
        }
      }
      if (!nextRows) return;
      const signature = nextRows.map((row) => `${row.hash}:${row.ok}`).join(" ");
      if (signature === shownRows) return;
      shownRows = signature;
      feed.replaceChildren(txList(nextRows, account, offers || new Map()));
    };
    paint(amount.data, pack.rows, lines, pack.offers);
    const hero = [
      el("p", { class: "balance" }, [amount, el("span", {}, [" XAH"])]),
      linesBox,
      addressRow(account),
      stale ? updateBanner(account) : null,
    ];
    if (shell() === "desk") {
      screen(text("wallet"), [
        el("div", { class: "board" }, [
          el("div", { class: "hero" }, hero.filter(Boolean)),
          el("section", { class: "card activity" }, [el("h2", {}, [text("activity")]), feed]),
          el("section", { class: "card receive" }, [el("h2", {}, [text("receive")]), ...receiveParts(account)]),
        ]),
      ], "home");
    } else {
      screen(text("wallet"), [
        ...hero,
        el("h2", {}, [text("activity")]),
        feed,
      ], "home");
    }
    followLedgers(account, viewGen, paint);
  } catch (error) {
    if (gen !== viewGen) return;
    screen(text("wallet"), [
      el("p", {}, [error.message || String(error)]),
      el("button", { class: "ghost", type: "button", onclick: () => home() }, ["Use a different account"]),
    ], "home");
  }
}

function sendBody(account, dest = "", amount = "") {
  const destination = el("input", {
    type: "text",
    placeholder: text("destPlaceholder"),
    autocomplete: "off",
    spellcheck: "false",
    value: dest,
  });
  const xah = el("input", {
    type: "text",
    inputMode: "decimal",
    placeholder: text("amountPlaceholder"),
    autocomplete: "off",
    value: displayAmount(amount),
  });
  const note = el("p", { class: "muted" }, [""]);
  const go = el("button", { type: "button" }, [shell() === "desk" ? text("showQr") : text("review")]);
  const back = safeReturn(params.get("return") || "", account);
  rpc("account_info", { account, ledger_index: "validated" }).then((info) => {
    note.textContent = text("available", { amount: showAmount(info.account_data.Balance) });
  }).catch(() => {});
  go.addEventListener("click", () => {
    let typed = "";
    try {
      typed = canonicalAmount(xah.value.trim(), amountFormat());
      if (!typed) throw new Error(text("amountInvalid"));
    } catch (error) {
      rejected(account, back, error.message === "enter an amount with at most 6 decimals" || error.message === "amount must be greater than 0" ? new Error(text("amountInvalid")) : error);
      return;
    }
    pay({ account, dest: destination.value.trim(), xah: typed, back }).catch((error) => rejected(account, back, error));
  });
  return [
    destination,
    xah,
    note,
    go,
    el("button", { class: "link", type: "button", onclick: () => composer({ account, back }) }, [text("otherTx")]),
  ];
}

function payScreen(account, mode, nodes) {
  const sendBtn = el("button", {
    class: mode === "send" ? "tab on" : "tab",
    type: "button",
    onclick: () => sendForm(account),
  }, [text("send")]);
  const receiveBtn = el("button", {
    class: mode === "receive" ? "tab on" : "tab",
    type: "button",
    onclick: () => receive(account),
  }, [text("receive")]);
  screen(text("transfer"), [
    el("div", { class: "seg" }, [sendBtn, receiveBtn]),
    ...nodes,
  ], "transfer");
}

function sendForm(account, dest = "", amount = "") {
  rememberAccount(account);
  const body = sendBody(account, dest, amount);
  if (shell() === "phone") {
    payScreen(account, "send", body);
    return;
  }
  screen(text("send"), [el("div", { class: "card form" }, body)], "send");
}

function receiveParts(account) {
  const amount = el("input", {
    type: "text",
    inputMode: "decimal",
    placeholder: text("requestAmount"),
    autocomplete: "off",
  });
  const box = el("div", { class: "qrbox" });
  const paint = () => {
    let xah = "";
    try {
      xah = canonicalAmount(amount.value.trim(), amountFormat());
    } catch {
      xah = "";
    }
    const code = xah ? payLink({ page: location.href, dest: account, xah }) : account;
    try {
      box.replaceChildren(qrCanvas(code));
    } catch (error) {
      box.replaceChildren(el("p", { class: "warn" }, [error.message]));
    }
  };
  amount.addEventListener("input", paint);
  paint();
  return [
    box,
    el("div", { class: "receive-meta" }, [
      el("p", { class: "muted" }, [text("receiveHint")]),
      addressRow(account),
      amount,
    ]),
  ];
}

function receive(account) {
  rememberAccount(account);
  const parts = receiveParts(account);
  if (shell() === "phone") {
    payScreen(account, "receive", parts);
    return;
  }
  screen(text("receive"), [el("div", { class: "split card" }, parts)], "receive");
}

async function listedTokens(account) {
  const tokens = [];
  let marker;
  for (let pageNo = 0; pageNo < 8; pageNo += 1) {
    const query = { account, type: "uri_token", ledger_index: "validated", limit: 200 };
    if (marker) query.marker = marker;
    const page = await rpc("account_objects", query);
    for (const object of page.account_objects || []) tokens.push(normalizeUriToken(object));
    marker = page.marker;
    if (!marker) break;
  }
  return tokens;
}

function tokenBack(account) {
  return safeReturn(params.get("return") || "", account) || pwaUrl(account);
}

function priceLabel(amount) {
  if (amount == null || amount === "") return "";
  if (typeof amount === "string") return `${showAmount(amount)} XAH`;
  return `${amount.value || ""} ${amount.currency || ""}`.trim();
}

function signToken(account, kind, values) {
  const back = tokenBack(account);
  openBuilt({ account, kind, values, back }).catch((error) => rejected(account, back, error));
}

function plainPrice(value) {
  const typed = String(value || "");
  if (!typed.trim()) return "";
  const plain = canonicalAmount(typed);
  if (!plain) throw new Error(text("amountInvalid"));
  return plain;
}

function sellFields(account, id) {
  const price = el("input", { type: "text", placeholder: text("nftPrice"), inputMode: "decimal", autocomplete: "off" });
  const buyer = el("input", { type: "text", placeholder: text("nftBuyer"), autocomplete: "off", spellcheck: "false" });
  const go = el("button", { type: "button" }, [text("nftSell")]);
  go.addEventListener("click", () => {
    try {
      const values = { id, xah: plainPrice(price.value) };
      if (!values.xah) throw new Error(text("amountInvalid"));
      if (buyer.value.trim()) values.destination = buyer.value.trim();
      signToken(account, "URITokenCreateSellOffer", values);
    } catch (error) {
      rejected(account, tokenBack(account), error);
    }
  });
  return el("div", {}, [price, buyer, go]);
}

function tokenArt(token, title) {
  const frame = el("div", { class: "nft-art" });
  if (!token.art) {
    frame.append(el("div", { class: "nft-fallback" }, [title]));
    return frame;
  }
  const image = el("img", { src: token.art, alt: title });
  image.addEventListener("error", () => {
    frame.replaceChildren(el("div", { class: "nft-fallback" }, [title]));
  });
  frame.append(image);
  return frame;
}

function tokenTitle(token) {
  return token.code || token.uri || shortAddress(token.id);
}

function collectItems(account, tokens, offers) {
  const declined = declinedOffers();
  const items = tokens.map((token) => ({ token, offer: null }));
  const owned = new Set(tokens.map((token) => token.id));
  for (const token of offers.values()) {
    const offer = heldOffer(account, token);
    if (!offer || owned.has(token.id) || declined.has(offer.key)) continue;
    items.push({ token, offer });
  }
  return items;
}

function galleryCard(item, onOpen) {
  const title = tokenTitle(item.token);
  const sale = priceLabel(item.token.amount);
  return el("button", { class: item.offer ? "nft incoming" : "nft", type: "button", onclick: onOpen }, [
    tokenArt(item.token, title),
    el("div", { class: "nft-body" }, [
      el("strong", {}, [title]),
      item.token.edition ? el("p", { class: "muted" }, [`${text("nftEdition")} ${item.token.edition}`]) : null,
      sale ? el("p", { class: "nft-sale" }, [`${text("nftForSale")} ${sale}`]) : null,
    ]),
  ]);
}

function showNftBrowser(account, items, focus) {
  let index = focus.openIndex >= 0 ? focus.openIndex : 0;
  let selling = Boolean(focus.sell);
  const note = el("p", { class: "muted" }, [items.length ? "" : text("nftEmpty")]);
  const grid = el("div", { class: "nft-grid" });
  const stage = el("div", { class: "nft-stage" });
  const caption = el("div", { class: "nft-caption" });
  const actions = el("div", { class: "nft-overlay-actions" });
  const sellBox = el("div", { class: "nft-sell" });
  const count = el("p", { class: "nft-count" }, [""]);
  const prev = el("button", { class: "nft-step", type: "button" }, ["‹"]);
  const next = el("button", { class: "nft-step", type: "button" }, ["›"]);
  const overlay = el("div", {
    class: "nft-overlay",
    hidden: "hidden",
    role: "dialog",
    "aria-modal": "true",
  }, [
    el("div", { class: "nft-dialog" }, [
      el("button", { class: "nft-close", type: "button", onclick: () => closeOverlay() }, [text("nftClose")]),
      stage,
      caption,
      actions,
      sellBox,
      el("div", { class: "nft-pager" }, [prev, count, next]),
    ]),
  ]);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });

  function closeOverlay() {
    overlay.hidden = true;
  }

  function rebuildGrid() {
    note.textContent = items.length ? "" : text("nftEmpty");
    grid.replaceChildren(...items.map((item, at) => galleryCard(item, () => openAt(at, false))));
  }

  function openAt(at, keepSell) {
    if (!items.length) {
      closeOverlay();
      return;
    }
    index = (at + items.length) % items.length;
    if (!keepSell) selling = false;
    paint();
    overlay.hidden = false;
  }

  function paint() {
    const item = items[index];
    if (!item) {
      closeOverlay();
      return;
    }
    const { token, offer } = item;
    const title = tokenTitle(token);
    const sale = priceLabel(token.amount);
    stage.replaceChildren(tokenArt(token, title));
    const lines = [el("strong", {}, [title])];
    if (token.edition) lines.push(el("p", {}, [`${text("nftEdition")} ${token.edition}`]));
    if (sale) lines.push(el("p", {}, [`${text("nftForSale")} ${sale}`]));
    if (token.destination) lines.push(el("p", {}, [shortAddress(token.destination)]));
    caption.replaceChildren(...lines);
    const controls = [];
    if (offer) {
      controls.push(el("button", {
        type: "button",
        onclick: () => signToken(account, "URITokenBuy", { id: offer.id, xah: offer.xah }),
      }, [text("nftAccept")]));
      controls.push(el("button", {
        class: "ghost",
        type: "button",
        onclick: () => {
          declineOffer(offer.key);
          items.splice(index, 1);
          selling = false;
          rebuildGrid();
          if (!items.length) closeOverlay();
          else {
            if (index >= items.length) index = items.length - 1;
            paint();
          }
        },
      }, [text("nftDecline")]));
    } else {
      if (sale) {
        controls.push(el("button", {
          class: "ghost",
          type: "button",
          onclick: () => signToken(account, "URITokenCancelSellOffer", { id: token.id }),
        }, [text("nftCancelSale")]));
      }
      controls.push(el("button", {
        type: "button",
        onclick: () => {
          selling = !selling;
          paint();
        },
      }, [text("nftSell")]));
      controls.push(el("button", {
        class: "ghost",
        type: "button",
        onclick: () => signToken(account, "URITokenBurn", { id: token.id }),
      }, [text("nftBurn")]));
    }
    actions.replaceChildren(...controls);
    sellBox.replaceChildren(!offer && selling ? sellFields(account, token.id) : null);
    count.textContent = text("nftCount", { n: index + 1, m: items.length });
    prev.disabled = items.length < 2;
    next.disabled = items.length < 2;
  }

  prev.addEventListener("click", () => openAt(index - 1, false));
  next.addEventListener("click", () => openAt(index + 1, false));
  rebuildGrid();
  if (focus.openIndex >= 0) {
    index = focus.openIndex;
    paint();
    overlay.hidden = false;
  }
  screen(text("nfts"), [note, grid, overlay], "nfts");
  const live = viewGen;
  const onKey = (event) => {
    if (live !== viewGen) {
      document.removeEventListener("keydown", onKey);
      return;
    }
    if (overlay.hidden) return;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "Escape") closeOverlay();
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      openAt(index + 1, false);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      openAt(index - 1, false);
    }
  };
  document.addEventListener("keydown", onKey);
}

async function uriTokens(account, focus = {}) {
  rememberAccount(account);
  screen(text("nfts"), [el("p", { class: "muted" }, [text("loading")])], "nfts");
  const gen = viewGen;
  try {
    const [tokens, rows] = await Promise.all([
      listedTokens(account),
      recent(account, 15).catch(() => []),
    ]);
    if (gen !== viewGen) return;
    const offers = await offerMap(account, rows);
    if (gen !== viewGen) return;
    const items = collectItems(account, tokens, offers);
    const wanted = String(focus.id || "").toUpperCase();
    let openIndex = wanted ? items.findIndex((item) => item.token.id === wanted) : -1;
    if (wanted && openIndex < 0) {
      try {
        const entry = await rpc("ledger_entry", { index: wanted, ledger_index: "validated" });
        if (gen !== viewGen) return;
        const token = normalizeUriToken({ ...(entry.node || {}), index: entry.index || wanted });
        const offer = heldOffer(account, token);
        if (token.id && !(offer && declinedOffers().has(offer.key))) {
          items.push({ token, offer });
          openIndex = items.length - 1;
        }
      } catch {
        // The id is not a URI token on the ledger.
      }
    }
    if (gen !== viewGen) return;
    const selling = focus.act === "sell" && openIndex >= 0 && !items[openIndex].offer;
    showNftBrowser(account, items, { openIndex, sell: selling });
  } catch {
    if (gen !== viewGen) return;
    screen(text("nfts"), [el("p", {}, [text("nftUnavailable")])], "nfts");
  }
}

async function activity(account) {
  rememberAccount(account);
  screen(text("activity"), [el("p", { class: "muted" }, [text("loading")])], "activity");
  const gen = viewGen;
  try {
    const rows = await recent(account, 15);
    const offers = await offerMap(account, rows);
    if (gen !== viewGen) return;
    screen(text("activity"), [txList(rows, account, offers)], "activity");
  } catch (error) {
    if (gen !== viewGen) return;
    screen(text("activity"), [el("p", {}, [error.message || String(error)])], "activity");
  }
}

function handoff({ account, back, summary, url, watch, signHere }) {
  let canvas;
  try {
    canvas = qrCanvas(url);
  } catch (error) {
    rejected(account, back, error);
    return;
  }
  const status = el("p", { class: "muted" }, ["Waiting for your iPhone."]);
  const here = el("button", { class: "ghost", type: "button" }, ["Sign on this computer"]);
  screen("Scan with iPhone", [
    el("p", { class: "lede" }, [summary]),
    el("div", { class: "qrbox" }, [canvas]),
    el("p", { class: "muted" }, ["Open this wallet on the iPhone and tap Scan."]),
    status,
    here,
    el("button", {
      class: "link",
      type: "button",
      onclick: () => (back ? location.assign(back) : walletHome(account)),
    }, ["Cancel"]),
  ]);
  const gen = viewGen;
  here.addEventListener("click", () => {
    if (gen === viewGen) signHere();
  });
  if (watch) watchPayment({ account, back, gen, status, watch }).catch(() => {});
}

async function watchPayment({ account, back, gen, status, watch }) {
  const seen = new Set();
  try {
    for (const row of await recent(account, 20)) if (row.hash) seen.add(row.hash);
  } catch {
    // The first poll still notices a new transaction.
  }
  if (gen !== viewGen) return;
  for (let i = 0; i < 80 && gen === viewGen; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (gen !== viewGen) return;
    try {
      const hit = (await recent(account, 8)).find((row) => row.hash && !seen.has(row.hash) && sameTransaction(row, account, watch));
      if (hit) {
        sent(account, back, hit.hash, { hash: hit.hash, result: "tesSUCCESS" });
        return;
      }
    } catch {
      if (gen === viewGen) status.textContent = "Still waiting. The network did not answer just now.";
    }
  }
}

async function openBuilt({ account, kind, values, back }) {
  if (!isAddress(account)) {
    askAccount((chosen) => {
      openBuilt({ account: chosen, kind, values, back: safeReturn(back || "", chosen) }).catch((error) => rejected(chosen, null, error));
    });
    return;
  }
  rememberAccount(account);
  const preview = transactionFromKind(kind, values);
  const signHere = () => approve({
    account,
    back,
    needsPublicKey: !preview.payment,
    make: () => transactionFromKind(kind, values),
  }).catch((error) => rejected(account, back, error));
  if (shell() === "phone") {
    await signHere();
    return;
  }
  handoff({
    account,
    back,
    summary: preview.summary,
    url: requestLink({ page: location.href, account, kind, values, returnTo: back || "" }),
    watch: preview.payment
      ? { dest: preview.payment.destination, drops: preview.payment.drops }
      : { type: preview.tx.TransactionType, destination: preview.tx.Destination || "" },
    signHere,
  });
}

function openScanned(text) {
  const found = parseScan(text);
  if (found.type === "address") {
    const account = savedAccount();
    if (!account) {
      askAccount((chosen) => sendForm(chosen, found.address));
      return;
    }
    sendForm(account, found.address);
    return;
  }
  if (found.type === "pay") {
    const start = (account) => {
      pay({
        account,
        dest: found.dest,
        xah: found.xah,
        back: safeReturn(found.returnTo, account),
      }).catch((error) => rejected(account, safeReturn(found.returnTo, account), error));
    };
    const account = found.account || savedAccount();
    if (!account) {
      askAccount(start);
      return;
    }
    start(account);
    return;
  }
  if (found.type === "qr") {
    const account = found.account || savedAccount();
    openBuilt({
      account,
      kind: found.kind,
      values: found.values,
      back: account ? safeReturn(found.returnTo, account) : null,
    }).catch((error) => fail(error));
    return;
  }
  if (found.type === "sign") {
    const account = found.account || savedAccount();
    if (!account) {
      askAccount((chosen) => composer({ account: chosen, back: null }));
      return;
    }
    composer({ account, back: safeReturn(params.get("return") || "", account) });
    return;
  }
  const again = savedAccount();
  screen(found.type === "xaman-payload" ? "Xaman keeps this request" : "This code is not a payment", [
    el("p", {}, [
      found.type === "xaman-payload"
        ? "This QR points at a sign request stored by Xaman. This wallet signs its own codes, an address, or a Xaman detect link."
        : "Scan an address, a sign QR from this wallet, or a Xaman detect link.",
    ]),
    again ? el("button", { class: "ghost", type: "button", onclick: () => scan(again) }, ["Scan again"]) : el("button", { class: "ghost", type: "button", onclick: () => home() }, ["Back"]),
  ], again ? "scan" : "");
}

function scan(account) {
  if (isAddress(account)) rememberAccount(account);
  const video = el("video", { autoplay: "true", muted: "true", playsinline: "true" });
  video.muted = true;
  video.setAttribute("playsinline", "");
  const reticle = el("div", { class: "reticle" });
  const finder = el("div", { class: "finder" }, [video, reticle]);
  const note = el("p", { class: "muted" }, [text("scanHint")]);
  const pasted = el("input", { type: "text", placeholder: text("pastePlaceholder"), autocomplete: "off", spellcheck: "false" });
  const open = el("button", { class: "ghost", type: "button" }, [text("open")]);
  const paste = el("div", { class: "paste" }, [pasted, open]);
  screen(text("scan"), shell() === "desk"
    ? [el("div", { class: "split scan-split" }, [finder, el("div", {}, [note, paste])])]
    : [finder, note, paste], "scan");
  const gen = viewGen;
  open.addEventListener("click", () => {
    if (pasted.value.trim()) take(pasted.value.trim());
  });
  video.playsInline = true;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // One fixed readback. Resizing the canvas every frame makes Safari allocate
  // a new buffer, and a smoothed scale washes the finder out.
  const SCAN = 320;
  canvas.width = SCAN;
  canvas.height = SCAN;
  ctx.imageSmoothingEnabled = false;
  let stopped = false;
  let locked = false;
  let frameHandle = 0;
  let step = 0;
  let lastScan = 0;
  let detecting = false;
  stopCamera = () => {
    stopped = true;
    if (frameHandle && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameHandle);
    else if (frameHandle) cancelAnimationFrame(frameHandle);
    video.srcObject?.getTracks?.().forEach((track) => track.stop());
  };
  let detector = null;
  try {
    if ("BarcodeDetector" in globalThis) detector = new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    detector = null;
  }
  const clamp = (x, y, w, h, vw, vh) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(vw, Math.round(x + w));
    const y1 = Math.min(vh, Math.round(y + h));
    if (x1 - x0 < 21 || y1 - y0 < 21) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  // object-fit: cover hides the rest of the sensor. Map an on-screen box
  // back into video pixels, then grow it a little for the quiet zone.
  const mappedRect = (mark, grow) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const box = video.getBoundingClientRect();
    if (box.width < 20 || box.height < 20 || !mark || mark.width < 20) {
      const side = Math.min(vw, vh) * 0.72;
      return clamp((vw - side) / 2, (vh - side) / 2, side, side, vw, vh);
    }
    const scale = Math.max(box.width / vw, box.height / vh);
    const offsetX = (box.width - vw * scale) / 2;
    const offsetY = (box.height - vh * scale) / 2;
    let w = mark.width / scale;
    let h = mark.height / scale;
    let x = (mark.left - box.left - offsetX) / scale;
    let y = (mark.top - box.top - offsetY) / scale;
    x -= (w * grow) / 2;
    y -= (h * grow) / 2;
    w *= 1 + grow;
    h *= 1 + grow;
    return clamp(x, y, w, h, vw, vh);
  };
  const centerSquare = (rect, frac) => {
    const side = Math.min(rect.w, rect.h) * frac;
    return clamp(rect.x + (rect.w - side) / 2, rect.y + (rect.h - side) / 2, side, side, video.videoWidth, video.videoHeight);
  };
  const readSquare = (rect, turn) => {
    if (!rect) return "";
    const side = Math.min(rect.w, rect.h);
    if (side < 21) return "";
    const x = rect.x + (rect.w - side) / 2;
    const y = rect.y + (rect.h - side) / 2;
    ctx.drawImage(video, x, y, side, side, 0, 0, SCAN, SCAN);
    const frame = ctx.getImageData(0, 0, SCAN, SCAN);
    return decodeImage(frame.data, SCAN, SCAN, turn);
  };
  const take = (text) => {
    if (!text || locked || stopped || gen !== viewGen) return;
    locked = true;
    stopCamera();
    openScanned(text);
  };
  const again = () => {
    if (stopped || locked || gen !== viewGen) return;
    if (video.requestVideoFrameCallback) frameHandle = video.requestVideoFrameCallback(tick);
    else frameHandle = requestAnimationFrame(tick);
  };
  const tick = (now) => {
    if (stopped || locked || gen !== viewGen) return;
    try {
      if (detector && !detecting && video.readyState >= 2) {
        detecting = true;
        detector.detect(video).then((codes) => {
          detecting = false;
          take(codes?.[0]?.rawValue || "");
        }).catch(() => {
          detecting = false;
          detector = null;
        });
      }
      const stamp = now || performance.now();
      // One crop from the square, about 30 times a second.
      if (video.readyState >= 2 && stamp - lastScan >= 32) {
        lastScan = stamp;
        const guide = mappedRect(reticle.getBoundingClientRect(), 0.18);
        const n = step;
        step += 1;
        let text = "";
        if (guide) {
          if (n % 16 === 15) text = readSquare(guide, n % 32 === 15 ? 20 : -20);
          else if (n % 4 === 3) text = readSquare(centerSquare(guide, 0.5), 0);
          else text = readSquare(guide, 0);
        }
        if (text) {
          take(text);
          return;
        }
      }
    } catch {
      // This frame failed. The next camera frame still runs.
    }
    again();
  };
  const camera = {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  const devices = navigator.mediaDevices;
  const getCamera = devices?.getUserMedia?.bind(devices);
  if (!getCamera) {
    note.textContent = "The camera is not available. Paste the link or the address instead.";
    return;
  }
  const plain = { audio: false, video: { facingMode: camera.facingMode } };
  const giveUp = (error) => error?.name === "NotAllowedError" || error?.name === "SecurityError" || error?.name === "NotFoundError";
  const fallback = (next) => (error) => {
    if (giveUp(error)) throw error;
    return next();
  };
  let videoTrack = null;
  // A point of interest makes the phone focus on the guide. Without it, a
  // continuous focus request is often ignored and the picture stays soft.
  const refocus = () => {
    const track = videoTrack;
    if (!track) return;
    const sharpen = (point) => {
      const caps = track.getCapabilities?.() || {};
      const advanced = {};
      if (caps.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
      if (caps.exposureMode?.includes("continuous")) advanced.exposureMode = "continuous";
      if (caps.whiteBalanceMode?.includes("continuous")) advanced.whiteBalanceMode = "continuous";
      if (point) advanced.pointsOfInterest = [{ x: 0.5, y: 0.5 }];
      if (!Object.keys(advanced).length) return Promise.resolve();
      return track.applyConstraints({ advanced: [advanced] });
    };
    sharpen(true).catch(() => sharpen(false)).catch(() => {});
  };
  finder.addEventListener("click", refocus);
  getCamera({ audio: false, video: { ...camera, advanced: [{ focusMode: "continuous" }] } })
    .catch(fallback(() => getCamera({ audio: false, video: camera })))
    .catch(fallback(() => getCamera(plain)))
    .then((stream) => {
      if (gen !== viewGen) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoTrack = stream.getVideoTracks?.()[0] || null;
      refocus();
      video.srcObject = stream;
      video.play?.().catch(() => {});
      again();
    })
    .catch(() => {
      if (gen === viewGen) note.textContent = "The camera is not available. Paste the link or the address instead.";
    });
}

async function pay({ account, dest, xah, back }) {
  const made = transactionFromKind("Payment", { destination: dest, xah });
  const drops = made.payment.drops;
  const info = await rpc("account_info", { account, ledger_index: "validated" });
  const balance = BigInt(info.account_data.Balance);
  const api = globalThis.XrplAccountLib;
  const definitions = await networkDefinitions(api, rpc);
  const fee = BigInt(await requiredFee(api, rpc, {
    ...made.tx,
    Account: account,
    Sequence: info.account_data.Sequence,
  }, definitions));
  if (balance < drops + fee) {
    throw new Error(`balance is ${showAmount(balance)} XAH. This send needs ${showAmount(drops + fee)} including the fee.`);
  }
  if (shell() === "desk") {
    handoff({
      account,
      back,
      summary: made.summary,
      url: payLink({ page: location.href, account, dest, xah, returnTo: back || "" }),
      watch: { dest, drops: made.payment.drops },
      signHere: () => approve({ account, back, needsPublicKey: false, make: () => made }).catch((error) => rejected(account, back, error)),
    });
    return;
  }
  await approve({ account, back, needsPublicKey: false, make: () => made });
}

function home() {
  const account = el("input", { type: "text", placeholder: "Account r…", autocomplete: "off", spellcheck: "false" });
  const seed = el("input", { type: "password", placeholder: "Family seed s…", autocomplete: "off", spellcheck: "false" });
  const lock = el("input", { type: "checkbox" });
  lock.checked = true;
  const create = el("button", {}, ["Create a wallet"]);
  const sign = el("button", {}, ["Open"]);
  const use = el("button", { class: "ghost" }, ["Attach passkey"]);
  const bad = originOk();
  const saved = savedAccount();
  if (saved) account.value = saved;
  screen("Wallet", [
    el("p", { class: "lede" }, [
      shell() === "desk"
        ? "A send shows a QR code. Your iPhone scans it and approves with Face ID."
        : "Face ID approves each send. Scan reads a QR code from another screen.",
    ]),
    bad ? el("p", { class: "warn" }, [bad]) : null,
    create,
    el("details", {}, [
      el("summary", {}, ["I already have an account"]),
      el("div", { class: "stack" }, [account, sign]),
    ]),
    el("details", {}, [
      el("summary", {}, ["Attach a passkey to a seed"]),
      el("div", { class: "stack" }, [
        seed,
        el("label", {}, [lock, el("span", {}, ["Lock the hook. A lost passkey cannot be replaced, and the seed cannot take the hook off."])]),
        use,
      ]),
    ]),
  ]);
  sign.addEventListener("click", () => {
    const text = account.value.trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(text)) {
      fail(new Error("enter the account address"));
      return;
    }
    rememberAccount(text);
    walletHome(text);
  });

  create.addEventListener("click", async () => {
    create.disabled = true;
    try {
      if (bad) throw new Error(bad);
      const response = await fetch(FAUCET, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json();
      const secret = body.account?.secret;
      if (!secret) throw new Error(body.error || "the faucet did not return a wallet");
      screen("Save this seed", [
        el("p", {}, ["This is the account key. The iPhone is required on top of it. Write the seed down, then continue."]),
        el("p", { class: "mono" }, [secret]),
        el("p", { class: "muted" }, [body.account.classicAddress || body.account.address || ""]),
        el("button", { onclick: () => attach(secret, { lock: lock.checked }).catch(fail) }, ["I saved the seed. Attach iPhone."]),
      ]);
    } catch (error) {
      create.disabled = false;
      fail(error);
    }
  });

  use.addEventListener("click", () => {
    const secret = seed.value.trim();
    if (!secret) return fail(new Error("paste the family seed"));
    if (bad) return fail(new Error(bad));
    attach(secret, { account: params.get("account") || "", lock: lock.checked }).catch(fail);
  });
}

function fail(error) {
  screen("Stopped", [
    el("p", {}, [error.message || String(error)]),
    el("button", { class: "ghost", onclick: () => location.assign(location.pathname) }, ["Start again"]),
  ]);
}

async function main() {
  applyShell();
  sessionStorage.removeItem(SEED_KEY);
  if (!globalThis.XrplAccountLib) {
    screen("Signer is incomplete", [el("p", {}, ["The signing library did not load."])]);
    return;
  }
  const op = params.get("op");
  if (!globalThis.PublicKeyCredential && shell() === "phone" && op !== "scan" && op !== "receive" && op !== "settings" && op !== "update" && op !== "nfts") {
    screen("No passkeys here", [el("p", {}, ["This browser has no WebAuthn. Open the wallet in Safari on the iPhone."])]);
    return;
  }
  try {
    if (op === "qr") {
      const found = parseScan(location.href);
      if (found.type !== "qr") throw new Error("this sign QR is not valid");
      const account = found.account || savedAccount();
      await openBuilt({
        account,
        kind: found.kind,
        values: found.values,
        back: account ? safeReturn(found.returnTo, account) : null,
      });
      return;
    }
    if (op === "scan") {
      const account = params.get("account") || savedAccount();
      if (isAddress(account)) rememberAccount(account);
      scan(account);
      return;
    }
    if (op === "receive") {
      const account = params.get("account") || savedAccount();
      if (!isAddress(account)) {
        home();
        return;
      }
      receive(account);
      return;
    }
    if (op === "pay") {
      const dest = params.get("dest") || "";
      const xah = params.get("xah") || "";
      if (!dest) throw new Error("the wallet did not name a destination");
      const start = (account) => pay({
        account,
        dest,
        xah,
        back: safeReturn(params.get("return") || "", account),
      });
      const account = params.get("account") || savedAccount();
      if (!account) {
        askAccount((chosen) => start(chosen).catch((error) => rejected(chosen, null, error)));
        return;
      }
      await start(account);
      return;
    }
    if (op === "sign") {
      const account = params.get("account") || "";
      const back = safeReturn(params.get("return") || "", account);
      if (!account) {
        home();
        return;
      }
      composer({ account, back });
      return;
    }
    if (op === "nfts") {
      const account = params.get("account") || savedAccount();
      if (!isAddress(account)) {
        home();
        return;
      }
      rememberAccount(account);
      const act = params.get("act") || "";
      const id = (params.get("id") || "").trim();
      const back = safeReturn(params.get("return") || "", account) || pwaUrl(account);
      if ((act === "burn" || act === "cancel") && id) {
        openBuilt({
          account,
          kind: act === "burn" ? "URITokenBurn" : "URITokenCancelSellOffer",
          values: { id },
          back,
        }).catch((error) => rejected(account, back, error));
        return;
      }
      if (act === "buy" && id) {
        const xah = params.get("xah") || "";
        if (!/^\d+(\.\d{0,6})?$/.test(xah)) throw new Error(text("amountInvalid"));
        openBuilt({
          account,
          kind: "URITokenBuy",
          values: { id, xah },
          back,
        }).catch((error) => rejected(account, back, error));
        return;
      }
      await uriTokens(account, { act, id });
      return;
    }
    if (op === "settings" || op === "update") {
      const account = params.get("account") || savedAccount();
      if (!isAddress(account)) {
        home();
        return;
      }
      rememberAccount(account);
      settings(account, "version");
      return;
    }
    if (op === "attach") {
      const existing = sessionStorage.getItem(SEED_KEY) || "";
      if (!existing) {
        home();
        return;
      }
      await attach(existing, { account: params.get("account") || "", lock: true });
      return;
    }
    const known = params.get("account") || savedAccount();
    if (isAddress(known)) {
      rememberAccount(known);
      walletHome(known);
      return;
    }
    home();
  } catch (error) {
    fail(error);
  }
}

main();
