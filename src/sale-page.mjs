// Public sale page. It reads URI tokens and never signs. The network call is a
// one-shot websocket: the HTTP RPC does not send browser CORS headers. The QR
// is always the GitHub Pages URL, so a scan from a preview still opens this page.

import { translate, LANGUAGES } from "./locale.mjs";
import { dropsToXah } from "./protocol.mjs";
import { encodeQr } from "./qr.mjs";
import { isAddress, saleLink, shortAddress, tweetLink } from "./scan.mjs";
import { cardArt, normalizeUriToken } from "./uri-tokens.mjs";

const WSS = "wss://passkey.xahau-dev.net";

export function saleQuery(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const account = params.get("account") || "";
  if (!isAddress(account)) return null;
  const id = String(params.get("id") || "").trim().toUpperCase();
  if (id && !/^[0-9A-F]{64}$/.test(id)) return null;
  return { account, id };
}

export function visibleSale(tokens, id = "") {
  const want = String(id || "").trim().toUpperCase();
  const list = Array.isArray(tokens) ? tokens : [];
  if (want) return list.filter((token) => token && token.id === want);
  return list.filter((token) => token && token.amount != null && token.amount !== "");
}

function language() {
  try {
    const value = localStorage.getItem("p256-lang");
    if (LANGUAGES.some((item) => item.id === value)) return value;
  } catch {
    // The public page stays in English when storage is blocked.
  }
  return "en";
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WSS);
    let settled = false;
    const timer = setTimeout(() => fail(new Error("cannot reach the network")), 15000);
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) resolve(value);
      else {
        try { socket.close(); } catch { /* already closed */ }
        reject(value);
      }
    };
    const fail = (error) => finish(false, error);
    socket.addEventListener("open", () => finish(true, socket));
    socket.addEventListener("error", () => fail(new Error("cannot reach the network")));
  });
}

function ask(socket, id, command, params) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error("the network did not answer")), 15000);
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      if (ok) resolve(value);
      else reject(value);
    };
    const fail = (error) => finish(false, error);
    const onMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id !== id) return;
      if (message.status && message.status !== "success") {
        fail(new Error(message.error_message || message.error || message.status));
        return;
      }
      finish(true, message.result || {});
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, command, ...params }));
  });
}

async function accountTokens(account) {
  const socket = await openSocket();
  try {
    const tokens = [];
    let marker;
    for (let pageNo = 0; pageNo < 8; pageNo += 1) {
      const query = { account, type: "uri_token", ledger_index: "validated", limit: 200 };
      if (marker) query.marker = marker;
      const page = await ask(socket, pageNo + 1, "account_objects", query);
      for (const object of page.account_objects || []) tokens.push(normalizeUriToken(object));
      marker = page.marker;
      if (!marker) break;
    }
    return tokens;
  } finally {
    socket.close();
  }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (value != null) node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function tokenTitle(token) {
  return token.code || token.uri || shortAddress(token.id);
}

function priceLabel(amount) {
  if (amount == null || amount === "") return "";
  if (typeof amount === "string") {
    if (!/^\d+$/.test(amount)) return "";
    return `${dropsToXah(amount)} XAH`;
  }
  if (!amount || typeof amount !== "object" || Array.isArray(amount)) return "";
  return `${amount.value || ""} ${amount.currency || ""}`.trim();
}

function tokenArt(token, title) {
  const frame = el("div", { class: "nft-art" });
  const art = cardArt(token.uri);
  if (!art) {
    frame.append(el("div", { class: "nft-fallback" }, [title]));
    return frame;
  }
  const image = el("img", { src: art, alt: title });
  image.addEventListener("error", () => {
    frame.replaceChildren(el("div", { class: "nft-fallback" }, [title]));
  });
  frame.append(image);
  return frame;
}

function qrCanvas(text) {
  const qr = encodeQr(text);
  const quiet = 4;
  const scale = 6;
  const size = (qr.size + quiet * 2) * scale;
  const canvas = el("canvas", { class: "qr", width: String(size), height: String(size) });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#102117";
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.modules[row * qr.size + col]) continue;
      ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
    }
  }
  return canvas;
}

function codeBlock(page, say) {
  const box = el("div", { class: "qrbox" });
  try {
    box.append(qrCanvas(page));
  } catch {
    box.append(el("code", { class: "nft-id-field" }, [page]));
  }
  return el("div", {}, [
    el("p", { class: "m" }, [say("nftScan")]),
    box,
  ]);
}

function tokenIdBlock(id, say) {
  const field = el("code", { class: "nft-id-field" }, [id]);
  const button = el("button", { class: "g", type: "button" }, [say("nftCopy")]);
  button.addEventListener("click", async () => {
    const done = () => {
      button.textContent = say("nftCopied");
    };
    const select = () => {
      const range = document.createRange();
      range.selectNodeContents(field);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(id);
      done();
    } catch {
      select();
    }
  });
  return el("div", { class: "nft-id" }, [
    el("span", {}, [say("nftTokenId")]),
    field,
    button,
  ]);
}

