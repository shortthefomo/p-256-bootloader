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
  en: { home: "Home", send: "Send", receive: "Receive", transfer: "Transfer", scan: "Scan", activity: "Activity", settings: "Settings", version: "Version", general: "General", language: "Language", currencyFormat: "Currency format", formatHint: "Balances and amounts you type use this format. A QR code stores a plain amount.", firewall: "Passkey firewall", walletInterface: "Wallet interface", installed: "Installed", shipped: "This wallet", current: "Current", updateAvailable: "Update available", notInstalled: "Not installed", notPublished: "Not published", updateFirewall: "Update firewall", updateWallet: "Install update", executionFee: "Execution fee", hookMatches: "This account runs the firewall shipped with this wallet.", hookDiffers: "This account runs a different firewall than the one shipped with this wallet.", hookMissing: "No firewall is installed on this account.", hookUnreadable: "The network did not return the firewall version.", interfaceMatches: "The published wallet page matches this wallet.", interfaceDiffers: "A new wallet page is ready for this account.", interfaceMissing: "This account has no wallet page yet.", layout: "Layout", mobile: "Mobile", desktop: "Desktop", light: "Light", dark: "Dark", loading: "Loading…", drops: "drops", amountInvalid: "Enter an amount", nfts: "NFTs", shop: "Shop", nftEmpty: "No URI tokens on this account.", nftMint: "Mint a URI token", nftBurn: "Burn", nftSell: "Sell", nftMakeOffer: "Put up for sale", nftCancelSale: "Cancel sale", nftForSale: "For sale", nftEdition: "Edition", nftUnavailable: "URI tokens are unavailable.", nftAccept: "Accept", nftDecline: "Decline", nftOffer: "Offer", nftClose: "Close", nftCount: "{n} of {m}", nftAll: "All", nftOffers: "Offers", nftNotForSale: "Not for sale", nftNoMatch: "Nothing matches.", nftCopy: "Copy", nftCopied: "Copied", nftShare: "Share", nftShareShop: "Share for sale", nftTweet: "For sale on Xahau", nftShop: "All for sale", nftShopEmpty: "Nothing is listed for sale.", nftOfferScan: "Scan this code to make an offer.", nftPurchase: "Buy", nftMissing: "That token is not on this account.", nftTokenId: "Token ID", nftPrice: "Price in XAH, optional", nftBuyer: "Only this buyer, optional", available: "Available {amount} XAH", destPlaceholder: "Destination r…", amountPlaceholder: "Amount", review: "Review", showQr: "Show QR for iPhone", otherTx: "Trust lines, escrow, and other types", requestAmount: "Request amount, optional", receiveHint: "Leave the amount empty and the code is your address.", payQr: "Scan this with the iPhone.", destInvalid: "Enter a destination address", login: "Log in", logout: "Log out", createWallet: "Create a wallet" },
  es: { home: "Inicio", send: "Enviar", receive: "Recibir", transfer: "Mover", scan: "Escanear", activity: "Actividad", settings: "Ajustes", version: "Versión", general: "General", language: "Idioma", currencyFormat: "Formato de cantidad", formatHint: "Los saldos y las cantidades que escribes usan este formato. Un código QR guarda una cantidad simple.", firewall: "Cortafuegos passkey", walletInterface: "Interfaz del monedero", installed: "Instalado", shipped: "Este monedero", current: "Al día", updateAvailable: "Hay una actualización", notInstalled: "No instalado", notPublished: "Sin publicar", updateFirewall: "Actualizar el cortafuegos", updateWallet: "Instalar actualización", executionFee: "Comisión de ejecución", hookMatches: "Esta cuenta usa el cortafuegos que trae este monedero.", hookDiffers: "Esta cuenta usa un cortafuegos distinto del que trae este monedero.", hookMissing: "Esta cuenta no tiene el cortafuegos instalado.", hookUnreadable: "La red no devolvió la versión del cortafuegos.", interfaceMatches: "La página publicada coincide con este monedero.", interfaceDiffers: "Hay una página nueva lista para esta cuenta.", interfaceMissing: "Esta cuenta todavía no tiene página.", layout: "Diseño", mobile: "Móvil", desktop: "Escritorio", light: "Claro", dark: "Oscuro", loading: "Cargando…", drops: "drops", amountInvalid: "Escribe una cantidad", nfts: "NFTs", shop: "Tienda", nftEmpty: "No hay URI tokens en esta cuenta.", nftMint: "Acuñar un URI token", nftBurn: "Quemar", nftSell: "Vender", nftMakeOffer: "Poner en venta", nftCancelSale: "Cancelar la venta", nftForSale: "En venta", nftEdition: "Edición", nftUnavailable: "Los URI tokens no están disponibles.", nftAccept: "Aceptar", nftDecline: "Rechazar", nftOffer: "Oferta", nftClose: "Cerrar", nftCount: "{n} de {m}", nftAll: "Todos", nftOffers: "Ofertas", nftNotForSale: "Sin venta", nftNoMatch: "Nada coincide.", nftCopy: "Copiar", nftCopied: "Copiado", nftShare: "Compartir", nftShareShop: "Compartir en venta", nftTweet: "En venta en Xahau", nftShop: "Todo en venta", nftShopEmpty: "Nada está en venta.", nftOfferScan: "Escanea este código para hacer una oferta.", nftPurchase: "Comprar", nftMissing: "Ese token no está en esta cuenta.", nftTokenId: "ID del token", nftPrice: "Precio en XAH, opcional", nftBuyer: "Solo este comprador, opcional", available: "Disponible {amount} XAH", destPlaceholder: "Destino r…", amountPlaceholder: "Cantidad", review: "Revisar", showQr: "Mostrar QR para el iPhone", otherTx: "Líneas de confianza, depósito y otros tipos", requestAmount: "Cantidad a solicitar, opcional", receiveHint: "Deja la cantidad vacía y el código es tu dirección.", payQr: "Escanéalo con el iPhone.", destInvalid: "Escribe una dirección de destino", login: "Entrar", logout: "Salir", createWallet: "Crear un monedero" },
  fr: { home: "Accueil", send: "Envoyer", receive: "Recevoir", transfer: "Transfert", scan: "Scanner", activity: "Activité", settings: "Réglages", version: "Version", general: "Général", language: "Langue", currencyFormat: "Format du montant", formatHint: "Les soldes et les montants saisis utilisent ce format. Un QR code garde un montant simple.", firewall: "Pare-feu passkey", walletInterface: "Interface du portefeuille", installed: "Installé", shipped: "Ce portefeuille", current: "À jour", updateAvailable: "Mise à jour disponible", notInstalled: "Non installé", notPublished: "Non publié", updateFirewall: "Mettre à jour le pare-feu", updateWallet: "Installer la mise à jour", executionFee: "Frais d’exécution", hookMatches: "Ce compte utilise le pare-feu livré avec ce portefeuille.", hookDiffers: "Ce compte utilise un pare-feu différent de celui livré avec ce portefeuille.", hookMissing: "Aucun pare-feu n’est installé sur ce compte.", hookUnreadable: "Le réseau n’a pas renvoyé la version du pare-feu.", interfaceMatches: "La page publiée correspond à ce portefeuille.", interfaceDiffers: "Une nouvelle page est prête pour ce compte.", interfaceMissing: "Ce compte n’a pas encore de page.", layout: "Disposition", mobile: "Mobile", desktop: "Ordinateur", light: "Clair", dark: "Sombre", loading: "Chargement…", drops: "drops", amountInvalid: "Saisissez un montant", nfts: "NFTs", shop: "Boutique", nftEmpty: "Aucun URI token sur ce compte.", nftMint: "Émettre un URI token", nftBurn: "Détruire", nftSell: "Vendre", nftMakeOffer: "Mettre en vente", nftCancelSale: "Annuler la vente", nftForSale: "En vente", nftEdition: "Édition", nftUnavailable: "Les URI tokens ne sont pas disponibles.", nftAccept: "Accepter", nftDecline: "Refuser", nftOffer: "Offre", nftClose: "Fermer", nftCount: "{n} sur {m}", nftAll: "Tous", nftOffers: "Offres", nftNotForSale: "Pas en vente", nftNoMatch: "Aucun résultat.", nftCopy: "Copier", nftCopied: "Copié", nftShare: "Partager", nftShareShop: "Partager en vente", nftTweet: "En vente sur Xahau", nftShop: "Tout en vente", nftShopEmpty: "Rien n’est en vente.", nftOfferScan: "Scannez ce code pour faire une offre.", nftPurchase: "Acheter", nftMissing: "Ce token n’est pas sur ce compte.", nftTokenId: "ID du token", nftPrice: "Prix en XAH, facultatif", nftBuyer: "Seulement cet acheteur, facultatif", available: "Disponible {amount} XAH", destPlaceholder: "Destination r…", amountPlaceholder: "Montant", review: "Vérifier", showQr: "Montrer le QR pour l’iPhone", otherTx: "Lignes de confiance, séquestre et autres types", requestAmount: "Montant demandé, facultatif", receiveHint: "Laissez le montant vide et le code est votre adresse.", payQr: "Scannez ceci avec l’iPhone.", destInvalid: "Saisissez une adresse de destination", login: "Connexion", logout: "Déconnexion", createWallet: "Créer un portefeuille" },
  de: { home: "Start", send: "Senden", receive: "Empfangen", transfer: "Transfer", scan: "Scannen", activity: "Aktivität", settings: "Einstellungen", version: "Version", general: "Allgemein", language: "Sprache", currencyFormat: "Zahlenformat", formatHint: "Guthaben und eingegebene Beträge nutzen dieses Format. Ein QR-Code speichert einen einfachen Betrag.", firewall: "Passkey-Firewall", walletInterface: "Wallet-Oberfläche", installed: "Installiert", shipped: "Diese Wallet", current: "Aktuell", updateAvailable: "Update verfügbar", notInstalled: "Nicht installiert", notPublished: "Nicht veröffentlicht", updateFirewall: "Firewall aktualisieren", updateWallet: "Update installieren", executionFee: "Ausführungsgebühr", hookMatches: "Dieses Konto nutzt die Firewall aus dieser Wallet.", hookDiffers: "Dieses Konto nutzt eine andere Firewall als die aus dieser Wallet.", hookMissing: "Auf diesem Konto ist keine Firewall installiert.", hookUnreadable: "Das Netzwerk hat die Firewall-Version nicht geliefert.", interfaceMatches: "Die veröffentlichte Seite entspricht dieser Wallet.", interfaceDiffers: "Eine neue Seite ist für dieses Konto bereit.", interfaceMissing: "Dieses Konto hat noch keine Seite.", layout: "Layout", mobile: "Mobil", desktop: "Desktop", light: "Hell", dark: "Dunkel", loading: "Wird geladen…", drops: "drops", amountInvalid: "Gib einen Betrag ein", nfts: "NFTs", shop: "Shop", nftEmpty: "Keine URI-Tokens auf diesem Konto.", nftMint: "URI-Token prägen", nftBurn: "Vernichten", nftSell: "Verkaufen", nftMakeOffer: "Zum Verkauf stellen", nftCancelSale: "Verkauf abbrechen", nftForSale: "Zu verkaufen", nftEdition: "Ausgabe", nftUnavailable: "URI-Tokens sind nicht verfügbar.", nftAccept: "Annehmen", nftDecline: "Ablehnen", nftOffer: "Angebot", nftClose: "Schließen", nftCount: "{n} von {m}", nftAll: "Alle", nftOffers: "Angebote", nftNotForSale: "Nicht im Verkauf", nftNoMatch: "Nichts passt.", nftCopy: "Kopieren", nftCopied: "Kopiert", nftShare: "Teilen", nftShareShop: "Verkauf teilen", nftTweet: "Zu verkaufen auf Xahau", nftShop: "Alles im Verkauf", nftShopEmpty: "Nichts steht zum Verkauf.", nftOfferScan: "Scanne diesen Code, um ein Angebot zu machen.", nftPurchase: "Kaufen", nftMissing: "Dieses Token ist nicht auf diesem Konto.", nftTokenId: "Token-ID", nftPrice: "Preis in XAH, optional", nftBuyer: "Nur dieser Käufer, optional", available: "Verfügbar {amount} XAH", destPlaceholder: "Ziel r…", amountPlaceholder: "Betrag", review: "Prüfen", showQr: "QR für das iPhone zeigen", otherTx: "Vertrauenslinien, Treuhand und andere Typen", requestAmount: "Betrag anfordern, optional", receiveHint: "Ohne Betrag ist der Code deine Adresse.", payQr: "Scanne das mit dem iPhone.", destInvalid: "Gib eine Zieladresse ein", login: "Anmelden", logout: "Abmelden", createWallet: "Wallet erstellen" },
  pt: { home: "Início", send: "Enviar", receive: "Receber", transfer: "Mover", scan: "Ler", activity: "Atividade", settings: "Ajustes", version: "Versão", general: "Geral", language: "Idioma", currencyFormat: "Formato do valor", formatHint: "Saldos e valores digitados usam este formato. Um QR guarda um valor simples.", firewall: "Firewall passkey", walletInterface: "Interface da carteira", installed: "Instalado", shipped: "Esta carteira", current: "Em dia", updateAvailable: "Atualização disponível", notInstalled: "Não instalado", notPublished: "Não publicada", updateFirewall: "Atualizar o firewall", updateWallet: "Instalar atualização", executionFee: "Taxa de execução", hookMatches: "Esta conta usa o firewall que vem com esta carteira.", hookDiffers: "Esta conta usa um firewall diferente do que vem com esta carteira.", hookMissing: "Não há firewall instalado nesta conta.", hookUnreadable: "A rede não devolveu a versão do firewall.", interfaceMatches: "A página publicada corresponde a esta carteira.", interfaceDiffers: "Uma página nova está pronta para esta conta.", interfaceMissing: "Esta conta ainda não tem página.", layout: "Layout", mobile: "Celular", desktop: "Computador", light: "Claro", dark: "Escuro", loading: "Carregando…", drops: "drops", amountInvalid: "Digite um valor", nfts: "NFTs", shop: "Loja", nftEmpty: "Não há URI tokens nesta conta.", nftMint: "Emitir um URI token", nftBurn: "Queimar", nftSell: "Vender", nftMakeOffer: "Colocar à venda", nftCancelSale: "Cancelar a venda", nftForSale: "À venda", nftEdition: "Edição", nftUnavailable: "Os URI tokens não estão disponíveis.", nftAccept: "Aceitar", nftDecline: "Recusar", nftOffer: "Oferta", nftClose: "Fechar", nftCount: "{n} de {m}", nftAll: "Todos", nftOffers: "Ofertas", nftNotForSale: "Sem venda", nftNoMatch: "Nada encontrado.", nftCopy: "Copiar", nftCopied: "Copiado", nftShare: "Compartilhar", nftShareShop: "Compartilhar à venda", nftTweet: "À venda na Xahau", nftShop: "Tudo à venda", nftShopEmpty: "Nada está à venda.", nftOfferScan: "Leia este código para fazer uma oferta.", nftPurchase: "Comprar", nftMissing: "Esse token não está nesta conta.", nftTokenId: "ID do token", nftPrice: "Preço em XAH, opcional", nftBuyer: "Só este comprador, opcional", available: "Disponível {amount} XAH", destPlaceholder: "Destino r…", amountPlaceholder: "Valor", review: "Rever", showQr: "Mostrar QR para o iPhone", otherTx: "Linhas de confiança, custódia e outros tipos", requestAmount: "Valor a pedir, opcional", receiveHint: "Deixe o valor vazio e o código é o seu endereço.", payQr: "Leia isto com o iPhone.", destInvalid: "Digite um endereço de destino", login: "Entrar", logout: "Sair", createWallet: "Criar uma carteira" },
  zh: { home: "首页", send: "发送", receive: "收款", transfer: "收发", scan: "扫描", activity: "活动", settings: "设置", version: "版本", general: "通用", language: "语言", currencyFormat: "金额格式", formatHint: "余额和输入的金额使用此格式。二维码保存的是普通金额。", firewall: "Passkey 防火墙", walletInterface: "钱包界面", installed: "已安装", shipped: "此钱包", current: "已是最新", updateAvailable: "有可用更新", notInstalled: "未安装", notPublished: "未发布", updateFirewall: "更新防火墙", updateWallet: "安装更新", executionFee: "执行费用", hookMatches: "此账户运行的是本钱包附带的防火墙。", hookDiffers: "此账户运行的防火墙与本钱包附带的不同。", hookMissing: "此账户尚未安装防火墙。", hookUnreadable: "网络没有返回防火墙版本。", interfaceMatches: "已发布的页面与此钱包一致。", interfaceDiffers: "此账户有新的钱包页面可以安装。", interfaceMissing: "此账户还没有钱包页面。", layout: "布局", mobile: "手机", desktop: "电脑", light: "浅色", dark: "深色", loading: "正在加载…", drops: "drops", amountInvalid: "请输入金额", nfts: "NFTs", shop: "商店", nftEmpty: "此账户没有 URI 代币。", nftMint: "铸造 URI 代币", nftBurn: "销毁", nftSell: "出售", nftMakeOffer: "上架出售", nftCancelSale: "取消出售", nftForSale: "在售", nftEdition: "版次", nftUnavailable: "无法读取 URI 代币。", nftAccept: "接受", nftDecline: "拒绝", nftOffer: "报价", nftClose: "关闭", nftCount: "{n} / {m}", nftAll: "全部", nftOffers: "报价", nftNotForSale: "未出售", nftNoMatch: "没有匹配。", nftCopy: "复制", nftCopied: "已复制", nftShare: "分享", nftShareShop: "分享在售", nftTweet: "在 Xahau 出售", nftShop: "全部在售", nftShopEmpty: "没有在售的代币。", nftOfferScan: "扫描此码即可出价。", nftPurchase: "购买", nftMissing: "此账户没有该代币。", nftTokenId: "代币 ID", nftPrice: "价格（XAH），可选", nftBuyer: "仅此买家，可选", available: "可用 {amount} XAH", destPlaceholder: "收款地址 r…", amountPlaceholder: "金额", review: "核对", showQr: "显示 iPhone 二维码", otherTx: "信任线、托管和其他类型", requestAmount: "请求金额，可选", receiveHint: "金额留空时，二维码就是你的地址。", payQr: "用 iPhone 扫描此码。", destInvalid: "请输入收款地址", login: "登录", logout: "退出", createWallet: "创建钱包" },
  ja: { home: "ホーム", send: "送金", receive: "受取", transfer: "入出金", scan: "スキャン", activity: "履歴", settings: "設定", version: "バージョン", general: "一般", language: "言語", currencyFormat: "金額の形式", formatHint: "残高と入力する金額はこの形式です。QRコードには単純な金額が入ります。", firewall: "パスキーファイアウォール", walletInterface: "ウォレット画面", installed: "導入済み", shipped: "このウォレット", current: "最新", updateAvailable: "更新があります", notInstalled: "未導入", notPublished: "未公開", updateFirewall: "ファイアウォールを更新", updateWallet: "更新をインストール", executionFee: "実行手数料", hookMatches: "このアカウントは、このウォレットに同梱されたファイアウォールです。", hookDiffers: "このアカウントのファイアウォールは、このウォレットに同梱されたものと違います。", hookMissing: "このアカウントにはファイアウォールがありません。", hookUnreadable: "ネットワークがファイアウォールのバージョンを返しませんでした。", interfaceMatches: "公開中のページは、このウォレットと一致しています。", interfaceDiffers: "このアカウントに新しいページを入れられます。", interfaceMissing: "このアカウントにはまだページがありません。", layout: "レイアウト", mobile: "モバイル", desktop: "デスクトップ", light: "ライト", dark: "ダーク", loading: "読み込み中…", drops: "drops", amountInvalid: "金額を入力してください", nfts: "NFTs", shop: "ショップ", nftEmpty: "このアカウントに URI トークンはありません。", nftMint: "URI トークンを発行", nftBurn: "破棄", nftSell: "売却", nftMakeOffer: "出品する", nftCancelSale: "売却を取り消す", nftForSale: "売却中", nftEdition: "エディション", nftUnavailable: "URI トークンを取得できません。", nftAccept: "受け取る", nftDecline: "辞退", nftOffer: "オファー", nftClose: "閉じる", nftCount: "{n} / {m}", nftAll: "すべて", nftOffers: "オファー", nftNotForSale: "未出品", nftNoMatch: "該当なし", nftCopy: "コピー", nftCopied: "コピーしました", nftShare: "共有", nftShareShop: "出品を共有", nftTweet: "Xahau で売却中", nftShop: "出品一覧", nftShopEmpty: "出品中のトークンはありません。", nftOfferScan: "このコードをスキャンしてオファーを出します。", nftPurchase: "買う", nftMissing: "このアカウントにそのトークンはありません。", nftTokenId: "トークン ID", nftPrice: "価格（XAH）、任意", nftBuyer: "この買い手だけ、任意", available: "利用可能 {amount} XAH", destPlaceholder: "宛先 r…", amountPlaceholder: "金額", review: "確認", showQr: "iPhone用QRを表示", otherTx: "トラストライン、エスクロー、その他", requestAmount: "請求額、任意", receiveHint: "金額を空にすると、コードはあなたのアドレスです。", payQr: "iPhone でこのコードをスキャンします。", destInvalid: "宛先のアドレスを入力してください", login: "ログイン", logout: "ログアウト", createWallet: "ウォレットを作る" },
  ko: { home: "홈", send: "보내기", receive: "받기", transfer: "이체", scan: "스캔", activity: "활동", settings: "설정", version: "버전", general: "일반", language: "언어", currencyFormat: "금액 형식", formatHint: "잔액과 입력하는 금액이 이 형식을 사용합니다. QR 코드에는 일반 금액이 저장됩니다.", firewall: "패스키 방화벽", walletInterface: "지갑 화면", installed: "설치됨", shipped: "이 지갑", current: "최신", updateAvailable: "업데이트 있음", notInstalled: "설치되지 않음", notPublished: "게시되지 않음", updateFirewall: "방화벽 업데이트", updateWallet: "업데이트 설치", executionFee: "실행 수수료", hookMatches: "이 계정은 이 지갑에 포함된 방화벽을 사용합니다.", hookDiffers: "이 계정의 방화벽은 이 지갑에 포함된 것과 다릅니다.", hookMissing: "이 계정에는 방화벽이 설치되어 있지 않습니다.", hookUnreadable: "네트워크가 방화벽 버전을 반환하지 않았습니다.", interfaceMatches: "게시된 페이지가 이 지갑과 일치합니다.", interfaceDiffers: "이 계정에 새 지갑 페이지를 설치할 수 있습니다.", interfaceMissing: "이 계정에는 아직 지갑 페이지가 없습니다.", layout: "레이아웃", mobile: "모바일", desktop: "데스크톱", light: "라이트", dark: "다크", loading: "불러오는 중…", drops: "drops", amountInvalid: "금액을 입력하세요", nfts: "NFTs", shop: "상점", nftEmpty: "이 계정에는 URI 토큰이 없습니다.", nftMint: "URI 토큰 발행", nftBurn: "소각", nftSell: "판매", nftMakeOffer: "판매로 내놓기", nftCancelSale: "판매 취소", nftForSale: "판매 중", nftEdition: "에디션", nftUnavailable: "URI 토큰을 불러올 수 없습니다.", nftAccept: "수락", nftDecline: "거절", nftOffer: "제안", nftClose: "닫기", nftCount: "{n} / {m}", nftAll: "전체", nftOffers: "제안", nftNotForSale: "미판매", nftNoMatch: "일치하는 항목 없음", nftCopy: "복사", nftCopied: "복사함", nftShare: "공유", nftShareShop: "판매 공유", nftTweet: "Xahau에서 판매 중", nftShop: "판매 전체", nftShopEmpty: "판매 중인 토큰이 없습니다.", nftOfferScan: "이 코드를 스캔하면 제안할 수 있습니다.", nftPurchase: "구매", nftMissing: "이 계정에 그 토큰이 없습니다.", nftTokenId: "토큰 ID", nftPrice: "가격(XAH), 선택", nftBuyer: "이 구매자만, 선택", available: "사용 가능 {amount} XAH", destPlaceholder: "받는 주소 r…", amountPlaceholder: "금액", review: "확인", showQr: "iPhone용 QR 표시", otherTx: "신뢰선, 에스크로 및 기타", requestAmount: "요청 금액, 선택", receiveHint: "금액을 비우면 코드는 내 주소입니다.", payQr: "iPhone으로 이 코드를 스캔하세요.", destInvalid: "받는 주소를 입력하세요", login: "로그인", logout: "로그아웃", createWallet: "지갑 만들기" },
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

