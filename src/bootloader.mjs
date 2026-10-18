// The document published in AccountSet.AppLoader. The node serves it with
// `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`,
// which gives the page an opaque origin. WebAuthn refuses an opaque origin,
// so this page is the wallet and the passkey ceremony is a top-level visit
// to the signer (a real origin). The hook still rejects any transaction
// whose memo was not produced for this exact payment.

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

function pageAsset(signer, file) {
  const url = new URL(signer);
  if (!url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/[^/]*$/, "");
  url.search = "";
  url.hash = "";
  return new URL(file, url).href;
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
  const css = pageAsset(signer, "wallet.css");
  const script = pageAsset(signer, "wallet.js");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${metas}<title>Wallet</title><link rel="stylesheet" href=${jsString(css)}></head><body><main><h1>Wallet</h1>
<p class="m" id="intro">Your iPhone approves each send. A computer shows a QR code.</p>
<p><code id="a"></code></p><p>Balance <b id="b">…</b></p><p id="g" class="m"></p><div id="d"></div><pre id="m" class="json"></pre>
</main><script src=${jsString(script)} data-s=${jsString(signer)}></script></body></html>`;
  assertLoaderHtml(html);
  return html;
}

export function loaderHex(html) {
  return [...new TextEncoder().encode(html)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
