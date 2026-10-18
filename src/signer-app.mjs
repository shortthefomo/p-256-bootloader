import { loaderChanged, renderBootloader } from "./bootloader.mjs";
import { decodeImage, encodeQr } from "./qr.mjs";
import {
  currencyLabel,
  describeTx,
  isAddress,
  parseScan,
  payLink,
  requestLink,
  samePayment,
  shortAddress,
} from "./scan.mjs";
import { TX_KINDS, transactionFromKind } from "./tx-forms.mjs";
import {
  asciiHex,
  bytesToHex,
  derToRaw,
  dropsToXah,
  hexToBytes,
  memoFromWebAuthn,
  openSeed,
  prfSalt,
  sealSeed,
  utf8,
  xahToDrops,
  xyFromAuthenticatorData,
  xyFromSpki,
} from "./protocol.mjs";
import {
  FAUCET,
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

function themeLabel() {
  return document.documentElement.dataset.theme === "light" ? "Dark" : "Light";
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
    el("p", {}, ["A new wallet page is ready for this account."]),
    el("button", {
      type: "button",
      onclick: () => republish(account, back).catch((error) => rejected(account, back, error)),
    }, ["Install"]),
  ]);
}

function layoutSwitch() {
  if (shell() !== "phone") return null;
  return el("button", {
    class: "link",
    type: "button",
    onclick: () => {
      localStorage.setItem(SHELL_KEY, "desk");
      location.reload();
    },
  }, ["Use the computer layout"]);
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

function rejected(account, back, error) {
  screen("Transaction was not sent", [
    el("p", {}, [error.message || String(error)]),
    el("button", { class: "ghost", onclick: () => (back ? location.assign(back) : composer({ account, back })) }, ["Back"]),
  ]);
}

async function approve({ account, back, make, needsPublicKey }) {
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
    el("details", { class: "raw" }, [el("summary", {}, ["Transaction details"]), pre]),
    go,
  ]);

  async function finish() {
    go.disabled = true;
    const challenge = made.payment
      ? await paymentChallenge(api, { sequence: prepared.Sequence, destination: made.payment.destination, drops: made.payment.drops })
      : await txChallenge(api, prepared, holder, definitions);
    const assertion = await getPasskey(challenge, salt, loaded.credentialId);
    if (!seed) seed = await unlockSeed(account, assertion, loaded.vault);
    const wallet = walletFromSeed(seed);
    if (wallet.address !== account) throw new Error("the sealed seed does not match this account");
    if (spk && wallet.keypair.publicKey.toUpperCase() !== spk.toUpperCase()) {
      throw new Error("the account key does not match the key stored with this passkey");
    }
    const tx = await submitTx(api, rpc, wallet, { ...prepared, Memos: [assertionParts(assertion)] }, definitions);
    if (tx.result !== "tesSUCCESS") throw new Error(`${tx.result} ${tx.hook}`.trim());
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
      rejected(account, back, error);
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
  screen("Other transaction", shell() === "desk" ? [el("div", { class: "card form" }, body)] : body, "send");
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
    ? [["home", "Home"], ["send", "Send"], ["scan", "Scan"], ["receive", "Receive"]]
    : [["home", "Home"], ["send", "Send"], ["receive", "Receive"], ["activity", "Activity"], ["scan", "Scan"]];
  const buttons = items.map(([id, label]) => el("button", {
    class: id === active ? "tab on" : "tab",
    type: "button",
    onclick: () => route(id, account),
  }, [label]));
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
    el("div", { class: "nav-foot" }, [
      themeButton(),
      el("button", {
        class: "layout",
        type: "button",
        onclick: () => {
          localStorage.setItem(SHELL_KEY, "phone");
          location.reload();
        },
      }, ["Phone layout"]),
    ]),
  );
}

