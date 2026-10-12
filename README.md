# Cloak

**Money that doesn't gossip.** Cloak is a pocket for your Solana wallet. You move funds in, then leave
through addresses nobody has seen before, and your keys never leave the browser.

**Live:** https://jaypacino337.github.io/Cloak/  ·  **App:** https://jaypacino337.github.io/Cloak/app.html

It's a static site with no backend and no build step.

## What works today (Solana devnet)

- **Wallet**: connect Phantom (desktop, or Phantom's in-app browser on mobile), check your balance, and get a test SOL airdrop.
- **Vault**: your pocket keypair, sealed notes and fresh-address keys, encrypted in the browser
  (PBKDF2-SHA256 at 310k iterations, then AES-GCM-256) and stored in `localStorage`.
- **Drop in**: Phantom signs a transfer into your pocket, and Cloak records a note whose commitment is
  `SHA-256(amount ‖ secret ‖ nullifier)`.
- **Leave**: withdraw from the pocket to 1–4 new keypairs with random splits, one transaction each.
- **Sweep**: move funds out of any fresh address.
- **View key**: export your notes as read-only JSON, without their secrets.
- Download an encrypted vault backup and restore it.
- `?rpc=https://your-node`: use your own RPC endpoint instead of the public devnet one.

## Honest limitations

Cloak runs on devnet only, it is **not audited**, and there's no shared pool yet, so anyone can follow the hops
from wallet to pocket to fresh address on-chain. Next on the roadmap: a pool program, zero-knowledge
withdrawals and relayers. Mainnet waits for an independent audit.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

Every push to `claude/cloak-site` deploys to GitHub Pages through `.github/workflows/pages.yml`.
