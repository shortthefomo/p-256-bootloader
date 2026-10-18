import { renderBootloader } from "./bootloader.mjs";
import { decodeImage, encodeQr } from "./qr.mjs";
import {
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
  base64url,
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
  HOOK_FEE,
  NAMESPACE,
  accountBytes,
  accountSetLoaderTx,
  invokeTx,
  loaderHtmlFromEntry,
  networkDefinitions,
  paymentChallenge,
  prepareFields,
  pwaUrl,
  rpcSocket,
  safeReturn,
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
let viewGen = 0;
let stopCamera = () => {};

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
  for (const child of children) node.append(child?.nodeType ? child : document.createTextNode(child ?? ""));
  return node;
}

function screen(title, nodes, mode = "") {
  stopCamera();
  viewGen += 1;
  app.replaceChildren(el("h1", {}, [title]), ...nodes);
  if (mode) renderNav(mode);
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

function passkeyLabel(summary) {
  const chars = [...String(summary || "Xahau transaction").replace(/\s+/g, " ").trim()];
  const encode = new TextEncoder();
  while (chars.length && encode.encode(chars.join("")).length > 64) chars.pop();
  return chars.join("").trim() || "Xahau transaction";
}

// The system sheet titles itself with the website. The passkey name is the
// transaction being approved, and it is put back to the account afterwards.
async function labelPasskey(accountId, label) {
  const signal = globalThis.PublicKeyCredential?.signalCurrentUserDetails;
  if (typeof signal !== "function") return;
  const text = passkeyLabel(label);
  try {
    await signal.call(globalThis.PublicKeyCredential, {
      rpId: location.hostname,
      userId: base64url(accountId),
      name: text,
      displayName: text,
    });
  } catch {
    // The sheet still opens when the name cannot be updated.
  }
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
      item.textContent = detail ? `${step.label}. ${detail}` : `${step.label}.`;
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
  const pre = el("pre", { class: "json" }, [JSON.stringify(result, null, 2)]);
  const backBtn = el("button", { onclick: () => location.assign(`${next}#tx=${hash}`) }, ["Back to wallet"]);
  screen("Result", [pre, backBtn]);
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
  const prepared = await prepareFields(rpc, holder, { ...made.tx, Sequence: fresh.account_data.Sequence, Fee: HOOK_FEE });
  const pre = el("pre", { class: "json" });
  const paint = () => { pre.textContent = txJson(prepared, spk); };
  paint();
  const go = el("button", {}, ["Sign with iPhone"]);
  screen("Transaction", [pre, go]);

  async function finish() {
    go.disabled = true;
    const definitions = await networkDefinitions(api, rpc);
    const challenge = made.payment
      ? await paymentChallenge(api, { sequence: prepared.Sequence, destination: made.payment.destination, drops: made.payment.drops })
      : await txChallenge(api, prepared, holder, definitions);
    await labelPasskey(idBytes, made.summary);
    let assertion;
    try {
      assertion = await getPasskey(challenge, salt, loaded.credentialId);
    } finally {
      await labelPasskey(idBytes, account);
    }
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
  const update = el("button", { class: "ghost", onclick: () => republish(account, back).catch((error) => rejected(account, back, error)) }, ["Update the wallet page"]);
  screen("New transaction", [el("p", { class: "mono" }, [account]), kindSelect, fields, review, update]);
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
  const items = shell() === "phone"
    ? [["home", "Home"], ["send", "Send"], ["scan", "Scan"], ["receive", "Receive"]]
    : [["home", "Home"], ["send", "Send"], ["receive", "Receive"], ["activity", "Activity"], ["scan", "Scan"]];
  const buttons = items.map(([id, label]) => el("button", {
    class: id === active ? "tab on" : "tab",
    type: "button",
    onclick: () => route(id, account),
  }, [label]));
  buttons.push(el("button", {
    class: "tab",
    type: "button",
    onclick: () => {
      localStorage.setItem(SHELL_KEY, shell() === "desk" ? "phone" : "desk");
      location.reload();
    },
  }, [shell() === "desk" ? "Phone" : "Computer"]));
  nav.replaceChildren(...buttons);
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
  }, ["Copy address"]);
}

function txList(rows) {
  if (!rows.length) return el("p", { class: "muted" }, ["No transactions yet."]);
  return el("div", {}, rows.map((row) => el("div", { class: "tx" }, [
    el("b", {}, [row.line]),
    el("span", { class: row.ok ? "muted" : "warn" }, [row.ok ? shortAddress(row.hash) : "Failed"]),
  ])));
}

async function recent(account, limit) {
  const page = await rpc("account_tx", { account, limit });
  return (page.transactions || []).map(describeTx);
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
    const info = await rpc("account_info", { account, ledger_index: "validated" });
    if (gen !== viewGen) return;
    let rows = [];
    try {
      rows = await recent(account, 6);
    } catch {
      rows = [];
    }
    if (gen !== viewGen) return;
    const balance = dropsToXah(info.account_data.Balance);
    screen("Wallet", [
      el("p", { class: "balance" }, [balance, el("span", {}, [" XAH"])]),
      el("p", { class: "mono" }, [account]),
      copyButton(account),
      el("p", { class: "muted" }, [
        shell() === "desk"
          ? "A send on this computer shows a QR code. Scan it with the wallet on your iPhone."
          : "Send with Face ID, or scan a QR code to sign a request from another screen.",
      ]),
      el("h2", {}, ["Recent"]),
      txList(rows),
      el("button", {
        class: "ghost",
        type: "button",
        onclick: () => republish(account, pwaUrl(account)).catch((error) => rejected(account, pwaUrl(account), error)),
      }, ["Update the wallet page"]),
    ], "home");
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
  screen("Send", [
    el("p", { class: "mono" }, [account]),
    destination,
    xah,
    note,
    go,
    el("button", { class: "ghost", type: "button", onclick: () => composer({ account, back }) }, ["Other transactions"]),
  ], "send");
  rpc("account_info", { account, ledger_index: "validated" }).then((info) => {
    note.textContent = `Available ${dropsToXah(info.account_data.Balance)} XAH`;
  }).catch(() => {});
  go.addEventListener("click", () => {
    pay({ account, dest: destination.value.trim(), xah: xah.value.trim(), back }).catch((error) => rejected(account, back, error));
  });
}

