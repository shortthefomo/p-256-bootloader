// Language and the way XAH amounts are shown. The default matches the
// previous plain "1234.5" text, and a QR still carries that plain form.

import { dropsToXah } from "./protocol.mjs";

export const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "es", name: "Español" },
  { id: "fr", name: "Français" },
  { id: "de", name: "Deutsch" },
  { id: "pt", name: "Português" },
  { id: "zh", name: "中文" },
  { id: "ja", name: "日本語" },
  { id: "ko", name: "한국어" },
];

export const AMOUNT_FORMATS = [
  { id: "plain", group: "", decimal: ".", example: "1234.5" },
  { id: "comma-dot", group: ",", decimal: ".", example: "1,234.5" },
  { id: "dot-comma", group: ".", decimal: ",", example: "1.234,5" },
  { id: "space-dot", group: " ", decimal: ".", example: "1 234.5" },
];

const en = {
  home: "Home",
  send: "Send",
  scan: "Scan",
  receive: "Receive",
  activity: "Activity",
  settings: "Settings",
  version: "Version",
  general: "General",
  language: "Language",
  currencyFormat: "Currency format",
  formatHint: "Balances and amounts you type use this format. A QR code stores a plain amount.",
  firewall: "Passkey firewall",
  walletInterface: "Wallet interface",
  installed: "Installed",
  shipped: "This wallet",
  revision: "Revision",
  current: "Current",
  updateAvailable: "Update available",
  notInstalled: "Not installed",
  notPublished: "Not published",
  updateFirewall: "Update firewall",
  removeFirewall: "Remove the current firewall",
  installFirewall: "Install the firewall",
  firewallTwoStep: "The new firewall is too large for one signature. This step removes the current firewall. Approve again on the next screen to install the new one.",
  firewallRemoved: "The firewall is off until it is installed again.",
  backToSettings: "Back to settings",
  updateWallet: "Install update",
  checkingFee: "Checking the fee…",
  executionFee: "Execution fee",
  hookMatches: "This account runs the firewall shipped with this wallet.",
  hookDiffers: "This account runs a different firewall than the one shipped with this wallet.",
  hookMissing: "No firewall is installed on this account.",
  hookUnreadable: "The network did not return the firewall version.",
  interfaceMatches: "The published wallet page matches this signer.",
  interfaceDiffers: "A new wallet page is ready for this account.",
  interfaceMissing: "This account has no wallet page yet.",
  light: "Light",
  dark: "Dark",
  layout: "Layout",
  mobile: "Mobile",
  desktop: "Desktop",
  loading: "Loading…",
  wallet: "Wallet",
  loadingAccount: "Loading the account…",
  available: "Available {amount} XAH",
  destPlaceholder: "Destination r…",
  amountPlaceholder: "Amount",
  review: "Review",
  showQr: "Show QR for iPhone",
  otherTx: "Trust lines, escrow, and other types",
  requestAmount: "Request amount, optional",
  receiveHint: "Leave the amount empty and the code is your address.",
  scanHint: "Hold the code in the frame. Tap the picture if it stays blurry.",
  pastePlaceholder: "Or paste a link or address",
  open: "Open",
  emptyActivity: "No transactions yet.",
  type: "Type",
  detail: "Detail",
  hash: "Hash",
  drops: "drops",
  amountInvalid: "Enter an amount with at most 6 decimals.",
};

