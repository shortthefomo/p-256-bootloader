import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertLoaderHtml, loaderChanged, renderBootloader } from "../src/bootloader.mjs";
import { TX_KINDS, transactionFromKind } from "../src/tx-forms.mjs";
import { cardArt, heldOffer, incomingOffer, uriFromHex, uriToHex } from "../src/uri-tokens.mjs";
import {
  DEVICE_FLAGS,
  MAX_CLIENT_DATA,
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
import { buyOfferLink, describeTx, kindFromTx, parseScan, payLink, requestLink, saleLink, samePayment, sameTransaction, shortAddress, toolLink, tweetLink, walletLink } from "../src/scan.mjs";
import { saleQuery, visibleSale } from "../src/sale-page.mjs";
import { AMOUNT_FORMATS, LANGUAGES, browserLanguage, canonicalAmount, formatDrops, translate } from "../src/locale.mjs";
import { addressesFromTxt, defaultRpcs, hexIndexToDecimal, judge, parsePwaUrl, sha512Half, stripEtag } from "../src/pwa-check.mjs";
import { EXPLORER, HOOK_HASH, HOOK_ON, INTERFACE_REV, NAMESPACE, accountBytes, explorerUrls, feeCeiling, hookLevel, levelTx, pageAccount, pwaPage, pwaUrl, safeReturn, sessionReturn, stateValue, txUrl } from "../src/wallet.mjs";
import { createHash } from "node:crypto";
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
check("client data cap is 208", MAX_CLIENT_DATA === 208);
check("clientData has one compact challenge", assertion.clientData.length <= MAX_CLIENT_DATA && !assertion.clientData.includes(0x20));
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
const signerApp = readFileSync(new URL("../src/signer-app.mjs", import.meta.url), "utf8");
check("wallet script names the namespace", walletJs.includes(NAMESPACE));
check("wallet leaves the ledger through a link", walletJs.includes("function href(") && !walletJs.includes("location.assign"));
check("update is offered only for an old page", html.includes('<meta name="rev" content="2">') && INTERFACE_REV === "2" && walletJs.includes('var INTERFACE_REV = "2"') && walletJs.includes("publishedRev !== INTERFACE_REV"));
check("settings compares the firewall and the page", signerApp.includes('function settings(account, section = "version")') && signerApp.includes("HOOK_HASH") && walletJs.includes('panel("settings")') && walletJs.includes("p256-lang") && walletJs.includes("p256-format"));
check("amount formats group the same drops", formatDrops(1234500000n, "plain") === "1234.5" && formatDrops(1234500000n, "comma-dot") === "1,234.5" && formatDrops(1234500000n, "dot-comma") === "1.234,5" && formatDrops(1234500000n, "space-dot") === "1 234.5" && formatDrops(2000000n, "dot-comma") === "2");
check("typed amounts become the plain form", canonicalAmount("1,234.5", "comma-dot") === "1234.5" && canonicalAmount("1.234,5", "dot-comma") === "1234.5" && canonicalAmount("1 234.5", "space-dot") === "1234.5" && canonicalAmount("1.5", "plain") === "1.5");
check("an unknown language uses English", translate("zz", "settings") === "Settings" && LANGUAGES.some((item) => item.id === "en") && AMOUNT_FORMATS.some((item) => item.id === "plain"));
check("the front door follows the browser language", browserLanguage(["es-MX"]) === "es" && browserLanguage("fr-FR") === "fr" && browserLanguage(["zh-CN"]) === "zh" && browserLanguage("ja") === "ja" && browserLanguage(["ko-KR"]) === "ko" && browserLanguage("de-DE") === "de" && browserLanguage("pt-BR") === "pt" && browserLanguage(["nl", "en-GB"]) === "en" && browserLanguage("nl") === "en" && browserLanguage("") === "en" && browserLanguage(["sv-SE", "fr"]) === "fr" && signerApp.includes("browserLanguage(") && signerApp.includes('text("createWallet")') && signerApp.includes('text("setup")') && !signerApp.includes('["Create a wallet"]') && translate("en", "createWallet") === "Create a wallet" && translate("es", "createWallet") === "Crear un monedero" && translate("fr", "haveWallet") === "J’ai déjà un portefeuille" && translate("de", "openWallet") === "Wallet öffnen" && translate("pt", "attachFirewall") === "Anexar o firewall" && translate("zh", "setup") === "开始" && translate("ja", "createWallet") === "ウォレットを作る" && translate("ko", "openWallet") === "지갑 열기");
function openLedgerLang(hash, navigatorValue, storage) {
  const start = walletJs.indexOf('var LANGS = ["en", "es", "fr", "de", "pt", "zh", "ja", "ko"];');
  const end = walletJs.indexOf("\nfunction shellChoice(");
  const loggedStart = walletJs.indexOf("function loggedIn()");
  const loggedEnd = walletJs.indexOf("\nfunction href(");
  const box = {
    URLSearchParams,
    location: { hash: hash || "" },
    navigator: Array.isArray(navigatorValue) || typeof navigatorValue === "string" || navigatorValue == null
      ? { languages: navigatorValue == null ? [] : navigatorValue }
      : navigatorValue,
    localStorage: storage || {
      getItem() { throw new Error("SecurityError"); },
      setItem() { throw new Error("SecurityError"); },
    },
    document: { documentElement: { lang: "" } },
  };
  runInNewContext(`${walletJs.slice(start, end)}\n${walletJs.slice(loggedStart, loggedEnd)}\nthis.language = language; this.rememberPref = rememberPref; this.browserLanguage = browserLanguage;`, box);
  return box;
}
function langStore(bag) {
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null; },
    setItem(key, value) { bag[key] = String(value); },
  };
}
const langSamples = [["es-MX"], "fr-FR", ["zh-CN"], "ja", ["ko-KR"], "de-DE", "pt-BR", ["nl", "en-GB"], "nl", "", ["sv-SE", "fr"], ["zh-Hans"], ["pt", "en"]];
const langProbe = openLedgerLang("", []);
const langCases = [
  ["", ["es-MX"], null, "es"],
  ["", ["fr-FR"], null, "fr"],
  ["", ["zh-CN"], null, "zh"],
  ["", ["zh-Hans", "en"], null, "zh"],
  ["", ["ja"], null, "ja"],
  ["", ["ko-KR"], null, "ko"],
  ["", ["de-DE"], null, "de"],
  ["", ["pt-BR"], null, "pt"],
  ["", ["nl", "en-GB"], null, "en"],
  ["", ["nl"], null, "en"],
  ["", "", null, "en"],
  ["", ["sv-SE", "fr"], null, "fr"],
  ["", { languages: { 0: "pt-BR", length: 1 } }, null, "pt"],
  ["", { language: "ko-KR" }, null, "ko"],
  ["#token=abc", ["es-MX"], null, "es"],
  ["#login=1", ["es-MX"], null, "en"],
  ["#login=1&view=nfts", ["ja"], null, "en"],
  ["", ["ja"], langStore({ "p256-lang": "fr" }), "fr"],
  ["#login=1", ["ja"], langStore({ "p256-lang": "de" }), "de"],
  ["", ["es-MX"], langStore({ "p256-lang": "zz" }), "es"],
  ["#login=1", ["es-MX"], langStore({ "p256-lang": "zz" }), "en"],
];
const langFailures = [];
if (!langSamples.every((sample) => langProbe.browserLanguage(sample) === browserLanguage(sample))) langFailures.push("tags");
for (const [hash, languages, storage, want] of langCases) {
  const box = openLedgerLang(hash, languages, storage);
  const got = box.language();
  if (got !== want || box.document.documentElement.lang !== want) langFailures.push(`${hash} ${JSON.stringify(languages)} => ${got}/${box.document.documentElement.lang}`);
}
const langSession = openLedgerLang("", ["ja"]);
langSession.rememberPref("p256-lang", "ko");
if (langSession.language() !== "ko") langFailures.push("session");
check("a visitor follows the browser language", langFailures.length === 0 && walletJs.includes('pref("p256-lang", LANGS, "")') && walletJs.includes('loggedIn() ? "en" : browserLanguage(browserLanguages())'), langFailures.join("; "));
check("chinese japanese and korean are listed", ["zh", "ja", "ko"].every((id) => LANGUAGES.some((item) => item.id === id)) && translate("zh", "settings") === "设置" && translate("ja", "settings") === "設定" && translate("ko", "settings") === "설정" && walletJs.includes('"ko"') && walletJs.includes("한국어") && walletJs.includes("中文") && walletJs.includes("日本語"));
check("layout choice sits in general", signerApp.includes('text("layout")') && signerApp.includes('chooseShell("desk")') && !signerApp.includes("function layoutSwitch") && walletJs.includes('shellButton("phone", "mobile")') && walletJs.includes('shellButton("desk", "desktop")') && translate("en", "mobile") === "Mobile" && translate("en", "desktop") === "Desktop");
const localeSrc = readFileSync(new URL("../src/locale.mjs", import.meta.url), "utf8");
let badLevel = false;
try { levelTx(4); } catch { badLevel = true; }
check("level 3 firewall update keeps the hook installed", hookLevel({}) === 1 && hookLevel({ namespace_entries: [{ HookStateKey: "4C56".padStart(64, "0"), HookStateData: "03" }] }) === 3 && hookLevel({ namespace_entries: [{ HookStateKey: "4C56".padStart(64, "0"), HookStateData: "02" }] }) === 2 && levelTx(2).TransactionType === "Invoke" && levelTx(2).HookParameters[0].HookParameter.HookParameterValue === "02" && levelTx(3).HookParameters[0].HookParameter.HookParameterValue === "03" && badLevel && !signerApp.includes("clearHookTx") && signerApp.includes("levelTx(2)") && signerApp.includes("setHookTx(code)") && signerApp.includes("p256-restore-level") && translate("en", "lowerFirewall") === "Lower the firewall to level 2" && ["stays installed", "sigue instalado", "reste installé", "bleibt installiert", "continua instalado", "仍会留在", "導入されたまま", "설치된 채로"].every((part) => localeSrc.includes(part)));
check("ledger json starts collapsed", walletJs.includes('createElement("details")') && walletJs.includes("raw.open = false"));
check("signer json starts collapsed", signerApp.includes('class: "raw"') && signerApp.includes('["Details"]') && signerApp.includes('["Transaction details"]') && signerApp.includes('el("details", { class: "raw" }, [\n      el("summary", {}, ["Details"])'));
check("the approval screen opens transaction details", signerApp.includes('el("details", { class: "raw", open: true }, [el("summary", {}, ["Transaction details"])'));
check("signing does not rename the passkey", !signerApp.includes("signalCurrentUserDetails"));
const walletSrc = readFileSync(new URL("../src/wallet.mjs", import.meta.url), "utf8");
const liveSrc = readFileSync(new URL("./live.mjs", import.meta.url), "utf8");
check("wallet asks the network for the fee", walletSrc.includes("async function requiredFee") && walletSrc.includes("function levelTx") && !walletSrc.includes("clearHookTx") && !walletSrc.includes("HOOK_FEE") && !walletSrc.includes("2000000"));
let badHookCode = false;
try { feeCeiling({ Hooks: [{ Hook: { CreateCode: "abc" } }] }); } catch { badHookCode = true; }
const asserted = signerApp.indexOf("await assertAssertion(assertion, challenge)");
check("a quoted fee cannot exceed what the transaction can cost", feeCeiling({ TransactionType: "Payment" }) === 2n * 1000000n && feeCeiling({ Hooks: [{ Hook: { CreateCode: "" } }] }) === 2n * 1000000n && feeCeiling({ Hooks: [{ Hook: { CreateCode: "ab".repeat(10) } }] }) === 10n * 500n * 2n + 2n * 1000000n && badHookCode && walletSrc.includes("the network fee is higher than this transaction can cost"));
check("a uri token mint keeps the card uri", transactionFromKind("URITokenMint", { uri: "xahaucards://XC-01-000-C-01-04-1", burnable: "1", xah: "1" }).tx.URI === uriToHex("xahaucards://XC-01-000-C-01-04-1") && transactionFromKind("URITokenMint", { uri: "xahaucards://XC-01-000-C-01-04-1", burnable: "1", xah: "1" }).tx.Flags === 1 && transactionFromKind("URITokenMint", { uri: "xahaucards://XC-01-000-C-01-04-1", burnable: "1", xah: "1" }).tx.Amount === "1000000" && transactionFromKind("URITokenBurn", { id: "ab".repeat(32) }).tx.URITokenID === "AB".repeat(32) && transactionFromKind("URITokenCreateSellOffer", { id: "cd".repeat(32), xah: "5" }).tx.Amount === "5000000" && uriFromHex(uriToHex("xahaucards://XC-01-500-L-20-20-1")) === "xahaucards://XC-01-500-L-20-20-1" && cardArt("xahaucards://XC-01-500-L-20-20-1") === "https://xahaucards.com/card/XC-01-500-L-20-20.webp" && cardArt("https://evil.example") === "");
check("signer has an nft tab", signerApp.includes('id === "nfts"') && !signerApp.includes("URITokenMint") && signerApp.includes("URITokenBurn") && signerApp.includes("URITokenCreateSellOffer") && signerApp.includes('class: "nft-grid"') && walletJs.includes('addTab("nfts"') && walletJs.includes('className = "nft-grid"') && walletJs.includes('type: "uri_token"') && !walletJs.includes('i18n = "nftMint"') && translate("en", "nfts") === "NFTs" && translate("ko", "nftBurn") === "소각");
check("phone combines send and receive", signerApp.includes('["home", "transfer", "nfts", "shop", "scan", "settings"]') && signerApp.includes('["home", "send", "receive", "nfts", "shop", "activity", "scan", "settings"]') && walletJs.includes('addTab("transfer", "transfer");') && walletJs.includes('addTab("nfts", "nfts")') && !walletJs.includes('addTab("shop"') && !walletJs.includes('addTab("send"') && !walletJs.includes('addTab("receive"') && translate("en", "transfer") === "Transfer" && translate("es", "transfer") === "Mover" && translate("fr", "transfer") === "Transfert" && translate("de", "transfer") === "Transfer" && translate("pt", "transfer") === "Mover" && translate("zh", "transfer") === "收发" && translate("ja", "transfer") === "入出金" && translate("ko", "transfer") === "이체" && walletJs.includes('transfer: "Transfer"') && walletJs.includes('transfer: "收发"') && walletJs.includes('transfer: "이체"') && translate("en", "shop") === "Shop" && translate("ko", "shop") === "상점");
const offeredId = "ab".repeat(32);
const buyer = "rDsbRZVhvZr7JZ6yexwbGAmPr9VBiYhbMB";
const seller = "rDvFquaHWiyWNcxk9fKhjtBtzyULTgbguL";
const freeBuy = transactionFromKind("URITokenBuy", { id: offeredId, xah: "0" });
const freeSell = transactionFromKind("URITokenCreateSellOffer", { id: offeredId, xah: "0", destination: buyer });
let publicFree = false;
try { transactionFromKind("URITokenCreateSellOffer", { id: offeredId, xah: "0" }); } catch { publicFree = true; }
const offerRow = describeTx({
  hash: "cd".repeat(32),
  tx: { TransactionType: "URITokenCreateSellOffer", Account: seller, Destination: buyer, Amount: "0", URITokenID: offeredId },
  meta: { TransactionResult: "tesSUCCESS" },
});
const openToken = { id: offeredId.toUpperCase(), owner: seller, destination: buyer, amount: "0" };
check("a free uri offer can be accepted", freeBuy.tx.Amount === "0" && freeSell.tx.Amount === "0" && freeSell.tx.Destination === buyer && publicFree && offerRow.tokenId === offeredId.toUpperCase() && incomingOffer(offerRow, buyer, openToken)?.xah === "0" && incomingOffer(offerRow, seller, openToken) == null && heldOffer(buyer, openToken)?.xah === "0" && heldOffer(seller, openToken) == null && translate("en", "nftAccept") === "Accept" && translate("ko", "nftDecline") === "거절" && signerApp.includes("nftAccept") && signerApp.includes('class: "nft-overlay"') && !signerApp.includes("tx-actions") && walletJs.includes("nftDecline") && walletJs.includes('className = "nft-overlay"') && walletJs.includes('act: "buy"') && translate("en", "nftCount") === "{n} of {m}" && translate("ja", "nftClose") === "閉じる");
const kinds = TX_KINDS.map((item) => item.id);
const iouSell = transactionFromKind("URITokenCreateSellOffer", { id: offeredId, xah: "2", currency: "USD", issuer: buyer });
check("other transactions can offer a uri token",
  kinds.includes("URITokenCreateSellOffer") &&
  kinds.includes("URITokenCancelSellOffer") &&
  kinds.includes("URITokenBuy") &&
  !kinds.includes("URITokenMint") &&
  transactionFromKind("URITokenCreateSellOffer", { id: offeredId, xah: "5" }).tx.Amount === "5000000" &&
  iouSell.tx.Amount.currency === "USD" && iouSell.tx.Amount.value === "2" && iouSell.tx.Amount.issuer === buyer &&
  !signerApp.includes("URITokenMint") &&
  !signerApp.includes("selling = !selling") &&
  signerApp.includes('text("nftMakeOffer")') && walletJs.includes('t("nftMakeOffer")') &&
  walletJs.includes('act: "sell"') &&
  translate("en", "nftMakeOffer") === "Put up for sale" && translate("es", "nftMakeOffer") === "Poner en venta" && translate("fr", "nftMakeOffer") === "Mettre en vente" && translate("de", "nftMakeOffer") === "Zum Verkauf stellen" && translate("pt", "nftMakeOffer") === "Colocar à venda" && translate("zh", "nftMakeOffer") === "上架出售" && translate("ja", "nftMakeOffer") === "出品する" && translate("ko", "nftMakeOffer") === "판매로 내놓기" && walletJs.includes('nftMakeOffer: "Put up for sale"'));
