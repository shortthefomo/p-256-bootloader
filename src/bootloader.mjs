// The document published in AccountSet.AppLoader. The node serves it with
// `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`,
// which gives the page an opaque origin. WebAuthn refuses an opaque origin,
// so this page is the wallet and the passkey ceremony is a top-level visit
// to the signer (a real origin). The hook still rejects any transaction
// whose memo was not produced for this exact payment.

import { RPC_WSS } from "./wallet.mjs";

export const LOADER_MAX = 4096;

export function assertLoaderHtml(html) {
  const bytes = new TextEncoder().encode(html);
  if (bytes.length === 0 || bytes.length > LOADER_MAX) {
    throw new Error(`AppLoader is ${bytes.length} bytes; the limit is ${LOADER_MAX}`);
  }
  if (new TextDecoder().decode(bytes) !== html) throw new Error("AppLoader is not UTF-8");
  for (const char of html) {
    const code = char.codePointAt(0);
    if (code === 0x7f || (code < 0x20 && code !== 9 && code !== 10 && code !== 12 && code !== 13)) {
      throw new Error("AppLoader contains a forbidden control character");
    }
  }
  const start = html.replace(/^\uFEFF/, "").trimStart();
  if (!/^<!doctype html/i.test(start) && !/^<html[\s>]/i.test(start)) {
    throw new Error("AppLoader must start with a doctype or <html>");
  }
  const open = html.search(/<html[\s>]/i);
  const close = html.toLowerCase().lastIndexOf("</html>");
  if (open < 0 || close < open) throw new Error("AppLoader needs <html> and </html>");
  if (!/^\s*$/.test(html.slice(close + "</html>".length))) {
    throw new Error("AppLoader has bytes after </html>");
  }
  return bytes.length;
}

function jsString(value) {
  if (/[\\"<>\u0000-\u001f]/.test(value)) throw new Error("signer URL has a character the loader cannot embed");
  return JSON.stringify(value);
}

export function renderBootloader({ signer, vault = "", cid = "", spk = "" }) {
  const url = new URL(signer);
  if (url.protocol !== "https:") throw new Error("signer must be https");
  const origin = url.origin;
  if (origin.length < 8 || origin.length > 64) {
    throw new Error(`signer origin is ${origin.length} characters; the hook allows 8 to 64`);
  }
  const metas = [
    vault ? `<meta name="vault" content="${vault}">` : "",
    cid ? `<meta name="cid" content="${cid}">` : "",
    spk ? `<meta name="spk" content="${spk}">` : "",
  ].filter(Boolean).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metas}<title>Wallet</title><style>
body{margin:0;background:#111;color:#eee;font:16px system-ui}main{max-width:28rem;margin:auto;padding:1rem}
button,a.b{display:block;box-sizing:border-box;width:100%;margin:.6rem 0;padding:.85rem;border:0;border-radius:.7rem;background:#8dffc1;color:#042;font:inherit;font-weight:700;text-align:center;text-decoration:none}.g{background:transparent;color:#8dffc1;border:1px solid #245c40}
input{box-sizing:border-box;width:100%;margin:.3rem 0;padding:.7rem;border-radius:.6rem;border:1px solid #333;background:#1b1b1b;color:inherit}
.m{color:#9ab;font-size:.85rem}code{word-break:break-all}
</style></head><body><main><h1>Wallet</h1>
<p class="m">Sends need your iPhone. The hook checks that passkey.</p>
<p><code id="a"></code></p><p>Balance <b id="b">…</b></p><p id="g" class="m"></p><div id="d"></div><p id="m"></p>
</main><script>
const S=${jsString(signer)};
const acct=location.pathname.split("/").filter(Boolean)[0]||"";
const $=document.getElementById.bind(document);
$("a").textContent=acct;
const m=$("m");
function xah(d){const n=BigInt(d),w=n/1000000n,f=(n%1000000n+"").padStart(6,"0").replace(/0+$/,"");return f?w+"."+f:""+w}
function rpc(c,p){return new Promise(function(ok,no){const ws=new WebSocket(${jsString(RPC_WSS)});
ws.onopen=function(){ws.send(JSON.stringify(Object.assign({id:1,command:c},p||{})))};
ws.onmessage=function(e){const j=JSON.parse(e.data);if(j.id!=1)return;ws.close();j.status&&j.status!="success"?no(new Error(j.error_message||j.error||j.status)):ok(j.result)};
ws.onerror=function(){no(new Error("offline"))}})}
function go(op,ex){const q=new URLSearchParams(Object.assign({op:op,account:acct,return:location.origin+location.pathname},ex||{}));location.assign(S+(S.indexOf("?")<0?"?":"&")+q)}
const h=new URLSearchParams(location.hash.slice(1));
if(h.get("tx"))m.textContent="Sent "+h.get("tx");
if(h.get("err"))m.textContent=h.get("err");
rpc("account_info",{account:acct,ledger_index:"validated"}).then(function(i){$("b").textContent=xah(i.account_data.Balance)+" XAH"}).catch(function(e){m.textContent=e.message});
rpc("account_namespace",{account:acct,namespace_id:"70323536626F6F74000000000000000000000000000000000000000000000001",ledger_index:"validated"}).then(function(ns){
const px=(ns.namespace_entries||ns.namespaceEntries||[]).some(function(e){const k=(e.HookStateKey||"").toUpperCase();return (k==="5058".padStart(64,"0")||k.slice(0,4)==="5058")&&(e.HookStateData||"").length==64});
$("g").textContent=px?"Passkey on. Sends need your iPhone.":"No passkey yet.";
const d=$("d");
if(!px){const a=document.createElement("a");a.className="b";a.href="#";a.textContent="Attach iPhone";a.onclick=function(ev){ev.preventDefault();go("attach")};d.append(a);return}
const to=document.createElement("input"),amt=document.createElement("input"),b=document.createElement("button");
to.placeholder="Destination r...";amt.placeholder="Amount XAH";amt.inputMode="decimal";b.textContent="Sign with iPhone";
b.onclick=function(){const t=amt.value.trim();if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(to.value.trim())){m.textContent="Enter a destination address";return}if(!/^\\d+(\\.\\d{0,6})?$/.test(t)){m.textContent="Enter an amount";return}go("pay",{dest:to.value.trim(),xah:t})};
const o=document.createElement("a");o.className="b g";o.href="#";o.textContent="Other transactions";o.onclick=function(ev){ev.preventDefault();go("sign")};
d.append(to,amt,b,o)}).catch(function(){$("g").textContent="Hook state unavailable"});
</script></body></html>`;
  assertLoaderHtml(html);
  return html;
}

export function loaderHex(html) {
  return [...new TextEncoder().encode(html)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
