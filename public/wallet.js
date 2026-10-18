(function () {
  var theme = "dark";
  try {
    var saved = localStorage.getItem("p256-theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (error) {}
  document.documentElement.dataset.theme = theme;
})();
const me = document.currentScript;
const S = me.dataset.s;
const acct = location.pathname.split("/").filter(Boolean)[0] || "";
const $ = document.getElementById.bind(document);
$("a").textContent = acct;
const m = $("m");
const NAMESPACE = "70323536626F6F74000000000000000000000000000000000000000000000001";

function xah(drops) {
  const n = BigInt(drops);
  const whole = n / 1000000n;
  const frac = (n % 1000000n + "").padStart(6, "0").replace(/0+$/, "");
  return frac ? whole + "." + frac : "" + whole;
}

// Keep this list in step with EXPLORERS in src/wallet.mjs. The first entry is the link.
const NETWORK = 21339;
const EXPLORERS = {
  21339: [{ name: "Passkey devnet", origin: "https://explorer.passkey.xahau-dev.net", txPath: "/tx/" }],
};

function txUrl(hash) {
  const text = String(hash || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) return "";
  const list = EXPLORERS[NETWORK] || [];
  if (!list.length) return "";
  return list[0].origin + list[0].txPath + text;
}

function explorerLinks(hash) {
  const text = String(hash || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) return [];
  const list = EXPLORERS[NETWORK] || [];
  const out = [];
  for (let i = 0; i < list.length; i++) out.push({ name: list[i].name, url: list[i].origin + list[i].txPath + text });
  return out;
}

function shortAddr(address) {
  const text = String(address || "");
  if (text.length < 12) return text;
  return text.slice(0, 6) + "…" + text.slice(-4);
}

function currencyLabel(code) {
  const text = String(code || "");
  if (text.length <= 8) return text;
  return text.slice(0, 4) + "…" + text.slice(-4);
}

function amountText(value) {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value)) return "";
    return xah(value) + " XAH";
  }
  if (!value || typeof value !== "object" || value.value == null || value.currency == null) return "";
  let text = value.value + " " + currencyLabel(value.currency);
  if (value.issuer) text += " · " + shortAddr(value.issuer);
  return text;
}

function txLine(entry) {
  const tx = entry.tx_json || entry.tx || {};
  const meta = entry.meta || entry.metaData || {};
  const type = tx.TransactionType || "Transaction";
  let shown = "";
  if (type === "OfferCreate") {
    const gives = amountText(tx.TakerGets);
    const wants = amountText(tx.TakerPays);
    shown = gives && wants ? gives + " for " + wants : (gives || wants);
  } else {
    let delivered = type === "Payment" ? meta.delivered_amount : null;
    if (type === "Payment" && delivered == null) delivered = meta.DeliveredAmount;
    if (delivered && delivered !== "unavailable") shown = amountText(delivered);
    if (!shown) shown = amountText(tx.Amount) || amountText(tx.LimitAmount) || amountText(tx.SendMax);
  }
  let line = type;
  if (shown) line += " · " + shown;
  if (tx.Destination) line += " to " + shortAddr(tx.Destination);
  return line;
}

function holdsBalance(line) {
  const balance = String(line && line.balance != null ? line.balance : "");
  return balance !== "" && !/^0(?:\.0+)?$/.test(balance);
}

function rpc(command, params) {
  return new Promise(function (ok, no) {
    const ws = new WebSocket("wss://passkey.xahau-dev.net");
    ws.onopen = function () {
      ws.send(JSON.stringify(Object.assign({ id: 1, command: command }, params || {})));
    };
    ws.onmessage = function (event) {
      const body = JSON.parse(event.data);
      if (body.id != 1) return;
      ws.close();
      if (body.status && body.status != "success") no(new Error(body.error_message || body.error || body.status));
      else ok(body.result);
    };
    ws.onerror = function () { no(new Error("offline")); };
  });
}