check("signer checks the passkey before the seed signs", signerApp.includes("async function assertAssertion") && asserted > 0 && signerApp.indexOf("unlockSeed(account, assertion", asserted) > asserted && !signerApp.includes("sessionStorage.setItem(SEED_KEY") && !signerApp.includes("watch.any") && signerApp.includes('text("networkFee")') && translate("en", "networkFee") === "Network fee" && translate("es", "networkFee") === "Comisión de red" && translate("fr", "networkFee") === "Frais du réseau" && translate("de", "networkFee") === "Netzwerkgebühr" && translate("pt", "networkFee") === "Taxa da rede" && translate("zh", "networkFee") === "网络手续费" && translate("ja", "networkFee") === "ネットワーク手数料" && translate("ko", "networkFee") === "네트워크 수수료");
check("signer does not hardcode the hook fee", !signerApp.includes("HOOK_FEE") && signerApp.includes("requiredFee"));
check("live test does not hardcode the hook fee", !liveSrc.includes("HOOK_FEE"));
check("home follows closed ledgers", signerApp.includes('streams: ["ledger"]') && walletJs.includes('streams: ["ledger"]') && walletJs.includes('body.type === "ledgerClosed"'));
check("scanner reads one crop a frame", signerApp.includes("imageSmoothingEnabled = false") && signerApp.includes("const SCAN = 320") && signerApp.includes("readSquare(guide, 0)"));
check("home shows issued balances", signerApp.includes("account_lines") && walletJs.includes("account_lines"));
const txHash = "ab".repeat(32);
check("devnet tx link", txUrl(txHash.toUpperCase()) === `${EXPLORER}/tx/${txHash}` && txUrl(txHash, 21337) === "");
check("a network can list several explorers", explorerUrls(txHash, [
  { name: "One", origin: "https://one.example", txPath: "/tx/" },
  { name: "Two", origin: "https://two.example", txPath: "/transactions/" },
]).map((item) => item.url).join(" ") === `https://one.example/tx/${txHash} https://two.example/transactions/${txHash}`);
check("tx link needs 64 hex", txUrl("abcd") === "");
check("ledger uses the same explorer", walletJs.includes(`origin: "${EXPLORER}"`) && walletJs.includes('txPath: "/tx/"') && walletJs.includes("function txUrl(") && walletJs.includes("links[0].url"));
check("activity starts with fifty and scrolls for more", walletJs.includes("var ACTIVITY_PAGE = 50") && walletJs.includes("query.marker = marker") && walletJs.includes('addEventListener("scroll", moreActivity'));
check("activity rows link out", signerApp.includes("explorerLinks(") && signerApp.includes("txUrl(") && signerApp.includes("links[0].url") && !signerApp.includes("links.slice(1)"));
const signerHtml = readFileSync(new URL("../public/signer.html", import.meta.url), "utf8");
const walletCss = readFileSync(new URL("../public/wallet.css", import.meta.url), "utf8");
check("desktop home lists twenty and a receive code", walletJs.includes("var HOME_ACTIVITY = 20") && walletJs.includes("source.slice(0, HOME_ACTIVITY)") && walletJs.includes('panel("home-receive")') && walletJs.includes('hint.dataset.i18n = "receiveHint"') && walletJs.includes('return (layout && layout.dataset.view) === "activity"') && walletCss.includes('#layout[data-view="home"] #nfts') && walletCss.includes("#home-receive") && !walletCss.includes('#layout[data-view="home"] #activity { display: none'));
check("activity keeps rows the network no longer returns", walletJs.includes("activityPrevLedger < activityFloor") && walletJs.includes("The network no longer has these older transactions.") && walletJs.includes("activityRows = next") && walletJs.includes("noteAccountLedger(info)") && !walletJs.includes("activityRows = batch"));
check("desktop combines send and receive", walletJs.includes('deskItem("home"), deskItem("transfer"), deskItem("nfts")') && !walletJs.includes('deskItem("transfer", href("send"))') && !walletJs.includes('deskItem("send")') && !walletJs.includes('deskItem("receive")') && walletJs.includes('named === "transfer" || named === "send" || named === "receive"') && walletJs.includes('id === "transfer" || id === "send" || id === "receive"') && walletCss.includes('#layout[data-view="transfer"] #transfer') && walletCss.includes("#layout #transfer > .panel") && walletCss.includes("#layout #transfer > #receive"));
check("transfer stays in the wallet", walletJs.includes('deskItem("home"), deskItem("transfer"), deskItem("nfts")') && walletJs.includes('addTab("transfer", "transfer");') && walletJs.includes("function paintTransfer(") && walletJs.includes('showQr: "Show QR for iPhone"') && walletJs.includes('review: "Review"') && walletJs.includes("side.append(review, go, hint, qrBox)") && !walletJs.includes("Sign with Face ID") && !walletJs.includes("location.assign") && signerApp.includes('if (op === "send" || op === "transfer" || op === "receive")') && signerApp.includes('location.assign(walletReturn(account, op === "receive" ? "receive" : "transfer"))') && !signerApp.includes('op === "send" || op === "activity"') && signerApp.includes("sendForm(account)") && signerApp.includes('payScreen(account, "send", back ? [back, ...body] : body)') && signerApp.includes('payScreen(account, "receive", back ? [back, ...parts] : parts)') && signerApp.includes("walletReturn(account, place)") && !signerApp.includes("transferPage("));
check("phone scan keeps the wallet menu", signerApp.includes("function phoneScanNav(account)") && signerApp.includes("phoneScanNav(account)") && signerApp.includes('["transfer", "transfer"]') && signerApp.includes('["scan", ""]') && signerApp.includes('["nfts", "nfts"]') && !signerApp.includes('["shop", "shop"]') && signerApp.includes('["activity", "activity"]') && signerApp.includes('["settings", "settings"]') && signerApp.includes("walletReturn(account, place)") && signerApp.includes('class: "tab on"') && signerApp.includes('shell() !== "phone"') && signerHtml.includes("a.tab") && signerHtml.includes("contain: paint") && !signerHtml.includes("overflow-x: clip"));
check("activity rows are not underlined", !signerHtml.includes("text-decoration-color: #8dffc1") && !walletCss.includes("text-decoration-color: #8dffc1") && !signerHtml.includes(".dash") && !signerApp.includes('class: "dash"'));
check("incoming offers look different from held tokens", translate("en", "nftOffer") === "Offer" && translate("es", "nftOffer") === "Oferta" && translate("fr", "nftOffer") === "Offre" && translate("de", "nftOffer") === "Angebot" && translate("pt", "nftOffer") === "Oferta" && translate("zh", "nftOffer") === "报价" && translate("ja", "nftOffer") === "オファー" && translate("ko", "nftOffer") === "제안" && signerApp.includes('class: `nft-pill ${kind}`') && signerApp.includes("sellBox.replaceChildren()") && !signerApp.includes("replaceChildren(!offer") && walletJs.includes('className = item.offer ? "nft-pill offer" : (listed ? "nft-pill sale" : "nft-pill held")') && walletJs.includes('nftOffer: "Offer"') && signerHtml.includes(".nft.incoming") && signerHtml.includes(".nft.held") && signerHtml.includes(".nft-pill.offer") && walletCss.includes(".nft.incoming") && walletCss.includes(".nft.held") && walletCss.includes(".nft-pill.sale"));
check("desktop fills the window", signerHtml.includes("max-width: none") && walletCss.includes("max-width: none") && !signerHtml.includes("52rem") && !walletCss.includes("64rem"));
check("the desktop viewer hides the page under it", walletCss.includes('html[data-shell="desk"] .nft-overlay { background: #0c0f14;') && signerHtml.includes('html[data-shell="desk"] .nft-overlay { background: #0c0f14;') && walletCss.includes('html[data-shell="desk"]:has(.nft-overlay:not([hidden])) .nft-grid { visibility: hidden; }') && signerHtml.includes('html[data-shell="desk"]:has(.nft-overlay:not([hidden])) .nft-grid { visibility: hidden; }'));
check("the desktop nft overlay uses the window", walletCss.includes('html[data-shell="desk"] .nft-overlay .nft-page { display: grid;') && walletCss.includes("minmax(16rem, 1fr) minmax(22rem, 1fr)") && walletJs.includes('detail.className = "nft-detail"') && walletCss.includes(".nft-dialog { width: min(22rem, 100%);"));
check("the phone viewer hides the gallery and swipes", signerHtml.includes('html[data-shell="phone"] .nft-overlay { background: #0c0f14;') && walletCss.includes('html[data-shell="phone"] .nft-overlay { background: #0c0f14;') && signerHtml.includes(".nft-grid { visibility: hidden; }") && walletCss.includes(".nft-grid { visibility: hidden; }") && signerHtml.includes('html[data-shell="phone"] .nft-grid { grid-template-columns: repeat(4, minmax(0, 1fr));') && walletCss.includes('html[data-shell="phone"] .nft-grid { grid-template-columns: repeat(4, minmax(0, 1fr));') && signerHtml.includes(".nft-filters") && walletCss.includes(".nft-filters") && signerApp.includes('"nft listed"') && walletJs.includes('"nft listed"') && translate("en", "nftAll") === "All" && translate("es", "nftOffers") === "Ofertas" && translate("de", "nftNotForSale") === "Nicht im Verkauf" && translate("ja", "nftNoMatch") === "該当なし" && translate("ko", "nftAll") === "전체" && signerHtml.includes(".nft-page.slide") && walletCss.includes(".nft-page.slide") && signerApp.includes('class: "nft-page"') && signerApp.includes("translate3d") && signerApp.includes('shell() !== "phone"') && signerApp.includes("touchstart") && walletJs.includes('className = "nft-page"') && walletJs.includes("translate3d") && walletJs.includes("if (!phone || nftSliding || event.touches.length !== 1) return") && walletJs.includes("touchstart") && walletJs.includes("stepViewer(dx < 0 ? 1 : -1)"));
check("explorer links open in a new tab", signerApp.includes('target: "_blank"') && signerApp.includes('rel: "noopener"') && walletJs.includes('"_blank"') && walletJs.includes('"noopener"') && !walletJs.includes("links[k]"));
check("theme defaults to dark", signerHtml.includes('getItem("p256-theme")') && signerHtml.includes('saved === "light" ? "light" : "dark"') && walletJs.includes('getItem("p256-theme")') && walletJs.includes("(function () {\n  var theme = \"dark\";") && walletJs.indexOf("document.documentElement.outerHTML") < walletJs.indexOf("var theme = \"dark\";") && walletJs.indexOf("var theme = \"dark\";") < walletJs.indexOf("dataset.theme") && !signerHtml.includes("prefers-color-scheme") && !walletCss.includes("prefers-color-scheme"));
const saleHtml = readFileSync(new URL("../public/sale.html", import.meta.url), "utf8");
const saleSrc = readFileSync(new URL("../src/sale-page.mjs", import.meta.url), "utf8");
const pagesSrc = readFileSync(new URL("./pages.mjs", import.meta.url), "utf8");
check("nft count replaces both numbers", walletJs.includes('text.split("{" + name + "}").join(String(vars[name]))') && !walletJs.includes('text.split("{" + name + "}", String(vars[name]))') && "{n} of {m}".split("{n}").join("2").split("{m}").join("5") === "2 of 5");
check("a gallery card opens the viewer by token", walletJs.includes("function itemKey(item)") && walletJs.includes("function itemIndex(list, item)") && walletJs.includes("itemIndex(viewerItems(), item)") && walletJs.includes('nftTokenId: "Token ID"') && walletJs.includes('nftPrice: "价格（XAH），可选"') && walletJs.includes('nftBuyer: "この買い手だけ、任意"') && !walletJs.includes("all[n] === item") && !walletJs.includes("list[i] === all[viewerPos]") && !walletJs.includes("list[n] === item"));
check("a visit is the nft page until the owner logs in", walletJs.includes("function loggedIn()") && walletJs.includes('get("login") === "1"') && walletJs.includes('href("login")') && walletJs.includes('query.set("logged", "1")') && walletJs.includes("loggedIn() && passkey") && walletJs.includes('walletOwner ? (view || "home") : "nfts"') && walletJs.includes("function logoutControl(") && walletJs.includes("function startOwnerFeeds()") && walletJs.includes("location.reload()") && !walletJs.includes("location.assign") && walletJs.includes("const statusLine = $(\"g\")") && walletJs.includes("if (statusLine) statusLine.hidden = true") && !walletJs.includes('$("g").hidden = true') && signerApp.includes('op === "login"') && signerApp.includes("async function finishLogin(") && signerApp.includes("getPasskey(challenge, null, loaded.credentialId)") && signerApp.includes('params.get("logged") === "1"') && signerApp.includes("location.assign(pwaUrl(named))") && translate("en", "login") === "Log in" && translate("en", "logout") === "Log out" && translate("fr", "logout") === "Déconnexion" && translate("ja", "login") === "ログイン" && translate("ko", "logout") === "로그아웃" && walletJs.includes('login: "Log in"') && walletJs.includes('logout: "退出"') && walletJs.includes('login: "ログイン"'));
const deskNav = walletJs.slice(walletJs.indexOf("function buildDeskNav("), walletJs.indexOf("function copyId("));
const ownerDesk = deskNav.slice(deskNav.indexOf("if (owner)"), deskNav.indexOf("} else {"));
const visitorDesk = deskNav.slice(deskNav.indexOf("} else {"));
const phoneNav = walletJs.slice(walletJs.indexOf('if (walletOwner) {\n      addTab("transfer"'), walletJs.indexOf("slot.append(tabs, layout)"));
const ownerPhone = phoneNav.slice(0, phoneNav.indexOf("} else {"));
const visitorPhone = phoneNav.slice(phoneNav.indexOf("} else {"));
const signerHomeStart = walletJs.indexOf("function signerHome()");
const signerHomeBox = { URL, S: "https://shortthefomo.github.io/p-256-bootloader/?op=login&account=rViewer", location: { href: "https://pwa.passkey.xahau-dev.net/rShop" } };
runInNewContext(`${walletJs.slice(signerHomeStart, walletJs.indexOf("function buildDeskNav(", signerHomeStart))}\nthis.signerHome = signerHome;`, signerHomeBox);
check("a visitor can create a wallet", ownerDesk.includes('deskItem("nfts")') && !ownerDesk.includes("createWallet") && visitorDesk.includes('deskItem("nfts")') && visitorDesk.includes('href("login")') && visitorDesk.includes('deskItem("createWallet", signerHome())') && ownerPhone.includes('addTab("nfts", "nfts")') && !ownerPhone.includes("createWallet") && visitorPhone.includes('addTab("nfts", "nfts")') && visitorPhone.includes('href("login")') && visitorPhone.includes('addTab("createWallet", "create", signerHome())') && signerHomeBox.signerHome() === "https://shortthefomo.github.io/p-256-bootloader/" && !walletJs.includes('deskItem("createWallet", href(') && translate("en", "createWallet") === "Create a wallet" && translate("es", "createWallet") === "Crear un monedero" && translate("fr", "createWallet") === "Créer un portefeuille" && translate("de", "createWallet") === "Wallet erstellen" && translate("pt", "createWallet") === "Criar uma carteira" && translate("zh", "createWallet") === "创建钱包" && translate("ja", "createWallet") === "ウォレットを作る" && translate("ko", "createWallet") === "지갑 만들기" && ["Create a wallet", "Crear un monedero", "Créer un portefeuille", "Wallet erstellen", "Criar uma carteira", "创建钱包", "ウォレットを作る", "지갑 만들기"].every((label) => walletJs.includes(`createWallet: "${label}"`)));
check("the nft page is the public store", walletJs.includes('if (named === "shop") return "nfts"') && walletJs.includes('walletOwner ? (view || "home") : "nfts"') && walletJs.includes('layout.append(nftPanel)') && walletJs.includes("startOwnerFeeds();\n  }\n  nftPanel = panel(\"nfts\")") && !walletJs.includes('deskItem("shop")') && walletJs.includes('deskItem("nfts")') && walletJs.includes('className = "sale-actions"') && walletJs.includes('className = "b sale-buy"') && walletJs.includes('t("nftPurchase")') && walletJs.includes('a: ""') && walletJs.includes('k: "URITokenBuy"') && walletJs.includes("if (walletOwner && !item.offer) nftActions.append(offerBox(id))") && walletJs.includes('nftMode === "all"') && walletJs.includes('nftMode === "sale"') && walletJs.includes('nftMode === "held"') && walletJs.includes("var selling"));
check("a sale price survives a ledger repaint", walletJs.includes("if (nftOverlay && !nftOverlay.hidden && viewerPos === i) return") && walletJs.includes("priorSale.dataset.id === id") && walletJs.includes("box.dataset.id = String(id)") && walletJs.includes("function pinToken()"));
check("a listed buy pays the asking price", walletJs.includes("payload.r") && walletJs.includes('className = "b sale-buy"') && walletJs.includes('t("nftPurchase")') && !walletJs.includes('t("nftBid")') && !walletJs.includes("function xahDrops(") && !walletJs.includes("sale-bid") && translate("en", "nftBid") === "nftBid");
check("nft actions return to the nft page", signerApp.includes("function nftLanding(") && signerApp.includes("function nftHome(") && signerApp.includes('bits.push("view=nfts")') && signerApp.includes('type === "URITokenBurn"') && signerApp.includes("pageAccount(back) !== account") && signerApp.includes("pwaPage(") && signerApp.includes("uriBack(") && signerApp.includes("sessionReturn("));
check("token id can be copied and shared", signerHtml.includes("code.nft-id-field") && walletCss.includes("code.nft-id-field") && signerHtml.includes("a.nft-shoplink") && walletCss.includes("a.nft-shoplink") && signerApp.includes('class: "nft-id-field"') && signerApp.includes("tweetLink") && walletJs.includes("https://pwa.passkey.xahau-dev.net/") && !walletJs.includes("sale.html") && walletJs.includes('className = "menu"') && walletJs.includes('addTab("nfts", "nfts")') && !walletJs.includes('panel("shop")') && walletJs.includes('className = "nft-id-field"') && walletJs.includes('rel = "noopener"') && walletCss.includes("canvas.qr") && walletCss.includes("a.nft"));
check("public sale page stays off the signer", pagesSrc.includes('path.join(root, "public", "sale.html")') && saleHtml.includes('src="src/sale-page.mjs"') && saleHtml.includes("wallet.css") && !saleHtml.includes("prefers-color-scheme") && saleSrc.includes("wss://passkey.xahau-dev.net") && !saleSrc.includes("rpc.passkey.xahau-dev.net") && saleSrc.includes("encodeQr(") && saleSrc.includes("saleLink(") && saleSrc.includes("cardArt(") && !saleSrc.includes("wallet.mjs") && !saleSrc.includes("location.href") && !saleSrc.includes("location.assign"));
check("same-tab wallet links stay on this tab", !walletJs.slice(walletJs.indexOf("function href("), walletJs.indexOf("function showNote(")).includes("_blank"));

