// ★鸟妖「本体贴图消失」定谳探针 v3：像素在位率+死亡路径+debuff 染色路径
//   v2 定谳:35s 合成战斗 knifeHits=0/帧矩形 OOB=0/回退=0/accFail=0/MISS=0——
//   刀在该场景无罪。v3 补三个真实战斗差异面:
//   ①死亡路径(hurt 99999→死亡演出→gore) ②debuff 染色(colorRGBA→tintAtlas 烘焙面)
//   ③逐帧像素在位率(draws>0 但像素≈0 = 纹理/α/quad 面=分支③;replay2D raw=null=队列丢弃)
//   运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_harpy-vanish-census.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5221';
const BATTLE_MS = Number(process.env.BATTLE_MS || 45000);
const OUT = '/tmp/harpy-vanish';
fs.mkdirSync(OUT, { recursive: true });

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: console.log });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'harpyvanish', size: 'small', pinRandom: 20261006, log: console.log });
console.log('createGame:', made?.ok, made?.why || '');

await page.evaluate(() => {
  const g = window.__swGame;
  const gl = (g.world?.groundLevel ?? 300);
  const px = g.player.cx;
  const wy = (gl - 45) * 16;
  g.player.x = px; g.player.y = wy; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = px; g.camera.y = wy;
});
await sleep(600);