const CATALOG = {
  en,
  es: {
    home: "Inicio", send: "Enviar", scan: "Escanear", receive: "Recibir", activity: "Actividad", settings: "Ajustes",
    version: "Versión", general: "General", language: "Idioma", currencyFormat: "Formato de cantidad",
    formatHint: "Los saldos y las cantidades que escribes usan este formato. Un código QR guarda una cantidad simple.",
    firewall: "Cortafuegos passkey", walletInterface: "Interfaz del monedero", installed: "Instalado", shipped: "Este monedero",
    revision: "Revisión", current: "Al día", updateAvailable: "Hay una actualización", notInstalled: "No instalado", notPublished: "Sin publicar",
    updateFirewall: "Actualizar el cortafuegos", removeFirewall: "Quitar el cortafuegos actual", installFirewall: "Instalar el cortafuegos", firewallTwoStep: "El cortafuegos nuevo no cabe en una firma. Este paso quita el actual. Aprueba otra vez en la siguiente pantalla para instalar el nuevo.", firewallRemoved: "El cortafuegos está apagado hasta que se vuelva a instalar.", backToSettings: "Volver a ajustes", updateWallet: "Instalar actualización", checkingFee: "Consultando la comisión…", executionFee: "Comisión de ejecución",
    hookMatches: "Esta cuenta usa el cortafuegos que trae este monedero.",
    hookDiffers: "Esta cuenta usa un cortafuegos distinto del que trae este monedero.",
    hookMissing: "Esta cuenta no tiene el cortafuegos instalado.",
    hookUnreadable: "La red no devolvió la versión del cortafuegos.",
    interfaceMatches: "La página publicada coincide con este firmante.",
    interfaceDiffers: "Hay una página nueva lista para esta cuenta.",
    interfaceMissing: "Esta cuenta todavía no tiene página.",
    light: "Claro", dark: "Oscuro", layout: "Diseño", mobile: "Móvil", desktop: "Escritorio",
    loading: "Cargando…", wallet: "Monedero", loadingAccount: "Cargando la cuenta…", available: "Disponible {amount} XAH",
    destPlaceholder: "Destino r…", amountPlaceholder: "Cantidad", review: "Revisar", showQr: "Mostrar QR para el iPhone",
    otherTx: "Líneas de confianza, depósito y otros tipos", requestAmount: "Cantidad a solicitar, opcional",
    receiveHint: "Deja la cantidad vacía y el código es tu dirección.",
    scanHint: "Encaja el código en el marco. Toca la imagen si se ve borrosa.",
    pastePlaceholder: "O pega un enlace o una dirección", open: "Abrir", emptyActivity: "Todavía no hay transacciones.",
    type: "Tipo", detail: "Detalle", hash: "Hash", drops: "drops", amountInvalid: "Escribe una cantidad con 6 decimales como máximo.",
  },
  fr: {
    home: "Accueil", send: "Envoyer", scan: "Scanner", receive: "Recevoir", activity: "Activité", settings: "Réglages",
    version: "Version", general: "Général", language: "Langue", currencyFormat: "Format du montant",
    formatHint: "Les soldes et les montants saisis utilisent ce format. Un QR code garde un montant simple.",
    firewall: "Pare-feu passkey", walletInterface: "Interface du portefeuille", installed: "Installé", shipped: "Ce portefeuille",
    revision: "Révision", current: "À jour", updateAvailable: "Mise à jour disponible", notInstalled: "Non installé", notPublished: "Non publié",
    updateFirewall: "Mettre à jour le pare-feu", removeFirewall: "Retirer le pare-feu actuel", installFirewall: "Installer le pare-feu", firewallTwoStep: "Le nouveau pare-feu ne tient pas dans une signature. Cette étape retire l’actuel. Approuvez encore à l’écran suivant pour installer le nouveau.", firewallRemoved: "Le pare-feu est arrêté tant qu’il n’est pas réinstallé.", backToSettings: "Retour aux réglages", updateWallet: "Installer la mise à jour", checkingFee: "Calcul des frais…", executionFee: "Frais d’exécution",
    hookMatches: "Ce compte utilise le pare-feu livré avec ce portefeuille.",
    hookDiffers: "Ce compte utilise un pare-feu différent de celui livré avec ce portefeuille.",
    hookMissing: "Aucun pare-feu n’est installé sur ce compte.",
    hookUnreadable: "Le réseau n’a pas renvoyé la version du pare-feu.",
    interfaceMatches: "La page publiée correspond à ce signataire.",
    interfaceDiffers: "Une nouvelle page est prête pour ce compte.",
    interfaceMissing: "Ce compte n’a pas encore de page.",
    light: "Clair", dark: "Sombre", layout: "Disposition", mobile: "Mobile", desktop: "Ordinateur",
    loading: "Chargement…", wallet: "Portefeuille", loadingAccount: "Chargement du compte…", available: "Disponible {amount} XAH",
    destPlaceholder: "Destination r…", amountPlaceholder: "Montant", review: "Vérifier", showQr: "Montrer le QR pour l’iPhone",
    otherTx: "Lignes de confiance, séquestre et autres types", requestAmount: "Montant demandé, facultatif",
    receiveHint: "Laissez le montant vide et le code est votre adresse.",
    scanHint: "Placez le code dans le cadre. Touchez l’image s’il reste flou.",
    pastePlaceholder: "Ou collez un lien ou une adresse", open: "Ouvrir", emptyActivity: "Aucune transaction pour le moment.",
    type: "Type", detail: "Détail", hash: "Hash", drops: "drops", amountInvalid: "Saisissez un montant avec au plus 6 décimales.",
  },
  de: {
    home: "Start", send: "Senden", scan: "Scannen", receive: "Empfangen", activity: "Aktivität", settings: "Einstellungen",
    version: "Version", general: "Allgemein", language: "Sprache", currencyFormat: "Zahlenformat",
    formatHint: "Guthaben und eingegebene Beträge nutzen dieses Format. Ein QR-Code speichert einen einfachen Betrag.",
    firewall: "Passkey-Firewall", walletInterface: "Wallet-Oberfläche", installed: "Installiert", shipped: "Diese Wallet",
    revision: "Revision", current: "Aktuell", updateAvailable: "Update verfügbar", notInstalled: "Nicht installiert", notPublished: "Nicht veröffentlicht",
    updateFirewall: "Firewall aktualisieren", removeFirewall: "Aktuelle Firewall entfernen", installFirewall: "Firewall installieren", firewallTwoStep: "Die neue Firewall passt nicht in eine Signatur. Dieser Schritt entfernt die aktuelle. Bestätige auf dem nächsten Bildschirm noch einmal, um die neue zu installieren.", firewallRemoved: "Die Firewall ist aus, bis sie wieder installiert ist.", backToSettings: "Zurück zu den Einstellungen", updateWallet: "Update installieren", checkingFee: "Gebühr wird ermittelt…", executionFee: "Ausführungsgebühr",
    hookMatches: "Dieses Konto nutzt die Firewall aus dieser Wallet.",
    hookDiffers: "Dieses Konto nutzt eine andere Firewall als die aus dieser Wallet.",
    hookMissing: "Auf diesem Konto ist keine Firewall installiert.",
    hookUnreadable: "Das Netzwerk hat die Firewall-Version nicht geliefert.",
    interfaceMatches: "Die veröffentlichte Seite entspricht diesem Signer.",
    interfaceDiffers: "Eine neue Seite ist für dieses Konto bereit.",
    interfaceMissing: "Dieses Konto hat noch keine Seite.",
    light: "Hell", dark: "Dunkel", layout: "Layout", mobile: "Mobil", desktop: "Desktop",
    loading: "Wird geladen…", wallet: "Wallet", loadingAccount: "Konto wird geladen…", available: "Verfügbar {amount} XAH",
    destPlaceholder: "Ziel r…", amountPlaceholder: "Betrag", review: "Prüfen", showQr: "QR für das iPhone zeigen",
    otherTx: "Vertrauenslinien, Treuhand und andere Typen", requestAmount: "Betrag anfordern, optional",
    receiveHint: "Ohne Betrag ist der Code deine Adresse.",
    scanHint: "Halte den Code ins Feld. Tippe auf das Bild, wenn es unscharf bleibt.",
    pastePlaceholder: "Oder Link oder Adresse einfügen", open: "Öffnen", emptyActivity: "Noch keine Transaktionen.",
    type: "Typ", detail: "Detail", hash: "Hash", drops: "drops", amountInvalid: "Gib einen Betrag mit höchstens 6 Nachkommastellen ein.",
  },
  pt: {
    home: "Início", send: "Enviar", scan: "Ler", receive: "Receber", activity: "Atividade", settings: "Ajustes",
    version: "Versão", general: "Geral", language: "Idioma", currencyFormat: "Formato do valor",
    formatHint: "Saldos e valores digitados usam este formato. Um QR guarda um valor simples.",
    firewall: "Firewall passkey", walletInterface: "Interface da carteira", installed: "Instalado", shipped: "Esta carteira",
    revision: "Revisão", current: "Em dia", updateAvailable: "Atualização disponível", notInstalled: "Não instalado", notPublished: "Não publicada",
    updateFirewall: "Atualizar o firewall", removeFirewall: "Remover o firewall atual", installFirewall: "Instalar o firewall", firewallTwoStep: "O firewall novo não cabe numa assinatura. Este passo remove o atual. Aprove de novo no ecrã seguinte para instalar o novo.", firewallRemoved: "O firewall fica desligado até ser instalado de novo.", backToSettings: "Voltar aos ajustes", updateWallet: "Instalar atualização", checkingFee: "Consultando a taxa…", executionFee: "Taxa de execução",
    hookMatches: "Esta conta usa o firewall que vem com esta carteira.",
    hookDiffers: "Esta conta usa um firewall diferente do que vem com esta carteira.",
    hookMissing: "Não há firewall instalado nesta conta.",
    hookUnreadable: "A rede não devolveu a versão do firewall.",
    interfaceMatches: "A página publicada corresponde a este assinante.",
    interfaceDiffers: "Uma página nova está pronta para esta conta.",
    interfaceMissing: "Esta conta ainda não tem página.",
    light: "Claro", dark: "Escuro", layout: "Layout", mobile: "Celular", desktop: "Computador",
    loading: "Carregando…", wallet: "Carteira", loadingAccount: "Carregando a conta…", available: "Disponível {amount} XAH",
    destPlaceholder: "Destino r…", amountPlaceholder: "Valor", review: "Rever", showQr: "Mostrar QR para o iPhone",
    otherTx: "Linhas de confiança, custódia e outros tipos", requestAmount: "Valor a pedir, opcional",
    receiveHint: "Deixe o valor vazio e o código é o seu endereço.",
    scanHint: "Encaixe o código na moldura. Toque na imagem se ficar desfocada.",
    pastePlaceholder: "Ou cole um link ou um endereço", open: "Abrir", emptyActivity: "Ainda não há transações.",
    type: "Tipo", detail: "Detalhe", hash: "Hash", drops: "drops", amountInvalid: "Digite um valor com no máximo 6 casas decimais.",
  },
  zh: {
    home: "首页", send: "发送", scan: "扫描", receive: "收款", activity: "活动", settings: "设置",
    version: "版本", general: "通用", language: "语言", currencyFormat: "金额格式",
    formatHint: "余额和输入的金额使用此格式。二维码保存的是普通金额。",
    firewall: "Passkey 防火墙", walletInterface: "钱包界面", installed: "已安装", shipped: "此钱包",
    revision: "修订", current: "已是最新", updateAvailable: "有可用更新", notInstalled: "未安装", notPublished: "未发布",
    updateFirewall: "更新防火墙", removeFirewall: "移除当前防火墙", installFirewall: "安装防火墙", firewallTwoStep: "新的防火墙太大，无法一次签名。此步骤会移除当前防火墙。请在下一屏再次确认，以安装新的防火墙。", firewallRemoved: "在重新安装之前，防火墙是关闭的。", backToSettings: "返回设置", updateWallet: "安装更新", checkingFee: "正在查询手续费…", executionFee: "执行费用",
    hookMatches: "此账户运行的是本钱包附带的防火墙。",
    hookDiffers: "此账户运行的防火墙与本钱包附带的不同。",
    hookMissing: "此账户尚未安装防火墙。",
    hookUnreadable: "网络没有返回防火墙版本。",
    interfaceMatches: "已发布的页面与此签名端一致。",
    interfaceDiffers: "此账户有新的钱包页面可以安装。",
    interfaceMissing: "此账户还没有钱包页面。",
    light: "浅色", dark: "深色", layout: "布局", mobile: "手机", desktop: "电脑",
    loading: "正在加载…", wallet: "钱包", loadingAccount: "正在加载账户…", available: "可用 {amount} XAH",
    destPlaceholder: "收款地址 r…", amountPlaceholder: "金额", review: "核对", showQr: "显示 iPhone 二维码",
    otherTx: "信任线、托管和其他类型", requestAmount: "请求金额，可选",
    receiveHint: "金额留空时，二维码就是你的地址。",
    scanHint: "把码放进框里。如果模糊，点一下画面。",
    pastePlaceholder: "或粘贴链接或地址", open: "打开", emptyActivity: "还没有交易。",
    type: "类型", detail: "详情", hash: "哈希", drops: "drops", amountInvalid: "请输入最多 6 位小数的金额。",
  },
  ja: {
    home: "ホーム", send: "送金", scan: "スキャン", receive: "受取", activity: "履歴", settings: "設定",
    version: "バージョン", general: "一般", language: "言語", currencyFormat: "金額の形式",
    formatHint: "残高と入力する金額はこの形式です。QRコードには単純な金額が入ります。",
    firewall: "パスキーファイアウォール", walletInterface: "ウォレット画面", installed: "導入済み", shipped: "このウォレット",
    revision: "リビジョン", current: "最新", updateAvailable: "更新があります", notInstalled: "未導入", notPublished: "未公開",
    updateFirewall: "ファイアウォールを更新", removeFirewall: "現在のファイアウォールを外す", installFirewall: "ファイアウォールを導入", firewallTwoStep: "新しいファイアウォールは一度の署名には大きすぎます。この手順で現在のものを外します。次の画面でもう一度承認すると、新しいものが導入されます。", firewallRemoved: "再導入するまでファイアウォールは外れています。", backToSettings: "設定に戻る", updateWallet: "更新をインストール", checkingFee: "手数料を確認しています…", executionFee: "実行手数料",
    hookMatches: "このアカウントは、このウォレットに同梱されたファイアウォールです。",
    hookDiffers: "このアカウントのファイアウォールは、このウォレットに同梱されたものと違います。",
    hookMissing: "このアカウントにはファイアウォールがありません。",
    hookUnreadable: "ネットワークがファイアウォールのバージョンを返しませんでした。",
    interfaceMatches: "公開中のページは、この署名画面と一致しています。",
    interfaceDiffers: "このアカウントに新しいページを入れられます。",
    interfaceMissing: "このアカウントにはまだページがありません。",
    light: "ライト", dark: "ダーク", layout: "レイアウト", mobile: "モバイル", desktop: "デスクトップ",
    loading: "読み込み中…", wallet: "ウォレット", loadingAccount: "アカウントを読み込んでいます…", available: "利用可能 {amount} XAH",
    destPlaceholder: "宛先 r…", amountPlaceholder: "金額", review: "確認", showQr: "iPhone用QRを表示",
    otherTx: "トラストライン、エスクロー、その他", requestAmount: "請求額、任意",
    receiveHint: "金額を空にすると、コードはあなたのアドレスです。",
    scanHint: "コードを枠に合わせてください。ぼやけるときは画面をタップします。",
    pastePlaceholder: "またはリンクかアドレスを貼り付け", open: "開く", emptyActivity: "取引はまだありません。",
    type: "種類", detail: "内容", hash: "ハッシュ", drops: "drops", amountInvalid: "小数は6桁までの金額を入力してください。",
  },
  ko: {
    home: "홈", send: "보내기", scan: "스캔", receive: "받기", activity: "활동", settings: "설정",
    version: "버전", general: "일반", language: "언어", currencyFormat: "금액 형식",
    formatHint: "잔액과 입력하는 금액이 이 형식을 사용합니다. QR 코드에는 일반 금액이 저장됩니다.",
    firewall: "패스키 방화벽", walletInterface: "지갑 화면", installed: "설치됨", shipped: "이 지갑",
    revision: "개정", current: "최신", updateAvailable: "업데이트 있음", notInstalled: "설치되지 않음", notPublished: "게시되지 않음",
    updateFirewall: "방화벽 업데이트", removeFirewall: "현재 방화벽 제거", installFirewall: "방화벽 설치", firewallTwoStep: "새 방화벽은 한 번의 서명에 넣기에는 너무 큽니다. 이 단계에서 현재 방화벽을 제거합니다. 다음 화면에서 다시 승인하면 새 방화벽이 설치됩니다.", firewallRemoved: "다시 설치하기 전까지 방화벽은 꺼져 있습니다.", backToSettings: "설정으로 돌아가기", updateWallet: "업데이트 설치", checkingFee: "수수료 확인 중…", executionFee: "실행 수수료",
    hookMatches: "이 계정은 이 지갑에 포함된 방화벽을 사용합니다.",
    hookDiffers: "이 계정의 방화벽은 이 지갑에 포함된 것과 다릅니다.",
    hookMissing: "이 계정에는 방화벽이 설치되어 있지 않습니다.",
    hookUnreadable: "네트워크가 방화벽 버전을 반환하지 않았습니다.",
    interfaceMatches: "게시된 페이지가 이 서명 화면과 일치합니다.",
    interfaceDiffers: "이 계정에 새 지갑 페이지를 설치할 수 있습니다.",
    interfaceMissing: "이 계정에는 아직 지갑 페이지가 없습니다.",
    light: "라이트", dark: "다크", layout: "레이아웃", mobile: "모바일", desktop: "데스크톱",
    loading: "불러오는 중…", wallet: "지갑", loadingAccount: "계정을 불러오는 중…", available: "사용 가능 {amount} XAH",
    destPlaceholder: "받는 주소 r…", amountPlaceholder: "금액", review: "확인", showQr: "iPhone용 QR 표시",
    otherTx: "신뢰선, 에스크로 및 기타", requestAmount: "요청 금액, 선택",
    receiveHint: "금액을 비우면 코드는 내 주소입니다.",
    scanHint: "코드를 프레임에 맞추세요. 흐리면 화면을 누르세요.",
    pastePlaceholder: "또는 링크나 주소를 붙여넣기", open: "열기", emptyActivity: "아직 거래가 없습니다.",
    type: "유형", detail: "내용", hash: "해시", drops: "drops", amountInvalid: "소수점은 6자리까지 입력하세요.",
  },
};

