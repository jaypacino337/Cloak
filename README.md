# Cloak

**Your wallet, off the record.** Cloak is a pocket for your Solana wallet. You move funds in, then leave
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

## Settings: `assets/config.js`

This is the only file you need to edit. Everything in it is **public**.

| Setting | What to put | Example |
|---|---|---|
| `rpcUrl` | A **devnet** RPC link from Helius, QuickNode etc. Empty = free public node. Lock the key to your domain in the provider's dashboard. | `https://devnet.helius-rpc.com/?api-key=…` |
| `token.ticker` | Your pump.fun ticker | `CLOAK` |
| `token.mint` | The contract address (CA) pump.fun gives you | `7xKq…pump` |
| `links.x` / `links.telegram` | Your socials | `https://x.com/…` |

Leave `token.mint` empty and the site says there's no token. Fill it in and a token section, a copy-CA
button in the nav and a pump.fun link show up.

> **Never put a private key or seed phrase anywhere in this repo, in Vercel, or in Railway.** The site
> doesn't need one. Launch the token on pump.fun with your Phantom wallet, then paste only the public CA here.

## Deploy

**Vercel (easiest):** vercel.com/new → import `jaypacino337/Cloak` → Framework preset **Other** → Deploy.
You don't need any build command or environment variables.

**Railway:** railway.com/new → Deploy from GitHub repo → `jaypacino337/Cloak`. It runs `npm start`
(`server.js`, no dependencies). Then Settings → Networking → **Generate Domain**.

**GitHub Pages:** Settings → Pages → Source: **GitHub Actions**. After that, every push deploys automatically.

Every push to `claude/cloak-site` redeploys on all three.
