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
  en: { send: "Send", receive: "Receive", transfer: "Transfer", scan: "Scan", activity: "Activity", settings: "Settings", version: "Version", general: "General", language: "Language", currencyFormat: "Currency format", formatHint: "Balances and amounts you type use this format. A QR code stores a plain amount.", firewall: "Passkey firewall", walletInterface: "Wallet interface", installed: "Installed", shipped: "This wallet", current: "Current", updateAvailable: "Update available", notInstalled: "Not installed", notPublished: "Not published", updateFirewall: "Update firewall", updateWallet: "Install update", executionFee: "Execution fee", hookMatches: "This account runs the firewall shipped with this wallet.", hookDiffers: "This account runs a different firewall than the one shipped with this wallet.", hookMissing: "No firewall is installed on this account.", hookUnreadable: "The network did not return the firewall version.", interfaceMatches: "The published wallet page matches this wallet.", interfaceDiffers: "A new wallet page is ready for this account.", interfaceMissing: "This account has no wallet page yet.", layout: "Layout", mobile: "Mobile", desktop: "Desktop", light: "Light", dark: "Dark", loading: "Loading…", drops: "drops", amountInvalid: "Enter an amount", nfts: "NFTs", nftEmpty: "No URI tokens on this account.", nftMint: "Mint a URI token", nftBurn: "Burn", nftSell: "Sell", nftCancelSale: "Cancel sale", nftForSale: "For sale", nftEdition: "Edition", nftUnavailable: "URI tokens are unavailable.", nftAccept: "Accept", nftDecline: "Decline", nftOffer: "Offer", nftClose: "Close", nftCount: "{n} of {m}" },
  es: { send: "Enviar", receive: "Recibir", transfer: "Mover", scan: "Escanear", activity: "Actividad", settings: "Ajustes", version: "Versión", general: "General", language: "Idioma", currencyFormat: "Formato de cantidad", formatHint: "Los saldos y las cantidades que escribes usan este formato. Un código QR guarda una cantidad simple.", firewall: "Cortafuegos passkey", walletInterface: "Interfaz del monedero", installed: "Instalado", shipped: "Este monedero", current: "Al día", updateAvailable: "Hay una actualización", notInstalled: "No instalado", notPublished: "Sin publicar", updateFirewall: "Actualizar el cortafuegos", updateWallet: "Instalar actualización", executionFee: "Comisión de ejecución", hookMatches: "Esta cuenta usa el cortafuegos que trae este monedero.", hookDiffers: "Esta cuenta usa un cortafuegos distinto del que trae este monedero.", hookMissing: "Esta cuenta no tiene el cortafuegos instalado.", hookUnreadable: "La red no devolvió la versión del cortafuegos.", interfaceMatches: "La página publicada coincide con este monedero.", interfaceDiffers: "Hay una página nueva lista para esta cuenta.", interfaceMissing: "Esta cuenta todavía no tiene página.", layout: "Diseño", mobile: "Móvil", desktop: "Escritorio", light: "Claro", dark: "Oscuro", loading: "Cargando…", drops: "drops", amountInvalid: "Escribe una cantidad", nfts: "NFTs", nftEmpty: "No hay URI tokens en esta cuenta.", nftMint: "Acuñar un URI token", nftBurn: "Quemar", nftSell: "Vender", nftCancelSale: "Cancelar la venta", nftForSale: "En venta", nftEdition: "Edición", nftUnavailable: "Los URI tokens no están disponibles.", nftAccept: "Aceptar", nftDecline: "Rechazar", nftOffer: "Oferta", nftClose: "Cerrar", nftCount: "{n} de {m}" },
  fr: { send: "Envoyer", receive: "Recevoir", transfer: "Transfert", scan: "Scanner", activity: "Activité", settings: "Réglages", version: "Version", general: "Général", language: "Langue", currencyFormat: "Format du montant", formatHint: "Les soldes et les montants saisis utilisent ce format. Un QR code garde un montant simple.", firewall: "Pare-feu passkey", walletInterface: "Interface du portefeuille", installed: "Installé", shipped: "Ce portefeuille", current: "À jour", updateAvailable: "Mise à jour disponible", notInstalled: "Non installé", notPublished: "Non publié", updateFirewall: "Mettre à jour le pare-feu", updateWallet: "Installer la mise à jour", executionFee: "Frais d’exécution", hookMatches: "Ce compte utilise le pare-feu livré avec ce portefeuille.", hookDiffers: "Ce compte utilise un pare-feu différent de celui livré avec ce portefeuille.", hookMissing: "Aucun pare-feu n’est installé sur ce compte.", hookUnreadable: "Le réseau n’a pas renvoyé la version du pare-feu.", interfaceMatches: "La page publiée correspond à ce portefeuille.", interfaceDiffers: "Une nouvelle page est prête pour ce compte.", interfaceMissing: "Ce compte n’a pas encore de page.", layout: "Disposition", mobile: "Mobile", desktop: "Ordinateur", light: "Clair", dark: "Sombre", loading: "Chargement…", drops: "drops", amountInvalid: "Saisissez un montant", nfts: "NFTs", nftEmpty: "Aucun URI token sur ce compte.", nftMint: "Émettre un URI token", nftBurn: "Détruire", nftSell: "Vendre", nftCancelSale: "Annuler la vente", nftForSale: "En vente", nftEdition: "Édition", nftUnavailable: "Les URI tokens ne sont pas disponibles.", nftAccept: "Accepter", nftDecline: "Refuser", nftOffer: "Offre", nftClose: "Fermer", nftCount: "{n} sur {m}" },
  de: { send: "Senden", receive: "Empfangen", transfer: "Transfer", scan: "Scannen", activity: "Aktivität", settings: "Einstellungen", version: "Version", general: "Allgemein", language: "Sprache", currencyFormat: "Zahlenformat", formatHint: "Guthaben und eingegebene Beträge nutzen dieses Format. Ein QR-Code speichert einen einfachen Betrag.", firewall: "Passkey-Firewall", walletInterface: "Wallet-Oberfläche", installed: "Installiert", shipped: "Diese Wallet", current: "Aktuell", updateAvailable: "Update verfügbar", notInstalled: "Nicht installiert", notPublished: "Nicht veröffentlicht", updateFirewall: "Firewall aktualisieren", updateWallet: "Update installieren", executionFee: "Ausführungsgebühr", hookMatches: "Dieses Konto nutzt die Firewall aus dieser Wallet.", hookDiffers: "Dieses Konto nutzt eine andere Firewall als die aus dieser Wallet.", hookMissing: "Auf diesem Konto ist keine Firewall installiert.", hookUnreadable: "Das Netzwerk hat die Firewall-Version nicht geliefert.", interfaceMatches: "Die veröffentlichte Seite entspricht dieser Wallet.", interfaceDiffers: "Eine neue Seite ist für dieses Konto bereit.", interfaceMissing: "Dieses Konto hat noch keine Seite.", layout: "Layout", mobile: "Mobil", desktop: "Desktop", light: "Hell", dark: "Dunkel", loading: "Wird geladen…", drops: "drops", amountInvalid: "Gib einen Betrag ein", nfts: "NFTs", nftEmpty: "Keine URI-Tokens auf diesem Konto.", nftMint: "URI-Token prägen", nftBurn: "Vernichten", nftSell: "Verkaufen", nftCancelSale: "Verkauf abbrechen", nftForSale: "Zu verkaufen", nftEdition: "Ausgabe", nftUnavailable: "URI-Tokens sind nicht verfügbar.", nftAccept: "Annehmen", nftDecline: "Ablehnen", nftOffer: "Angebot", nftClose: "Schließen", nftCount: "{n} von {m}" },
  pt: { send: "Enviar", receive: "Receber", transfer: "Mover", scan: "Ler", activity: "Atividade", settings: "Ajustes", version: "Versão", general: "Geral", language: "Idioma", currencyFormat: "Formato do valor", formatHint: "Saldos e valores digitados usam este formato. Um QR guarda um valor simples.", firewall: "Firewall passkey", walletInterface: "Interface da carteira", installed: "Instalado", shipped: "Esta carteira", current: "Em dia", updateAvailable: "Atualização disponível", notInstalled: "Não instalado", notPublished: "Não publicada", updateFirewall: "Atualizar o firewall", updateWallet: "Instalar atualização", executionFee: "Taxa de execução", hookMatches: "Esta conta usa o firewall que vem com esta carteira.", hookDiffers: "Esta conta usa um firewall diferente do que vem com esta carteira.", hookMissing: "Não há firewall instalado nesta conta.", hookUnreadable: "A rede não devolveu a versão do firewall.", interfaceMatches: "A página publicada corresponde a esta carteira.", interfaceDiffers: "Uma página nova está pronta para esta conta.", interfaceMissing: "Esta conta ainda não tem página.", layout: "Layout", mobile: "Celular", desktop: "Computador", light: "Claro", dark: "Escuro", loading: "Carregando…", drops: "drops", amountInvalid: "Digite um valor", nfts: "NFTs", nftEmpty: "Não há URI tokens nesta conta.", nftMint: "Emitir um URI token", nftBurn: "Queimar", nftSell: "Vender", nftCancelSale: "Cancelar a venda", nftForSale: "À venda", nftEdition: "Edição", nftUnavailable: "Os URI tokens não estão disponíveis.", nftAccept: "Aceitar", nftDecline: "Recusar", nftOffer: "Oferta", nftClose: "Fechar", nftCount: "{n} de {m}" },
  zh: { send: "发送", receive: "收款", transfer: "收发", scan: "扫描", activity: "活动", settings: "设置", version: "版本", general: "通用", language: "语言", currencyFormat: "金额格式", formatHint: "余额和输入的金额使用此格式。二维码保存的是普通金额。", firewall: "Passkey 防火墙", walletInterface: "钱包界面", installed: "已安装", shipped: "此钱包", current: "已是最新", updateAvailable: "有可用更新", notInstalled: "未安装", notPublished: "未发布", updateFirewall: "更新防火墙", updateWallet: "安装更新", executionFee: "执行费用", hookMatches: "此账户运行的是本钱包附带的防火墙。", hookDiffers: "此账户运行的防火墙与本钱包附带的不同。", hookMissing: "此账户尚未安装防火墙。", hookUnreadable: "网络没有返回防火墙版本。", interfaceMatches: "已发布的页面与此钱包一致。", interfaceDiffers: "此账户有新的钱包页面可以安装。", interfaceMissing: "此账户还没有钱包页面。", layout: "布局", mobile: "手机", desktop: "电脑", light: "浅色", dark: "深色", loading: "正在加载…", drops: "drops", amountInvalid: "请输入金额", nfts: "NFTs", nftEmpty: "此账户没有 URI 代币。", nftMint: "铸造 URI 代币", nftBurn: "销毁", nftSell: "出售", nftCancelSale: "取消出售", nftForSale: "在售", nftEdition: "版次", nftUnavailable: "无法读取 URI 代币。", nftAccept: "接受", nftDecline: "拒绝", nftOffer: "报价", nftClose: "关闭", nftCount: "{n} / {m}" },
  ja: { send: "送金", receive: "受取", transfer: "入出金", scan: "スキャン", activity: "履歴", settings: "設定", version: "バージョン", general: "一般", language: "言語", currencyFormat: "金額の形式", formatHint: "残高と入力する金額はこの形式です。QRコードには単純な金額が入ります。", firewall: "パスキーファイアウォール", walletInterface: "ウォレット画面", installed: "導入済み", shipped: "このウォレット", current: "最新", updateAvailable: "更新があります", notInstalled: "未導入", notPublished: "未公開", updateFirewall: "ファイアウォールを更新", updateWallet: "更新をインストール", executionFee: "実行手数料", hookMatches: "このアカウントは、このウォレットに同梱されたファイアウォールです。", hookDiffers: "このアカウントのファイアウォールは、このウォレットに同梱されたものと違います。", hookMissing: "このアカウントにはファイアウォールがありません。", hookUnreadable: "ネットワークがファイアウォールのバージョンを返しませんでした。", interfaceMatches: "公開中のページは、このウォレットと一致しています。", interfaceDiffers: "このアカウントに新しいページを入れられます。", interfaceMissing: "このアカウントにはまだページがありません。", layout: "レイアウト", mobile: "モバイル", desktop: "デスクトップ", light: "ライト", dark: "ダーク", loading: "読み込み中…", drops: "drops", amountInvalid: "金額を入力してください", nfts: "NFTs", nftEmpty: "このアカウントに URI トークンはありません。", nftMint: "URI トークンを発行", nftBurn: "破棄", nftSell: "売却", nftCancelSale: "売却を取り消す", nftForSale: "売却中", nftEdition: "エディション", nftUnavailable: "URI トークンを取得できません。", nftAccept: "受け取る", nftDecline: "辞退", nftOffer: "オファー", nftClose: "閉じる", nftCount: "{n} / {m}" },
  ko: { send: "보내기", receive: "받기", transfer: "이체", scan: "스캔", activity: "활동", settings: "설정", version: "버전", general: "일반", language: "언어", currencyFormat: "금액 형식", formatHint: "잔액과 입력하는 금액이 이 형식을 사용합니다. QR 코드에는 일반 금액이 저장됩니다.", firewall: "패스키 방화벽", walletInterface: "지갑 화면", installed: "설치됨", shipped: "이 지갑", current: "최신", updateAvailable: "업데이트 있음", notInstalled: "설치되지 않음", notPublished: "게시되지 않음", updateFirewall: "방화벽 업데이트", updateWallet: "업데이트 설치", executionFee: "실행 수수료", hookMatches: "이 계정은 이 지갑에 포함된 방화벽을 사용합니다.", hookDiffers: "이 계정의 방화벽은 이 지갑에 포함된 것과 다릅니다.", hookMissing: "이 계정에는 방화벽이 설치되어 있지 않습니다.", hookUnreadable: "네트워크가 방화벽 버전을 반환하지 않았습니다.", interfaceMatches: "게시된 페이지가 이 지갑과 일치합니다.", interfaceDiffers: "이 계정에 새 지갑 페이지를 설치할 수 있습니다.", interfaceMissing: "이 계정에는 아직 지갑 페이지가 없습니다.", layout: "레이아웃", mobile: "모바일", desktop: "데스크톱", light: "라이트", dark: "다크", loading: "불러오는 중…", drops: "drops", amountInvalid: "금액을 입력하세요", nfts: "NFTs", nftEmpty: "이 계정에는 URI 토큰이 없습니다.", nftMint: "URI 토큰 발행", nftBurn: "소각", nftSell: "판매", nftCancelSale: "판매 취소", nftForSale: "판매 중", nftEdition: "에디션", nftUnavailable: "URI 토큰을 불러올 수 없습니다.", nftAccept: "수락", nftDecline: "거절", nftOffer: "제안", nftClose: "닫기", nftCount: "{n} / {m}" },
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