// The first supported tag wins. "es-MX" matches es. Anything else is English.
function browserLanguage(list) {
  var tags = [];
  if (Array.isArray(list)) tags = list.slice();
  else if (list && typeof list !== "string" && typeof list.length === "number") {
    for (var i = 0; i < list.length; i++) tags.push(list[i]);
  } else tags = String(list || "").split(",");
  for (var j = 0; j < tags.length; j++) {
    var primary = String(tags[j] || "").trim().toLowerCase().split(/[-_]/)[0];
    if (LANGS.indexOf(primary) >= 0) return primary;
  }
  return "en";
}

function browserLanguages() {
  try {
    return navigator.languages ? Array.from(navigator.languages) : [navigator.language || ""];
  } catch (error) {
    return [];
  }
}

// A saved language wins. A visitor with none uses a supported browser language. A logged-in wallet with none stays English.
function language() {
  var saved = pref("p256-lang", LANGS, "");
  var id = saved || (loggedIn() ? "en" : browserLanguage(browserLanguages()));
  try { document.documentElement.lang = id; } catch (error) {}
  return id;
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
  if (!kept) putHash({ shell: value });
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
  var text = String(t(key));
  Object.keys(vars).forEach(function (name) {
    text = text.split("{" + name + "}").join(String(vars[name]));
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
  var avail = document.getElementById("available");
  if (avail) avail.textContent = fill("available", { amount: formatDrops(lastDrops) });
}

function applyLanguage() {
  var nodes = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].dataset.i18n);
  var themes = document.querySelectorAll("button.theme");
  for (var j = 0; j < themes.length; j++) {
    if (themes[j].dataset.i18n) continue;
    themes[j].textContent = themeLabel();
  }
  if (lastDrops != null) $("b").textContent = formatDrops(lastDrops);
  var holds = document.querySelectorAll("[data-placeholder]");
  for (var h = 0; h < holds.length; h++) holds[h].placeholder = t(holds[h].getAttribute("data-placeholder"));
  var avail = document.getElementById("available");
  if (avail && lastDrops != null) avail.textContent = fill("available", { amount: formatDrops(lastDrops) });
}

