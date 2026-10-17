import { renderBootloader } from "./bootloader.mjs";
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
const params = new URLSearchParams(location.search);
const SEED_KEY = "p256-seed";

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

function screen(title, nodes) {
  app.replaceChildren(el("h1", {}, [title]), ...nodes);
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
  const returned = new URLSearchParams({ tx: hash, err: JSON.stringify(result) });
  location.replace(`${next}#${returned}`);
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
  screen("New transaction", [el("p", { class: "mono" }, [account]), kindSelect, fields, review]);
  review.addEventListener("click", () => {
    const values = Object.fromEntries([...inputs].map(([key, input]) => [key, input.value]));
    try {
      const preview = transactionFromKind(kindSelect.value, values);
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

async function pay({ account, dest, xah, back }) {
  const drops = xahToDrops(xah);
  const info = await rpc("account_info", { account, ledger_index: "validated" });
  const balance = BigInt(info.account_data.Balance);
  if (balance < drops + BigInt(HOOK_FEE)) {
    throw new Error(`balance is ${dropsToXah(balance)} XAH. This send needs ${dropsToXah(drops + BigInt(HOOK_FEE))} including the fee.`);
  }
  const made = transactionFromKind("Payment", { destination: dest, xah });
  await approve({ account, back, needsPublicKey: false, make: () => made });
}

function home() {
  const account = el("input", { type: "text", placeholder: "Account r…", autocomplete: "off", spellcheck: "false" });
  const seed = el("input", { type: "password", placeholder: "Family seed s…", autocomplete: "off", spellcheck: "false" });
  const lock = el("input", { type: "checkbox" });
  lock.checked = true;
  const create = el("button", {}, ["Create a wallet and attach iPhone"]);
  const sign = el("button", { class: "ghost" }, ["Sign a transaction"]);
  const use = el("button", { class: "ghost" }, ["Attach iPhone to this seed"]);
  const bad = originOk();
  screen("Xahau wallet", [
    el("p", {}, ["This page builds a transaction, your iPhone signs it with Face ID, and the firewall hook on the account accepts or rejects it."]),
    el("p", { class: "mono" }, [location.origin]),
    bad ? el("p", { class: "warn" }, [bad]) : el("p", { class: "muted" }, [
      "On a computer, choose the iPhone in the passkey prompt. On the phone, use Face ID.",
    ]),
    create,
    el("p", { class: "muted" }, ["Sign with an account that already has this iPhone attached."]),
    account,
    sign,
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
    composer({ account: text, back: safeReturn(params.get("return") || "", text) });
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
  if (!globalThis.XrplAccountLib) {
    screen("Signer is incomplete", [el("p", {}, ["The signing library did not load."])]);
    return;
  }
  if (!globalThis.PublicKeyCredential) {
    screen("No passkeys here", [el("p", {}, ["This browser has no WebAuthn. Open the signer in Safari on the iPhone, or in Chrome or Safari on a computer that can reach the phone."])]);
    return;
  }
  const op = params.get("op");
  try {
    if (op === "pay") {
      const account = params.get("account") || "";
      const dest = params.get("dest") || "";
      const xah = params.get("xah") || "";
      const back = safeReturn(params.get("return") || "", account);
      if (!account || !dest) throw new Error("the wallet did not name an account and a destination");
      await pay({ account, dest, xah, back });
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
    home();
  } catch (error) {
    fail(error);
  }
}

main();