function receive(account) {
  rememberAccount(account);
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
  screen("Receive", [
    el("p", { class: "muted" }, ["With no amount, the code is your address. Another wallet can scan it."]),
    box,
    el("p", { class: "mono" }, [account]),
    copyButton(account),
    amount,
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
    el("p", {}, [summary]),
    canvas,
    el("p", { class: "muted" }, ["Open this wallet on the iPhone and tap Scan. The iPhone camera can open the code too."]),
    status,
    here,
    el("button", {
      class: "ghost",
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
  const finder = el("div", { class: "finder" }, [video, el("div", { class: "reticle" })]);
  const note = el("p", { class: "muted" }, ["Point the camera at a sign QR or an account address."]);
  const pasted = el("input", { type: "text", placeholder: "Or paste a link or address", autocomplete: "off", spellcheck: "false" });
  const open = el("button", { class: "ghost", type: "button" }, ["Open pasted code"]);
  screen("Scan", [finder, note, pasted, open], "scan");
  const gen = viewGen;
  open.addEventListener("click", () => {
    if (pasted.value.trim()) openScanned(pasted.value.trim());
  });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stopped = false;
  let timer = 0;
  stopCamera = () => {
    stopped = true;
    if (timer) clearInterval(timer);
    video.srcObject?.getTracks?.().forEach((track) => track.stop());
  };
  let detector = null;
  try {
    if ("BarcodeDetector" in globalThis) detector = new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    detector = null;
  }
  timer = setInterval(async () => {
    if (stopped || gen !== viewGen || video.readyState < 2) return;
    const maxEdge = 480;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(21, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(21, Math.round(video.videoHeight * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let text = "";
    if (detector) {
      try {
        const codes = await detector.detect(canvas);
        text = codes[0]?.rawValue || "";
      } catch {
        text = "";
      }
    }
    if (!text) {
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      text = decodeImage(frame.data, canvas.width, canvas.height);
    }
    if (text && gen === viewGen) openScanned(text);
  }, 200);
  navigator.mediaDevices?.getUserMedia?.({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  }).then((stream) => {
    if (gen !== viewGen) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    video.srcObject = stream;
  }).catch(() => {
    if (gen === viewGen) note.textContent = "The camera is not available. Paste the link or the address instead.";
  });
}

async function pay({ account, dest, xah, back }) {
  const drops = xahToDrops(xah);
  const info = await rpc("account_info", { account, ledger_index: "validated" });
  const balance = BigInt(info.account_data.Balance);
  if (balance < drops + BigInt(HOOK_FEE)) {
    throw new Error(`balance is ${dropsToXah(balance)} XAH. This send needs ${dropsToXah(drops + BigInt(HOOK_FEE))} including the fee.`);
  }
  const made = transactionFromKind("Payment", { destination: dest, xah });
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
  nav.hidden = true;
  const account = el("input", { type: "text", placeholder: "Account r…", autocomplete: "off", spellcheck: "false" });
  const seed = el("input", { type: "password", placeholder: "Family seed s…", autocomplete: "off", spellcheck: "false" });
  const lock = el("input", { type: "checkbox" });
  lock.checked = true;
  const create = el("button", {}, ["Create a wallet and attach iPhone"]);
  const sign = el("button", { class: "ghost" }, ["Open this account"]);
  const update = el("button", { class: "ghost" }, ["Update the wallet page"]);
  const use = el("button", { class: "ghost" }, ["Attach iPhone to this seed"]);
  const bad = originOk();
  screen("Xahau wallet", [
    el("p", {}, ["Your iPhone approves every send. On a computer the wallet shows a QR code. On the phone, scan one."]),
    el("p", { class: "mono" }, [location.origin]),
    bad ? el("p", { class: "warn" }, [bad]) : el("p", { class: "muted" }, [
      shell() === "desk"
        ? "This is the computer wallet. The iPhone scans the QR and uses Face ID."
        : "This is the phone wallet. Face ID signs here, and Scan reads a QR from another screen.",
    ]),
    create,
    el("p", { class: "muted" }, ["Sign with an account that already has this iPhone attached."]),
    account,
    sign,
    update,
    el("p", { class: "muted" }, ["Or attach a passkey to a wallet you already have."]),
    seed,
    el("label", {}, [lock, el("span", {}, ["Lock the hook. A lost passkey cannot be replaced, and the seed cannot take the hook off."])]),
    use,
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
  update.addEventListener("click", () => {
    const text = account.value.trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(text)) {
      fail(new Error("enter the account address"));
      return;
    }
    const back = safeReturn(params.get("return") || "", text) || pwaUrl(text);
    republish(text, back).catch(fail);
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
  if (!globalThis.PublicKeyCredential && shell() === "phone") {
    screen("No passkeys here", [el("p", {}, ["This browser has no WebAuthn. Open the wallet in Safari on the iPhone."])]);
    return;
  }
  const op = params.get("op");
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