// The ledger page is sandboxed, so its origin is opaque. A scripted
// location change is rejected there and the page reloads. A real link is a
// user navigation, which this top-level page is allowed to do.
function loggedIn() {
  try {
    return new URLSearchParams((location.hash || "").replace(/^#/, "")).get("login") === "1";
  } catch (error) {
    return false;
  }
}

function href(op, extra) {
  const query = new URLSearchParams(Object.assign({ op: op, account: acct }, extra || {}));
  if (loggedIn()) query.set("logged", "1");
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
const headActions = document.createElement("div");
headActions.className = "head-actions";
if (phone) {
  headActions.append(themeButton());
  head.append(headActions);
}
const statusLine = $("g");
side.append.apply(side, [head, intro, $("a").parentElement, balanceLine, linesBox, statusLine].filter(Boolean));
balanceLine.hidden = true;
linesBox.hidden = true;
if (statusLine) statusLine.hidden = true;
if (intro) intro.hidden = true;
stage.append.apply(stage, [$("d"), note, raw].filter(Boolean));
frame.append(side, stage);
document.querySelector("main").replaceChildren(frame);

// The published page carries this rev. A page without it, or with an older
// one, still has the previous wallet and can install this one.
var publishedRev = (document.querySelector("meta[name=rev]") || {}).content || "";
var updateLink = null;
if (publishedRev !== INTERFACE_REV) {
  updateLink = document.createElement("a");
  updateLink.className = "b g";
  updateLink.href = href("update");
  updateLink.dataset.i18n = "updateWallet";
  updateLink.textContent = t("updateWallet");
}
if (!phone) side.append(themeButton());

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

function accountHome(account, hash) {
  var who = String(account || "");
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(who)) return "";
  var url = "https://pwa.passkey.xahau-dev.net/" + who;
  return hash ? url + "#" + hash : url;
}

function isClassic(account) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(String(account || ""));
}

function receiveCode(xah) {
  if (!xah) return acct;
  var query = new URLSearchParams();
  query.set("op", "pay");
  query.set("dest", acct);
  query.set("xah", xah);
  if (loggedIn()) query.set("logged", "1");
  try {
    var back = new URL(location.href);
    back.search = "";
    back.hash = "";
    if (back.protocol === "https:") query.set("return", back.origin + back.pathname.replace(/\/$/, ""));
  } catch (error) {}
  return signerBase() + "?" + query.toString();
}

function signerBase() {
  var base = String(S || "");
  var cut = base.indexOf("?");
  if (cut >= 0) base = base.slice(0, cut);
  if (base && base.slice(-1) !== "/") base += "/";
  return base;
}

function buyLink(object) {
  var id = String(object && object.index || "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(id)) return "";
  var amount = object.Amount;
  var values = { id: id };
  if (typeof amount === "string") {
    if (!/^\d+$/.test(amount)) return "";
    values.xah = xah(amount);
  } else if (amount && typeof amount === "object" && amount.value && amount.currency) {
    values.xah = String(amount.value);
    values.currency = String(amount.currency);
    if (amount.issuer) values.issuer = String(amount.issuer);
  } else return "";
  var payload = { v: 1, a: "", k: "URITokenBuy", f: values };
  try {
    var back = new URL(location.href);
    back.search = "";
    back.hash = "";
    if (back.protocol === "https:") payload.r = back.origin + back.pathname.replace(/\/$/, "");
  } catch (error) {}
  var json = JSON.stringify(payload);
  var bytes = new TextEncoder().encode(json);
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var encoded = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return signerBase() + "?op=qr#p=" + encoded;
}

var qrReady = null;
function whenQr(done) {
  if (typeof globalThis.encodeQr === "function") {
    done();
    return;
  }
  var base = signerBase();
  if (!base) return;
  if (!qrReady) {
    qrReady = import(base + "src/qr.mjs").then(function (mod) {
      globalThis.encodeQr = mod.encodeQr;
    }).catch(function () {});
  }
  qrReady.then(function () {
    if (typeof globalThis.encodeQr === "function") done();
  }).catch(function () {});
}

function qrCanvas(text) {
  if (typeof globalThis.encodeQr !== "function") return null;
  var qr = globalThis.encodeQr(text);
  var quiet = 4;
  var scale = 6;
  var size = (qr.size + quiet * 2) * scale;
  var canvas = document.createElement("canvas");
  canvas.className = "qr";
  canvas.width = String(size);
  canvas.height = String(size);
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#102117";
  for (var row = 0; row < qr.size; row++) {
    for (var col = 0; col < qr.size; col++) {
      if (!qr.modules[row * qr.size + col]) continue;
      ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
    }
  }
  return canvas;
}

function drawQr(text) {
  var box = document.createElement("div");
  box.className = "sale-qr";
  var caption = document.createElement("p");
  caption.className = "m";
  caption.textContent = t("nftOfferScan");
  box.append(caption);
  whenQr(function () {
    var canvas = qrCanvas(text);
    if (canvas) box.insertBefore(canvas, caption);
  });
  return box;
}

function tweetPage(page, message) {
  return "https://x.com/intent/tweet?text=" + encodeURIComponent(message || "") + "&url=" + encodeURIComponent(page || "");
}

var deskButtons = {};
var walletOwner = false;
var transferMode = "send";

function hashBag() {
  var raw = (location.hash || "").replace(/^#/, "");
  var params = new URLSearchParams(raw.indexOf("=") >= 0 ? raw : "");
  if (raw && raw.indexOf("=") < 0) params.set("view", raw);
  return params;
}

function putHash(patch) {
  try {
    var params = hashBag();
    if (patch.shell) params.set("shell", patch.shell);
    if (patch.declined) params.set("declined", patch.declined);
    if (patch.login === "") params.delete("login");
    else if (patch.login) params.set("login", patch.login);
    if (patch.view != null || patch.token != null) {
      params.delete("view");
      params.delete("token");
      var id = String(patch.token || "").toUpperCase();
      if (/^[0-9A-F]{64}$/.test(id)) params.set("token", id);
      else if (patch.view && patch.view !== "home") params.set("view", patch.view);
    }
    var shell = params.get("shell");
    var declined = params.get("declined");
    var login = params.get("login");
    var view = params.get("view") || "";
    var token = (params.get("token") || "").toUpperCase();
    var next = new URLSearchParams();
    if (shell === "phone" || shell === "desk") next.set("shell", shell);
    if (declined) next.set("declined", declined);
    if (login === "1") next.set("login", "1");
    if (/^[0-9A-F]{64}$/.test(token)) next.set("token", token);
    else if (view && view !== "home") next.set("view", view);
    var bare = !next.has("shell") && !next.has("declined") && !next.has("login");
    var body = bare && next.has("token") ? "token=" + token : (bare && next.has("view") ? view : next.toString());
    var raw = (location.hash || "").replace(/^#/, "");
    if (body !== raw) location.hash = body;
  } catch (error) {}
}

function viewFromHash() {
  var raw = (location.hash || "").replace(/^#/, "");
  if (tokenFocus() || raw.indexOf("token=") >= 0) return "nfts";
  if (!raw || raw.indexOf("tx=") === 0 || raw.indexOf("err=") === 0) return "home";
  var named = raw;
  if (raw.indexOf("=") >= 0) {
    try { named = new URLSearchParams(raw).get("view") || ""; } catch (error) { named = ""; }
  }
  if (named === "transfer" || named === "send" || named === "receive") {
    transferMode = named === "receive" ? "receive" : "send";
    return "transfer";
  }
  if (named === "shop") return "nfts";
  if (["home", "nfts", "shop", "activity", "settings"].indexOf(named) >= 0) return named;
  return "home";
}

function showDesk(view) {
  var layout = document.getElementById("layout");
  var name = walletOwner ? (view || "home") : "nfts";
  if (layout) {
    layout.dataset.view = name;
    if (name === "settings") paintLedgerSettings();
    if (name === "transfer") paintTransfer();
    if (nftOverlay && !nftOverlay.hidden && name !== "nfts" && name !== "home" && name !== "activity") closeViewer();
  }
  var keys = Object.keys(deskButtons);
  for (var i = 0; i < keys.length; i++) deskButtons[keys[i]].classList.toggle("on", keys[i] === name);
}

function deskItem(key, url) {
  var node = document.createElement(url ? "a" : "button");
  node.className = "tab";
  node.dataset.i18n = key;
  node.textContent = t(key);
  if (url) node.href = url;
  else {
    node.type = "button";
    node.onclick = function () {
      if (key === "transfer") transferMode = "send";
      putHash({ view: key === "transfer" ? "send" : key });
      showDesk(key);
    };
  }
  deskButtons[key] = node;
  return node;
}

function logoutControl(className) {
  var node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.dataset.i18n = "logout";
  node.textContent = t("logout");
  node.onclick = function () {
    putHash({ login: "" });
    location.reload();
  };
  return node;
}

function signerHome() {
  try {
    var url = new URL(S, location.href);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch (error) {
    return String(S || "").split("#")[0].split("?")[0];
  }
}

function buildDeskNav(owner, passkey) {
  var menu = document.createElement("nav");
  menu.className = "menu";
  var items = [];
  if (owner) {
    items.push(deskItem("home"), deskItem("transfer"), deskItem("nfts"), deskItem("activity"), deskItem("scan", href("scan")), deskItem("settings"), logoutControl("tab"));
  } else {
    items.push(deskItem("nfts"));
    if (passkey) items.push(deskItem("login", href("login")));
    items.push(deskItem("createWallet", signerHome()));
  }
  menu.append.apply(menu, items);
  var theme = side.querySelector("button.theme");
  if (theme) side.insertBefore(menu, theme);
  else side.append(menu);
}

function copyId(id) {
  var wrap = document.createElement("div");
  wrap.className = "nft-id";
  var label = document.createElement("span");
  label.textContent = t("nftTokenId");
  var field = document.createElement("code");
  field.className = "nft-id-field";
  field.textContent = id;
  var button = document.createElement("button");
  button.type = "button";
  button.className = "g";
  button.textContent = t("nftCopy");
  button.onclick = function () {
    var done = function () { button.textContent = t("nftCopied"); };
    var select = function () {
      var range = document.createRange();
      range.selectNodeContents(field);
      var selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(done).catch(select);
    } else select();
  };
  wrap.append(label, field, button);
  return wrap;
}

function shareLink(page, label, message) {
  var link = document.createElement("a");
  link.className = "b g";
  link.href = tweetPage(page, message);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  return link;
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
var nftMode = "all";
var nftIssuer = "";
var nftFilters = null;
var nftIssuers = null;
var nftShop = null;

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

function tokenListed(object) {
  return !!(object && object.Amount != null && object.Amount !== "");
}

function filteredItems() {
  var all = viewerItems();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var item = all[i];
    if (nftIssuer && (item.object.Issuer || "") !== nftIssuer) continue;
    if (nftMode === "offer" && !item.offer) continue;
    if (nftMode === "sale" && (item.offer || !tokenListed(item.object))) continue;
    if (nftMode === "held" && (item.offer || tokenListed(item.object))) continue;
    out.push(item);
  }
  return out;
}

function itemKey(item) {
  if (!item) return "";
  if (item.offer) return "offer:" + item.offer.key;
  return "own:" + String(item.object && item.object.index || "").toUpperCase();
}

function itemIndex(list, item) {
  var key = itemKey(item);
  if (!key) return -1;
  for (var i = 0; i < list.length; i++) if (itemKey(list[i]) === key) return i;
  return -1;
}

function neighborPos(delta) {
  var all = viewerItems();
  var list = filteredItems();
  if (!list.length) return 0;
  var at = itemIndex(list, all[viewerPos]);
  if (at < 0) at = 0;
  var next = list.length < 2 ? list[0] : list[(at + delta + list.length) % list.length];
  var dest = itemIndex(all, next);
  return dest >= 0 ? dest : viewerPos;
}

function ensureViewer() {
  var all = viewerItems();
  var list = filteredItems();
  if (!list.length) return false;
  if (itemIndex(list, all[viewerPos]) >= 0) return true;
  var dest = itemIndex(all, list[0]);
  if (dest >= 0) viewerPos = dest;
  return dest >= 0;
}

function filterChip(label, on, pick, kind) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = on ? "on" : "";
  if (kind) button.setAttribute("data-kind", kind);
  button.textContent = label;
  button.onclick = pick;
  return button;
}

function paintShop() {
  if (!nftShop) return;
  var all = viewerItems();
  var selling = false;
  for (var i = 0; i < all.length; i++) {
    if (!all[i].offer && tokenListed(all[i].object)) selling = true;
  }
  var page = selling ? accountHome(acct, "nfts") : "";
  nftShop.hidden = !page;
  if (!page) return;
  nftShop.href = tweetPage(page, t("nftTweet"));
  nftShop.textContent = t("nftShareShop");
}

function paintFilters() {
  if (!nftFilters || !nftIssuers) return;
  paintShop();
  var all = viewerItems();
  nftFilters.replaceChildren();
  nftIssuers.replaceChildren();
  nftFilters.hidden = !all.length;
  if (!all.length) {
    nftIssuers.hidden = true;
    return;
  }
  nftFilters.append(filterChip(t("nftAll"), nftMode === "all", function () { nftMode = "all"; paintGallery(); }, "all"));
  nftFilters.append(filterChip(t("nftOffers"), nftMode === "offer", function () { nftMode = "offer"; paintGallery(); }, "offer"));
  nftFilters.append(filterChip(t("nftForSale"), nftMode === "sale", function () { nftMode = "sale"; paintGallery(); }, "sale"));
  nftFilters.append(filterChip(t("nftNotForSale"), nftMode === "held", function () { nftMode = "held"; paintGallery(); }, "held"));
  var seen = {};
  var issuers = [];
  for (var i = 0; i < all.length; i++) {
    var id = all[i].object.Issuer || "";
    if (!id || seen[id]) continue;
    seen[id] = 1;
    issuers.push(id);
  }
  nftIssuers.hidden = issuers.length < 2;
  if (issuers.length < 2) return;
  nftIssuers.append(filterChip(t("nftAll"), nftIssuer === "", function () { nftIssuer = ""; paintGallery(); }));
  for (let j = 0; j < issuers.length; j++) {
    let id = issuers[j];
    nftIssuers.append(filterChip(shortAddr(id), nftIssuer === id, function () { nftIssuer = id; paintGallery(); }));
  }
}

function paintGallery() {
  if (!nftList || !nftNote) return;
  var all = viewerItems();
  var items = filteredItems();
  paintFilters();
  nftList.replaceChildren();
  nftNote.textContent = all.length ? (items.length ? "" : t("nftNoMatch")) : t("nftEmpty");
  for (let i = 0; i < items.length; i++) nftList.append(galleryButton(items[i]));
  if (nftOverlay && !nftOverlay.hidden && !ensureViewer()) closeViewer();
}

function galleryButton(item) {
  var face = tokenFace(item.object);
  var listed = !item.offer && tokenListed(item.object);
  var button = document.createElement("button");
  button.type = "button";
  button.className = item.offer ? "nft incoming" : (listed ? "nft listed" : "nft held");
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
  var label = item.offer ? t("nftOffer") : (listed ? t("nftForSale") : t("nftNotForSale"));
  var status = document.createElement("p");
  status.className = "nft-status";
  var state = document.createElement("span");
  state.className = "nft-state";
  state.textContent = label;
  status.append(state);
  if (shown && (item.offer || listed)) {
    var priceBit = document.createElement("span");
    priceBit.className = "nft-pricebit";
    priceBit.textContent = shown;
    status.append(priceBit);
  }
  copy.append(status);
  button.append(artFrame(face), copy);
  button.onclick = function () {
    var at = itemIndex(viewerItems(), item);
    if (at >= 0) openViewer(at);
  };
  return button;
}

function tokenFocus() {
  var raw = (location.hash || "").replace(/^#/, "");
  var id = "";
  if (raw.indexOf("token=") >= 0) {
    try { id = new URLSearchParams(raw).get("token") || ""; } catch (error) { id = ""; }
  }
  id = String(id).toUpperCase();
  return /^[0-9A-F]{64}$/.test(id) ? id : "";
}

function focusToken() {
  var id = tokenFocus();
  if (!id) {
    if (nftOverlay && !nftOverlay.hidden) closeViewer();
    return;
  }
  var all = viewerItems();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].object.index || "").toUpperCase() === id) {
      openViewer(i);
      return;
    }
  }
  if (ownedNodes.length && nftNote) nftNote.textContent = t("nftMissing");
}

function paintTokens(objects) {
  ownedNodes = objects || [];
  if (nftList) paintGallery();
  if (tokenFocus()) focusToken();
}

var nftOverlay = null;
var nftStage = null;
var nftCaption = null;
var nftActions = null;
var nftCount = null;
var nftPrev = null;
var nftNext = null;
var nftPage = null;
var nftSheet = null;
var nftSliding = false;

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
  var axis = "";
  var ignoreClick = false;
  nftOverlay.addEventListener("click", function (event) {
    if (ignoreClick) {
      ignoreClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.target === nftOverlay) dismissViewer();
  }, true);
  nftOverlay.addEventListener("touchstart", function (event) {
    if (!phone || nftSliding || event.touches.length !== 1) return;
    var tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;
    swipeX = event.touches[0].clientX;
    swipeY = event.touches[0].clientY;
    axis = "";
    swiping = true;
  }, { passive: true });
  nftOverlay.addEventListener("touchmove", function (event) {
    if (!swiping || nftSliding) return;
    var touch = event.touches[0];
    if (!touch) return;
    var dx = touch.clientX - swipeX;
    var dy = touch.clientY - swipeY;
    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis !== "x") return;
    event.preventDefault();
    var cap = Math.max((nftSheet && nftSheet.clientWidth) || 1, 1);
    var items = filteredItems();
    placePage(items.length < 2 ? dx * 0.25 : Math.max(-cap, Math.min(cap, dx)), false);
  }, { passive: false });
  nftOverlay.addEventListener("touchend", function (event) {
    if (!swiping) return;
    swiping = false;
    var touch = event.changedTouches[0];
    var dx = touch ? touch.clientX - swipeX : 0;
    var dy = touch ? touch.clientY - swipeY : 0;
    var horizontal = axis === "x";
    axis = "";
    if (!horizontal) return;
    var items = filteredItems();
    if (!touch || items.length < 2 || Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) {
      placePage(0, true);
      return;
    }
    ignoreClick = true;
    stepViewer(dx < 0 ? 1 : -1);
  }, { passive: true });
  nftOverlay.addEventListener("touchcancel", function () {
    if (!swiping) return;
    swiping = false;
    var horizontal = axis === "x";
    axis = "";
    if (horizontal && !nftSliding) placePage(0, true);
  }, { passive: true });
  var dialog = document.createElement("div");
  dialog.className = "nft-dialog";
  var close = document.createElement("button");
  close.type = "button";
  close.className = "nft-close";
  close.dataset.i18n = "nftClose";
  close.textContent = t("nftClose");
  close.onclick = dismissViewer;
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
  var sheet = document.createElement("div");
  sheet.className = "nft-sheet";
  nftSheet = sheet;
  var page = document.createElement("div");
  page.className = "nft-page";
  nftPage = page;
  var detail = document.createElement("div");
  detail.className = "nft-detail";
  detail.append(nftCaption, nftActions);
  page.append(nftStage, detail);
  sheet.append(page);
  dialog.append(close, sheet, pager);
  nftOverlay.append(dialog);
  document.body.append(nftOverlay);
  document.addEventListener("keydown", function (event) {
    if (!nftOverlay || nftOverlay.hidden) return;
    var tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "Escape") dismissViewer();
    else if (event.key === "ArrowRight") stepViewer(1);
    else if (event.key === "ArrowLeft") stepViewer(-1);
  });
}