var HOOK_HASH = "BBCBC4186CC7A73493D4CF1E175153E4245D2FC1ED60641B8B47E4A93BECFF6B";
var INTERFACE_REV = "2";
var LANGS = ["en", "es", "fr", "de", "pt", "zh", "ja", "ko"];
var FORMATS = [
  { id: "plain", group: "", decimal: ".", example: "1234.5" },
  { id: "comma-dot", group: ",", decimal: ".", example: "1,234.5" },
  { id: "dot-comma", group: ".", decimal: ",", example: "1.234,5" },
  { id: "space-dot", group: " ", decimal: ".", example: "1 234.5" },
];
var CATALOG = {
  en: { send: "Send", receive: "Receive", scan: "Scan", activity: "Activity", settings: "Settings", version: "Version", general: "General", language: "Language", currencyFormat: "Currency format", formatHint: "Balances and amounts you type use this format. A QR code stores a plain amount.", firewall: "Passkey firewall", walletInterface: "Wallet interface", installed: "Installed", shipped: "This wallet", current: "Current", updateAvailable: "Update available", notInstalled: "Not installed", notPublished: "Not published", updateFirewall: "Update firewall", updateWallet: "Install update", executionFee: "Execution fee", hookMatches: "This account runs the firewall shipped with this wallet.", hookDiffers: "This account runs a different firewall than the one shipped with this wallet.", hookMissing: "No firewall is installed on this account.", hookUnreadable: "The network did not return the firewall version.", interfaceMatches: "The published wallet page matches this wallet.", interfaceDiffers: "A new wallet page is ready for this account.", interfaceMissing: "This account has no wallet page yet.", layout: "Layout", mobile: "Mobile", desktop: "Desktop", light: "Light", dark: "Dark", loading: "Loading…", drops: "drops", amountInvalid: "Enter an amount" },
  es: { send: "Enviar", receive: "Recibir", scan: "Escanear", activity: "Actividad", settings: "Ajustes", version: "Versión", general: "General", language: "Idioma", currencyFormat: "Formato de cantidad", formatHint: "Los saldos y las cantidades que escribes usan este formato. Un código QR guarda una cantidad simple.", firewall: "Cortafuegos passkey", walletInterface: "Interfaz del monedero", installed: "Instalado", shipped: "Este monedero", current: "Al día", updateAvailable: "Hay una actualización", notInstalled: "No instalado", notPublished: "Sin publicar", updateFirewall: "Actualizar el cortafuegos", updateWallet: "Instalar actualización", executionFee: "Comisión de ejecución", hookMatches: "Esta cuenta usa el cortafuegos que trae este monedero.", hookDiffers: "Esta cuenta usa un cortafuegos distinto del que trae este monedero.", hookMissing: "Esta cuenta no tiene el cortafuegos instalado.", hookUnreadable: "La red no devolvió la versión del cortafuegos.", interfaceMatches: "La página publicada coincide con este monedero.", interfaceDiffers: "Hay una página nueva lista para esta cuenta.", interfaceMissing: "Esta cuenta todavía no tiene página.", layout: "Diseño", mobile: "Móvil", desktop: "Escritorio", light: "Claro", dark: "Oscuro", loading: "Cargando…", drops: "drops", amountInvalid: "Escribe una cantidad" },
  fr: { send: "Envoyer", receive: "Recevoir", scan: "Scanner", activity: "Activité", settings: "Réglages", version: "Version", general: "Général", language: "Langue", currencyFormat: "Format du montant", formatHint: "Les soldes et les montants saisis utilisent ce format. Un QR code garde un montant simple.", firewall: "Pare-feu passkey", walletInterface: "Interface du portefeuille", installed: "Installé", shipped: "Ce portefeuille", current: "À jour", updateAvailable: "Mise à jour disponible", notInstalled: "Non installé", notPublished: "Non publié", updateFirewall: "Mettre à jour le pare-feu", updateWallet: "Installer la mise à jour", executionFee: "Frais d’exécution", hookMatches: "Ce compte utilise le pare-feu livré avec ce portefeuille.", hookDiffers: "Ce compte utilise un pare-feu différent de celui livré avec ce portefeuille.", hookMissing: "Aucun pare-feu n’est installé sur ce compte.", hookUnreadable: "Le réseau n’a pas renvoyé la version du pare-feu.", interfaceMatches: "La page publiée correspond à ce portefeuille.", interfaceDiffers: "Une nouvelle page est prête pour ce compte.", interfaceMissing: "Ce compte n’a pas encore de page.", layout: "Disposition", mobile: "Mobile", desktop: "Ordinateur", light: "Clair", dark: "Sombre", loading: "Chargement…", drops: "drops", amountInvalid: "Saisissez un montant" },
  de: { send: "Senden", receive: "Empfangen", scan: "Scannen", activity: "Aktivität", settings: "Einstellungen", version: "Version", general: "Allgemein", language: "Sprache", currencyFormat: "Zahlenformat", formatHint: "Guthaben und eingegebene Beträge nutzen dieses Format. Ein QR-Code speichert einen einfachen Betrag.", firewall: "Passkey-Firewall", walletInterface: "Wallet-Oberfläche", installed: "Installiert", shipped: "Diese Wallet", current: "Aktuell", updateAvailable: "Update verfügbar", notInstalled: "Nicht installiert", notPublished: "Nicht veröffentlicht", updateFirewall: "Firewall aktualisieren", updateWallet: "Update installieren", executionFee: "Ausführungsgebühr", hookMatches: "Dieses Konto nutzt die Firewall aus dieser Wallet.", hookDiffers: "Dieses Konto nutzt eine andere Firewall als die aus dieser Wallet.", hookMissing: "Auf diesem Konto ist keine Firewall installiert.", hookUnreadable: "Das Netzwerk hat die Firewall-Version nicht geliefert.", interfaceMatches: "Die veröffentlichte Seite entspricht dieser Wallet.", interfaceDiffers: "Eine neue Seite ist für dieses Konto bereit.", interfaceMissing: "Dieses Konto hat noch keine Seite.", layout: "Layout", mobile: "Mobil", desktop: "Desktop", light: "Hell", dark: "Dunkel", loading: "Wird geladen…", drops: "drops", amountInvalid: "Gib einen Betrag ein" },
  pt: { send: "Enviar", receive: "Receber", scan: "Ler", activity: "Atividade", settings: "Ajustes", version: "Versão", general: "Geral", language: "Idioma", currencyFormat: "Formato do valor", formatHint: "Saldos e valores digitados usam este formato. Um QR guarda um valor simples.", firewall: "Firewall passkey", walletInterface: "Interface da carteira", installed: "Instalado", shipped: "Esta carteira", current: "Em dia", updateAvailable: "Atualização disponível", notInstalled: "Não instalado", notPublished: "Não publicada", updateFirewall: "Atualizar o firewall", updateWallet: "Instalar atualização", executionFee: "Taxa de execução", hookMatches: "Esta conta usa o firewall que vem com esta carteira.", hookDiffers: "Esta conta usa um firewall diferente do que vem com esta carteira.", hookMissing: "Não há firewall instalado nesta conta.", hookUnreadable: "A rede não devolveu a versão do firewall.", interfaceMatches: "A página publicada corresponde a esta carteira.", interfaceDiffers: "Uma página nova está pronta para esta conta.", interfaceMissing: "Esta conta ainda não tem página.", layout: "Layout", mobile: "Celular", desktop: "Computador", light: "Claro", dark: "Escuro", loading: "Carregando…", drops: "drops", amountInvalid: "Digite um valor" },
  zh: { send: "发送", receive: "收款", scan: "扫描", activity: "活动", settings: "设置", version: "版本", general: "通用", language: "语言", currencyFormat: "金额格式", formatHint: "余额和输入的金额使用此格式。二维码保存的是普通金额。", firewall: "Passkey 防火墙", walletInterface: "钱包界面", installed: "已安装", shipped: "此钱包", current: "已是最新", updateAvailable: "有可用更新", notInstalled: "未安装", notPublished: "未发布", updateFirewall: "更新防火墙", updateWallet: "安装更新", executionFee: "执行费用", hookMatches: "此账户运行的是本钱包附带的防火墙。", hookDiffers: "此账户运行的防火墙与本钱包附带的不同。", hookMissing: "此账户尚未安装防火墙。", hookUnreadable: "网络没有返回防火墙版本。", interfaceMatches: "已发布的页面与此钱包一致。", interfaceDiffers: "此账户有新的钱包页面可以安装。", interfaceMissing: "此账户还没有钱包页面。", layout: "布局", mobile: "手机", desktop: "电脑", light: "浅色", dark: "深色", loading: "正在加载…", drops: "drops", amountInvalid: "请输入金额" },
  ja: { send: "送金", receive: "受取", scan: "スキャン", activity: "履歴", settings: "設定", version: "バージョン", general: "一般", language: "言語", currencyFormat: "金額の形式", formatHint: "残高と入力する金額はこの形式です。QRコードには単純な金額が入ります。", firewall: "パスキーファイアウォール", walletInterface: "ウォレット画面", installed: "導入済み", shipped: "このウォレット", current: "最新", updateAvailable: "更新があります", notInstalled: "未導入", notPublished: "未公開", updateFirewall: "ファイアウォールを更新", updateWallet: "更新をインストール", executionFee: "実行手数料", hookMatches: "このアカウントは、このウォレットに同梱されたファイアウォールです。", hookDiffers: "このアカウントのファイアウォールは、このウォレットに同梱されたものと違います。", hookMissing: "このアカウントにはファイアウォールがありません。", hookUnreadable: "ネットワークがファイアウォールのバージョンを返しませんでした。", interfaceMatches: "公開中のページは、このウォレットと一致しています。", interfaceDiffers: "このアカウントに新しいページを入れられます。", interfaceMissing: "このアカウントにはまだページがありません。", layout: "レイアウト", mobile: "モバイル", desktop: "デスクトップ", light: "ライト", dark: "ダーク", loading: "読み込み中…", drops: "drops", amountInvalid: "金額を入力してください" },
  ko: { send: "보내기", receive: "받기", scan: "스캔", activity: "활동", settings: "설정", version: "버전", general: "일반", language: "언어", currencyFormat: "금액 형식", formatHint: "잔액과 입력하는 금액이 이 형식을 사용합니다. QR 코드에는 일반 금액이 저장됩니다.", firewall: "패스키 방화벽", walletInterface: "지갑 화면", installed: "설치됨", shipped: "이 지갑", current: "최신", updateAvailable: "업데이트 있음", notInstalled: "설치되지 않음", notPublished: "게시되지 않음", updateFirewall: "방화벽 업데이트", updateWallet: "업데이트 설치", executionFee: "실행 수수료", hookMatches: "이 계정은 이 지갑에 포함된 방화벽을 사용합니다.", hookDiffers: "이 계정의 방화벽은 이 지갑에 포함된 것과 다릅니다.", hookMissing: "이 계정에는 방화벽이 설치되어 있지 않습니다.", hookUnreadable: "네트워크가 방화벽 버전을 반환하지 않았습니다.", interfaceMatches: "게시된 페이지가 이 지갑과 일치합니다.", interfaceDiffers: "이 계정에 새 지갑 페이지를 설치할 수 있습니다.", interfaceMissing: "이 계정에는 아직 지갑 페이지가 없습니다.", layout: "레이아웃", mobile: "모바일", desktop: "데스크톱", light: "라이트", dark: "다크", loading: "불러오는 중…", drops: "drops", amountInvalid: "금액을 입력하세요" },
};
var NAMES = { en: "English", es: "Español", fr: "Français", de: "Deutsch", pt: "Português", zh: "中文", ja: "日本語", ko: "한국어" };
var sessionPref = {};
var settingsSection = "version";
var lastDrops = null;
var settingsButton = null;
var wantSettings = false;

