/* ============================================================
   CLOAK SETTINGS: the only file you need to edit.
   Everything here is PUBLIC (anyone can read it in their browser).
   Never put a private key or seed phrase in this file.
   ============================================================ */
window.CLOAK_CONFIG = {
  // Solana RPC link (e.g. from Helius, QuickNode or Triton). Leave empty to use the free public devnet node.
  // Use a DEVNET link, and lock the key to your domain in your RPC dashboard, because this value is public.
  rpcUrl: "",

  // Your pump.fun token. Leave empty and the site says "no token".
  // mint = the contract address (CA) pump.fun shows after you launch. It's public, so it's safe here.
  token: {
    ticker: "", // e.g. "CLOAK"
    mint: "", // e.g. "7xKq...pump"
  },

  // Social links. Leave any empty to hide it.
  links: {
    x: "", // e.g. "https://x.com/yourhandle"
    telegram: "", // e.g. "https://t.me/yourgroup"
    github: "https://github.com/jaypacino337/Cloak",
  },
};