function fill(key, vars) {
  var text = t(key);
  Object.keys(vars).forEach(function (name) {
    text = text.split("{" + name + "}", String(vars[name]));
  });
  return text;
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
let nftNote = null;
let nftList = null;

function uriText(hex) {
  var text = String(hex || "").trim();
  if (!text || !/^[0-9A-Fa-f]+$/.test(text) || text.length % 2) return text;
  var bytes = new Uint8Array(text.length / 2);
  for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  try {
    var decoded = new TextDecoder().decode(bytes);
    return decoded.indexOf("\uFFFD") >= 0 ? text.toUpperCase() : decoded;
  } catch (error) {
    return text.toUpperCase();
  }
}

function cardParts(uri) {
  var match = /^xahaucards:\/\/(XC-\d{2}-\d{3}-[A-Za-z]-\d{2}-\d{2})-(\d+)$/i.exec(String(uri || "").trim());
  if (!match) return null;
  return { code: match[1].toUpperCase(), edition: match[2] };
}

function nftLink(key, extra, ghost) {
  var link = document.createElement("a");
  link.className = ghost ? "b g" : "b";
  link.href = href("nfts", extra);
  link.dataset.i18n = key;
  link.textContent = t(key);
  return link;
}

function tokenFace(object) {
  var uri = uriText(object && object.URI || "");
  var card = cardParts(uri);
  var title = card ? card.code : (uri || shortAddr(object && object.index || ""));
  return {
    uri: uri,
    card: card,
    title: title,
    art: card ? "https://xahaucards.com/card/" + card.code + ".webp" : "",
  };
}

function saleText(amount) {
  if (amount == null || amount === "") return "";
  if (typeof amount === "string") return formatDrops(amount) + " XAH";
  return (amount.value || "") + " " + (amount.currency || "");
}

function artFrame(face) {
  var frame = document.createElement("div");
  frame.className = "nft-art";
  if (!face.art) {
    var fallback = document.createElement("div");
    fallback.className = "nft-fallback";
    fallback.textContent = face.title;
    frame.append(fallback);
    return frame;
  }
  var image = document.createElement("img");
  image.src = face.art;
  image.alt = face.title;
  image.onerror = function () {
    var box = this.parentNode;
    if (!box) return;
    var missed = document.createElement("div");
    missed.className = "nft-fallback";
    missed.textContent = this.alt || "";
    box.replaceChildren(missed);
  };
  frame.append(image);
  return frame;
}

var ownedNodes = [];
var offerNodes = {};
var activityRows = [];
var viewerPos = 0;

function viewerItems() {
  var items = [];
  var seen = {};
  var declined = declinedOffers();
  for (var i = 0; i < ownedNodes.length; i++) {
    var object = ownedNodes[i];
    var id = String(object.index || "").toUpperCase();
    if (id) seen[id] = 1;
    items.push({ object: object, offer: null });
  }
  var ids = Object.keys(offerNodes);
  for (var j = 0; j < ids.length; j++) {
    var node = offerNodes[ids[j]];
    var offer = heldNode(node);
    if (!offer || seen[offer.id] || declined[offer.key]) continue;
    items.push({ object: node, offer: offer });
  }
  return items;
}

function heldNode(object) {
  if (!object || object.Owner === acct || object.Destination !== acct) return null;
  var amount = object.Amount;
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) return null;
  var id = String(object.index || "").toUpperCase();
  return { id: id, xah: xah(amount), key: id + ":" + object.Owner + ":" + amount };
}