function pref(key, allowed, fallback) {
  if (sessionPref[key] && allowed.indexOf(sessionPref[key]) >= 0) return sessionPref[key];
  try {
    var value = localStorage.getItem(key);
    if (allowed.indexOf(value) >= 0) return value;
  } catch (error) {}
  return fallback;
}

function rememberPref(key, value) {
  sessionPref[key] = value;
  try { localStorage.setItem(key, value); } catch (error) {}
}

function language() {
  return pref("p256-lang", LANGS, "en");
}

function shellChoice() {
  var saved = pref("p256-shell", ["phone", "desk"], "");
  if (saved) return saved;
  try {
    var fromHash = new URLSearchParams(location.hash.slice(1)).get("shell");
    if (fromHash === "phone" || fromHash === "desk") return fromHash;
  } catch (error) {}
  return "";
}

function chooseShell(value) {
  if (value !== "phone" && value !== "desk") return;
  if (value === (phone ? "phone" : "desk")) return;
  rememberPref("p256-shell", value);
  var kept = false;
  try {
    kept = localStorage.getItem("p256-shell") === value;
  } catch (error) {}
  if (!kept) {
    var params = new URLSearchParams(location.hash.replace(/^#/, ""));
    params.set("shell", value);
    location.hash = params.toString();
  }
  location.reload();
}

function amountFormat() {
  return pref("p256-format", FORMATS.map(function (item) { return item.id; }), "plain");
}

function amountSpec() {
  var id = amountFormat();
  for (var i = 0; i < FORMATS.length; i++) if (FORMATS[i].id === id) return FORMATS[i];
  return FORMATS[0];
}

function t(key) {
  var table = CATALOG[language()] || CATALOG.en;
  return table[key] || CATALOG.en[key] || key;
}

function formatDrops(drops) {
  var plain = xah(drops);
  var spec = amountSpec();
  if (!spec.group) return plain;
  var parts = plain.split(".");
  var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, spec.group);
  return parts[1] ? whole + spec.decimal + parts[1] : whole;
}

function canonicalAmount(text) {
  var raw = String(text || "").trim();
  if (!raw) return "";
  var spec = amountSpec();
  var body = raw;
  if (spec.group === " ") body = body.replace(/[ \u00a0\u202f]/g, "");
  else if (spec.group) body = body.split(spec.group).join("");
  if (spec.decimal !== ".") body = body.split(spec.decimal).join(".");
  if (!/^\d+(\.\d{0,6})?$/.test(body)) return "";
  var bits = body.split(".");
  var frac = bits[1] || "";
  var drops = BigInt(bits[0]) * 1000000n + BigInt((frac + "000000").slice(0, 6));
  if (drops <= 0n) return "";
  return xah(drops);
}

function paintBalance(drops) {
  lastDrops = String(drops);
  $("b").textContent = formatDrops(lastDrops);
}

function applyLanguage() {
  var nodes = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].dataset.i18n);
  var themes = document.querySelectorAll("button.theme");
  for (var j = 0; j < themes.length; j++) themes[j].textContent = themeLabel();
  if (lastDrops != null) $("b").textContent = formatDrops(lastDrops);
}

