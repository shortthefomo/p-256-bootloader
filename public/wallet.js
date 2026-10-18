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
balanceLine.replaceChildren($("b"), document.createTextNode(" XAH"));

const frame = document.createElement("div");
frame.id = "frame";
const side = document.createElement("aside");
side.className = "side";
const stage = document.createElement("section");
stage.className = "stage";
const intro = $("intro") || document.querySelector("p.m:not(#g)");
side.append.apply(side, [document.querySelector("h1"), intro, $("a").parentElement, balanceLine, $("g")].filter(Boolean));
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

const hash = new URLSearchParams(location.hash.slice(1));
const txHash = hash.get("tx");
if (hash.get("err")) showJson(hash.get("err"));
else if (txHash) {
  showNote("Sent " + txHash);
  rpc("tx", { transaction: txHash }).then(function (result) {
    showJson(JSON.stringify(result));
    note.textContent = "Sent " + txHash;
  }).catch(function () {});
}

rpc("account_info", { account: acct, ledger_index: "validated" }).then(function (info) {
  $("b").textContent = xah(info.account_data.Balance);
}).catch(function (error) { showNote(error.message); });

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
  const activityPanel = panel("activity");
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

  const activityNote = document.createElement("p");
  activityNote.className = "m";
  activityNote.textContent = "Loading activity…";
  activityPanel.append(heading("Activity"), activityNote);
  rpc("account_tx", { account: acct, limit: 8 }).then(function (page) {
    const rows = page.transactions || [];
    activityNote.textContent = rows.length ? "" : "No transactions yet.";
    rows.forEach(function (entry) {
      const tx = entry.tx_json || entry.tx || {};
      const line = document.createElement("div");
      line.className = "tx";
      let text = tx.TransactionType || "Transaction";
      if (text === "Payment" && typeof tx.Amount === "string") text = xah(tx.Amount) + " XAH";
      if (tx.Destination) text += " → " + tx.Destination.slice(0, 6) + "…" + tx.Destination.slice(-4);
      line.textContent = text;
      activityPanel.append(line);
    });
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