function paintGallery() {
  if (!nftList || !nftNote) return;
  var items = viewerItems();
  nftList.replaceChildren();
  nftNote.textContent = items.length ? "" : t("nftEmpty");
  for (let i = 0; i < items.length; i++) nftList.append(galleryButton(items[i], i));
}

function galleryButton(item, index) {
  var face = tokenFace(item.object);
  var button = document.createElement("button");
  button.type = "button";
  button.className = item.offer ? "nft incoming" : "nft";
  var copy = document.createElement("div");
  copy.className = "nft-body";
  var title = document.createElement("strong");
  title.textContent = face.title;
  copy.append(title);
  if (face.card) {
    var meta = document.createElement("p");
    meta.className = "m";
    meta.textContent = t("nftEdition") + " " + face.card.edition;
    copy.append(meta);
  }
  var shown = saleText(item.object.Amount);
  if (shown) {
    var sale = document.createElement("p");
    sale.className = "nft-sale";
    sale.textContent = t("nftForSale") + " " + shown;
    copy.append(sale);
  }
  button.append(artFrame(face), copy);
  if (item.offer) {
    var badge = document.createElement("span");
    badge.className = "nft-badge";
    badge.textContent = t("nftOffer");
    button.append(badge);
  }
  button.onclick = function () { openViewer(index); };
  return button;
}