// —— 装仪 v3 ——
const inst = await page.evaluate(() => {
  const g = window.__swGame;
  const shim = g.renderer.bglEntShim;
  if (!shim) { globalThis.__hcErr = 'no-shim-instance'; return { ok: false }; }
  const proto = Object.getPrototypeOf(shim);
  const C = globalThis.__hc = {
    ok: true, frame: 0, calls: 0, knifeHits: 0, knifeByImg: {}, knifeSamples: [],
    oobSamples: [], fbByImg: {}, fbSamples: [], quadByImg: {}, harpyDrawFrames: 0, harpyCalls: 0,
    hf: {}, perFrame: [], miss: [], invisible: [], hurtErr: null,
    replay2D: 0, replayDrop: 0, degradeCalls: 0, degradeFalse: 0,
    deathLog: [], tintPhase: false,
  };

  const harpyImgs = new WeakSet();
  const names = new WeakMap(); let seq = 0;
  globalThis.__imgName = (img) => {
    if (!img) return 'null';
    let n = names.get(img);
    if (n) return n;
    try {
      if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
        const m = /([^/]+)$/.exec(img.src || ''); n = m ? decodeURIComponent(m[1]) : 'img#' + (++seq);
      } else if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
        n = 'cv' + img.width + 'x' + img.height + '#' + (++seq);
      } else if (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) {
        n = 'osc' + img.width + 'x' + img.height + '#' + (++seq);
      } else {
        n = 'bmp' + (img.width ?? '?') + 'x' + (img.height ?? '?') + '#' + (++seq);
      }
    } catch { n = 'unk#' + (++seq); }
    names.set(img, n);
    return n;
  };
  C.tryResolveHarpy = () => {
    if (C.harpyImg) return true;
    const himg = g.renderer.atlas?.ensureVImage?.('vanilla/NPC_48.png');
    if (himg && himg.width > 0) {
      harpyImgs.add(himg);
      C.harpyImg = true; C.harpyImgName = globalThis.__imgName(himg);
      C.harpyDims = { w: himg.width, h: himg.height };
      return true;
    }
    return false;
  };
  const isHarpy = (img) => harpyImgs.has(img) || (C.harpyImgName && img && globalThis.__imgName(img) === C.harpyImgName);
  globalThis.__hcIsHarpy = isHarpy;

  globalThis.__SW_SRC_OOB_NOOP_OFF = false;
  const knifeGate = (img, rest) => {
    const n = rest.length;
    const iw = img?.width ?? 0, ih = img?.height ?? 0;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (n === 8) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    if (!globalThis.__SW_SRC_OOB_NOOP_OFF && sw > 0 && sh > 0 && Number.isFinite(sx) && Number.isFinite(sy)
      && (sx >= iw || sx + sw <= 0 || sy >= ih || sy + sh <= 0)) {
      return { sx, sy, sw, sh, iw, ih };
    }
    return null;
  };

  const wrapDraw = (orig, label) => function (img, ...rest) {
    C.calls++;
    const f = C.frame;
    const hp = isHarpy(img);
    const cur = hp ? (C.hf[f] ??= { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0 }) : null;
    if (hp) C.harpyCalls++;
    const hit = knifeGate(img, rest);
    if (hit) {
      C.knifeHits++;
      const nm = globalThis.__imgName(img);
      C.knifeByImg[nm] = (C.knifeByImg[nm] || 0) + 1;
      if (cur) { cur.knife++; cur.draws++; }
      if (C.knifeSamples.length < 48) {
        C.knifeSamples.push({ f, via: label, img: nm, iw: hit.iw, ih: hit.ih, sx: hit.sx, sy: hit.sy, sw: hit.sw, sh: hit.sh,
          n: rest.length, ga: +this.ga, gco: this.gco, acc: !!this.accMode });
      }
      return;
    }
    if (hp && rest.length === 8) {
      const iw = img?.width ?? 0, ih = img?.height ?? 0;
      const [sx, sy, sw, sh] = rest;
      if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih)
        && Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sw) && Number.isFinite(sh)) {
        if (cur) cur.oob++;
        if (C.oobSamples.length < 24) C.oobSamples.push({ f, sx, sy, sw, sh, iw, ih });
      }
      if (cur && cur.draws === 0) C.harpyDrawFrames++;
      // α 异常采样（NaN/≤0.02 globalAlpha=quad 不可见面）
      const ga = +this.ga;
      if (cur && (!Number.isFinite(ga) || ga <= 0.02)) cur.gaBad++;
    }
    if (cur) cur.draws++;
    return orig.call(this, img, ...rest);
  };
  if (!shim.boundBuilt) { try { shim.wrap(); } catch { } }
  if (shim.bound && shim.bound.drawImage) {
    const origBound = shim.bound.drawImage;
    shim.bound.drawImage = wrapDraw(origBound, 'bound');
  }
  const origProtoDraw = proto.drawImage;
  proto.drawImage = wrapDraw(origProtoDraw, 'proto');

  const origRaw = proto.rawDrawImage;
  proto.rawDrawImage = function (img, rest, why) {
    const cur = isHarpy(img) ? (C.hf[C.frame] ??= { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0 }) : null;
    if (cur) { cur.fb++; cur.draws++; }
    if (C.fbSamples.length < 12) C.fbSamples.push({ f: C.frame, why, img: globalThis.__imgName(img) });
    return origRaw.call(this, img, rest, why);
  };

  const origPush = proto.push;
  proto.push = function (tier, e, solid, img, ...tail) {
    if (isHarpy(img)) (C.hf[C.frame] ??= { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0 }).quads++;
    return origPush.call(this, tier, e, solid, img, ...tail);
  };

  // replay2D 丢弃检测（acc 态 raw=null → popAll=静默弃队）
  if (proto.replay2D) {
    const origR2 = proto.replay2D;
    proto.replay2D = function (...a) {
      C.replay2D++;
      const drop = !this.raw;
      if (drop) C.replayDrop++;
      return origR2.apply(this, a);
    };
  }
  // degradeAcc 调用账（host）
  if (typeof g.renderer.degradeAcc === 'function') {
    const origDA = g.renderer.degradeAcc.bind(g.renderer);
    g.renderer.degradeAcc = (...a) => {
      C.degradeCalls++;
      const r = origDA(...a);
      if (!r) C.degradeFalse++;
      return r;
    };
  }

  // —— 像素在位率仪（主画布 bbox 采样,与天空角基色差分） ——
  const pcv = document.createElement('canvas'); pcv.width = 128; pcv.height = 128;
  const pctx = pcv.getContext('2d', { willReadFrequently: true });
  globalThis.__harpyPresence = (scr) => {
    try {
      const main = g.renderer.canvas;
      const x = Math.max(0, Math.round(scr[0] - 40)), y = Math.max(0, Math.round(scr[1] - 40));
      const w = Math.min(80, main.width - x), h = Math.min(80, main.height - y);
      if (w < 40 || h < 40) return null;
      pctx.drawImage(main, x, y, w, h, 0, 0, w, h);
      const d = pctx.getImageData(0, 0, w, h).data;
      const at = (i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
      const c0 = at(0), c1 = at(w - 1), c2 = at((h - 1) * w), c3 = at(h * w - 1);
      let diff = 0;
      for (let i = 0; i < w * h; i++) {
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
        const dr = Math.min(Math.abs(r - c0[0]), Math.abs(r - c1[0]), Math.abs(r - c2[0]), Math.abs(r - c3[0]));
        const dg = Math.min(Math.abs(gg - c0[1]), Math.abs(gg - c1[1]), Math.abs(gg - c2[1]), Math.abs(gg - c3[1]));
        const db = Math.min(Math.abs(b - c0[2]), Math.abs(b - c1[2]), Math.abs(b - c2[2]), Math.abs(b - c3[2]));
        if (dr > 44 || dg > 44 || db > 44) diff++;
      }
      return diff / (w * h);
    } catch { return null; }
  };

  if (!g.__origFrameH) {
    g.__origFrameH = g.frame;
    g.frame = function (...a) {
      C.frame++;
      const f = C.frame;
      if ((f & 63) === 0) C.tryResolveHarpy();
      const r = g.__origFrameH.apply(this, a);
      if ((f % 3) === 0) {
        const cam = g.camera;
        const W = g.renderer.canvas?.width ?? 1280, H = g.renderer.canvas?.height ?? 800;
        const hs = [];
        for (const e of (g.entities?.enemies ?? [])) {
          if (e?.vanillaId !== 48) continue;
          const scr = cam.worldToScreen(e.cx, e.cy);
          const onScreen = scr[0] > -100 && scr[0] < W + 100 && scr[1] > -100 && scr[1] < H + 100;
          const cur = C.hf[f] ?? { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0 };
          const pres = onScreen && !e.dead ? globalThis.__harpyPresence(scr) : null;
          const rec = {
            id: e.id, alive: !e.dead, life: Math.round(e.hp), iframes: e.iframes ?? 0,
            spawnA: e.spawnAlpha, facing: e.facing, scr: [Math.round(scr[0]), Math.round(scr[1])], onScreen,
            draws: cur.draws, quads: cur.quads, fb: cur.fb, knife: cur.knife, oob: cur.oob, gaBad: cur.gaBad,
            pres: pres == null ? null : +pres.toFixed(4),
            tint: e.colorRGBA ? e.colorRGBA.map((v) => +(+v).toFixed(2)) : null,
            tintPhase: !!C.tintPhase,
          };
          hs.push(rec);
          if (!e.dead && onScreen && (e.spawnAlpha ?? 255) >= 250) {
            if (cur.draws === 0 && cur.quads === 0 && cur.fb === 0) {
              C.miss.push({ f, ...rec });
              if (C.miss.length > 400) C.miss.shift();
            } else if (pres != null && pres < 0.02 && (f % 30 === 0)) {
              C.invisible.push({ f, ...rec });   // draws>0 但像素≈0（伤害数字噪声窗口外）
              if (C.invisible.length > 400) C.invisible.shift();
            }
          }
        }
        if (hs.length) { C.perFrame.push({ f, flushes: shim.stats?.flushes ?? -1, fallback: shim.stats?.fallback ?? -1, harpies: hs }); if (C.perFrame.length > 6000) C.perFrame.shift(); }
      }
      C.hf = {};
      return r;
    };
  }
  return { ok: true, boundPatched: !!(shim.bound && shim.bound.drawImage), harpyResolved: !!C.harpyImg, accMode: !!shim.accMode };
});
console.log('instrument:', JSON.stringify(inst));
if (!inst?.ok) { console.error('install fail:', await page.evaluate(() => globalThis.__hcErr || 'unknown')); await page.browser().close(); process.exit(1); }