// The ledger page is sandboxed, so its origin is opaque. A scripted
// location change is rejected there and the page reloads. A real link is a
// user navigation, which this top-level page is allowed to do.
function href(op, extra) {
  const query = new URLSearchParams(Object.assign({ op: op, account: acct }, extra || {}));
  try {
    const back = new URL(location.href);
    back.search = "";
    back.hash = "";
    if (back.protocol === "https:") query.set("return", back.origin + back.pathname.replace(/\/$/, ""));
  } catch (error) {}
  return S + (S.indexOf("?") < 0 ? "?" : "&") + query;
}

const note = document.createElement("p");
note.className = "note";
const raw = document.createElement("details");
raw.className = "raw";
raw.hidden = true;
const summary = document.createElement("summary");
summary.textContent = "Details";
m.replaceWith(note, raw);
raw.append(summary, m);

function showNote(text) {
  note.textContent = text || "";
  m.textContent = "";
  raw.hidden = true;
  raw.open = false;
}

function sentNote(hash) {
  note.textContent = "Sent ";
  const url = txUrl(hash);
  if (!url) {
    note.append(document.createTextNode(hash));
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = shortAddr(hash);
  note.append(link);
}

function showJson(text) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (error) {
    showNote(text);
    return;
  }
  m.textContent = pretty;
  raw.hidden = false;
  raw.open = false;
}

