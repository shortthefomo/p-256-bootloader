import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLoaderHtml, loaderChanged, renderBootloader } from "../src/bootloader.mjs";
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
import { decodeImage, decodeQr, encodeQr, rasterQr } from "../src/qr.mjs";
import { kindFromTx, parseScan, payLink, requestLink, samePayment } from "../src/scan.mjs";
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
check("loader loads the github stylesheet", html.includes("https://shortthefomo.github.io/p-256-bootloader/wallet.css"));
check("loader loads the github script", html.includes("https://shortthefomo.github.io/p-256-bootloader/wallet.js"));
check("loader keeps its style off the ledger", !html.includes("<style"));
check("loader has one script tag", html.split("</script>").length === 2);
const loaderFields = {
  signer: "https://shortthefomo.github.io/p-256-bootloader/",
  vault: bytesToHex(vault),
  cid: "aa".repeat(16),
};
check("a current loader is not an update", !loaderChanged(html, loaderFields));
check("a changed loader is an update", loaderChanged(html.replace("Wallet", "Purse"), loaderFields));
check("a missing loader is not an update", !loaderChanged("", loaderFields));
const walletJs = readFileSync(new URL("../public/wallet.js", import.meta.url), "utf8");
check("wallet script names the namespace", walletJs.includes(NAMESPACE));
check("wallet leaves the ledger through a link", walletJs.includes("function href(") && !walletJs.includes("location.assign"));
check("update is offered only for an old page", html.includes('<meta name="rev" content="2">') && walletJs.includes('content !== "2"'));

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

const signText = payLink({
  page: "https://shortthefomo.github.io/p-256-bootloader/?old=1",
  account,
  dest: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  xah: "1.5",
});
const qr = encodeQr(signText);
check("qr matrix roundtrip", decodeQr(qr.modules, qr.size) === signText, `v${qr.version}`);
const damaged = new Uint8Array(qr.modules);
damaged[qr.size * qr.size - 1] ^= 1;
damaged[qr.size * (qr.size - 1) - 3] ^= 1;
check("qr repairs two bad modules", decodeQr(damaged, qr.size) === signText);
const raster = rasterQr(signText, 4, 4);
check("qr image roundtrip", decodeImage(raster.rgba, raster.width, raster.height) === signText);

function placeQr(src, sw, sh, frame, fraction, degrees = 0) {
  const scene = new Uint8ClampedArray(frame * frame * 4);
  for (let i = 0; i < scene.length; i += 4) {
    scene[i] = 24;
    scene[i + 1] = 24;
    scene[i + 2] = 24;
    scene[i + 3] = 255;
  }
  const rad = degrees * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const side = frame * fraction;
  const scale = side / sw;
  const cx = (frame - 1) / 2;
  const cy = (frame - 1) / 2;
  const half = sw / 2;
  // The rotated square sticks out past its old upright box. Cover that box
  // or the finder corners are clipped and the code cannot be read.
  const reach = Math.ceil((side / 2) * (Math.abs(cos) + Math.abs(sin))) + 2;
  const y0 = Math.max(0, Math.floor(cy - reach));
  const y1 = Math.min(frame - 1, Math.ceil(cy + reach));
  const x0 = Math.max(0, Math.floor(cx - reach));
  const x1 = Math.min(frame - 1, Math.ceil(cx + reach));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x - cx) / scale;
      const dy = (y - cy) / scale;
      const sx = Math.round(cos * dx + sin * dy + half);
      const sy = Math.round(-sin * dx + cos * dy + half);
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const from = (sy * sw + sx) * 4;
      const at = (y * frame + x) * 4;
      scene[at] = src[from];
      scene[at + 1] = src[from + 1];
      scene[at + 2] = src[from + 2];
      scene[at + 3] = 255;
    }
  }
  for (let y = 1; y < frame - 1; y += 1) {
    for (let x = 1; x < frame - 1; x += 1) {
      const o = (y * frame + x) * 4;
      scene[o] = (scene[o - 4] + scene[o] + scene[o + 4]) / 3;
      scene[o + 1] = (scene[o - 3] + scene[o + 1] + scene[o + 5]) / 3;
      scene[o + 2] = (scene[o - 2] + scene[o + 2] + scene[o + 6]) / 3;
    }
  }
  return scene;
}

const soft = placeQr(raster.rgba, raster.width, raster.height, 640, 0.36);
check("qr reads a small blurred code", decodeImage(soft, 640, 640) === signText);
const tilted = placeQr(raster.rgba, raster.width, raster.height, 640, 0.55, 22);
check("qr reads a tilted code", decodeImage(tilted, 640, 640, 0) === signText);
const steep = placeQr(raster.rgba, raster.width, raster.height, 640, 0.55, 36);
check(
  "qr reads a steep tilt on a later frame",
  [20, -20].some((turn) => decodeImage(steep, 640, 640, turn) === signText),
);
const longText = "https://wallet.example/sign?" + "a".repeat(240);
const longQr = encodeQr(longText);
check("long qr roundtrip", decodeQr(longQr.modules, longQr.size) === longText && longQr.version > 8);

const parsedPay = parseScan(signText);
check("scan reads a pay link", parsedPay.type === "pay" && parsedPay.xah === "1.5" && parsedPay.account === account);
check("scan reads an address", parseScan(account).type === "address");
const request = requestLink({
  page: "https://shortthefomo.github.io/p-256-bootloader/",
  account,
  kind: "TrustSet",
  values: { issuer: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh", currency: "USD", limit: "100" },
});
const parsedRequest = parseScan(request);
check("scan reads a sign request", parsedRequest.type === "qr" && parsedRequest.kind === "TrustSet" && parsedRequest.values.limit === "100");
const detect = `https://xaman.app/detect/${Buffer.from(JSON.stringify({
  TransactionType: "Payment",
  Destination: account,
  Amount: "2500000",
})).toString("hex")}`;
const parsedDetect = parseScan(detect);
check("scan reads a xaman detect payment", parsedDetect.kind === "Payment" && parsedDetect.values.xah === "2.5");
check("xaman payload is not fetched", parseScan("https://xumm.app/sign/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").type === "xaman-payload");
check("scan ignores another site", parseScan("https://evil.example/steal").type === "unknown");
check("kind from trustset", kindFromTx({ TransactionType: "TrustSet", LimitAmount: { currency: "USD", issuer: account, value: "5" } })?.kind === "TrustSet");
check("payment watch matches drops", samePayment(
  { ok: true, hash: "abc", type: "Payment", destination: account, amount: "1500000" },
  { dest: account, drops: 1500000n },
));

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