function closeViewer() {
  if (nftOverlay) nftOverlay.hidden = true;
  nftSliding = false;
  if (nftPage) placePage(0, false);
}

function dismissViewer() {
  closeViewer();
  if (tokenFocus()) putHash({ view: "nfts" });
}

function placePage(x, animate) {
  if (!nftPage) return;
  nftPage.classList.toggle("slide", !!animate);
  nftPage.style.transform = "translate3d(" + x + "px,0,0)";
}

function slideViewer(delta) {
  var dest = neighborPos(delta);
  if (nftSliding || !nftPage) return;
  nftSliding = true;
  var width = Math.max((nftSheet && nftSheet.clientWidth) || 1, 1);
  var target = delta > 0 ? -width : width;
  var settled = false;
  var timer = 0;
  function commit() {
    if (settled) return;
    settled = true;
    nftPage.removeEventListener("transitionend", onEnd);
    clearTimeout(timer);
    var items = filteredItems();
    if (!nftOverlay || nftOverlay.hidden || items.length < 2) {
      nftSliding = false;
      placePage(0, false);
      return;
    }
    placePage(delta > 0 ? width : -width, false);
    viewerPos = dest;
    paintOverlay();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        placePage(0, true);
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          nftPage.removeEventListener("transitionend", onIn);
          nftSliding = false;
        }
        function onIn(event) {
          if (event.target !== nftPage || event.propertyName !== "transform") return;
          finish();
        }
        nftPage.addEventListener("transitionend", onIn);
        setTimeout(finish, 320);
      });
    });
  }
  function onEnd(event) {
    if (event.target !== nftPage || event.propertyName !== "transform") return;
    commit();
  }
  nftPage.addEventListener("transitionend", onEnd);
  timer = setTimeout(commit, 320);
  placePage(target, true);
}