var chosenShell = shellChoice();
const phone = chosenShell ? chosenShell === "phone" : window.matchMedia("(max-width: 860px)").matches;
document.documentElement.dataset.shell = phone ? "phone" : "desk";

const balanceLine = $("b").parentElement;
balanceLine.className = "balance";
const balanceUnit = document.createElement("span");
balanceUnit.textContent = " XAH";
balanceLine.replaceChildren($("b"), balanceUnit);
const linesBox = document.createElement("div");
linesBox.className = "lines";

function themeLabel() {
  return document.documentElement.dataset.theme === "light" ? t("dark") : t("light");
}

function themeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme";
  button.textContent = themeLabel();
  button.onclick = function () {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    const buttons = document.querySelectorAll("button.theme");
    for (let i = 0; i < buttons.length; i++) buttons[i].textContent = themeLabel();
    try { localStorage.setItem("p256-theme", next); } catch (error) {}
  };
  return button;
}

const frame = document.createElement("div");
frame.id = "frame";
const side = document.createElement("aside");
side.className = "side";
const stage = document.createElement("section");
stage.className = "stage";
const intro = $("intro") || document.querySelector("p.m:not(#g)");
const head = document.createElement("div");
head.className = "head";
head.append(document.querySelector("h1"));
if (phone) head.append(themeButton());
side.append.apply(side, [head, intro, $("a").parentElement, balanceLine, linesBox, $("g")].filter(Boolean));
stage.append.apply(stage, [$("d"), note, raw].filter(Boolean));
frame.append(side, stage);
document.querySelector("main").replaceChildren(frame);

// The published page carries this rev. A page without it, or with an older
// one, still has the previous wallet and can install this one.
var publishedRev = (document.querySelector("meta[name=rev]") || {}).content || "";
if (publishedRev !== INTERFACE_REV) {
  const update = document.createElement("a");
  update.className = "b g";
  update.href = href("update");
  update.dataset.i18n = "updateWallet";
  update.textContent = t("updateWallet");
  side.append(update);
}
if (!phone) {
  settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "g side";
  settingsButton.dataset.i18n = "settings";
  settingsButton.textContent = t("settings");
  settingsButton.onclick = function () {
    const layout = document.getElementById("layout");
    if (!layout) {
      wantSettings = !wantSettings;
      settingsButton.classList.toggle("on", wantSettings);
      return;
    }
    const open = layout.classList.toggle("settings-open");
    wantSettings = open;
    settingsButton.classList.toggle("on", open);
    if (open) paintLedgerSettings();
  };
  side.append(settingsButton);
  side.append(themeButton());
}

const hash = new URLSearchParams(location.hash.slice(1));
const txHash = hash.get("tx");
if (hash.get("err")) showJson(hash.get("err"));
else if (txHash) {
  sentNote(txHash);
  rpc("tx", { transaction: txHash }).then(function (result) {
    showJson(JSON.stringify(result));
    sentNote(txHash);
  }).catch(function () {});
}

let activityPanel = null;
let activityNote = null;
let activityList = null;

function txDetail(type, line) {
  const prefix = type + " · ";
  if (line === type) return "";
  if (line.indexOf(prefix) === 0) return line.slice(prefix.length);
  return line;
}

function paintLines(lines) {
  linesBox.replaceChildren();
  const list = lines || [];
  for (let i = 0; i < list.length; i++) {
    const line = list[i];
    if (!holdsBalance(line)) continue;
    const row = document.createElement("p");
    row.className = "m";
    row.textContent = line.balance + " " + currencyLabel(line.currency) + " · " + shortAddr(line.account);
    linesBox.append(row);
  }
}

