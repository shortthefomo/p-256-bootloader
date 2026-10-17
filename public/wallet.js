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
  $("b").textContent = xah(info.account_data.Balance) + " XAH";
}).catch(function (error) { m.textContent = error.message; });

rpc("account_namespace", { account: acct, namespace_id: NAMESPACE, ledger_index: "validated" }).then(function (ns) {
  const entries = ns.namespace_entries || ns.namespaceEntries || [];
  const passkey = entries.some(function (entry) {
    const key = (entry.HookStateKey || "").toUpperCase();
    return (key === "5058".padStart(64, "0") || key.slice(0, 4) === "5058") && (entry.HookStateData || "").length == 64;
  });
  $("g").textContent = passkey ? "Passkey on. Sends need your iPhone." : "No passkey yet.";
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
  const destination = document.createElement("input");
  const amount = document.createElement("input");
  const sign = document.createElement("button");
  destination.placeholder = "Destination r...";
  amount.placeholder = "Amount XAH";
  amount.inputMode = "decimal";
  sign.textContent = "Sign with iPhone";
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
  slot.append(destination, amount, sign, other);
}).catch(function () { $("g").textContent = "Hook state unavailable"; });
