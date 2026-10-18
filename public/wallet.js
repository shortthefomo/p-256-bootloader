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

function go(op, extra) {
  const query = new URLSearchParams(Object.assign({ op: op, account: acct, return: location.origin + location.pathname }, extra || {}));
  location.assign(S + (S.indexOf("?") < 0 ? "?" : "&") + query);
}

function showJson(text) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (error) { pretty = text; }
  m.textContent = pretty;
}

const phone = window.matchMedia("(max-width: 860px)").matches;
document.documentElement.dataset.shell = phone ? "phone" : "desk";

const balanceLine = $("b").parentElement;
balanceLine.className = "balance";
balanceLine.replaceChildren($("b"), document.createTextNode(" XAH"));

const hash = new URLSearchParams(location.hash.slice(1));
const txHash = hash.get("tx");
if (hash.get("err")) showJson(hash.get("err"));
else if (txHash) {
  m.textContent = "Sent " + txHash;
  rpc("tx", { transaction: txHash }).then(function (result) {
    m.textContent = JSON.stringify(result, null, 2);
  }).catch(function () {});
}

rpc("account_info", { account: acct, ledger_index: "validated" }).then(function (info) {
  $("b").textContent = xah(info.account_data.Balance);
}).catch(function (error) { m.textContent = error.message; });

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
    attach.href = "#";
    attach.textContent = "Attach iPhone";
    attach.onclick = function (event) { event.preventDefault(); go("attach"); };
    slot.append(attach);
    return;
  }

  const tabs = document.createElement("nav");
  tabs.className = "tabs";
  const sendPanel = panel("send");
  const receivePanel = panel("receive");
  const activityPanel = panel("activity");
  function addTab(label, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.panel = id;
    button.textContent = label;
    button.onclick = function () { show(id); };
    tabs.append(button);
  }
  addTab("Send", "send");
  addTab("Receive", "receive");
  addTab("Scan", "scan");
  addTab("Activity", "activity");
  const scanTab = tabs.lastChild.previousSibling;
  scanTab.onclick = function () { go("scan"); };

  const destination = document.createElement("input");
  const amount = document.createElement("input");
  const sign = document.createElement("button");
  destination.placeholder = "Destination r...";
  amount.placeholder = "Amount XAH";
  amount.inputMode = "decimal";
  sign.textContent = phone ? "Sign with Face ID" : "Show QR for iPhone";
  sign.onclick = function () {
    const value = amount.value.trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination.value.trim())) {
      m.textContent = "Enter a destination address";
      return;
    }
    if (!/^\d+(\.\d{0,6})?$/.test(value)) {
      m.textContent = "Enter an amount";
      return;
    }
    go("pay", { dest: destination.value.trim(), xah: value });
  };
  const other = document.createElement("a");
  other.className = "b g";
  other.href = "#";
  other.textContent = "Other transactions";
  other.onclick = function (event) { event.preventDefault(); go("sign"); };
  sendPanel.append(destination, amount, sign, other);

  const receiveNote = document.createElement("p");
  receiveNote.className = "m";
  receiveNote.textContent = "Show a QR code for this address.";
  const receive = document.createElement("button");
  receive.textContent = "Show my QR";
  receive.onclick = function () { go("receive"); };
  const scan = document.createElement("a");
  scan.className = "b g";
  scan.href = "#";
  scan.textContent = "Scan a QR code";
  scan.onclick = function (event) { event.preventDefault(); go("scan"); };
  receivePanel.append(receiveNote, receive, scan);

  const activityNote = document.createElement("p");
  activityNote.className = "m";
  activityNote.textContent = "Loading activity…";
  activityPanel.append(activityNote);
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
  slot.append(tabs, layout);
  show("send");
}).catch(function () { $("g").textContent = "Hook state unavailable"; });