function paintActivity(rows) {
  if (!activityPanel || !activityNote || !activityList) return;
  const old = activityList.querySelectorAll(".tx");
  for (let i = 0; i < old.length; i++) old[i].remove();
  const list = rows || [];
  activityNote.textContent = list.length ? "" : "No transactions yet.";
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const tx = entry.tx_json || entry.tx || {};
    const meta = entry.meta || entry.metaData || {};
    const type = tx.TransactionType || "Transaction";
    const line = txLine(entry);
    const hash = entry.hash || tx.hash || "";
    const result = meta.TransactionResult || "";
    const ok = result === "" || result === "tesSUCCESS";
    const links = explorerLinks(hash);
    const row = document.createElement(links.length ? "a" : "div");
    row.className = ok ? "tx" : "tx bad";
    if (links.length) {
      row.href = links[0].url;
      row.target = "_blank";
      row.rel = "noopener";
    }
    const typeNode = document.createElement("span");
    typeNode.className = "tx-type";
    typeNode.textContent = type;
    const main = document.createElement("span");
    main.className = "tx-main";
    main.textContent = txDetail(type, line);
    const end = document.createElement("span");
    end.className = "tx-end";
    if (!ok) {
      const flag = document.createElement("span");
      flag.className = "tx-flag";
      flag.textContent = "Failed";
      end.append(flag);
    }
    const hashNode = document.createElement("span");
    hashNode.className = "tx-hash";
    hashNode.textContent = shortAddr(hash);
    end.append(hashNode);
    row.append(typeNode, main, end);
    activityList.append(row);
  }
}

let refreshing = false;
let refreshAgain = false;
function refreshHome() {
  if (!acct) return;
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  const infoP = rpc("account_info", { account: acct, ledger_index: "validated" }).then(function (info) {
    paintBalance(info.account_data.Balance);
  });
  const txP = rpc("account_tx", { account: acct, limit: 8 }).then(function (page) {
    paintActivity(page.transactions || []);
  });
  const lineP = rpc("account_lines", { account: acct, ledger_index: "validated" }).then(function (page) {
    paintLines(page.lines || []);
  });
  Promise.all([infoP, txP, lineP].map(function (job) { return job.catch(function () {}); })).then(function () {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      refreshHome();
    }
  });
}

rpc("account_info", { account: acct, ledger_index: "validated" }).then(function (info) {
  paintBalance(info.account_data.Balance);
}).catch(function (error) { showNote(error.message); });

rpc("account_lines", { account: acct, ledger_index: "validated" }).then(function (page) {
  paintLines(page.lines || []);
}).catch(function () {});

// Each closed ledger can change the validated balance and the history.
function watchLedgers() {
  if (!acct) return;
  let ws = null;
  let wait = 1000;
  function open() {
    ws = new WebSocket("wss://passkey.xahau-dev.net");
    ws.onopen = function () {
      wait = 1000;
      ws.send(JSON.stringify({ id: 1, command: "subscribe", accounts: [acct], streams: ["ledger"] }));
    };
    ws.onmessage = function (event) {
      let body;
      try { body = JSON.parse(event.data); } catch (error) { return; }
      if (body.type === "ledgerClosed") refreshHome();
    };
    ws.onclose = function () {
      setTimeout(open, wait);
      wait = Math.min(wait * 2, 15000);
    };
  }
  open();
}
watchLedgers();

function panel(id) {
  const node = document.createElement("div");
  node.className = "panel";
  node.id = id;
  return node;
}

function show(which) {
  const panels = document.querySelectorAll(".panel");
  for (let i = 0; i < panels.length; i++) panels[i].classList.toggle("on", panels[i].id === which);
  const tabs = document.querySelectorAll("nav.tabs button");
  for (let i = 0; i < tabs.length; i++) tabs[i].classList.toggle("on", tabs[i].dataset.panel === which);
}

function labeled(key) {
  const node = document.createElement("h2");
  node.dataset.i18n = key;
  node.textContent = t(key);
  return node;
}

function kv(pairs) {
  const box = document.createElement("div");
  box.className = "kv";
  for (let i = 0; i < pairs.length; i++) {
    const name = document.createElement("span");
    name.textContent = pairs[i][0];
    const value = document.createElement("span");
    value.className = "mono";
    value.textContent = pairs[i][1] || "—";
    box.append(name, value);
  }
  return box;
}

function fieldSelect(labelKey, current, options, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "setting";
  const name = document.createElement("span");
  name.dataset.i18n = labelKey;
  name.textContent = t(labelKey);
  const select = document.createElement("select");
  for (let i = 0; i < options.length; i++) {
    const option = document.createElement("option");
    option.value = options[i].id;
    option.textContent = options[i].name;
    select.append(option);
  }
  select.value = current;
  select.onchange = function () { onChange(select.value); };
  wrap.append(name, select);
  return wrap;
}