// —— 生成 8 只鸟妖 ——
const spawn = await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  const out = [];
  for (let i = 0; i < 8; i++) {
    const e = await window.__swFlow.spawnVanillaEnemy(48, px - 260 + i * 75, py - 40 - (i % 3) * 70);
    out.push(e ? (e.id ?? true) : null);
  }
  return out;
});
console.log('spawn 8x harpy:', JSON.stringify(spawn));
await sleep(1200);

// —— 阶段A:战斗 soak（轮换 hurt） ——
await page.evaluate(() => {
  globalThis.__hcIdx = 0;
  globalThis.__hcTimer = setInterval(() => {
    const g = window.__swGame;
    if (!g || g.paused) return;
    const hs = (g.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead);
    for (const e of hs) { const mx = e.maxHp ?? e.def?.hp ?? 100; if (!(e.hp > mx * 0.55)) e.hp = mx; }
    if (g.player && g.player.hp < (g.player.maxHp ?? 100)) g.player.hp = g.player.maxHp ?? 100;
    if (!hs.length) return;
    globalThis.__hcIdx = (globalThis.__hcIdx + 1) % hs.length;
    const e = hs[globalThis.__hcIdx];
    try { e.hurt(18, Math.random() < 0.5 ? 6 : -6, -3, g, 0, Math.random() < 0.2, 0, true); } catch (err) { globalThis.__hc.hurtErr = String(err); }
  }, 300);
});
console.log('== 阶段A:战斗 soak', BATTLE_MS, 'ms ==');
const t0 = Date.now();
let lastBad = 0, shotN = 0;
while (Date.now() - t0 < BATTLE_MS) {
  await sleep(700);
  const st = await page.evaluate(() => {
    const C = globalThis.__hc;
    return { miss: C.miss.length, inv: C.invisible.length, knife: C.knifeHits, replayDrop: C.replayDrop,
      lastMiss: C.miss[C.miss.length - 1] || null, lastInv: C.invisible[C.invisible.length - 1] || null };
  });
  const bad = st.miss + st.inv;
  if (bad > lastBad) {
    lastBad = bad;
    const m = st.lastInv || st.lastMiss;
    if (m) {
      const pad = 50, vw = page.viewport()?.width ?? 1280, vh = page.viewport()?.height ?? 800;
      const clip = { x: Math.max(0, m.scr[0] - pad), y: Math.max(0, m.scr[1] - pad), width: Math.min(vw - Math.max(0, m.scr[0] - pad), 2 * pad), height: Math.min(vh - Math.max(0, m.scr[1] - pad), 2 * pad) };
      try {
        const buf = await page.screenshot({ type: 'png', clip });
        fs.writeFileSync(`${OUT}/bad-${st.lastInv ? 'inv' : 'miss'}-f${m.f}-id${m.id}.png`, buf);
        console.log('BAD shot:', JSON.stringify(st.lastInv ? st.lastInv : st.lastMiss));
      } catch { }
    }
  }
}
await page.evaluate(() => { if (globalThis.__hcTimer) clearInterval(globalThis.__hcTimer); });

