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

const phone = window.matchMedia("(max-width: 860px)").matches;
document.documentElement.dataset.shell = phone ? "phone" : "desk";

const balanceLine = $("b").parentElement;
balanceLine.className = "balance";
const balanceUnit = document.createElement("span");
balanceUnit.textContent = " XAH";
balanceLine.replaceChildren($("b"), balanceUnit);
const linesBox = document.createElement("div");
linesBox.className = "lines";

function themeLabel() {
  return document.documentElement.dataset.theme === "light" ? "Dark" : "Light";
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
    for (let i = 0; i < buttons.length; i++) buttons[i].textContent = next === "light" ? "Dark" : "Light";
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
if ((document.querySelector("meta[name=rev]") || {}).content !== "2") {
  const update = document.createElement("a");
  update.className = "b g";
  update.href = href("update");
  update.textContent = "Install update";
  side.append(update);
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
    $("b").textContent = xah(info.account_data.Balance);
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
  $("b").textContent = xah(info.account_data.Balance);
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
    return;
  }

  const sendPanel = panel("send");
  const receivePanel = panel("receive");
  activityPanel = panel("activity");
  function heading(text) {
    const h = document.createElement("h2");
    h.textContent = text;
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
    if (!/^\d+(\.\d{0,6})?$/.test(value)) {
      event.preventDefault();
      showNote("Enter an amount");
      return;
    }
    sign.href = href("pay", { dest: dest, xah: value });
  };
  const other = document.createElement("a");
  other.className = "b g";
  other.href = href("sign");
  other.textContent = "Other transactions";
  sendPanel.append(heading("Send"), destination, amount, sign, other);

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
  receivePanel.append(heading("Receive"), receiveNote, receive, scan);

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
  activityPanel.append(heading("Activity"), activityNote, activityList);
  rpc("account_tx", { account: acct, limit: 8 }).then(function (page) {
    paintActivity(page.transactions || []);
  }).catch(function () { activityNote.textContent = "Activity is unavailable."; });

  const layout = document.createElement("div");
  layout.id = "layout";
  layout.append(sendPanel, receivePanel, activityPanel);
  if (phone) {
    const tabs = document.createElement("nav");
    tabs.className = "tabs";
    function addTab(label, id, url) {
      const button = document.createElement(url ? "a" : "button");
      if (url) button.href = url;
      else button.type = "button";
      button.dataset.panel = id;
      button.textContent = label;
      if (!url) button.onclick = function () { show(id); };
      tabs.append(button);
    }
    addTab("Send", "send");
    addTab("Receive", "receive");
    addTab("Scan", "scan", href("scan"));
    addTab("Activity", "activity");
    slot.append(tabs, layout);
    show("send");
  } else {
    slot.append(layout);
  }
}).catch(function () { $("g").textContent = "Hook state unavailable"; });
