/* Landing page: the drape animation, ticker and scroll reveals. */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- headline: words rise in one by one ----------
  const h1 = document.querySelector(".hero h1");
  if (h1 && !reduced) {
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.append(part);
            const w = document.createElement("span");
            w.className = "w";
            w.style.setProperty("--i", i++);
            w.textContent = part;
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
      }
    };
    walk(h1);
    document.documentElement.classList.add("intro");
  }

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // ---------- settings from config.js ----------
  const cfg = window.CLOAK_CONFIG || {};
  const mint = (cfg.token?.mint || "").trim();
  const tokenTicker = (cfg.token?.ticker || "").trim().replace(/^\$/, "");
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    const label = tokenTicker ? `$${tokenTicker}` : "Token";
    const short = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    document.getElementById("token")?.classList.remove("hidden");
    document.querySelectorAll("[data-ticker]").forEach((n) => (n.textContent = label));
    const ca = document.getElementById("ca-text");
    if (ca) ca.textContent = mint;
    const pump = document.getElementById("pump-link");
    if (pump) pump.href = `https://pump.fun/coin/${mint}`;
    const note = document.getElementById("hero-note");
    if (note) note.textContent = "No sign-up · no account · keys never leave your browser";
    const nav = document.getElementById("nav-token");
    if (nav) { nav.textContent = `${label} · ${short}`; nav.classList.remove("hidden"); }
    const faq = document.getElementById("faq-token");
    if (faq) faq.textContent = `Yes. ${label} is a community token launched on pump.fun, contract ${mint}. It isn't a share of anything and gives no revenue, rights or special access. The app works the same without it. Always check the contract address against this site before you buy.`;
    document.querySelectorAll("[data-copy-ca]").forEach((b) =>
      b.addEventListener("click", async () => {
        const original = b.textContent;
        try { await navigator.clipboard.writeText(mint); b.textContent = "Copied ✓"; }
        catch { b.textContent = mint; }
        setTimeout(() => (b.textContent = original), 1600);
      })
    );
  } else if (mint) {
    console.warn("config.js: token.mint doesn't look like a Solana address, so the token section stays hidden.");
  }
  for (const [key, url] of Object.entries(cfg.links || {})) {
    document.querySelectorAll(`[data-link="${key}"]`).forEach((a) => {
      if (/^https:\/\//.test(url || "")) { a.href = url; a.classList.remove("hidden"); }
      else if (key !== "github") a.classList.add("hidden");
    });
  }

  // ---------- ticker ----------
  const ticker = document.getElementById("ticker");
  if (ticker) {
    const b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const rnd = (n) => Array.from({ length: n }, () => b58[(Math.random() * b58.length) | 0]).join("");
    const items = Array.from({ length: 14 }, (_, i) => {
      const amt = (Math.random() * 40 + 0.01).toFixed(3);
      return i % 3 === 2
        ? `<span><i>●</i> ${rnd(4)}…${rnd(4)} ← fresh address · no history</span>`
        : `<span>${rnd(4)}…${rnd(4)} → ${rnd(4)}…${rnd(4)} · ${amt} SOL · <i>public forever</i></span>`;
    });
    ticker.innerHTML = items.join("") + items.join("");
  }

  // ---------- live receipt: what any wallet gives away ----------
  const form = document.getElementById("lookup");
  if (form) {
    const receipt = document.getElementById("receipt");
    const input = document.getElementById("lookup-addr");
    const go = document.getElementById("lookup-go");
    const hint = document.getElementById("lookup-hint");
    const PUBLIC_MAINNET = "https://api.mainnet-beta.solana.com";
    const endpoint = /^https:\/\//.test(cfg.lookupRpcUrl || "") ? cfg.lookupRpcUrl : PUBLIC_MAINNET;
    const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGRPGsT9YmyLm7oVR6j6hkBQ", "TokenzQdBNbLqP5VEhdkAS6EjFqzhLiBmQ5LCv6qDzPd"];

    const rpc = async (method, params) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `RPC ${res.status}`);
      return json.result;
    };

    const ago = (sec) => {
      const d = Date.now() / 1000 - sec;
      if (d < 90) return "just now";
      if (d < 3600) return `${Math.round(d / 60)} min ago`;
      if (d < 86400) return `${Math.round(d / 3600)} h ago`;
      if (d < 86400 * 60) return `${Math.round(d / 86400)} days ago`;
      return `${Math.round(d / (86400 * 30))} months ago`;
    };
    const fmtSol = (n) => n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 2 });
    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

    function print(lines) {
      receipt.classList.remove("printing");
      void receipt.offsetWidth; // restart the animation
      receipt.innerHTML = lines
        .map((l, i) => {
          const style = `style="--d:${i * 70}ms"`;
          if (l === "hr") return `<hr class="p" ${style} />`;
          if (l.h) return `<h4 class="p" ${style}>${esc(l.h)}</h4>`;
          if (l.c) return `<div class="center p" ${style}>${esc(l.c)}</div>`;
          return `<div class="line p${l.leak ? " leak" : ""}" ${style}><span>${esc(l.k)}</span><span>${esc(l.v)}</span></div>`;
        })
        .join("");
      receipt.classList.add("printing");
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addr = input.value.trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
        hint.textContent = "That doesn't look like a Solana address. It should be 32–44 letters and numbers.";
        hint.classList.add("bad");
        return;
      }
      hint.classList.remove("bad");
      go.disabled = true;
      go.firstChild.textContent = "Printing… ";
      receipt.classList.add("busy");
      const started = performance.now();
      try {
        const [lamports, sigs, ...tokenLists] = await Promise.all([
          rpc("getBalance", [addr]).then((r) => r.value),
          rpc("getSignaturesForAddress", [addr, { limit: 1000 }]),
          ...TOKEN_PROGRAMS.map((programId) =>
            rpc("getTokenAccountsByOwner", [addr, { programId }, { encoding: "jsonParsed" }]).then((r) => r.value).catch(() => [])
          ),
        ]);
        const secs = ((performance.now() - started) / 1000).toFixed(2);
        const held = tokenLists.flat().filter((a) => Number(a.account?.data?.parsed?.info?.tokenAmount?.amount || 0) > 0).length;
        const times = sigs.map((s) => s.blockTime).filter(Boolean);
        const hours = new Array(24).fill(0);
        const days = new Set();
        times.forEach((t) => {
          const d = new Date(t * 1000);
          hours[d.getHours()]++;
          days.add(d.toDateString());
        });
        const peak = hours.indexOf(Math.max(...hours));
        const peakLabel = new Date(2000, 0, 1, peak).toLocaleTimeString([], { hour: "numeric" });
        const oldest = times.length ? Math.min(...times) : null;
        const newest = times.length ? Math.max(...times) : null;
        const failed = sigs.filter((s) => s.err).length;
        const lines = [
          { h: `Wallet ${addr.slice(0, 4)}…${addr.slice(-4)}` },
          { c: `printed ${new Date().toLocaleDateString()} · solana mainnet` },
          "hr",
          { k: "SOL balance", v: `${fmtSol(lamports / 1e9)} SOL`, leak: true },
          { k: "Tokens held", v: `${held} kind${held === 1 ? "" : "s"}`, leak: held > 0 },
          { k: "Transactions on file", v: sigs.length >= 1000 ? "1,000+" : sigs.length.toLocaleString(), leak: sigs.length > 0 },
        ];
        if (newest) lines.push({ k: "Last active", v: ago(newest), leak: true });
        if (oldest) lines.push({ k: sigs.length >= 1000 ? "Searched back to" : "First ever move", v: new Date(oldest * 1000).toLocaleDateString(), leak: true });
        if (times.length >= 5) lines.push({ k: "Usually active around", v: `${peakLabel} your time`, leak: true });
        if (days.size) lines.push({ k: "Active days", v: days.size.toLocaleString() });
        if (failed) lines.push({ k: "Failed transactions", v: failed.toLocaleString() });
        lines.push("hr", { c: `anyone can print this · it took ${secs}s` });
        print(lines);
        hint.textContent = "That's just what's public. With a pocket and fresh addresses, there's much less to print.";
      } catch (err) {
        console.warn(err);
        hint.textContent = "The public Solana node is busy or blocked this request. Try again in a minute. (Site owner: add a free RPC link to lookupRpcUrl in config.js.)";
        hint.classList.add("bad");
      } finally {
        go.disabled = false;
        go.firstChild.textContent = "Print ";
        receipt.classList.remove("busy");
      }
    });
  }

  // ---------- the drape ----------
  const canvas = document.getElementById("drape");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const INK = "#16130f";
  const SIGNAL = "#e5482b";
  const LANES = 9;
  let W = 0, H = 0, dpr = 1;
  let particles = [];
  let outs = [];
  let t = 0;
  let last = performance.now();
  let visible = true;
  // pointer: the cloth leans toward it, loose dots scatter away from it
  const ptr = { x: 0, y: 0, s: 0, target: 0 };
  const art = canvas.parentElement;
  art.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
    ptr.target = 1;
  });
  art.addEventListener("pointerleave", () => (ptr.target = 0));
  const lean = (y) => {
    if (ptr.s < 0.01) return 0;
    const dir = Math.max(-1, Math.min(1, (ptr.x - W / 2) / (W / 2)));
    const sigma = H * 0.13;
    return dir * ptr.s * W * 0.07 * Math.exp(-((y - ptr.y) ** 2) / (2 * sigma * sigma));
  };

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const laneY = (i) => H * 0.16 + (i * (H * 0.7)) / (LANES - 1);
  // the cloth's left and right edges sway over time
  const edgeL = (y) => W * 0.4 + Math.sin(y * 0.018 + t * 0.7) * W * 0.03 + Math.sin(y * 0.041 - t * 0.4) * W * 0.012 + lean(y);
  const edgeR = (y) => W * 0.6 + Math.sin(y * 0.015 + t * 0.9 + 1.7) * W * 0.035 + Math.sin(y * 0.05 + t * 0.3) * W * 0.01 + lean(y) * 0.8;

  function spawn() {
    const lane = (Math.random() * LANES) | 0;
    particles.push({ x: -6, lane, v: 34 + Math.random() * 28, r: 2.4 + Math.random() * 1.8 });
  }

  function emerge(r) {
    const y = H * 0.14 + Math.random() * H * 0.72;
    const a = (Math.random() - 0.5) * 0.9;
    outs.push({ x: edgeR(y) + 2, y, vx: Math.cos(a) * (30 + Math.random() * 35), vy: Math.sin(a) * 26, r, life: 1 });
  }

  function drawLedger() {
    ctx.lineWidth = 1;
    for (let i = 0; i < LANES; i++) {
      const y = laneY(i);
      ctx.strokeStyle = "rgba(22,19,15,.13)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(edgeL(y), y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawCloth() {
    const top = H * 0.06, bot = H * 0.94, step = 4;
    // body
    ctx.beginPath();
    ctx.moveTo(edgeL(top), top);
    for (let y = top; y <= bot; y += step) ctx.lineTo(edgeL(y), y);
    for (let y = bot; y >= top; y -= step) ctx.lineTo(edgeR(y), y);
    ctx.closePath();
    const g = ctx.createLinearGradient(W * 0.38, 0, W * 0.64, 0);
    g.addColorStop(0, "#221e19"); g.addColorStop(0.5, INK); g.addColorStop(1, "#2a251f");
    ctx.fillStyle = g;
    ctx.fill();
    // folds
    ctx.save();
    ctx.clip();
    const folds = 15;
    for (let i = 1; i < folds; i++) {
      const f = i / folds;
      ctx.beginPath();
      for (let y = top; y <= bot; y += step) {
        const x = edgeL(y) + (edgeR(y) - edgeL(y)) * f + Math.sin(y * 0.03 + i * 1.3 + t * 0.8) * 4;
        y === top ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 2 ? "rgba(244,240,232,.09)" : "rgba(0,0,0,.35)";
      ctx.lineWidth = i % 2 ? 1 : 2.5;
      ctx.stroke();
    }
    // sheen
    const sx = W * 0.5 + Math.sin(t * 0.35) * W * 0.06;
    const sheen = ctx.createRadialGradient(sx, H * 0.35, 0, sx, H * 0.35, H * 0.45);
    sheen.addColorStop(0, "rgba(244,240,232,.10)"); sheen.addColorStop(1, "rgba(244,240,232,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // hem stitch
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "rgba(229,72,43,.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let y = top + 8; y <= bot - 8; y += step) { const x = edgeR(y) - 7; y === top + 8 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ptr.s += (ptr.target - ptr.s) * Math.min(1, dt * 4);

    if (Math.random() < dt * 3.2) spawn();

    ctx.clearRect(0, 0, W, H);
    drawLedger();

    // incoming: ink dots with a fading tail along their lane
    for (const p of particles) {
      p.x += p.v * dt;
      const y = laneY(p.lane);
      const tail = ctx.createLinearGradient(p.x - 46, y, p.x, y);
      tail.addColorStop(0, "rgba(22,19,15,0)"); tail.addColorStop(1, "rgba(22,19,15,.45)");
      ctx.strokeStyle = tail; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Math.max(0, p.x - 46), y); ctx.lineTo(p.x, y); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, Math.PI * 2); ctx.fill();
      if (p.x >= edgeL(y)) { p.done = true; setTimeout(() => emerge(p.r), 500 + Math.random() * 1600); }
    }
    particles = particles.filter((p) => !p.done);

    drawCloth();

    // outgoing: signal dots drifting off with no trail
    for (const o of outs) {
      if (ptr.s > 0.05) {
        const dx = o.x - ptr.x, dy = o.y - ptr.y, d2 = dx * dx + dy * dy;
        if (d2 < 90 * 90 && d2 > 1) {
          const f = (ptr.s * 2600) / d2;
          o.vx += dx * f * dt; o.vy += dy * f * dt;
        }
      }
      o.x += o.vx * dt; o.y += o.vy * dt; o.vy *= 0.985;
      o.life = Math.max(0, 1 - (o.x - W * 0.62) / (W * 0.4));
      ctx.globalAlpha = Math.min(1, o.life * 1.4);
      ctx.fillStyle = SIGNAL;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = SIGNAL; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 4 + (1 - o.life) * 6, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.25; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    outs = outs.filter((o) => o.life > 0 && o.y > -10 && o.y < H + 10);

    if (!reduced && visible) requestAnimationFrame(frame);
  }

  resize();
  addEventListener("resize", resize);

  if (reduced) {
    // a single composed still frame
    for (let i = 0; i < 12; i++) particles.push({ x: Math.random() * W * 0.36, lane: i % LANES, v: 0, r: 3 });
    for (let i = 0; i < 9; i++) outs.push({ x: W * 0.66 + Math.random() * W * 0.28, y: H * 0.15 + Math.random() * H * 0.7, vx: 0, vy: 0, r: 3 + Math.random() * 2, life: 1 });
    frame(performance.now());
  } else {
    // pre-warm so the first paint isn't empty
    for (let i = 0; i < 10; i++) particles.push({ x: Math.random() * W * 0.38, lane: (Math.random() * LANES) | 0, v: 34 + Math.random() * 28, r: 2.4 + Math.random() * 1.8 });
    for (let i = 0; i < 6; i++) emerge(2.4 + Math.random() * 1.8), (outs[outs.length - 1].x += Math.random() * W * 0.3);
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
    }).observe(canvas);
    requestAnimationFrame(frame);
  }
})();
