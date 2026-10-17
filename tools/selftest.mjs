import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLoaderHtml, renderBootloader } from "../src/bootloader.mjs";
import { transactionFromKind } from "../src/tx-forms.mjs";
import {
  DEVICE_FLAGS,
  base64url,
  buildPaymentPayload,
  buildTxPayload,
  bytesToHex,
  derToRaw,
  dropsToXah,
  hexToBytes,
  memoFromWebAuthn,
  openSeed,
  prfSalt,
  sealSeed,
  sha256,
  signWebAuthn,
  softwarePasskey,
  xahToDrops,
} from "../src/protocol.mjs";
import { HOOK_ON, NAMESPACE, accountBytes, safeReturn, stateValue } from "../src/wallet.mjs";
import { generate, libraries } from "xrpl-accountlib";

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(ok ? "PASS" : "FAIL", name, detail);
}

const nsBytes = hexToBytes(NAMESPACE);
check("namespace is 32 bytes", nsBytes.length === 32 && NAMESPACE.length === 64, String(NAMESPACE.length));
check("namespace spells p256boot", new TextDecoder().decode(nsBytes.slice(0, 8)) === "p256boot");
check("hookon is 32 bytes", hexToBytes(HOOK_ON).length === 32);

const other = new Uint8Array(20).fill(7);
const payload = buildPaymentPayload({ direction: 0, sequence: 1, counterparty: other, drops: 1000000n });
check("payment payload is 53 bytes", payload.length === 53);
check("payment payload magic", new TextDecoder().decode(payload.slice(0, 16)) === "xahau.passkey.v2");
check("payment challenge encodes to 71 chars", base64url(payload).length === 71);
check("sequence sits in the low uint32", payload[21] === 0 && payload[24] === 1);

const txPayload = buildTxPayload({ sequence: 9, txHash: new Uint8Array(32).fill(3) });
check("tx payload kind is 2", txPayload[16] === 2 && txPayload[20] === 9);

const highR = new Uint8Array(32).fill(0x11);
highR[0] = 0x80;
const s = new Uint8Array(32).fill(0x22);
const der = new Uint8Array([0x30, 0x45, 0x02, 0x21, 0x00, ...highR, 0x02, 0x20, ...s]);
const raw = derToRaw(der);
check("der high r", raw.length === 64 && raw.slice(0, 32).every((b, i) => b === highR[i]));

const passkey = await softwarePasskey();
const assertion = await signWebAuthn({
  pkcs8: passkey.pkcs8,
  payload,
  rpId: "p256.local",
  origin: "https://p256.local",
  flags: DEVICE_FLAGS,
});
check("clientData has one compact challenge", assertion.clientData.length <= 220 && !assertion.clientData.includes(0x20));
const memo = memoFromWebAuthn(assertion);
check("memo type is the v2 magic", memo.Memo.MemoType === bytesToHex(new TextEncoder().encode("xahau.passkey.v2")));
check("memo body length matches", hexToBytes(memo.Memo.MemoData).length === 2 + 37 + 2 + assertion.clientData.length + 64);

const key = await subtleKey();
async function subtleKey() {
  return sha256(new TextEncoder().encode("selftest-prf"));
}
const salt = await prfSalt(other);
check("prf salt is 32 bytes", salt.length === 32);
const vault = await sealSeed(key, "sEdTestSeed");
check("vault roundtrip", (await openSeed(key, vault)) === "sEdTestSeed");

check("xah drops", xahToDrops("1.5") === 1500000n && dropsToXah(1500000n) === "1.5");
check("xah whole", dropsToXah(2000000n) === "2");

const html = renderBootloader({
  signer: "https://shortthefomo.github.io/p-256-bootloader/",
  vault: bytesToHex(vault),
  cid: "aa".repeat(16),
});
const size = assertLoaderHtml(html);
check("loader fits", size <= 4096, `${size} bytes`);
check("loader names the signer", html.includes("https://shortthefomo.github.io/p-256-bootloader/"));
check("loader names the namespace", html.includes(NAMESPACE));
check("loader has no script close inside the script", html.split("</script>").length === 2);

const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
try {
  new Function(script);
  check("loader script parses", true);
} catch (error) {
  check("loader script parses", false, error.message);
}

let firewall = null;
try {
  firewall = await import("/tmp/passkey_p256_firewall/v2/sign.mjs");
} catch {
  firewall = null;
}
if (firewall) {
  const theirs = firewall.buildPayload({
    direction: 0,
    sequence: 1,
    counterparty: Buffer.from(other),
    drops: 1000000n,
  });
  check("payload matches firewall v2", Buffer.from(payload).equals(theirs));
  const theirTx = firewall.buildTxPayload({ sequence: 9, txHash: Buffer.alloc(32, 3) });
  check("tx payload matches firewall v2", Buffer.from(txPayload).equals(theirTx));
} else {
  console.log("SKIP firewall byte compare (clone not at /tmp/passkey_p256_firewall)");
}

const wasm = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "passkey_p256_firewall_v2.wasm"));
check("wasm is the firewall module", wasm[0] === 0 && wasm[1] === 0x61 && wasm.length > 1000, `${wasm.length} bytes`);

const account = "rP2UiVK5uHJqSkKv1D7koyrCjHNXtCopJW";
check("return allows the served pwa host", safeReturn(`https://pwa8.pwa.passkey.xahau-dev.net/${account}`, account) === `https://pwa8.pwa.passkey.xahau-dev.net/${account}`);
check("return allows the front door", safeReturn(`https://pwa.passkey.xahau-dev.net/${account}`, account) === `https://pwa.passkey.xahau-dev.net/${account}`);
check("return rejects another host", safeReturn(`https://evil.example/${account}`, account) === null);
const payment = transactionFromKind("Payment", { destination: account, xah: "2" });
check("payment form is native drops", payment.tx.Amount === "2000000" && payment.payment.drops === 2000000n);
const trust = transactionFromKind("TrustSet", { issuer: account, currency: "usd", limit: "100" });
check("trust line sets no ripple", trust.tx.LimitAmount.currency === "USD" && trust.tx.Flags === 131072);
const escrow = transactionFromKind("EscrowCreate", { destination: account, xah: "1", seconds: "60" }, 1_700_000_000);
check("escrow finish is ripple time", escrow.tx.FinishAfter === 1_700_000_000 + 60 - 946684800);
let badKind = false;
try { transactionFromKind("Payment", { destination: "nope", xah: "1" }); } catch { badKind = true; }
check("payment form rejects a bad address", badKind);
const pxKey = "5058".padStart(64, "0");
check("namespace key matches a right-aligned PX", stateValue({ namespace_entries: [{ HookStateKey: pxKey, HookStateData: "ab".repeat(32) }] }, "PX").length === 64);

const fresh = generate.familySeed();
const decoded = accountBytes({ libraries }, fresh.address);
check("account id is 20 bytes", decoded.length === 20, fresh.address);

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
