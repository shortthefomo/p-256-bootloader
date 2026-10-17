// Assemble the static wallet for GitHub Pages. The site is this directory's
// parent, with the signer at the root and the modules beside it.
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
await rm(site, { recursive: true, force: true });
await mkdir(path.join(site, "src"), { recursive: true });
await mkdir(path.join(site, "vendor"), { recursive: true });

const signer = path.join(root, "public", "signer.html");
await cp(signer, path.join(site, "index.html"));
await cp(signer, path.join(site, "signer.html"));
await cp(path.join(root, "public", "passkey_p256_firewall_v2.wasm"), path.join(site, "passkey_p256_firewall_v2.wasm"));
await cp(path.join(root, "public", "wallet.css"), path.join(site, "wallet.css"));
await cp(path.join(root, "public", "wallet.js"), path.join(site, "wallet.js"));
await cp(
  path.join(root, "node_modules", "xrpl-accountlib", "dist", "browser-class.min.js"),
  path.join(site, "vendor", "xrpl-accountlib.js"),
);
for (const name of await readdir(path.join(root, "src"))) {
  if (name.endsWith(".mjs")) await cp(path.join(root, "src", name), path.join(site, "src", name));
}
await writeFile(path.join(site, ".nojekyll"), "");
console.log("site ready", site);