function stepViewer(delta) {
  var list = filteredItems();
  if (list.length < 2 || !delta) return;
  var dest = neighborPos(delta);
  if (!phone || !nftPage || nftSliding || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (nftSliding) return;
    placePage(0, false);
    viewerPos = dest;
    paintOverlay();
    return;
  }
  slideViewer(delta);
}

function offerAmount(value) {
  var typed = String(value || "").trim();
  if (!typed) return "";
  if (/^0+([.,]0+)?$/.test(typed)) return "0";
  return canonicalAmount(typed);
}

function offerBox(id) {
  var box = document.createElement("div");
  box.className = "nft-sell";
  var price = document.createElement("input");
  price.type = "text";
  price.placeholder = t("nftPrice");
  price.inputMode = "decimal";
  price.autocomplete = "off";
  var buyer = document.createElement("input");
  buyer.type = "text";
  buyer.placeholder = t("nftBuyer");
  buyer.autocomplete = "off";
  buyer.spellcheck = false;
  var go = document.createElement("a");
  go.className = "b";
  go.dataset.i18n = "nftMakeOffer";
  go.textContent = t("nftMakeOffer");
  function paintHref() {
    var extra = { act: "sell", id: id };
    var amount = offerAmount(price.value);
    if (amount) extra.xah = amount;
    var who = String(buyer.value || "").trim();
    if (who) extra.destination = who;
    go.href = href("nfts", extra);
  }
  price.oninput = paintHref;
  buyer.oninput = paintHref;
  go.onclick = function (event) {
    var typed = String(price.value || "").trim();
    if (typed && !offerAmount(typed)) {
      event.preventDefault();
      showNote(t("amountInvalid"));
    }
  };
  paintHref();
  box.append(price, buyer, go);
  return box;
}