export function translate(lang, key, vars) {
  const table = CATALOG[lang] || en;
  let text = table[key] || en[key] || key;
  if (!vars) return text;
  for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  return text;
}

function amountSpec(formatId) {
  return AMOUNT_FORMATS.find((item) => item.id === formatId) || AMOUNT_FORMATS[0];
}

export function formatDrops(drops, formatId = "plain") {
  const plain = dropsToXah(drops);
  const spec = amountSpec(formatId);
  if (!spec.group) return plain;
  const [whole, frac] = plain.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, spec.group);
  return frac ? grouped + spec.decimal + frac : grouped;
}

// Turns a typed amount into the plain form the transaction and the QR use.
// An empty field stays empty. A bad field throws.
export function canonicalAmount(text, formatId = "plain") {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const spec = amountSpec(formatId);
  let body = raw;
  if (spec.group === " ") body = body.replace(/[ \u00a0\u202f]/g, "");
  else if (spec.group) body = body.split(spec.group).join("");
  if (spec.decimal !== ".") body = body.split(spec.decimal).join(".");
  if (!/^\d+(\.\d{0,6})?$/.test(body)) throw new Error("enter an amount with at most 6 decimals");
  const [whole, frac = ""] = body.split(".");
  const drops = BigInt(whole) * 1000000n + BigInt((frac + "000000").slice(0, 6));
  if (drops <= 0n) throw new Error("amount must be greater than 0");
  if (drops > 100000000000000000n) throw new Error("amount is too large");
  return dropsToXah(drops);
}