// —— 阶段B:debuff 染色窗（colorRGBA 挂 5s） ——
console.log('== 阶段B:debuff 染色窗 ==');
await page.evaluate(() => { globalThis.__hc.tintPhase = true; });
await page.evaluate(() => {
  const g = window.__swGame;
  const hs = (g.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead);
  for (const e of hs) e.colorRGBA = [255, 96, 32, 200];
});
await sleep(5000);
await page.evaluate(() => {
  const g = window.__swGame;
  (g.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48).forEach((e) => { e.colorRGBA = null; });
  globalThis.__hc.tintPhase = false;
});

// —— 阶段C:死亡路径（逐杀 3 只,死亡演出帧账） ——
console.log('== 阶段C:死亡路径 ==');
for (let k = 0; k < 3; k++) {
  const kill = await page.evaluate((kk) => {
    const g = window.__swGame;
    const e = (g.entities?.enemies ?? []).filter((x) => x?.vanillaId === 48 && !x.dead)[0];
    if (!e) return { ok: false };
    const C = globalThis.__hc;
    C.deathLog.push({ k: kk, id: e.id, f0: C.frame });
    const r = e.hurt(99999, 4, -2, g, 0, false, 0, true);
    return { ok: true, id: e.id, ret: !!r, dead: !!e.dead, life: e.hp };
  }, k);
  await sleep(1500);
  console.log('kill', k, JSON.stringify(kill));
}