function route(id, account) {
  if (id === "home") walletHome(account);
  else if (id === "send") sendForm(account);
  else if (id === "scan") scan(account);
  else if (id === "receive") receive(account);
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

function txRow(row) {
  const type = row.type || "Transaction";
  const links = explorerLinks(row.hash);
  const ok = Boolean(row.ok);
  const attrs = { class: ok ? "tx" : "tx bad" };
  if (links[0]) {
    attrs.href = links[0].url;
    attrs.target = "_blank";
    attrs.rel = "noopener";
  }
  const detail = txDetail(type, row.line || "");
  const end = [];
  if (!ok) end.push(el("span", { class: "tx-flag" }, ["Failed"]));
  end.push(el("span", { class: "tx-hash" }, [shortAddress(row.hash)]));
  const body = [
    el("span", { class: "tx-type" }, [type]),
    el("span", { class: "tx-main" }, detail ? [detail] : []),
    el("span", { class: "tx-end" }, end),
  ];
  return links[0] ? el("a", attrs, body) : el("div", attrs, body);
}

function txList(rows) {
  if (!rows.length) return el("p", { class: "muted" }, ["No transactions yet."]);
  const head = shell() === "desk"
    ? el("div", { class: "tx-head", "aria-hidden": "true" }, [
      el("span", {}, ["Type"]),
      el("span", {}, ["Detail"]),
      el("span", {}, ["Hash"]),
    ])
    : null;
  return el("div", { class: "tx-list" }, [head, ...rows.map(txRow)]);
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
      recent(account, 6).catch(() => null),
      issuedLines(account),
    ]).then(([info, rows, lines]) => {
      if (gen !== viewGen) return;
      paint(dropsToXah(info.account_data.Balance), rows, lines);
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
  screen("Wallet", [el("p", { class: "muted" }, ["Loading the account…"])], "home");
  const gen = viewGen;
  try {
    const [info, rows, lines] = await Promise.all([
      rpc("account_info", { account, ledger_index: "validated" }),
      recent(account, 6).catch(() => []),
      issuedLines(account),
    ]);
    if (gen !== viewGen) return;
    const stale = await pageIsStale(account);
    if (gen !== viewGen) return;
    const amount = document.createTextNode(dropsToXah(info.account_data.Balance));
    const linesBox = el("ul", { class: "lines" });
    const feed = el("div", { class: "feed" });
    let shownRows = null;
    let shownLines = null;
    const paint = (balance, nextRows, nextLines) => {
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
      feed.replaceChildren(txList(nextRows));
    };
    paint(amount.data, rows, lines);
    const hero = [
      el("p", { class: "balance" }, [amount, el("span", {}, [" XAH"])]),
      linesBox,
      addressRow(account),
      stale ? updateBanner(account) : null,
    ];
    if (shell() === "desk") {
      screen("Wallet", [
        el("div", { class: "board" }, [
          el("div", { class: "hero" }, hero.filter(Boolean)),
          el("section", { class: "card activity" }, [el("h2", {}, ["Activity"]), feed]),
          el("section", { class: "card receive" }, [el("h2", {}, ["Receive"]), ...receiveParts(account)]),
        ]),
      ], "home");
    } else {
      screen("Wallet", [
        ...hero,
        el("h2", {}, ["Activity"]),
        feed,
        layoutSwitch(),
      ], "home");
    }
    followLedgers(account, viewGen, paint);
  } catch (error) {
    if (gen !== viewGen) return;
    screen("Wallet", [
      el("p", {}, [error.message || String(error)]),
      el("button", { class: "ghost", type: "button", onclick: () => home() }, ["Use a different account"]),
    ], "home");
  }
}

function sendForm(account, dest = "", amount = "") {
  rememberAccount(account);
  const destination = el("input", {
    type: "text",
    placeholder: "Destination r…",
    autocomplete: "off",
    spellcheck: "false",
    value: dest,
  });
  const xah = el("input", {
    type: "text",
    inputMode: "decimal",
    placeholder: "Amount XAH",
    autocomplete: "off",
    value: amount,
  });
  const note = el("p", { class: "muted" }, [""]);
  const go = el("button", { type: "button" }, [shell() === "desk" ? "Show QR for iPhone" : "Review"]);
  const back = safeReturn(params.get("return") || "", account);
  const body = [
    destination,
    xah,
    note,
    go,
    el("button", { class: "link", type: "button", onclick: () => composer({ account, back }) }, ["Trust lines, escrow, and other types"]),
  ];
  screen("Send", shell() === "desk" ? [el("div", { class: "card form" }, body)] : body, "send");
  rpc("account_info", { account, ledger_index: "validated" }).then((info) => {
    note.textContent = `Available ${dropsToXah(info.account_data.Balance)} XAH`;
  }).catch(() => {});
  go.addEventListener("click", () => {
    pay({ account, dest: destination.value.trim(), xah: xah.value.trim(), back }).catch((error) => rejected(account, back, error));
  });
}

function receiveParts(account) {
  const amount = el("input", {
    type: "text",
    inputMode: "decimal",
    placeholder: "Request amount, optional",
    autocomplete: "off",
  });
  const box = el("div", { class: "qrbox" });
  const paint = () => {
    const xah = amount.value.trim();
    const text = xah ? payLink({ page: location.href, dest: account, xah }) : account;
    try {
      box.replaceChildren(qrCanvas(text));
    } catch (error) {
      box.replaceChildren(el("p", { class: "warn" }, [error.message]));
    }
  };
  amount.addEventListener("input", paint);
  paint();
  return [
    box,
    el("div", { class: "receive-meta" }, [
      el("p", { class: "muted" }, ["Leave the amount empty and the code is your address."]),
      addressRow(account),
      amount,
    ]),
  ];
}

function receive(account) {
  rememberAccount(account);
  const parts = receiveParts(account);
  screen("Receive", [
    shell() === "desk" ? el("div", { class: "split card" }, parts) : el("div", {}, parts),
  ], "receive");
}

async function activity(account) {
  rememberAccount(account);
  screen("Activity", [el("p", { class: "muted" }, ["Loading…"])], "activity");
  const gen = viewGen;
  try {
    const rows = await recent(account, 15);
    if (gen !== viewGen) return;
    screen("Activity", [txList(rows)], "activity");
  } catch (error) {
    if (gen !== viewGen) return;
    screen("Activity", [el("p", {}, [error.message || String(error)])], "activity");
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
      const hit = (await recent(account, 8)).find((row) => row.hash && !seen.has(row.hash) && matchesWatch(row, account, watch));
      if (hit) {
        sent(account, back, hit.hash, { hash: hit.hash, result: "tesSUCCESS" });
        return;
      }
    } catch {
      if (gen === viewGen) status.textContent = "Still waiting. The network did not answer just now.";
    }
  }
}

function matchesWatch(row, account, watch) {
  if (!row.ok) return false;
  if (watch.any) return row.account === account;
  return samePayment(row, watch);
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
      : { any: true },
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
  const note = el("p", { class: "muted" }, ["Hold the code in the frame. Tap the picture if it stays blurry."]);
  const pasted = el("input", { type: "text", placeholder: "Or paste a link or address", autocomplete: "off", spellcheck: "false" });
  const open = el("button", { class: "ghost", type: "button" }, ["Open"]);
  const paste = el("div", { class: "paste" }, [pasted, open]);
  screen("Scan", shell() === "desk"
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
    throw new Error(`balance is ${dropsToXah(balance)} XAH. This send needs ${dropsToXah(drops + fee)} including the fee.`);
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
      sessionStorage.setItem(SEED_KEY, secret);
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
    sessionStorage.setItem(SEED_KEY, secret);
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
  if (!globalThis.XrplAccountLib) {
    screen("Signer is incomplete", [el("p", {}, ["The signing library did not load."])]);
    return;
  }
  const op = params.get("op");
  if (!globalThis.PublicKeyCredential && shell() === "phone" && op !== "scan" && op !== "receive") {
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