function installedHook() {
  return rpc("account_objects", { account: acct, type: "hook", ledger_index: "validated" }).then(function (page) {
    const objects = page.account_objects || [];
    let hash = "";
    for (let i = 0; i < objects.length && !hash; i++) {
      const hooks = objects[i].Hooks || [];
      for (let j = 0; j < hooks.length; j++) {
        const found = hooks[j] && hooks[j].Hook && hooks[j].Hook.HookHash;
        if (found) hash = String(found).toUpperCase();
      }
    }
    if (!hash) return { hash: "", fee: "" };
    return rpc("ledger_entry", { hook_definition: hash, ledger_index: "validated" }).then(function (entry) {
      const node = entry.node || entry;
      return { hash: hash, fee: node.Fee != null ? String(node.Fee) : "" };
    }).catch(function () { return { hash: hash, fee: "" }; });
  });
}

function paintLedgerGeneral(body) {
  body.append(fieldSelect("language", language(), LANGS.map(function (id) {
    return { id: id, name: NAMES[id] };
  }), function (value) {
    rememberPref("p256-lang", value);
    applyLanguage();
    paintLedgerSettings();
  }));
  body.append(fieldSelect("currencyFormat", amountFormat(), FORMATS.map(function (item) {
    return { id: item.id, name: item.example };
  }), function (value) {
    rememberPref("p256-format", value);
    applyLanguage();
    paintLedgerSettings();
  }));
  const hint = document.createElement("p");
  hint.className = "m";
  hint.dataset.i18n = "formatHint";
  hint.textContent = t("formatHint");
  const layoutLabel = document.createElement("label");
  layoutLabel.className = "setting";
  const layoutName = document.createElement("span");
  layoutName.dataset.i18n = "layout";
  layoutName.textContent = t("layout");
  const seg = document.createElement("div");
  seg.className = "seg";
  function shellButton(id, key) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = (phone ? "phone" : "desk") === id ? "on" : "";
    button.dataset.i18n = key;
    button.textContent = t(key);
    button.onclick = function () { chooseShell(id); };
    seg.append(button);
  }
  shellButton("phone", "mobile");
  shellButton("desk", "desktop");
  layoutLabel.append(layoutName, seg);
  body.append(hint, layoutLabel);
}

function paintLedgerVersion(body) {
  const hookBox = document.createElement("section");
  const hookStatus = document.createElement("p");
  hookStatus.className = "m";
  hookStatus.textContent = t("loading");
  hookBox.append(labeled("firewall"), hookStatus);
  const pageBox = document.createElement("section");
  const stale = publishedRev !== INTERFACE_REV;
  const status = document.createElement("p");
  status.className = stale ? "warn" : "m";
  status.textContent = t(stale ? "updateAvailable" : "current");
  const sentence = document.createElement("p");
  sentence.textContent = t(stale ? "interfaceDiffers" : "interfaceMatches");
  pageBox.append(labeled("walletInterface"), status, sentence, kv([
    [t("shipped"), INTERFACE_REV],
    [t("installed"), publishedRev || "—"],
  ]));
  if (stale) {
    const link = document.createElement("a");
    link.className = "b";
    link.href = href("update");
    link.dataset.i18n = "updateWallet";
    link.textContent = t("updateWallet");
    pageBox.append(link);
  }
  body.append(hookBox, pageBox);
  installedHook().then(function (hook) {
    const key = !hook.hash ? "hookMissing" : hook.hash === HOOK_HASH ? "hookMatches" : "hookDiffers";
    hookStatus.className = key === "hookDiffers" ? "warn" : "m";
    hookStatus.textContent = t(key === "hookDiffers" ? "updateAvailable" : key === "hookMatches" ? "current" : "notInstalled");
    const line = document.createElement("p");
    line.textContent = t(key);
    const rows = [
      [t("installed"), hook.hash || "—"],
      [t("shipped"), HOOK_HASH],
    ];
    if (hook.fee) rows.push([t("executionFee"), formatDrops(hook.fee) + " XAH · " + hook.fee + " " + t("drops")]);
    hookBox.append(line, kv(rows));
    if (hook.hash && hook.hash !== HOOK_HASH) {
      const link = document.createElement("a");
      link.className = "b";
      link.href = href("settings");
      link.dataset.i18n = "updateFirewall";
      link.textContent = t("updateFirewall");
      hookBox.append(link);
    }
  }).catch(function () { hookStatus.textContent = t("hookUnreadable"); });
}

function paintLedgerSettings() {
  const node = document.getElementById("settings");
  if (!node) return;
  node.replaceChildren();
  const seg = document.createElement("div");
  seg.className = "seg";
  function segButton(key) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = settingsSection === key ? "on" : "";
    button.dataset.i18n = key;
    button.textContent = t(key);
    button.onclick = function () {
      settingsSection = key;
      paintLedgerSettings();
    };
    seg.append(button);
  }
  segButton("version");
  segButton("general");
  const body = document.createElement("div");
  node.append(seg, body);
  if (settingsSection === "general") paintLedgerGeneral(body);
  else paintLedgerVersion(body);
}

