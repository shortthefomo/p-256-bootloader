# P-256 wallet bootloader

An on-ledger Xahau wallet. The account publishes a small HTML wallet (`AccountSet.AppLoader`, at most 4096 bytes). The [passkey firewall](https://github.com/shortthefomo/passkey_p256_firewall) v2 hook is installed unnamed, so a transaction cannot skip it. After it is locked, every gated transaction needs a WebAuthn assertion from the attached iPhone.

The network is the passkey devnet (network id 21339, build `2026.10.17-HEAD+4160`). It has `PWALoader` and the firewall calls `util_sha256` and `util_verify_p256`. The wallet is served at `https://pwa.passkey.xahau-dev.net/<account>` after the account publishes a loader.

| | |
| --- | --- |
| Wallet host | https://pwa.passkey.xahau-dev.net/`<account>` |
| RPC | https://rpc.passkey.xahau-dev.net |
| WebSocket | wss://passkey.xahau-dev.net |
| Explorer | https://explorer.passkey.xahau-dev.net |
| Faucet | `POST https://faucet.passkey.xahau-dev.net/accounts` |

## Why signing leaves the wallet page

The node serves the loader with `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups`. That page has an opaque origin, and WebAuthn refuses an opaque origin. The wallet still collects the payment. Confirming it navigates to this signer, which has a normal https origin. Face ID runs there. The signer submits the transaction, with the passkey memo the hook checks, and returns to the wallet.

The hook does not replace the account signature. On attach, the family seed is sealed with the passkey's PRF output and stored as ciphertext in the loader. A later payment asks for the same passkey, opens the seed, and signs. Without PRF, the seed stays in this browser and the hook still requires the passkey.

The stored origin has to be https and 8 to 64 characters.

## Wallet

GitHub Pages is the setup page and the Face ID step. It creates a wallet or attaches the firewall bootloader. It is not the address the wallet runs from. The wallet is the account page at `https://pwa.passkey.xahau-dev.net/<account>`. A phone lays out as a wallet there. A computer shows a QR code for a send. The iPhone opens this site only to approve with Face ID, then returns to the account page.

Push the repository to GitHub and turn on Pages (the `pages` workflow publishes the site). The site origin, such as `https://shortthefomo.github.io`, must be 64 characters or fewer. `github.io` is a public suffix, so the passkey belongs to that full host. Open the Pages URL in Safari on the iPhone.

- **Create a wallet and attach iPhone** funds a new account from the faucet, shows the seed once, then opens the passkey prompt.
- The wallet installs the hook with that iPhone public key, publishes the bootloader pointed at this same URL, and sets the level.
- **Lock the hook** (level 3) means a lost passkey locks the account. The seed cannot remove the hook. Leave it off for level 2: payments and account changes still need the phone, and `SetHook` can still remove the hook.
- **Open this account** shows the balance, recent activity, send, and receive. On a computer, send shows a QR code for the iPhone. On the phone, Face ID signs, and Scan reads a QR from the computer, an address, or a Xaman detect link.
- **Sign a transaction** builds a payment, trust line, offer, escrow, check, domain change, regular key, preauthorization, tickets, invoke, or account delete. Face ID signs it and the wallet submits it.

Open https://shortthefomo.github.io/p-256-bootloader/ to create a wallet or attach the firewall. After that, the wallet is `https://pwa.passkey.xahau-dev.net/<account>`. A payment collected there comes back to this site for Face ID, then returns to the account page. **Other transactions** opens the full form on this site for the same approval.

## Levels

The hook is [v2 of passkey_p256_firewall](https://github.com/shortthefomo/passkey_p256_firewall/tree/main/v2) (`17dc923`), wasm in `public/passkey_p256_firewall_v2.wasm`. It is not renamed.

| Level | What needs the passkey |
| --- | --- |
| 2 | Outgoing payments, plus value and account-control transactions, including Invoke. `SetHook` still passes. |
| 3 | Every outgoing transaction the hook runs on, including `SetHook`. |

Payments use the 53-byte payment challenge as the WebAuthn challenge. Other gated transactions use the transaction-hash challenge. A memo for a different amount, destination, or sequence is rejected.

`npm run live` funds a throwaway account on this devnet, installs the hook with a software passkey (not an iPhone), publishes the loader, and checks that `https://pwa.passkey.xahau-dev.net/<account>` serves it. An unsigned payment must fail and a v2 memo must succeed.