let firewall = null;
const firewallCandidates = [
  "/tmp/passkey_p256_firewall/v2/sign.mjs",
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "passkey_p256_firewall", "v2", "sign.mjs"),
];
for (const candidate of firewallCandidates) {
  try {
    firewall = await import(pathToFileURL(candidate).href);
    break;
  } catch {
    firewall = null;
  }
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
  console.log("SKIP firewall byte compare (passkey_p256_firewall clone not found)");
}

const wasm = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "passkey_p256_firewall_v2.wasm"));
check("wasm is the firewall module", wasm[0] === 0 && wasm[1] === 0x61 && wasm.length > 1000, `${wasm.length} bytes`);
check("hook hash is the sha512 half of the wasm", HOOK_HASH === createHash("sha512").update(wasm).digest("hex").slice(0, 64).toUpperCase() && walletJs.includes(HOOK_HASH));

const account = "rP2UiVK5uHJqSkKv1D7koyrCjHNXtCopJW";
check("return allows the served pwa host", safeReturn(`https://pwa8.pwa.passkey.xahau-dev.net/${account}`, account) === `https://pwa8.pwa.passkey.xahau-dev.net/${account}`);
check("return allows the front door", safeReturn(`https://pwa.passkey.xahau-dev.net/${account}`, account) === `https://pwa.passkey.xahau-dev.net/${account}`);
check("return rejects another host", safeReturn(`https://evil.example/${account}`, account) === null);
check("a shop return can be another account", pwaPage(`https://pwa8.pwa.passkey.xahau-dev.net/${account}`) === `https://pwa8.pwa.passkey.xahau-dev.net/${account}` && pwaPage(`https://pwa.passkey.xahau-dev.net/${buyer}/`) === `https://pwa.passkey.xahau-dev.net/${buyer}` && pwaPage(`https://evil.example/${account}`) === "" && pwaPage(`https://pwa.passkey.xahau-dev.net/${account}/extra`) === "" && pwaPage(`http://pwa.passkey.xahau-dev.net/${account}`) === "" && safeReturn(`https://pwa.passkey.xahau-dev.net/${account}`, buyer) === null);
const servedWallet = `https://pwa6.pwa.passkey.xahau-dev.net/${account}`;
const otherShop = `https://pwa8.pwa.passkey.xahau-dev.net/${buyer}`;
const keptToken = "ab".repeat(32);
const keptHash = "cd".repeat(32);
const keptSale = sessionReturn(account, servedWallet, `token=${keptToken}&tx=${keptHash}`, true);
const keptBurn = sessionReturn(account, servedWallet, "view=nfts", true);
const keptDesk = sessionReturn(account, servedWallet, `shell=desk&token=${keptToken}`, true);
const publicBuy = sessionReturn(account, otherShop, `shell=desk&view=nfts&tx=${keptHash}`, true);
const signedQr = requestLink({
  page: "https://shortthefomo.github.io/p-256-bootloader/",
  account,
  kind: "URITokenCreateSellOffer",
  values: { id: keptToken, xah: "3" },
  returnTo: servedWallet,
  logged: true,
  shell: "desk",
});
const scannedSale = parseScan(signedQr);
const signedPay = payLink({ page: "https://shortthefomo.github.io/p-256-bootloader/", account, dest: buyer, xah: "1", returnTo: servedWallet, logged: true, shell: "desk" });
check("a signed return keeps the login", keptSale === `${servedWallet}?login=1#login=1&token=${keptToken}&tx=${keptHash}` && keptBurn === `${servedWallet}?login=1#login=1&view=nfts` && keptDesk === `${servedWallet}?login=1&shell=desk#login=1&shell=desk&token=${keptToken}` && sessionReturn(account, servedWallet, `token=${keptToken}`, false) === `${servedWallet}#token=${keptToken}` && publicBuy === `${otherShop}#view=nfts&tx=${keptHash}` && !publicBuy.includes("login=") && !publicBuy.includes("shell=") && pageAccount(servedWallet) === account && pageAccount(otherShop) === buyer && sessionReturn(account, `https://evil.example/${account}`, `tx=${keptHash}`, true) === `${pwaUrl(account)}?login=1#login=1&tx=${keptHash}` && scannedSale.returnTo === servedWallet && scannedSale.kind === "URITokenCreateSellOffer" && new URL(signedQr).searchParams.get("logged") === "1" && new URL(signedQr).searchParams.get("shell") === "desk" && new URL(signedPay).searchParams.get("logged") === "1" && new URL(signedPay).searchParams.get("shell") === "desk" && walletJs.includes('location.search || ""') && walletJs.includes('searchParams.delete("login")') && signerApp.includes("function staying(") && signerApp.includes("sessionReturn(account, back, withShell(\"\"), true)"));
const payment = transactionFromKind("Payment", { destination: account, xah: "2" });
check("payment form is native drops", payment.tx.Amount === "2000000" && payment.payment.drops === 2000000n);
const trust = transactionFromKind("TrustSet", { issuer: account, currency: "usd", limit: "100" });
check("trust line sets no ripple", trust.tx.LimitAmount.currency === "USD" && trust.tx.Flags === 131072);
const offer = transactionFromKind("OfferCreate", {
  pays: "2",
  paysCurrency: "XAH",
  paysIssuer: "",
  gets: "5",
  getsCurrency: "USD",
  getsIssuer: account,
});
check("offer gives what you pay", offer.tx.TakerGets === "2000000" && offer.tx.TakerPays.currency === "USD" && offer.tx.TakerPays.value === "5");
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
function cropCenter(src, frame, fraction) {
  const side = Math.max(21, Math.round(frame * fraction));
  const x0 = Math.floor((frame - side) / 2);
  const y0 = Math.floor((frame - side) / 2);
  const out = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    const from = ((y0 + y) * frame + x0) * 4;
    out.set(src.subarray(from, from + side * 4), y * side * 4);
  }
  return out;
}
const distant = placeQr(raster.rgba, raster.width, raster.height, 960, 0.22);
check("qr reads a distant code in the full frame", decodeImage(distant, 960, 960) === signText);
const centered = cropCenter(distant, 960, 0.4);
const centerSide = Math.round(960 * 0.4);
check("qr reads that code from the center", decodeImage(centered, centerSide, centerSide) === signText);
check("qr still reads a clean code after a photo", decodeImage(raster.rgba, raster.width, raster.height) === signText);
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
const saleId = "A".repeat(64);
const saleOne = saleLink(account, saleId);
const saleShop = saleLink(account);
const parsedSale = parseScan(saleOne);
check("scan reads a sale page", parsedSale.type === "sale" && parsedSale.account === account && parsedSale.id === saleId && parseScan(saleShop).type === "sale" && parseScan(saleShop).id === "" && !saleShop.includes("id="));
check("sale link rejects a bad id", saleLink(account, "zz") === "" && saleLink("not-an-account") === "" && parseScan(`https://shortthefomo.github.io/p-256-bootloader/sale.html?account=${account}&id=zz`).type === "unknown" && parseScan(saleOne.replace("https:", "http:")).type === "unknown");
check("sale link ignores another site", parseScan(`https://evil.example/p-256-bootloader/sale.html?account=${account}`).type === "unknown" && parseScan(`https://evil.example/sale.html?account=${account}`).type === "unknown" && parseScan(`https://shortthefomo.github.io/p-256-bootloader/?account=${account}`).type !== "sale");
const tweet = tweetLink(saleOne, "For sale on Xahau");
check("share opens a tweet", tweet.startsWith("https://x.com/intent/tweet?") && new URL(tweet).searchParams.get("url") === saleOne && new URL(tweet).searchParams.get("text") === "For sale on Xahau");
const heldToken = { id: "B".repeat(64), amount: "" };
const listedToken = { id: saleId, amount: "1000000" };
const freeToken = { id: "C".repeat(64), amount: "0" };
const shopTokens = visibleSale([heldToken, listedToken, freeToken], "");
check("sale shop keeps listed tokens", shopTokens.length === 2 && shopTokens[0].id === saleId && shopTokens[1].amount === "0" && visibleSale([heldToken, listedToken], saleId).length === 1 && visibleSale([heldToken, listedToken], heldToken.id)[0].amount === "" && visibleSale([listedToken], "D".repeat(64)).length === 0);
const offerQr = buyOfferLink({ id: saleId, amount: "22000000" });
const offerScan = parseScan(offerQr);
const shopFn = saleSrc.slice(saleSrc.indexOf("function shop("), saleSrc.indexOf("function paint("));
check("a listed token qr makes an offer", offerScan.type === "qr" && offerScan.kind === "URITokenBuy" && offerScan.values.id === saleId && offerScan.values.xah === "22" && offerScan.account === "" && offerQr.startsWith("https://shortthefomo.github.io/p-256-bootloader/?op=qr#") && buyOfferLink(heldToken) === "" && !shopFn.includes("codeBlock") && saleSrc.includes('say("nftOfferScan")') && !saleSrc.includes('say("nftScan")') && translate("en", "nftOfferScan") === "Scan this code to make an offer.");
check("a shop item keeps the desktop menu and buys from the phone", saleSrc.includes('class: "sale-item"') && saleSrc.includes('class: "sale-actions"') && saleSrc.includes('class: "sale-qr"') && saleSrc.includes('class: "b sale-buy"') && saleSrc.includes('say("backToWallet")') && saleSrc.includes("walletLink(") && saleSrc.includes("toolLink(") && !saleSrc.includes("location.assign") && walletCss.includes('html[data-shell="phone"] .sale-qr') && walletCss.includes('html[data-shell="desk"] .sale-direct') && walletLink(account, "send") === `${pwaUrl(account)}#send` && walletLink(account) === pwaUrl(account) && toolLink(account, "scan").startsWith("https://shortthefomo.github.io/p-256-bootloader/?op=scan&") && signerApp.includes('op === "send"') && signerApp.includes('op === "activity"') && signerApp.includes("location.assign(pwaUrl(named))") && !signerApp.includes("walletHome(known)") && translate("en", "nftPurchase") === "Buy" && translate("en", "backToWallet") === "Return to wallet" && translate("fr", "backToWallet") === "Retour au portefeuille");
check("sale query keeps a shop or one token", saleQuery(`?account=${account}`)?.id === "" && saleQuery(`?account=${account}&id=${saleId}`)?.id === saleId && saleQuery(`?account=${account}&id=zz`) == null && saleQuery("?account=nope") == null);
check("kind from trustset", kindFromTx({ TransactionType: "TrustSet", LimitAmount: { currency: "USD", issuer: account, value: "5" } })?.kind === "TrustSet");
check("payment watch matches drops", samePayment(
  { ok: true, hash: "abc", type: "Payment", destination: account, amount: "1500000" },
  { dest: account, drops: 1500000n },
));
const sentRow = { ok: true, hash: "abc", type: "TrustSet", destination: account, account, amount: "" };
const otherSpend = { ok: true, hash: "def", type: "Payment", destination: account, account, amount: "1" };
check("desktop handoff confirms only the shown transaction", sameTransaction(sentRow, account, { type: "TrustSet", destination: account }) && !sameTransaction(otherSpend, account, { type: "TrustSet", destination: account }) && !sameTransaction(sentRow, account, { type: "TrustSet", destination: "rOther" }) && sameTransaction({ ok: true, hash: "abc", type: "AccountSet", destination: "", account }, account, { type: "AccountSet", destination: "" }) && !sameTransaction(otherSpend, "rOther", { dest: account, drops: 1n }) && !sameTransaction({ ok: true, hash: "abc", type: "URITokenBurn", destination: "", account, tokenId: "AA" }, account, { type: "URITokenBurn", destination: "", token: "BB" }) && sameTransaction({ ok: true, hash: "abc", type: "URITokenBurn", destination: "", account, tokenId: "AA" }, account, { type: "URITokenBurn", destination: "", token: "aa" }));
const nativeTx = describeTx({
  hash: txHash,
  tx: { TransactionType: "Payment", Account: account, Destination: account, Amount: "1500000" },
  meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1500000" },
});
check("activity names a native payment", nativeTx.line === `Payment · 1.5 XAH to ${shortAddress(account)}` && nativeTx.amount === "1500000" && samePayment(nativeTx, { dest: account, drops: 1500000n }));
const iouTx = describeTx({
  hash: txHash,
  tx_json: {
    TransactionType: "Payment",
    Destination: account,
    Amount: { currency: "USD", issuer: account, value: "12.5" },
  },
  meta: { TransactionResult: "tesSUCCESS" },
});
check("activity names an iou payment", iouTx.type === "Payment" && iouTx.line.includes("12.5 USD") && iouTx.line.startsWith("Payment") && iouTx.amount === "");
const trustTx = describeTx({
  tx: { TransactionType: "TrustSet", LimitAmount: { currency: "EUR", issuer: account, value: "100" } },
});
check("activity names a trust line", trustTx.line.startsWith("TrustSet") && trustTx.line.includes("100 EUR"));
const offerTx = describeTx({
  tx: {
    TransactionType: "OfferCreate",
    TakerGets: "1000000",
    TakerPays: { currency: "USD", issuer: account, value: "2" },
  },
});
check("activity names an offer", offerTx.line.startsWith("OfferCreate") && offerTx.line.includes("1 XAH for 2 USD"));
const helperStart = walletJs.indexOf("function xah(");
const helperEnd = walletJs.indexOf("\nfunction rpc(");
const ledgerFns = {};
runInNewContext(`${walletJs.slice(helperStart, helperEnd)}\nthis.txLine = txLine; this.pageTxUrl = txUrl;`, ledgerFns);
check("ledger activity matches the signer", ledgerFns.txLine({
  hash: txHash,
  tx: { TransactionType: "Payment", Account: account, Destination: account, Amount: "1500000" },
  meta: { TransactionResult: "tesSUCCESS", delivered_amount: "1500000" },
}) === nativeTx.line && ledgerFns.txLine({
  tx_json: {
    TransactionType: "Payment",
    Destination: account,
    Amount: { currency: "USD", issuer: account, value: "12.5" },
  },
  meta: { TransactionResult: "tesSUCCESS" },
}) === iouTx.line && ledgerFns.txLine({
  tx: {
    TransactionType: "OfferCreate",
    TakerGets: "1000000",
    TakerPays: { currency: "USD", issuer: account, value: "2" },
  },
}) === offerTx.line && ledgerFns.pageTxUrl(txHash) === txUrl(txHash));

