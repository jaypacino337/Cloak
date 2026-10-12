/* Cloak devnet app.
 * Everything runs client-side: keys are generated with web3.js, encrypted with
 * AES-GCM under a PBKDF2-derived key, and stored in localStorage.
 */
(() => {
  "use strict";

  // The web3.js browser bundle encodes u64 amounts with a global Buffer that browsers don't have.
  // Borrow the polyfill the bundle already ships with.
  if (!window.Buffer) window.Buffer = solanaWeb3.PublicKey.default.toBuffer().constructor;

  const { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, clusterApiUrl } = solanaWeb3;

  const CLUSTER = "devnet";
  // Optional ?rpc=https://your-node for people who'd rather not use the public endpoint.
  const RPC = (() => {
    const custom = new URLSearchParams(location.search).get("rpc");
    try {
      if (custom && /^https?:$/.test(new URL(custom).protocol)) return custom;
    } catch {}
    return clusterApiUrl(CLUSTER);
  })();
  const CUSTOM_RPC = RPC !== clusterApiUrl(CLUSTER);
  const STORAGE_KEY = "cloak.vault.v1";
  const PBKDF2_ITERATIONS = 310000;
  const FEE_LAMPORTS = 5000;
  const MIN_PART_LAMPORTS = 0.001 * LAMPORTS_PER_SOL; // stays above rent-exempt minimum for a fresh system account

  const connection = new Connection(RPC, "confirmed");
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const state = {
    provider: null,
    wallet: null, // PublicKey
    vault: null, // decrypted vault object
    cryptoKey: null,
    salt: null,
    pocket: null, // Keypair
    busy: false,
  };

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const short = (s, n = 4) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
  const sol = (lamports) => (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  const explorer = (sig) =>
    CUSTOM_RPC
      ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`
      : `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;

  let toastTimer;
  function toast(msg, isError = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
  }

  function log(msg, sig) {
    const row = document.createElement("div");
    const time = new Date().toLocaleTimeString();
    row.textContent = `[${time}] ${msg} `;
    if (sig) {
      const a = document.createElement("a");
      a.href = explorer(sig);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = short(sig, 6);
      row.appendChild(a);
    }
    $("log").prepend(row);
  }

  function parseSol(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a positive amount.");
    return Math.round(n * LAMPORTS_PER_SOL);
  }

  async function withBusy(btn, fn) {
    if (state.busy) return;
    state.busy = true;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Working…";
    try {
      await fn();
    } catch (err) {
      console.error(err);
      const msg = err?.message || String(err);
      toast(msg, true);
      log(`Error: ${msg}`);
    } finally {
      state.busy = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // ---------- vault crypto ----------
  async function deriveKey(passphrase, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function sealVault() {
    const iv = randomBytes(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, state.cryptoKey, enc.encode(JSON.stringify(state.vault)));
    const blob = { v: 1, kdf: "PBKDF2-SHA256", iter: PBKDF2_ITERATIONS, salt: b64(state.salt), iv: b64(iv), ct: b64(ct) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    return blob;
  }

  async function openVault(passphrase, blob) {
    const salt = unb64(blob.salt);
    const key = await deriveKey(passphrase, salt);
    let pt;
    try {
      pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
    } catch {
      throw new Error("Wrong passphrase.");
    }
    state.vault = JSON.parse(dec.decode(pt));
    state.cryptoKey = key;
    state.salt = salt;
    state.pocket = Keypair.fromSecretKey(Uint8Array.from(state.vault.pocket));
  }

  async function createVault(passphrase) {
    state.salt = randomBytes(16);
    state.cryptoKey = await deriveKey(passphrase, state.salt);
    state.pocket = Keypair.generate();
    state.vault = { version: 1, createdAt: Date.now(), pocket: Array.from(state.pocket.secretKey), notes: [], fresh: [] };
    await sealVault();
  }

  function storedVault() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ---------- notes ----------
  async function makeNote(lamports, sig) {
    const secret = randomBytes(32);
    const nullifier = randomBytes(32);
    const amountBytes = new Uint8Array(8);
    new DataView(amountBytes.buffer).setBigUint64(0, BigInt(lamports), true);
    const preimage = new Uint8Array([...amountBytes, ...secret, ...nullifier]);
    const commitment = toHex(await crypto.subtle.digest("SHA-256", preimage));
    const nullifierHash = toHex(await crypto.subtle.digest("SHA-256", nullifier));
    return {
      id: commitment.slice(0, 12),
      lamports,
      secret: toHex(secret),
      nullifier: toHex(nullifier),
      commitment,
      nullifierHash,
      sig,
      createdAt: Date.now(),
      spent: false,
    };
  }

  /** Mark notes as spent to cover `lamports`; returns change amount (may need a change note). */
  function spendNotes(lamports) {
    let remaining = lamports;
    for (const note of state.vault.notes) {
      if (remaining <= 0) break;
      if (note.spent) continue;
      note.spent = true;
      note.spentAt = Date.now();
      remaining -= note.lamports;
    }
    return remaining < 0 ? -remaining : 0;
  }

  const unspentTotal = () => state.vault.notes.filter((n) => !n.spent).reduce((s, n) => s + n.lamports, 0);

  // ---------- wallet ----------
  function getProvider() {
    const p = window.phantom?.solana || window.solana;
    return p && (p.isPhantom || typeof p.signTransaction === "function") ? p : null;
  }

  async function connectWallet() {
    const provider = getProvider();
    if (!provider) {
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // Reopen this page inside Phantom's in-app browser.
        location.href = `https://phantom.app/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;
        return;
      }
      window.open("https://phantom.app/download", "_blank", "noopener");
      throw new Error("Phantom not found. Install it, then reload this page.");
    }
    const res = await provider.connect();
    state.provider = provider;
    state.wallet = new PublicKey(res.publicKey.toString());
    provider.on?.("accountChanged", (pk) => {
      state.wallet = pk ? new PublicKey(pk.toString()) : null;
      render();
      refreshBalances();
    });
    $("connect").textContent = short(state.wallet.toBase58());
    $("airdrop").disabled = false;
    log(`Connected ${short(state.wallet.toBase58())}`);
    await refreshBalances();
    render();
  }

  async function refreshBalances() {
    try {
      if (state.wallet) {
        const bal = await connection.getBalance(state.wallet);
        state.walletLamports = bal;
        $("wallet-balance").innerHTML = `${sol(bal)} <small>SOL</small>`;
      }
      if (state.pocket) {
        const bal = await connection.getBalance(state.pocket.publicKey);
        state.pocketLamports = bal;
        $("pocket-balance").innerHTML = `${sol(bal)} <small>SOL</small>`;
      }
    } catch (err) {
      log(`Balance refresh failed: ${err.message}`);
    }
  }

  async function confirmTx(sig, blockhash, lastValidBlockHeight) {
    const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  }

  // ---------- actions ----------
  async function airdrop() {
    if (!state.wallet) throw new Error("Connect Phantom first.");
    log("Requesting 1 devnet SOL…");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    let sig;
    try {
      sig = await connection.requestAirdrop(state.wallet, LAMPORTS_PER_SOL);
    } catch (err) {
      throw new Error("Devnet faucet is rate-limited. Try faucet.solana.com instead.");
    }
    await confirmTx(sig, blockhash, lastValidBlockHeight);
    log("Airdrop landed", sig);
    toast("1 devnet SOL received");
    await refreshBalances();
  }

  async function seal() {
    if (!state.wallet) throw new Error("Connect Phantom first.");
    const lamports = parseSol($("seal-amt").value);
    if (lamports < MIN_PART_LAMPORTS) throw new Error("Minimum is 0.001 SOL.");

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ feePayer: state.wallet, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: state.wallet, toPubkey: state.pocket.publicKey, lamports })
    );
    // Sign in Phantom, but submit ourselves so the transfer always goes to devnet.
    const signed = await state.provider.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    log(`Dropping ${sol(lamports)} SOL into pocket…`, sig);
    await confirmTx(sig, blockhash, lastValidBlockHeight);

    const note = await makeNote(lamports, sig);
    state.vault.notes.push(note);
    await sealVault();
    $("seal-amt").value = "";
    log(`Sealed note ${note.id}`);
    toast(`${sol(lamports)} SOL is in your pocket`);
    await refreshBalances();
    render();
  }

  function randomSplit(total, parts) {
    if (parts === 1) return [total];
    const spare = total - parts * MIN_PART_LAMPORTS;
    if (spare < 0) throw new Error(`Each piece needs at least 0.001 SOL. Use fewer pieces or a bigger amount.`);
    const cuts = Array.from({ length: parts - 1 }, () => Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * spare)).sort((a, b) => a - b);
    const edges = [0, ...cuts, spare];
    return edges.slice(1).map((e, i) => MIN_PART_LAMPORTS + (e - edges[i]));
  }

  async function scatter() {
    const total = parseSol($("scatter-amt").value);
    const manualTo = $("scatter-to").value.trim();
    const parts = manualTo ? 1 : Number($("scatter-parts").value);

    if (total > unspentTotal()) throw new Error(`Only ${sol(unspentTotal())} SOL in unspent notes.`);
    await refreshBalances();
    const needed = total + parts * FEE_LAMPORTS;
    if ((state.pocketLamports ?? 0) < needed) throw new Error(`Pocket needs ${sol(needed)} SOL including fees.`);

    let destinations;
    if (manualTo) {
      let pk;
      try {
        pk = new PublicKey(manualTo);
      } catch {
        throw new Error("That isn't a valid Solana address.");
      }
      if (state.wallet && pk.equals(state.wallet)) throw new Error("Sending back to your public wallet would undo the point. Pick another address.");
      destinations = [{ pubkey: pk, keypair: null, lamports: total }];
    } else {
      destinations = randomSplit(total, parts).map((lamports) => {
        const keypair = Keypair.generate();
        return { pubkey: keypair.publicKey, keypair, lamports };
      });
    }

    // Persist fresh keys before sending, so funds are never sent to a key we might lose.
    for (const d of destinations) {
      if (d.keypair) {
        state.vault.fresh.push({ pubkey: d.pubkey.toBase58(), secret: Array.from(d.keypair.secretKey), lamports: d.lamports, sig: null, createdAt: Date.now() });
      }
    }
    await sealVault();

    let sent = 0;
    // Separate transactions so fresh addresses don't share a transaction on-chain.
    for (const d of destinations) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ feePayer: state.pocket.publicKey, blockhash, lastValidBlockHeight }).add(
        SystemProgram.transfer({ fromPubkey: state.pocket.publicKey, toPubkey: d.pubkey, lamports: d.lamports })
      );
      tx.sign(state.pocket);
      const sig = await connection.sendRawTransaction(tx.serialize());
      log(`Leave ${sol(d.lamports)} SOL → ${short(d.pubkey.toBase58())}`, sig);
      await confirmTx(sig, blockhash, lastValidBlockHeight);
      const rec = state.vault.fresh.find((f) => f.pubkey === d.pubkey.toBase58());
      if (rec) rec.sig = sig;
      sent += d.lamports;
    }

    const change = spendNotes(sent);
    if (change > 0) {
      const changeNote = await makeNote(change, null);
      changeNote.change = true;
      state.vault.notes.push(changeNote);
    }
    await sealVault();
    $("scatter-amt").value = "";
    $("scatter-to").value = "";
    toast(`Sent ${sol(sent)} SOL to ${destinations.length} address${destinations.length > 1 ? "es" : ""}`);
    await refreshBalances();
    render();
  }

  function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportViewKey() {
    const view = {
      type: "cloak-view-key",
      cluster: CLUSTER,
      pocket: state.pocket.publicKey.toBase58(),
      exportedAt: new Date().toISOString(),
      notes: state.vault.notes.map(({ id, lamports, commitment, nullifierHash, sig, createdAt, spent, change }) => ({ id, lamports, commitment, nullifierHash, sig, createdAt, spent, change: !!change })),
      fresh: state.vault.fresh.map(({ pubkey, lamports, sig, createdAt }) => ({ pubkey, lamports, sig, createdAt })),
    };
    download(`cloak-view-key-${Date.now()}.json`, view);
    log("Exported read-only view key");
  }

  async function sweepFresh(pubkey) {
    if (!state.wallet) throw new Error("Connect Phantom to choose a sweep destination.");
    const rec = state.vault.fresh.find((f) => f.pubkey === pubkey);
    const kp = Keypair.fromSecretKey(Uint8Array.from(rec.secret));
    const bal = await connection.getBalance(kp.publicKey);
    if (bal <= FEE_LAMPORTS) throw new Error("Nothing to sweep.");
    const to = prompt("Sweep this address to which Solana address?", "");
    if (!to) return;
    const dest = new PublicKey(to.trim());
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ feePayer: kp.publicKey, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: dest, lamports: bal - FEE_LAMPORTS })
    );
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await confirmTx(sig, blockhash, lastValidBlockHeight);
    log(`Swept ${short(pubkey)} → ${short(dest.toBase58())}`, sig);
    toast("Sweep confirmed");
  }

  // ---------- rendering ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setAddr(id, pk) {
    const node = $(id);
    if (!pk) { node.textContent = id === "wallet-addr" ? "not connected" : "—"; node.classList.remove("copy"); return; }
    const full = pk.toBase58();
    node.textContent = short(full, 6);
    node.title = `${full} (click to copy)`;
    node.dataset.full = full;
    node.classList.add("copy");
  }

  function emptyState(text) {
    const box = el("div", "empty");
    box.innerHTML = '<svg viewBox="0 0 72 72" fill="none" stroke="#6f675b" stroke-width="1.6" stroke-linecap="round"><path d="M16 22h40v22c0 10-9 18-20 18s-20-8-20-18V22z"/><path d="M20 28h32" stroke-dasharray="3 4"/></svg>';
    box.append(el("div", null, text));
    return box;
  }

  function render() {
    setAddr("wallet-addr", state.wallet);
    const unlocked = !!state.vault;
    $("gate").classList.toggle("hidden", unlocked);
    $("main").classList.toggle("hidden", !unlocked);

    if (!unlocked) {
      const existing = storedVault();
      $("gate-title").textContent = existing ? "Unlock your vault" : "Create your vault";
      $("gate-hint").textContent = existing
        ? "Enter your passphrase to decrypt your vault in this browser."
        : "Choose a passphrase. It encrypts your pocket key, notes and fresh addresses right here in this browser. There's no reset link, so write it down somewhere safe.";
      $("pass2-wrap").classList.toggle("hidden", !!existing);
      $("gate-go").textContent = existing ? "Unlock" : "Create vault";
      $("gate-wipe").classList.toggle("hidden", !existing);
      $("gate-restore").classList.toggle("hidden", !!existing);
      $("vault-state").textContent = existing ? "locked" : "no vault";
      setAddr("pocket-addr", null);
      $("note-count").textContent = "0";
      $("fresh-count").textContent = "0";
      return;
    }

    $("vault-state").textContent = "unlocked";
    setAddr("pocket-addr", state.pocket.publicKey);
    const unspent = state.vault.notes.filter((n) => !n.spent);
    $("note-count").textContent = `${unspent.length} · ${sol(unspentTotal())} SOL`;
    $("fresh-count").textContent = String(state.vault.fresh.length);

    const notesBox = $("notes");
    notesBox.replaceChildren();
    if (!state.vault.notes.length) notesBox.append(emptyState("No notes yet. Drop some SOL into your pocket first."));
    for (const n of [...state.vault.notes].reverse()) {
      const card = el("div", `note${n.spent ? " spent" : ""}`);
      const top = el("div", "note-top");
      top.append(el("b", null, `${sol(n.lamports)} SOL${n.change ? " (change)" : ""}`), el("span", n.spent ? "warn" : "ok", n.spent ? "spent" : "unspent"));
      card.append(top, el("div", "mono", `commitment ${n.commitment}`));
      notesBox.append(card);
    }

    const freshBox = $("fresh");
    freshBox.replaceChildren();
    if (!state.vault.fresh.length) freshBox.append(emptyState("No fresh addresses yet. They show up here after you leave."));
    for (const f of [...state.vault.fresh].reverse()) {
      const card = el("div", "note");
      const top = el("div", "note-top");
      const sweep = el("button", "btn btn-ghost btn-sm", "Sweep");
      sweep.addEventListener("click", () => withBusy(sweep, () => sweepFresh(f.pubkey)));
      top.append(el("b", null, `${sol(f.lamports)} SOL`), sweep);
      card.append(top, el("div", "mono", f.pubkey));
      freshBox.append(card);
    }
  }

  // ---------- wiring ----------
  $("connect").addEventListener("click", (e) => withBusy(e.currentTarget, connectWallet));
  $("airdrop").addEventListener("click", (e) => withBusy(e.currentTarget, airdrop));
  $("seal-go").addEventListener("click", (e) => withBusy(e.currentTarget, seal));
  $("scatter-go").addEventListener("click", (e) => withBusy(e.currentTarget, scatter));
  $("export-view").addEventListener("click", exportViewKey);
  $("refresh").addEventListener("click", (e) => withBusy(e.currentTarget, refreshBalances));

  $("gate-go").addEventListener("click", (e) =>
    withBusy(e.currentTarget, async () => {
      const pass = $("pass").value;
      const existing = storedVault();
      if (existing) {
        await openVault(pass, existing);
        log("Vault unlocked");
      } else {
        if (pass.length < 8) throw new Error("Use at least 8 characters.");
        if (pass !== $("pass2").value) throw new Error("Passphrases don't match.");
        await createVault(pass);
        log("Vault created. Back it up from the Keys tab.");
        toast("Vault created");
      }
      $("pass").value = $("pass2").value = "";
      render();
      await refreshBalances();
    })
  );
  $("pass").addEventListener("keydown", (e) => e.key === "Enter" && $("gate-go").click());
  $("pass2").addEventListener("keydown", (e) => e.key === "Enter" && $("gate-go").click());

  $("gate-wipe").addEventListener("click", () => {
    if (!confirmDelete()) return;
    localStorage.removeItem(STORAGE_KEY);
    log("Local vault deleted");
    render();
  });
  function confirmDelete() {
    return window.prompt('This permanently deletes the vault in this browser. Funds in your pocket and fresh addresses are lost unless you have a backup. Type DELETE to confirm.') === "DELETE";
  }

  $("lock").addEventListener("click", () => {
    state.vault = state.cryptoKey = state.pocket = null;
    state.pocketLamports = undefined;
    $("pocket-balance").innerHTML = "— <small>SOL</small>";
    log("Vault locked");
    render();
  });

  $("backup").addEventListener("click", () => {
    const blob = storedVault();
    if (blob) download(`cloak-vault-backup-${Date.now()}.json`, blob);
  });

  async function restoreFrom(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = JSON.parse(await file.text());
      if (blob?.v !== 1 || !blob.ct || !blob.iv || !blob.salt) throw new Error("That isn't a Cloak backup file.");
      if (storedVault() && !window.confirm("Replace the vault in this browser with this backup?")) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
      state.vault = state.cryptoKey = state.pocket = null;
      log("Backup restored. Unlock it with its passphrase.");
      toast("Backup restored. Enter its passphrase.");
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }
  $("restore").addEventListener("change", restoreFrom);
  $("restore-gate").addEventListener("change", restoreFrom);

  // click-to-copy addresses
  document.addEventListener("click", async (e) => {
    const node = e.target.closest(".copy");
    if (!node?.dataset.full) return;
    try {
      await navigator.clipboard.writeText(node.dataset.full);
      toast("Address copied");
    } catch {
      toast(node.dataset.full);
    }
  });

  // amount presets
  document.querySelectorAll(".presets").forEach((group) =>
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-v]");
      if (!btn) return;
      const input = $(group.dataset.for);
      let v = btn.dataset.v;
      if (v === "max") {
        if (group.dataset.for === "seal-amt") {
          v = Math.max(0, (state.walletLamports ?? 0) - 0.002 * LAMPORTS_PER_SOL);
        } else {
          const parts = $("scatter-to").value.trim() ? 1 : Number($("scatter-parts").value);
          v = Math.max(0, Math.min(state.vault ? unspentTotal() : 0, (state.pocketLamports ?? 0) - parts * FEE_LAMPORTS));
        }
        v = Math.floor(v / 1e3) / 1e6; // lamports → SOL, trimmed to 6 decimals
      }
      input.value = v;
      input.focus();
    })
  );

  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tab-body").forEach((b) => b.classList.toggle("active", b.id === `tab-${tab.dataset.tab}`));
    })
  );

  // Silently reconnect if the site is already trusted in Phantom.
  const provider = getProvider();
  if (provider?.connect) {
    provider
      .connect({ onlyIfTrusted: true })
      .then((res) => {
        state.provider = provider;
        state.wallet = new PublicKey(res.publicKey.toString());
        $("connect").textContent = short(state.wallet.toBase58());
        $("airdrop").disabled = false;
        render();
        refreshBalances();
      })
      .catch(() => {});
  }

  if (CUSTOM_RPC) log(`Using custom RPC ${RPC}`);
  render();
})();
