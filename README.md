# Cloak

A privacy tool for Solana: put space between your public wallet and where your money goes.
It's a static site with no backend and no build step. Open `index.html` or serve the folder.

## What's here

- `index.html` is the landing page.
- `app.html` + `assets/app.js` is the devnet app:
  - Connect Phantom, check your balance, and request a devnet airdrop.
  - **Vault**: a pocket keypair, notes and fresh-address keys, encrypted in the browser
    (PBKDF2-SHA256 at 310k iterations, then AES-GCM-256) and stored in `localStorage`.
  - **Seal**: Phantom signs a transfer into your pocket, and Cloak records a note whose commitment is
    `SHA-256(amount ‖ secret ‖ nullifier)`.
  - **Scatter**: withdraw from the pocket to new keypairs with random splits, one transaction per address.
  - **Sweep**: move funds out of any fresh address.
  - **View key**: export your notes as read-only JSON, without their secrets.
  - Download an encrypted vault backup and restore it.

## Honest limitations

Cloak runs on devnet only, it is **not audited**, and it does **not** have a shared pool yet.
The hops from wallet to pocket to fresh address are visible on-chain. The roadmap is a pool program
with zero-knowledge (Groth16) withdrawals and fee-paying relayers.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Any static host works for deployment (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