function buyerActions(object) {
  var offer = buyLink(object);
  if (!offer) return null;
  var box = document.createElement("div");
  box.className = "sale-actions";
  box.append(drawQr(offer));
  var buy = document.createElement("a");
  buy.className = "b sale-buy";
  buy.href = offer;
  buy.textContent = t("nftPurchase");
  box.append(buy);
  return box;
}

function openViewer(index) {
  var items = viewerItems();
  if (!items.length) return;
  ensureOverlay();
  viewerPos = (index + items.length) % items.length;
  paintOverlay();
  nftOverlay.hidden = false;
  if (phone) show("nfts");
  var tokenId = String(items[viewerPos].object.index || "").toUpperCase();
  if (/^[0-9A-F]{64}$/.test(tokenId) && tokenFocus() !== tokenId) putHash({ token: tokenId });
}

function paintOverlay() {
  var items = viewerItems();
  var item = items[viewerPos];
  if (!item) {
    closeViewer();
    return;
  }
  var face = tokenFace(item.object);
  var listed = !item.offer && tokenListed(item.object);
  nftStage.className = "nft-stage " + (item.offer ? "incoming" : (listed ? "listed" : "held"));
  nftStage.replaceChildren(artFrame(face));
  nftCaption.replaceChildren();
  var pill = document.createElement("span");
  pill.className = item.offer ? "nft-pill offer" : (listed ? "nft-pill sale" : "nft-pill held");
  pill.textContent = item.offer ? t("nftOffer") : (listed ? t("nftForSale") : t("nftNotForSale"));
  nftCaption.append(pill);
  var name = document.createElement("strong");
  name.textContent = face.title;
  nftCaption.append(name);
  if (face.card) {
    var edition = document.createElement("p");
    edition.textContent = t("nftEdition") + " " + face.card.edition;
    nftCaption.append(edition);
  }
  var shown = saleText(item.object.Amount);
  if (shown && (item.offer || listed)) {
    var price = document.createElement("p");
    price.className = "nft-price";
    price.textContent = shown;
    nftCaption.append(price);
  }
  var tokenId = String(item.object.index || "").toUpperCase();
  if (tokenId) nftCaption.append(copyId(tokenId));
  nftActions.replaceChildren();
  var id = String(item.object.index || "");
  if (walletOwner && item.offer) {
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
      if (!nftOverlay || nftOverlay.hidden) return;
      if (!ensureViewer()) closeViewer();
      else paintOverlay();
    };
    nftActions.append(decline);
  } else if (walletOwner) {
    if (item.object.Amount) nftActions.append(nftLink("nftCancelSale", { act: "cancel", id: id }, true));
    nftActions.append(nftLink("nftBurn", { act: "burn", id: id }, true));
  } else if (listed) {
    var buying = buyerActions(item.object);
    if (buying) nftActions.append(buying);
  }
  var owner = item.object.Owner || acct;
  var shared = accountHome(owner, tokenId ? "token=" + tokenId : "nfts");
  if (shared) {
    var blurb = item.offer || listed ? face.title + " · " + t("nftTweet") : face.title;
    nftActions.append(shareLink(shared, t("nftShare"), blurb));
  }
  if (walletOwner && !item.offer) nftActions.append(offerBox(id));
  var list = filteredItems();
  var placeInList = itemIndex(list, item);
  if (placeInList < 0) placeInList = 0;
  nftCount.textContent = fill("nftCount", { n: placeInList + 1, m: Math.max(list.length, 1) });
  nftPrev.disabled = list.length < 2;
  nftNext.disabled = list.length < 2;
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
  var params = hashBag();
  var current = (params.get("declined") || "").split(",").filter(function (part) {
    return /^[A-F0-9]{64}:r[1-9A-HJ-NP-Za-km-z]{24,34}:\d+$/.test(part);
  });
  if (current.indexOf(key) < 0) current.push(key);
  if (current.length > 8) current = current.slice(current.length - 8);
  putHash({ declined: current.join(",") });
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
        nftMode = "all";
        nftIssuer = "";
        paintGallery();
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