rpc("account_namespace", { account: acct, namespace_id: NAMESPACE, ledger_index: "validated" }).then(function (ns) {
  const entries = ns.namespace_entries || ns.namespaceEntries || [];
  const passkey = entries.some(function (entry) {
    const key = (entry.HookStateKey || "").toUpperCase();
    return (key === "5058".padStart(64, "0") || key.slice(0, 4) === "5058") && (entry.HookStateData || "").length == 64;
  });
  $("g").textContent = passkey ? "Passkey on. The iPhone approves each send." : "No passkey yet.";
  const slot = $("d");
  if (!passkey) {
    const attach = document.createElement("a");
    attach.className = "b";
    attach.href = href("attach");
    attach.textContent = "Attach iPhone";
    slot.append(attach);
  }

  const sendPanel = panel("send");
  const receivePanel = panel("receive");
  activityPanel = panel("activity");
  const settingsPanel = panel("settings");
  function heading(key) {
    const h = document.createElement("h2");
    h.dataset.i18n = key;
    h.textContent = t(key);
    return h;
  }

  const destination = document.createElement("input");
  const amount = document.createElement("input");
  const sign = document.createElement("a");
  destination.placeholder = "Destination r...";
  amount.placeholder = "Amount XAH";
  amount.inputMode = "decimal";
  sign.className = "b";
  sign.href = href("pay");
  sign.textContent = phone ? "Sign with Face ID" : "Show QR for iPhone";
  sign.onclick = function (event) {
    const value = amount.value.trim();
    const dest = destination.value.trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(dest)) {
      event.preventDefault();
      showNote("Enter a destination address");
      return;
    }
    const typed = canonicalAmount(value);
    if (!typed) {
      event.preventDefault();
      showNote(t("amountInvalid"));
      return;
    }
    sign.href = href("pay", { dest: dest, xah: typed });
  };
  const other = document.createElement("a");
  other.className = "b g";
  other.href = href("sign");
  other.textContent = "Other transactions";
  sendPanel.append(heading("send"), destination, amount, sign, other);

  const receiveNote = document.createElement("p");
  receiveNote.className = "m";
  receiveNote.textContent = "Show a QR code for this address.";
  const receive = document.createElement("a");
  receive.className = "b";
  receive.href = href("receive");
  receive.textContent = "Show my QR";
  const scan = document.createElement("a");
  scan.className = "b g";
  scan.href = href("scan");
  scan.textContent = "Scan a QR code";
  receivePanel.append(heading("receive"), receiveNote, receive, scan);

  activityNote = document.createElement("p");
  activityNote.className = "m";
  activityNote.textContent = "Loading activity…";
  activityList = document.createElement("div");
  activityList.className = "tx-list";
  if (!phone) {
    const txHead = document.createElement("div");
    txHead.className = "tx-head";
    txHead.setAttribute("aria-hidden", "true");
    const labels = ["Type", "Detail", "Hash"];
    for (let i = 0; i < labels.length; i++) {
      const span = document.createElement("span");
      span.textContent = labels[i];
      txHead.append(span);
    }
    activityList.append(txHead);
  }
  activityPanel.append(heading("activity"), activityNote, activityList);
  rpc("account_tx", { account: acct, limit: 8 }).then(function (page) {
    paintActivity(page.transactions || []);
  }).catch(function () { activityNote.textContent = "Activity is unavailable."; });

  const layout = document.createElement("div");
  layout.id = "layout";
  if (passkey) layout.append(sendPanel, receivePanel, activityPanel);
  layout.append(settingsPanel);
  if (phone) {
    const tabs = document.createElement("nav");
    tabs.className = "tabs";
    function addTab(key, id, url) {
      const button = document.createElement(url ? "a" : "button");
      if (url) button.href = url;
      else button.type = "button";
      button.dataset.panel = id;
      button.dataset.i18n = key;
      button.textContent = t(key);
      button.title = t(key);
      if (!url) button.onclick = function () {
        show(id);
        if (id === "settings") paintLedgerSettings();
      };
      tabs.append(button);
    }
    if (passkey) {
      addTab("send", "send");
      addTab("receive", "receive");
      addTab("scan", "scan", href("scan"));
      addTab("activity", "activity");
    }
    addTab("settings", "settings");
    slot.append(tabs, layout);
    if (passkey) show("send");
    else {
      show("settings");
      paintLedgerSettings();
    }
  } else {
    slot.append(layout);
    if (wantSettings) {
      layout.classList.add("settings-open");
      if (settingsButton) settingsButton.classList.add("on");
      paintLedgerSettings();
    }
  }
}).catch(function () { $("g").textContent = "Hook state unavailable"; });