function paintTokens(objects) {
  ownedNodes = objects || [];
  paintGallery();
}

var nftOverlay = null;
var nftStage = null;
var nftCaption = null;
var nftActions = null;
var nftCount = null;
var nftPrev = null;
var nftNext = null;

function ensureOverlay() {
  if (nftOverlay) return;
  nftOverlay = document.createElement("div");
  nftOverlay.className = "nft-overlay";
  nftOverlay.hidden = true;
  nftOverlay.setAttribute("role", "dialog");
  nftOverlay.setAttribute("aria-modal", "true");
  var swipeX = 0;
  var swipeY = 0;
  var swiping = false;
  var ignoreClick = false;
  nftOverlay.addEventListener("click", function (event) {
    if (ignoreClick) {
      ignoreClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.target === nftOverlay) closeViewer();
  }, true);
  nftOverlay.addEventListener("touchstart", function (event) {
    if (!phone || event.touches.length !== 1) return;
    var tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;
    swipeX = event.touches[0].clientX;
    swipeY = event.touches[0].clientY;
    swiping = true;
  }, { passive: true });
  nftOverlay.addEventListener("touchend", function (event) {
    if (!swiping) return;
    swiping = false;
    var touch = event.changedTouches[0];
    if (!touch) return;
    var dx = touch.clientX - swipeX;
    var dy = touch.clientY - swipeY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    ignoreClick = true;
    stepViewer(dx < 0 ? 1 : -1);
  }, { passive: true });
  nftOverlay.addEventListener("touchcancel", function () { swiping = false; }, { passive: true });
  var dialog = document.createElement("div");
  dialog.className = "nft-dialog";
  var close = document.createElement("button");
  close.type = "button";
  close.className = "nft-close";
  close.dataset.i18n = "nftClose";
  close.textContent = t("nftClose");
  close.onclick = closeViewer;
  nftStage = document.createElement("div");
  nftStage.className = "nft-stage";
  nftCaption = document.createElement("div");
  nftCaption.className = "nft-caption";
  nftActions = document.createElement("div");
  nftActions.className = "nft-overlay-actions";
  nftCount = document.createElement("p");
  nftCount.className = "nft-count";
  nftPrev = document.createElement("button");
  nftPrev.type = "button";
  nftPrev.className = "nft-step";
  nftPrev.textContent = "‹";
  nftPrev.onclick = function () { stepViewer(-1); };
  nftNext = document.createElement("button");
  nftNext.type = "button";
  nftNext.className = "nft-step";
  nftNext.textContent = "›";
  nftNext.onclick = function () { stepViewer(1); };
  var pager = document.createElement("div");
  pager.className = "nft-pager";
  pager.append(nftPrev, nftCount, nftNext);
  dialog.append(close, nftStage, nftCaption, nftActions, pager);
  nftOverlay.append(dialog);
  document.body.append(nftOverlay);
  document.addEventListener("keydown", function (event) {
    if (!nftOverlay || nftOverlay.hidden) return;
    var tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "Escape") closeViewer();
    else if (event.key === "ArrowRight") stepViewer(1);
    else if (event.key === "ArrowLeft") stepViewer(-1);
  });
}