function startOwnerFeeds() {
  rpc("account_info", { account: acct, ledger_index: "validated" }).then(function (info) {
    paintBalance(info.account_data.Balance);
  }).catch(function (error) { showNote(error.message); });

  rpc("account_lines", { account: acct, ledger_index: "validated" }).then(function (page) {
    paintLines(page.lines || []);
  }).catch(function () {});

  watchLedgers();
}

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
    const on = which === "transfer" ? id === "transfer" || id === "send" || id === "receive" : id === which;
    panels[i].classList.toggle("on", on);
  }
  const tabs = document.querySelectorAll("nav.tabs button, nav.tabs a");
  for (let i = 0; i < tabs.length; i++) tabs[i].classList.toggle("on", tabs[i].dataset.panel === which);
  if (which === "transfer") paintTransfer();
  if (nftOverlay && !nftOverlay.hidden && which !== "nfts" && which !== "activity") closeViewer();
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

function paintTransfer() {
  var node = document.getElementById("transfer");
  if (!node) return;
  var mode = transferMode === "receive" ? "receive" : "send";
  if (node.dataset.mode === mode) return;
  node.dataset.mode = mode;
  node.replaceChildren();
  node.append(labeled("transfer"));
  var seg = document.createElement("div");
  seg.className = "seg";
  function segButton(next, key) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = mode === next ? "on" : "";
    button.dataset.i18n = key;
    button.textContent = t(key);
    button.onclick = function () {
      if (transferMode === next) return;
      transferMode = next;
      node.dataset.mode = "";
      putHash({ view: next === "receive" ? "receive" : "send" });
      paintTransfer();
    };
    seg.append(button);
  }
  segButton("send", "send");
  segButton("receive", "receive");
  var main = document.createElement("div");
  main.className = "pay-main";
  var side = document.createElement("div");
  side.className = "pay-side";
  var split = document.createElement("div");
  split.className = "pay-split";
  split.append(main, side);
  var warn = document.createElement("p");
  warn.className = "warn";
  warn.hidden = true;
  function showWarn(key) {
    warn.hidden = false;
    warn.textContent = t(key);
  }
  if (mode === "send") {
    var destination = document.createElement("input");
    destination.type = "text";
    destination.autocomplete = "off";
    destination.spellcheck = false;
    destination.setAttribute("data-placeholder", "destPlaceholder");
    destination.placeholder = t("destPlaceholder");
    var amount = document.createElement("input");
    amount.type = "text";
    amount.inputMode = "decimal";
    amount.autocomplete = "off";
    amount.setAttribute("data-placeholder", "amountPlaceholder");
    amount.placeholder = t("amountPlaceholder");
    var avail = document.createElement("p");
    avail.className = "m";
    avail.id = "available";
    avail.textContent = lastDrops != null ? fill("available", { amount: formatDrops(lastDrops) }) : "";
    var typedPay = function () {
      var dest = destination.value.trim();
      var typed = canonicalAmount(amount.value);
      if (!isClassic(dest)) {
        showWarn("destInvalid");
        return "";
      }
      if (!typed) {
        showWarn("amountInvalid");
        return "";
      }
      warn.hidden = true;
      warn.textContent = "";
      return href("pay", { dest: dest, xah: typed });
    };
    if (phone) {
      var review = document.createElement("a");
      review.className = "b";
      review.href = "#transfer";
      review.dataset.i18n = "review";
      review.textContent = t("review");
      review.onclick = function (event) {
        var next = typedPay();
        if (!next) {
          event.preventDefault();
          return;
        }
        review.href = next;
      };
      side.append(review);
    } else {
      var go = document.createElement("button");
      go.type = "button";
      go.dataset.i18n = "showQr";
      go.textContent = t("showQr");
      var qrBox = document.createElement("div");
      qrBox.className = "qrbox";
      var hint = document.createElement("p");
      hint.className = "m";
      hint.dataset.i18n = "payQr";
      hint.textContent = t("payQr");
      hint.hidden = true;
      go.onclick = function () {
        var next = typedPay();
        if (!next) return;
        hint.hidden = false;
        whenQr(function () {
          var canvas = qrCanvas(next);
          if (canvas) qrBox.replaceChildren(canvas);
        });
      };
      side.append(go, hint, qrBox);
    }
    var other = document.createElement("a");
    other.className = "b g";
    other.href = href("sign");
    other.dataset.i18n = "otherTx";
    other.textContent = t("otherTx");
    var more = document.createElement("div");
    more.className = "pay-other";
    more.append(other);
    main.append(destination, amount, avail, warn);
    split.append(more);
  } else {
    var box = document.createElement("div");
    box.className = "qrbox";
    var hint = document.createElement("p");
    hint.className = "m";
    hint.dataset.i18n = "receiveHint";
    hint.textContent = t("receiveHint");
    var request = document.createElement("input");
    request.type = "text";
    request.inputMode = "decimal";
    request.autocomplete = "off";
    request.setAttribute("data-placeholder", "requestAmount");
    request.placeholder = t("requestAmount");
    var paintCode = function () {
      var typed = canonicalAmount(request.value);
      if (request.value.trim() && !typed) {
        showWarn("amountInvalid");
        return;
      }
      warn.hidden = true;
      warn.textContent = "";
      var code = receiveCode(typed);
      whenQr(function () {
        var canvas = qrCanvas(code);
        if (canvas) box.replaceChildren(canvas);
      });
    };
    request.addEventListener("input", paintCode);
    paintCode();
    side.append(box);
    main.append(hint, addressLine(acct), request, warn);
  }
  node.append(seg, split);
}

