// Installs the firewall on a fresh faucet account, publishes the bootloader,
// and checks the hook rejects an unsigned payment and accepts a v2 memo.
// The passkey here is a software P-256 key. An iPhone is attached from the signer.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBootloader } from "../src/bootloader.mjs";
import {
  bytesToHex,
  memoFromWebAuthn,
  sha256,
  signWebAuthn,
  softwarePasskey,
} from "../src/protocol.mjs";
import {
  FAUCET,
  HOOK_FEE,
  NAMESPACE,
  PWA_HOST,
  accountBytes,
  accountSetLoaderTx,
  invokeTx,
  paymentChallenge,
  firewallBlock,
  rpcHttp,
  rpcSocket,
  setHookTx,
  stateValue,
  submitTx,
} from "../src/wallet.mjs";
import { libraries, XrplDefinitions, binary, derive, sign } from "xrpl-accountlib";

const RP_ID = "p256.local";
const ORIGIN = "https://p256.local";
const SIGNER = "http://127.0.0.1:8787/signer.html";
const api = { libraries, XrplDefinitions, binary, sign, derive };

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail);
}

async function faucet() {
  const response = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = await response.json();
  if (!body.account?.secret) throw new Error(`faucet failed: ${JSON.stringify(body)}`);
  return derive.familySeed(body.account.secret);
}

async function signedPayment(wallet, passkey, destination, drops) {
  const info = await rpcHttp("account_info", { account: wallet.address, ledger_index: "validated" });
  const sequence = info.account_data.Sequence;
  const payload = await paymentChallenge(api, { sequence, destination, drops });
  const assertion = await signWebAuthn({ pkcs8: passkey.pkcs8, payload, rpId: RP_ID, origin: ORIGIN });
  return submitTx(api, rpcHttp, wallet, {
    TransactionType: "Payment",
    Destination: destination,
    Amount: String(drops),
    Sequence: sequence,
    Fee: HOOK_FEE,
    Memos: [memoFromWebAuthn(assertion)],
  }, await defs());
}

let definitions;
async function defs() {
  if (!definitions) definitions = await (await import("../src/wallet.mjs")).networkDefinitions(api, rpcHttp);
  return definitions;
}

async function main() {
  const wasm = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "passkey_p256_firewall_v2.wasm"),
  );
  const probe = rpcSocket();
  const block = await firewallBlock(probe, bytesToHex(wasm));
  probe.close();
  if (block) throw new Error(block);
  const owner = await faucet();
  const other = await faucet();
  console.log("account", owner.address);
  console.log("payee", other.address);

  const passkey = await softwarePasskey();
  const definitionsNow = await defs();
  const installed = await submitTx(api, rpcHttp, owner, setHookTx(bytesToHex(wasm)), definitionsNow);
  record("install hook", installed.result === "tesSUCCESS", `${installed.result} ${installed.hash}`);

  const rp = bytesToHex(await sha256(new TextEncoder().encode(RP_ID)));
  const configured = await submitTx(api, rpcHttp, owner, invokeTx([
    ["PX", bytesToHex(passkey.x)],
    ["PY", bytesToHex(passkey.y)],
    ["RP", rp],
    ["OR", bytesToHex(new TextEncoder().encode(ORIGIN))],
  ]), definitionsNow);
  record("store passkey", configured.result === "tesSUCCESS", `${configured.result} ${configured.hook}`);
  try {
    const ns = await rpcHttp("account_namespace", {
      account: owner.address,
      namespace_id: NAMESPACE,
      ledger_index: "validated",
    });
    const entries = ns.namespace_entries || ns.namespaceEntries || [];
    console.log("namespace fields", Object.keys(ns).join(","));
    console.log(entries.map((entry) => `${entry.HookStateKey} ${(entry.HookStateData || "").length}`).join("\n"));
    record("namespace lists PX", stateValue(ns, "PX").length === 64, `${entries.length} entries`);
  } catch (error) {
    record("namespace lists PX", false, error.message);
  }

  const html = renderBootloader({ signer: SIGNER });
  const published = await submitTx(api, rpcHttp, owner, accountSetLoaderTx(html), definitionsNow);
  record("publish bootloader", published.result === "tesSUCCESS", `${published.result} ${html.length} bytes ${published.hash}`);

  const bare = await submitTx(api, rpcHttp, owner, {
    TransactionType: "Payment",
    Destination: other.address,
    Amount: "1000000",
    Fee: HOOK_FEE,
  }, definitionsNow);
  record("unsigned payment rejected", bare.result !== "tesSUCCESS", `${bare.result} ${bare.hook}`);

  const paid = await signedPayment(owner, passkey, other.address, 1000000n);
  record("passkey payment accepted", paid.result === "tesSUCCESS", `${paid.result} ${paid.hook} ${paid.hash}`);

  const locked = await submitTx(api, rpcHttp, owner, invokeTx([["LV", "03"]]), definitionsNow);
  record("lock level 3", locked.result === "tesSUCCESS", `${locked.result} ${locked.hook}`);

  const blocked = await submitTx(api, rpcHttp, owner, {
    TransactionType: "Payment",
    Destination: other.address,
    Amount: "1000000",
    Fee: HOOK_FEE,
  }, definitionsNow);
  record("level 3 blocks an unsigned payment", blocked.result !== "tesSUCCESS", `${blocked.result} ${blocked.hook}`);

  const page = await fetch(`${PWA_HOST}/${owner.address}`, { redirect: "manual" });
  const location = page.headers.get("location") || "";
  record("loader redirects to a per-account host", page.status === 301 && location.includes(owner.address), `${page.status} ${location}`);
  const served = await fetch(location.startsWith("//") ? `https:${location}` : location);
  const body = await served.text();
  const csp = served.headers.get("content-security-policy") || "";
  record(
    "served document is the sandboxed wallet",
    served.status === 200 && body.includes("Sign with iPhone") && body.includes(SIGNER) && csp.includes("sandbox"),
    `${served.status} ${csp}`,
  );
  console.log("wallet", location.startsWith("//") ? `https:${location}` : location);
  console.log("account id bytes", accountBytes(api, owner.address).length);

  const failed = results.filter((item) => !item.ok).length;
  if (failed) {
    console.log(`${failed} failed`);
    process.exit(1);
  }
  console.log(`${results.length} passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