function closeViewer() {
  if (nftOverlay) nftOverlay.hidden = true;
}

function stepViewer(delta) {
  var items = viewerItems();
  if (items.length < 2) return;
  viewerPos = (viewerPos + delta + items.length) % items.length;
  paintOverlay();
}

function openViewer(index) {
  var items = viewerItems();
  if (!items.length) return;
  ensureOverlay();
  viewerPos = (index + items.length) % items.length;
  paintOverlay();
  nftOverlay.hidden = false;
  if (phone) show("nfts");
}

function paintOverlay() {
  var items = viewerItems();
  var item = items[viewerPos];
  if (!item) {
    closeViewer();
    return;
  }
  var face = tokenFace(item.object);
  nftStage.replaceChildren(artFrame(face));
  if (item.offer) {
    var stageBadge = document.createElement("span");
    stageBadge.className = "nft-badge";
    stageBadge.textContent = t("nftOffer");
    nftStage.append(stageBadge);
  }
  nftCaption.replaceChildren();
  var name = document.createElement("strong");
  name.textContent = face.title;
  nftCaption.append(name);
  if (item.offer) {
    var offerCaption = document.createElement("p");
    offerCaption.className = "nft-offer";
    offerCaption.textContent = t("nftOffer");
    nftCaption.append(offerCaption);
  }
  if (face.card) {
    var edition = document.createElement("p");
    edition.textContent = t("nftEdition") + " " + face.card.edition;
    nftCaption.append(edition);
  }
  var shown = saleText(item.object.Amount);
  if (shown) {
    var sale = document.createElement("p");
    sale.textContent = t("nftForSale") + " " + shown;
    nftCaption.append(sale);
  }
  nftActions.replaceChildren();
  var id = String(item.object.index || "");
  if (item.offer) {
    nftActions.append(nftLink("nftAccept", { act: "buy", id: item.offer.id, xah: item.offer.xah }, false));
    var decline = document.createElement("button");
    decline.type = "button";
    decline.className = "g";
    decline.dataset.i18n = "nftDecline";
    decline.textContent = t("nftDecline");
    decline.onclick = function () {
      rememberDeclined(item.offer.key);
      paintGallery();
      paintActivity(activityRows, offerNodes);
      var next = viewerItems();
      if (!next.length) closeViewer();
      else {
        if (viewerPos >= next.length) viewerPos = next.length - 1;
        paintOverlay();
      }
    };
    nftActions.append(decline);
  } else if (item.object.Amount) {
    nftActions.append(nftLink("nftCancelSale", { act: "cancel", id: id }, true));
    nftActions.append(nftLink("nftBurn", { act: "burn", id: id }, true));
  } else {
    nftActions.append(nftLink("nftSell", { act: "sell", id: id }, false));
    nftActions.append(nftLink("nftBurn", { act: "burn", id: id }, true));
  }
  nftCount.textContent = fill("nftCount", { n: viewerPos + 1, m: items.length });
  nftPrev.disabled = items.length < 2;
  nftNext.disabled = items.length < 2;
}

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