function addressLine(value) {
  var row = document.createElement("div");
  row.className = "addr";
  var code = document.createElement("span");
  code.className = "mono";
  code.textContent = value;
  var copy = document.createElement("button");
  copy.type = "button";
  copy.className = "g";
  copy.dataset.i18n = "nftCopy";
  copy.textContent = t("nftCopy");
  copy.onclick = function () {
    var done = function () { copy.textContent = t("nftCopied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () {});
    }
  };
  row.append(code, copy);
  return row;
}

rpc("account_namespace", { account: acct, namespace_id: NAMESPACE, ledger_index: "validated" }).then(function (ns) {
  const entries = ns.namespace_entries || ns.namespaceEntries || [];
  const passkey = entries.some(function (entry) {
    const key = (entry.HookStateKey || "").toUpperCase();
    return (key === "5058".padStart(64, "0") || key.slice(0, 4) === "5058") && (entry.HookStateData || "").length == 64;
  });
  const slot = $("d");
  walletOwner = loggedIn() && passkey;
  function heading(key) {
    const h = document.createElement("h2");
    h.dataset.i18n = key;
    h.textContent = t(key);
    return h;
  }
  var settingsPanel = null;
  var nftPanel = null;
  if (walletOwner) {
    balanceLine.hidden = false;
    linesBox.hidden = false;
    $("g").hidden = false;
    if (intro) intro.hidden = false;
    $("g").textContent = "Passkey on. The iPhone approves each send.";
    if (updateLink) {
      var themeNode = side.querySelector("button.theme");
      if (themeNode) side.insertBefore(updateLink, themeNode);
      else side.append(updateLink);
    }
    if (phone) headActions.append(logoutControl("theme"));
    activityPanel = panel("activity");
    var transferPanel = panel("transfer");
    settingsPanel = panel("settings");

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

  startOwnerFeeds();
  }
  nftPanel = panel("nfts");
  nftNote = document.createElement("p");
  nftNote.className = "m";
  nftNote.textContent = t("loading");
  nftList = document.createElement("div");
  nftList.className = "nft-grid";
  nftFilters = document.createElement("div");
  nftFilters.className = "nft-filters";
  nftIssuers = document.createElement("div");
  nftIssuers.className = "nft-filters issuers";
  var filterBar = document.createElement("div");
  filterBar.className = "nft-filterbar";
  nftShop = document.createElement("a");
  nftShop.className = "nft-shoplink";
  nftShop.target = "_blank";
  nftShop.rel = "noopener";
  nftShop.hidden = true;
  filterBar.append(nftFilters, nftIssuers, nftShop);
  nftPanel.append(heading("nfts"), filterBar, nftNote, nftList);
  rpc("account_objects", { account: acct, type: "uri_token", ledger_index: "validated" }).then(function (page) {
    paintTokens(page.account_objects || []);
  }).catch(function () {
    if (nftNote) nftNote.textContent = t("nftUnavailable");
  });

  const layout = document.createElement("div");
  layout.id = "layout";
  if (walletOwner) layout.append(activityPanel, transferPanel);
  layout.append(nftPanel);
  if (walletOwner) layout.append(settingsPanel);
  if (phone) {
    const tabs = document.createElement("nav");
    tabs.className = "tabs";
    function addTab(key, id, url, blank) {
      const button = document.createElement(url ? "a" : "button");
      if (url) {
        button.href = url;
        if (blank) {
          button.target = "_blank";
          button.rel = "noopener";
        }
      } else button.type = "button";
      button.dataset.panel = id;
      button.dataset.i18n = key;
      button.textContent = t(key);
      button.title = t(key);
      if (!url) button.onclick = function () {
        if (id === "transfer") transferMode = "send";
        putHash({ view: id === "transfer" ? "send" : id });
        show(id);
        if (id === "settings") paintLedgerSettings();
      };
      tabs.append(button);
    }
    if (walletOwner) {
      addTab("transfer", "transfer");
      addTab("scan", "scan", href("scan"));
      addTab("nfts", "nfts");
      addTab("activity", "activity");
      addTab("settings", "settings");
    } else {
      addTab("nfts", "nfts");
      if (passkey) {
        const loginLink = document.createElement("a");
        loginLink.href = href("login");
        loginLink.dataset.panel = "login";
        loginLink.dataset.i18n = "login";
        loginLink.textContent = t("login");
        loginLink.title = t("login");
        tabs.append(loginLink);
      }
      addTab("createWallet", "create", signerHome());
    }
    slot.append(tabs, layout);
    if (!walletOwner) show("nfts");
    else {
      var section = viewFromHash();
      if (section === "settings") {
        show("settings");
        paintLedgerSettings();
      } else if (section === "nfts") show("nfts");
      else if (section === "activity") show("activity");
      else if (section === "transfer") show("transfer");
      else show("activity");
    }
  } else {
    slot.append(layout);
    buildDeskNav(walletOwner, passkey);
    showDesk(viewFromHash());
  }
  window.addEventListener("hashchange", function () {
    var view = walletOwner ? viewFromHash() : "nfts";
    if (!phone) {
      showDesk(view);
      focusToken();
      return;
    }
    if (view === "settings") {
      show("settings");
      paintLedgerSettings();
    } else if (view === "nfts" || view === "activity" || view === "transfer") show(view);
    else show(walletOwner ? "activity" : "nfts");
    focusToken();
  });
}).catch(function () {});