const pageHash = await sha512Half(new TextEncoder().encode("abc"));
check("served page hash is sha512 half", pageHash === "DDAF35A193617ABACC417349AE20413112E6FA4E89A97EA20A9EEEE64B55D39A");
const parsedPage = parsePwaUrl("https://pwa32666.pwa.exposed/rfMA55rjHKM4RBQyWoXnDNGRW6YJjKJa9j");
const pageHeaders = { networkId: "21338", ledgerSeq: "10", ledgerHash: "AA", pwaSeq: "1", etag: "" };
const pageNode = {
  rpc: "https://node.example", hostid: "N1", networkId: 21338, valid: true, reason: "",
  ledgerIndex: 12, appLoaderSequence: 1, domainValid: false, domainReason: "domain not endorsed by account",
  bytesMatch: true, previousTxnId: "BB", accountIndex: "32666", headerLedgerOk: true, histMatch: null, error: "",
};
const pageCtx = { headers: pageHeaders, requireDomain: false, domainName: "pwa32666.pwa.exposed", urlIndex: "32666" };
check("a matching portal page is ok", parsedPage.accountIndex === "32666" && parsedPage.zone === "pwa.exposed" && hexIndexToDecimal("7f9a") === "32666" && defaultRpcs(21339)[0] === "https://rpc.passkey.xahau-dev.net" && stripEtag('W/"AbC"') === "ABC" && addressesFromTxt(['"rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"', '"not an address"']) === "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" && addressesFromTxt(['"rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"']) === null && judge([pageNode], pageCtx).verdict === "ok");
check("a served page that matches an older ledger is stale", judge([{ ...pageNode, valid: false, reason: "hash mismatch", bytesMatch: false, histMatch: true }], pageCtx).verdict === "stale");
check("bytes that match neither copy are tampered", judge([{ ...pageNode, valid: false, reason: "hash mismatch", bytesMatch: false, histMatch: false, ledgerIndex: 10 }], { ...pageCtx, headers: { ...pageHeaders, ledgerSeq: "10" } }).verdict === "tampered");
check("a verify node behind the served ledger is unverifiable", judge([{ ...pageNode, valid: false, reason: "hash mismatch", bytesMatch: false, ledgerIndex: 9, histMatch: null }], pageCtx).verdict === "unverifiable");
check("a forged ledger header is a mismatch", judge([{ ...pageNode, headerLedgerOk: false }], pageCtx).verdict === "header-mismatch");
check("a custom host without domain endorsement is unendorsed", judge([pageNode], { ...pageCtx, requireDomain: true }).verdict === "unendorsed");
check("a host index that is not the account is tampered", judge([pageNode], { ...pageCtx, urlIndex: "1" }).verdict === "tampered");
check("version checks the served page", walletJs.indexOf("document.documentElement.outerHTML") < walletJs.indexOf("dataset.theme") && walletJs.includes('new URL("src/pwa-check.mjs"') && walletJs.includes("checkServedPage") && signerApp.includes("checkServedPage") && signerApp.includes("readDocument") && translate("en", "servedPage") === "Served page" && translate("en", "pageOk") === "This page is the account's current document." && translate("fr", "pageTampered") === "Cette page n’est pas le document du compte." && translate("es", "pageStale") === "Esta página es una copia antigua. Recárgala." && translate("de", "pageUnread") === "Dieser Browser kann die Portalseite von hier nicht lesen." && translate("pt", "pageNotes") === "Notas da verificação" && translate("zh", "pageOk") === "此页面是该账户的当前文档。" && translate("ja", "servedPage") === "配信されたページ" && translate("ko", "pageOk") === "이 페이지는 이 계정의 현재 문서입니다." && translate("en", "pageHash") === "Hash" && translate("zh", "pageHash") === "哈希" && walletJs.includes('t("pageHash")') && !walletJs.includes("evergram.app") && !walletCss.includes("a.support"));
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