function declinedOffers() {
  var out = {};
  try {
    var raw = new URLSearchParams(location.hash.replace(/^#/, "")).get("declined") || "";
    var parts = raw.split(",");
    for (var i = 0; i < parts.length; i++) {
      if (/^[A-F0-9]{64}:r[1-9A-HJ-NP-Za-km-z]{24,34}:\d+$/.test(parts[i])) out[parts[i]] = 1;
    }
  } catch (error) {}
  return out;
}

function rememberDeclined(key) {
  try {
    var params = new URLSearchParams(location.hash.replace(/^#/, ""));
    var current = (params.get("declined") || "").split(",").filter(function (part) {
      return /^[A-F0-9]{64}:r[1-9A-HJ-NP-Za-km-z]{24,34}:\d+$/.test(part);
    });
    if (current.indexOf(key) < 0) current.push(key);
    if (current.length > 8) current = current.slice(current.length - 8);
    params.set("declined", current.join(","));
    location.hash = params.toString();
  } catch (error) {}
}

function loadOffers(entries) {
  var ids = [];
  var seen = {};
  for (var i = 0; i < entries.length; i++) {
    var tx = entries[i].tx_json || entries[i].tx || {};
    var meta = entries[i].meta || entries[i].metaData || {};
    var result = meta.TransactionResult || "";
    var ok = result === "" || result === "tesSUCCESS";
    var id = String(tx.URITokenID || "").toUpperCase();
    if (!ok || tx.TransactionType !== "URITokenCreateSellOffer" || tx.Destination !== acct || !/^[A-F0-9]{64}$/.test(id) || seen[id]) continue;
    seen[id] = 1;
    ids.push(id);
  }
  return Promise.all(ids.map(function (id) {
    return rpc("ledger_entry", { index: id, ledger_index: "validated" }).then(function (entry) {
      var node = entry.node || {};
      node.index = String(entry.index || node.index || id).toUpperCase();
      return node;
    }).catch(function () { return null; });
  })).then(function (nodes) {
    var map = {};
    for (var i = 0; i < nodes.length; i++) if (nodes[i] && nodes[i].index) map[nodes[i].index] = nodes[i];
    return map;
  });
}

function liveOffer(tx, token) {
  if (!token || token.Owner === acct || token.Destination !== acct || tx.Account !== token.Owner) return null;
  var amount = tx.Amount;
  if (typeof amount !== "string" || !/^\d+$/.test(amount) || amount !== String(token.Amount)) return null;
  var id = String(token.index || tx.URITokenID || "").toUpperCase();
  return { id: id, xah: xah(amount), key: id + ":" + token.Owner + ":" + amount };
}

function paintActivity(rows, tokens) {
  if (!activityPanel || !activityNote || !activityList) return;
  const old = activityList.querySelectorAll(".tx");
  for (let i = 0; i < old.length; i++) old[i].remove();
  const list = rows || [];
  const offers = tokens || {};
  const declined = declinedOffers();
  const used = {};
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
    const tokenId = String(tx.URITokenID || "").toUpperCase();
    let offer = null;
    if (ok && type === "URITokenCreateSellOffer" && tx.Destination === acct && !used[tokenId]) {
      offer = liveOffer(tx, offers[tokenId]);
      if (offer) used[tokenId] = 1;
      if (offer && declined[offer.key]) offer = null;
    }
    const row = document.createElement(links.length && !offer ? "a" : "div");
    row.className = (ok ? "tx" : "tx bad") + (offer ? " offer" : "");
    if (links.length && !offer) {
      row.href = links[0].url;
      row.target = "_blank";
      row.rel = "noopener";
    }
    const end = document.createElement("span");
    end.className = "tx-end";
    if (!ok) {
      const flag = document.createElement("span");
      flag.className = "tx-flag";
      flag.textContent = "Failed";
      end.append(flag);
    }
    const hashNode = document.createElement(links.length && offer ? "a" : "span");
    hashNode.className = "tx-hash";
    hashNode.textContent = shortAddr(hash);
    if (links.length && offer) {
      hashNode.href = links[0].url;
      hashNode.target = "_blank";
      hashNode.rel = "noopener";
      hashNode.onclick = function (event) { event.stopPropagation(); };
    }
    end.append(hashNode);
    if (offer) {
      const face = tokenFace(offers[tokenId] || {});
      const shown = saleText((offers[tokenId] || {}).Amount);
      if (face.art) {
        const thumb = document.createElement("img");
        thumb.className = "tx-art";
        thumb.src = face.art;
        thumb.alt = face.title;
        row.append(thumb);
      } else {
        const thumb = document.createElement("span");
        thumb.className = "tx-art tx-art-fallback";
        thumb.textContent = (face.title || "").slice(0, 2);
        row.append(thumb);
      }
      const typeNode = document.createElement("span");
      typeNode.className = "tx-type";
      typeNode.textContent = face.title || type;
      const main = document.createElement("span");
      main.className = "tx-main";
      main.textContent = t("nftForSale") + (shown ? " " + shown : "");
      row.append(typeNode, main, end);
      row.tabIndex = 0;
      const open = function () {
        const items = viewerItems();
        let at = -1;
        for (let n = 0; n < items.length; n++) if (items[n].offer && items[n].offer.id === offer.id) at = n;
        if (at >= 0) openViewer(at);
      };
      row.onclick = function (event) {
        if (event.target.closest && event.target.closest("a")) return;
        open();
      };
      row.onkeydown = function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      };
    } else {
      const typeNode = document.createElement("span");
      typeNode.className = "tx-type";
      typeNode.textContent = type;
      const main = document.createElement("span");
      main.className = "tx-main";
      main.textContent = txDetail(type, line);
      row.append(typeNode, main, end);
    }
    activityList.append(row);
  }
}

function showActivity(entries) {
  activityRows = entries || [];
  return loadOffers(activityRows).then(function (map) {
    offerNodes = map || {};
    paintActivity(activityRows, offerNodes);
    paintGallery();
  }).catch(function () {
    offerNodes = {};
    paintActivity(activityRows, offerNodes);
  });
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
    return showActivity(page.transactions || []);
  });
  const lineP = rpc("account_lines", { account: acct, ledger_index: "validated" }).then(function (page) {
    paintLines(page.lines || []);
  });
  const nftP = rpc("account_objects", { account: acct, type: "uri_token", ledger_index: "validated" }).then(function (page) {
    paintTokens(page.account_objects || []);
  });
  Promise.all([infoP, txP, lineP, nftP].map(function (job) { return job.catch(function () {}); })).then(function () {
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
  for (let i = 0; i < panels.length; i++) {
    const id = panels[i].id;
    const on = which === "transfer" ? id === "send" || id === "receive" : id === which;
    panels[i].classList.toggle("on", on);
  }
  const tabs = document.querySelectorAll("nav.tabs button, nav.tabs a");
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
    return showActivity(page.transactions || []);
  }).catch(function () { activityNote.textContent = "Activity is unavailable."; });

  const nftPanel = panel("nfts");
  nftNote = document.createElement("p");
  nftNote.className = "m";
  nftNote.textContent = t("loading");
  nftList = document.createElement("div");
  nftList.className = "nft-grid";
  nftPanel.append(heading("nfts"), nftNote, nftList);
  rpc("account_objects", { account: acct, type: "uri_token", ledger_index: "validated" }).then(function (page) {
    paintTokens(page.account_objects || []);
  }).catch(function () { if (nftNote) nftNote.textContent = t("nftUnavailable"); });

  const layout = document.createElement("div");
  layout.id = "layout";
  if (passkey) layout.append(sendPanel, receivePanel, activityPanel, nftPanel);
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
      addTab("transfer", "transfer");
      addTab("scan", "scan", href("scan"));
      addTab("nfts", "nfts");
      addTab("activity", "activity");
    }
    addTab("settings", "settings");
    slot.append(tabs, layout);
    if (passkey) show("transfer");
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