// —— 总账 ——
const battleOut = await page.evaluate(() => {
  const g = window.__swGame;
  const C = globalThis.__hc;
  const shim = g.renderer.bglEntShim;
  const pf = C.perFrame;
  const sum = (k) => pf.reduce((a, x) => a + x.harpies.reduce((b, h) => b + (h[k] || 0), 0), 0);
  const presVals = pf.flatMap((x) => x.harpies.filter((h) => h.pres != null && h.alive).map((h) => h.pres));
  presVals.sort((a, b) => a - b);
  const q = (p) => presVals.length ? presVals[Math.min(presVals.length - 1, Math.floor(presVals.length * p))] : null;
  const deathFrames = C.deathLog.map((d) => {
    const fr = pf.filter((x) => x.f >= d.f0 && x.f < d.f0 + 150);
    return { k: d.k, id: d.id, frames: fr.length,
      draws: fr.reduce((a, x) => a + x.harpies.filter((h) => h.id === d.id).reduce((b, h) => b + h.draws, 0), 0),
      aliveFrames: fr.filter((x) => x.harpies.some((h) => h.id === d.id && h.alive)).length,
      pres: fr.map((x) => x.harpies.find((h) => h.id === d.id)).filter((h) => h && h.pres != null).map((h) => h.pres).slice(0, 20) };
  });
  return {
    frames: C.frame, calls: C.calls, harpyCalls: C.harpyCalls, harpyDrawFrames: C.harpyDrawFrames,
    harpyDraws: sum('draws'), harpyQuads: sum('quads'), harpyFb: sum('fb'), harpyKnife: sum('knife'),
    harpyOob: sum('oob'), harpyGaBad: sum('gaBad'),
    knifeHits: C.knifeHits, knifeByImg: C.knifeByImg, knifeSamples: C.knifeSamples.slice(0, 10),
    oobSamples: C.oobSamples.slice(0, 10),
    fbSamples: C.fbSamples.slice(0, 8),
    missCount: C.miss.length, miss: C.miss.slice(0, 12),
    invisibleCount: C.invisible.length, invisible: C.invisible.slice(0, 12),
    hurtErr: C.hurtErr, replay2D: C.replay2D, replayDrop: C.replayDrop, degradeCalls: C.degradeCalls, degradeFalse: C.degradeFalse,
    deathFrames,
    presence: { n: presVals.length, p01: q(0.01), p05: q(0.05), p50: q(0.5), min: presVals[0] ?? null },
    accFailLedger: Object.fromEntries(Object.entries(shim?.constructor?.accFailLedger ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    degradeOps: Object.fromEntries(Object.entries(shim?.constructor?.degradeOps ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    harpiesAlive: (g.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead).length,
  };
});
console.log('== 总账 ==');
console.log(JSON.stringify(battleOut, null, 1));
console.log('shots dir:', OUT);
await page.browser().close();