function shareAnchor(page, label, message) {
  return el("a", {
    class: "b",
    href: tweetLink(page, message),
    target: "_blank",
    rel: "noopener",
  }, [label]);
}

function shopCard(account, token, say) {
  const title = tokenTitle(token);
  const price = priceLabel(token.amount);
  return el("a", {
    class: "nft listed",
    href: saleLink(account, token.id),
  }, [
    tokenArt(token, title),
    el("div", { class: "nft-body" }, [
      el("strong", {}, [title]),
      token.edition ? el("span", { class: "nft-edition" }, [`${say("nftEdition")} ${token.edition}`]) : null,
      token.destination ? el("span", { class: "nft-edition" }, [shortAddress(token.destination)]) : null,
      el("p", { class: "nft-status" }, [
        el("span", { class: "nft-state" }, [say("nftForSale")]),
        price ? el("span", { class: "nft-pricebit" }, [price]) : null,
      ]),
    ]),
  ]);
}

function oneToken(account, token, say) {
  const title = tokenTitle(token);
  const price = priceLabel(token.amount);
  const forSale = token.amount != null && token.amount !== "";
  const page = saleLink(account, token.id);
  const message = forSale ? `${title} · ${say("nftTweet")}` : title;
  return [el("div", { class: "sale-direct" }, [
    el("h1", {}, [title]),
    el("p", { class: "m mono" }, [account]),
    el("div", { class: forSale ? "nft listed sale-one" : "nft held sale-one" }, [
      tokenArt(token, title),
      el("div", { class: "nft-body" }, [
        el("strong", {}, [title]),
        token.edition ? el("span", { class: "nft-edition" }, [`${say("nftEdition")} ${token.edition}`]) : null,
        el("p", { class: "nft-status" }, [
          el("span", { class: "nft-state" }, [forSale ? say("nftForSale") : say("nftNotForSale")]),
          forSale && price ? el("span", { class: "nft-pricebit" }, [price]) : null,
        ]),
      ]),
    ]),
    token.destination ? el("p", { class: "m" }, [shortAddress(token.destination)]) : null,
    token.id ? tokenIdBlock(token.id, say) : null,
    page ? codeBlock(page, say) : null,
    el("div", { class: "sale-links" }, [
      page ? shareAnchor(page, say("nftShare"), message) : null,
      el("a", { class: "b g", href: saleLink(account) }, [say("nftShop")]),
    ]),
  ])];
}

function shop(account, tokens, say) {
  const page = saleLink(account);
  const cards = tokens.map((token) => shopCard(account, token, say));
  return [
    el("h1", {}, [say("nftShop")]),
    el("p", { class: "m mono" }, [account]),
    cards.length
      ? el("div", { class: "nft-grid" }, cards)
      : el("p", {}, [say("nftShopEmpty")]),
    page ? codeBlock(page, say) : null,
    page ? el("div", { class: "sale-links" }, [shareAnchor(page, say("nftShareShop"), say("nftTweet"))]) : null,
  ];
}

function paint(root, say, query, tokens) {
  const shown = visibleSale(tokens, query.id);
  document.title = say(query.id ? "nftForSale" : "nftShop");
  if (query.id && !shown.length) {
    root.replaceChildren(
      el("h1", {}, [say("nfts")]),
      el("p", { class: "m mono" }, [query.account]),
      el("p", {}, [say("nftMissing")]),
      el("div", { class: "sale-links" }, [
        el("a", { class: "b g", href: saleLink(query.account) }, [say("nftShop")]),
      ]),
    );
    return;
  }
  const nodes = query.id
    ? oneToken(query.account, shown[0], say)
    : shop(query.account, shown, say);
  root.replaceChildren(...nodes.filter((node) => node != null && node !== false));
}

function boot() {
  const root = document.querySelector("#app");
  if (!root) return;
  const say = (key, vars) => translate(language(), key, vars);
  document.documentElement.lang = language();
  const query = saleQuery(location.search);
  if (!query) {
    document.title = say("nftBadLink");
    root.replaceChildren(
      el("h1", {}, [say("nfts")]),
      el("p", {}, [say("nftBadLink")]),
    );
    return;
  }
  root.replaceChildren(el("p", { class: "m" }, [say("loading")]));
  accountTokens(query.account).then((tokens) => {
    paint(root, say, query, tokens);
  }).catch(() => {
    document.title = say("nftUnavailable");
    root.replaceChildren(
      el("h1", {}, [say("nfts")]),
      el("p", {}, [say("nftUnavailable")]),
    );
  });
}

if (typeof document !== "undefined") boot();
