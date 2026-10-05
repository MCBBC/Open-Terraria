// ★鸟妖「本体贴图消失」定谳探针 v5：push 计数修复(v4 丢了 push 包装=quads 恒 0 伪象)
//   + GL 层探测(quadSprite/endAccumulate 逐帧计数)+零在位窗快速截图(150ms 轮询)
//   v4 定谳:draws=8/零在位(pres≈0)窗在三次运行均现(p01≈0~1%),fb=knife=zero=gaBad
//   =ras=0,per-call stats delta≠0 → quad 已推、像素缺席=GL 面下游。
//   运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_harpy-realgun-census.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5221';
const BATTLE_MS = Number(process.env.BATTLE_MS || 180000);
const OUT = '/tmp/harpy-vanish';
fs.mkdirSync(OUT, { recursive: true });

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: console.log });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'harpygun', size: 'small', pinRandom: 20261006, log: console.log });
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

const inst = await page.evaluate(() => {
  const g = window.__swGame;
  const shim = g.renderer.bglEntShim;
  if (!shim) { globalThis.__hcErr = 'no-shim-instance'; return { ok: false }; }
  const SELF = shim;
  const proto = Object.getPrototypeOf(shim);
  const C = globalThis.__hc = {
    ok: true, frame: 0, calls: 0, knifeHits: 0, knifeByImg: {}, knifeSamples: [],
    oobSamples: [], fbSamples: [], harpyDrawFrames: 0, harpyCalls: 0,
    hf: {}, perFrame: [], miss: [], zeroPres: [], hurtErr: null,
    rasCalls: 0, rasHarpy: 0,
    // GL 层账（逐帧差分入 perFrame）
    glwQuad: 0, glwEndAcc: 0, glwTexUpload: 0,
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

  // —— drawImage 前门（bound 表+proto 双挂,防 buildBound 旁路/双计:bound 补丁的
  //    orig 是未包装原函数,proto 补丁兜未来实例;单次调用只经一条入口） ——
  const wrapDraw = (orig, label) => function (img, ...rest) {
    C.calls++;
    const f = C.frame;
    const hp = isHarpy(img);
    const cur = hp ? (C.hf[f] ??= { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0, zero: 0 }) : null;
    if (hp) C.harpyCalls++;
    const hit = knifeGate(img, rest);
    if (hit) {
      C.knifeHits++;
      const nm = globalThis.__imgName(img);
      C.knifeByImg[nm] = (C.knifeByImg[nm] || 0) + 1;
      if (cur) { cur.knife++; cur.draws++; }
      if (C.knifeSamples.length < 48) {
        C.knifeSamples.push({ f, via: label, img: nm, iw: hit.iw, ih: hit.ih, sx: hit.sx, sy: hit.sy, sw: hit.sw, sh: hit.sh,
          n: rest.length, ga: +SELF.ga, gco: SELF.gco, acc: !!SELF.accMode });
      }
      return;
    }
    if (hp) {
      const n = rest.length;
      let sw0 = 0, sh0 = 0, dw0 = 0, dh0 = 0;
      if (n === 2) { sw0 = img?.width; sh0 = img?.height; dw0 = img?.width; dh0 = img?.height; }
      else if (n === 4) { sw0 = img?.width; sh0 = img?.height; dw0 = rest[2]; dh0 = rest[3]; }
      else if (n === 8) { sw0 = rest[2]; sh0 = rest[3]; dw0 = rest[6]; dh0 = rest[7]; }
      if (sw0 === 0 || sh0 === 0 || dw0 === 0 || dh0 === 0) cur.zero++;
      if (rest.length === 8) {
        const iw = img?.width ?? 0, ih = img?.height ?? 0;
        const [sx, sy, sw, sh] = rest;
        if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih)
          && Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sw) && Number.isFinite(sh)) {
          cur.oob++;
          if (C.oobSamples.length < 24) C.oobSamples.push({ f, sx, sy, sw, sh, iw, ih });
        }
        if (cur.draws === 0) C.harpyDrawFrames++;
        const ga = +SELF.ga;
        if (!Number.isFinite(ga) || ga <= 0.02) cur.gaBad++;
      }
      cur.draws++;
    }
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
    const cur = isHarpy(img) ? (C.hf[C.frame] ??= { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0, zero: 0 }) : null;
    if (cur) { cur.fb++; cur.draws++; }
    if (C.fbSamples.length < 12) C.fbSamples.push({ f: C.frame, why, img: globalThis.__imgName(img) });
    return origRaw.call(this, img, rest, why);
  };

  // ★push 计数（v4 丢失的包装恢复——v3 曾证 quads==draws 1:1）
  const origPush = proto.push;
  proto.push = function (tier, e, solid, img, ...tail) {
    if (isHarpy(img)) (C.hf[C.frame] ??= { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0, zero: 0 }).quads++;
    return origPush.call(this, tier, e, solid, img, ...tail);
  };

  if (proto.rasterizeDrawImage) {
    const origRas = proto.rasterizeDrawImage;
    proto.rasterizeDrawImage = function (img, rest) {
      C.rasCalls++;
      if (isHarpy(img)) C.rasHarpy++;
      return origRas.call(this, img, rest);
    };
  }

  // —— GL 层探测：quadSprite 逐帧计数 + endAccumulate（FBO 收帧/present） ——
  const glw = shim.glw ?? shim['glw'] ?? null;
  let glwPatched = false;
  const glwTarget = glw ?? (proto.constructor.name === 'GLShimExecutor' ? null : null);
  const tryPatchGlw = () => {
    const w = SELF.glw ?? SELF['glw'];
    if (!w || glwPatched) return !!w;
    glwPatched = true;
    const wp = Object.getPrototypeOf(w);
    if (wp.quadSprite) {
      const origQ = wp.quadSprite;
      wp.quadSprite = function (...a) {
        C.glwQuad++;
        return origQ.apply(this, a);
      };
    }
    if (wp.endAccumulate) {
      const origEA = wp.endAccumulate;
      wp.endAccumulate = function (...a) {
        C.glwEndAcc++;
        return origEA.apply(this, a);
      };
    }
    return true;
  };
  tryPatchGlw();
  globalThis.__tryPatchGlw = tryPatchGlw;

  // —— 像素在位率仪（主画布 bbox 与天空角基色差分） ——
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
      if ((f & 63) === 0) { C.tryResolveHarpy(); globalThis.__tryPatchGlw?.(); }
      const q0 = C.glwQuad, e0 = C.glwEndAcc, u0 = C.glwTexUpload;
      const r = g.__origFrameH.apply(this, a);
      if ((f % 3) === 0) {
        const cam = g.camera;
        const W = g.renderer.canvas?.width ?? 1280, H = g.renderer.canvas?.height ?? 800;
        const hs = [];
        for (const e of (g.entities?.enemies ?? [])) {
          if (e?.vanillaId !== 48) continue;
          const scr = cam.worldToScreen(e.cx, e.cy);
          const onScreen = scr[0] > -100 && scr[0] < W + 100 && scr[1] > -100 && scr[1] < H + 100;
          const cur = C.hf[f] ?? { draws: 0, quads: 0, fb: 0, knife: 0, oob: 0, gaBad: 0, zero: 0 };
          const pres = onScreen && !e.dead ? globalThis.__harpyPresence(scr) : null;
          const rec = {
            id: e.id, alive: !e.dead, life: Math.round(e.hp), iframes: e.iframes ?? 0,
            facing: e.facing, scr: [Math.round(scr[0]), Math.round(scr[1])], onScreen,
            draws: cur.draws, quads: cur.quads, fb: cur.fb, knife: cur.knife, oob: cur.oob,
            gaBad: cur.gaBad, zero: cur.zero,
            pres: pres == null ? null : +pres.toFixed(4),
          };
          hs.push(rec);
          if (!e.dead && onScreen && pres != null && pres < 0.02 && cur.draws > 0) {
            C.zeroPres.push({
              f, ...rec,
              acc: !!SELF.accMode, filter: SELF.filterV, gco: SELF.gco, ga: +SELF.ga,
              glwQ: C.glwQuad - q0, glwEA: C.glwEndAcc - e0,
              path: g.renderer.bglPathUsed ?? null,
              rasH: C.rasHarpy,
            });
            if (C.zeroPres.length > 120) C.zeroPres.shift();
          }
        }
        if (hs.length) {
          C.perFrame.push({ f, harpies: hs, glwQ: C.glwQuad - q0, glwEA: C.glwEndAcc - e0 });
          if (C.perFrame.length > 9000) C.perFrame.shift();
        }
      }
      C.hf = {};
      return r;
    };
  }
  return { ok: true, boundPatched: !!(shim.bound && shim.bound.drawImage), harpyResolved: !!C.harpyImg,
    accMode: !!shim.accMode, glwPatched };
});
console.log('instrument:', JSON.stringify(inst));
if (!inst?.ok) { console.error('install fail:', await page.evaluate(() => globalThis.__hcErr || 'unknown')); await page.browser().close(); process.exit(1); }

// —— 给枪+弹（Minishark 98 + 火枪弹 97 弹药槽 54） ——
await page.evaluate(() => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const inv = g.player.inv;
  inv.slots[0] = { id: flow.itemByVid(98), stack: 1 };
  inv.slots[54] = { id: flow.itemByVid(97), stack: 9999 };
  inv.selected = 0;
});

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

// —— 真武器战斗：按住左键+准星对最近鸟妖;保活+补弹+补员 ——
const { aimAt, mouseHold } = await import('../tools/probe/lib/world.mjs');
await mouseHold(page, true);

const t0 = Date.now();
let lastBad = 0, shotN = 0, poll = 0;
while (Date.now() - t0 < BATTLE_MS) {
  await sleep(150);
  poll++;
  const st = await page.evaluate(() => {
    const C = globalThis.__hc;
    const z = C.zeroPres[C.zeroPres.length - 1] || null;
    return { zp: C.zeroPres.length, last: z, alive: (window.__swGame.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead).length };
  });
  if (st.alive < 3) {
    await page.evaluate(async () => {
      const g = window.__swGame;
      const px = g.player.cx, py = g.player.cy;
      for (let i = 0; i < 3; i++) await window.__swFlow.spawnVanillaEnemy(48, px - 200 + i * 150, py - 80);
    });
  }
  const tgt = await page.evaluate(() => {
    const g = window.__swGame;
    const hs = (g.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead);
    for (const e of hs) { const mx = e.maxHp ?? e.def?.hp ?? 100; if (!(e.hp > mx * 0.5)) e.hp = mx; }
    if (g.player && g.player.hp < (g.player.maxHp ?? 100)) g.player.hp = g.player.maxHp ?? 100;
    const inv = g.player.inv;
    if (inv.slots[54] && inv.slots[54].stack < 500) inv.slots[54].stack = 9999;
    if (!hs.length) return null;
    hs.sort((a, b) => (Math.abs(a.cx - g.player.cx) + Math.abs(a.cy - g.player.cy)) - (Math.abs(b.cx - g.player.cx) + Math.abs(b.cy - g.player.cy)));
    return { cx: hs[0].cx, cy: hs[0].cy };
  });
  if (tgt) await aimAt(page, tgt.cx, tgt.cy);
  if (st.zp > lastBad) {
    lastBad = st.zp;
    const m = st.last;
    if (m) {
      const pad = 50, vw = page.viewport()?.width ?? 1280, vh = page.viewport()?.height ?? 800;
      const clip = { x: Math.max(0, m.scr[0] - pad), y: Math.max(0, m.scr[1] - pad), width: Math.min(vw - Math.max(0, m.scr[0] - pad), 2 * pad), height: Math.min(vh - Math.max(0, m.scr[1] - pad), 2 * pad) };
      try {
        const buf = await page.screenshot({ type: 'png', clip });
        fs.writeFileSync(`${OUT}/v5-zp-f${m.f}-id${m.id}-${++shotN}.png`, buf);
        console.log('ZP shot:', JSON.stringify(m));
      } catch { }
    }
  }
  if (poll % 60 === 0) console.log('poll', poll, JSON.stringify({ zp: st.zp, alive: st.alive }));
}
await page.evaluate(() => { globalThis.__gunTimer && clearInterval(globalThis.__gunTimer); });

const battleOut = await page.evaluate(() => {
  const g = window.__swGame;
  const C = globalThis.__hc;
  const shim = g.renderer.bglEntShim;
  const pf = C.perFrame;
  const sum = (k) => pf.reduce((a, x) => a + x.harpies.reduce((b, h) => b + (h[k] || 0), 0), 0);
  const presVals = pf.flatMap((x) => x.harpies.filter((h) => h.pres != null && h.alive).map((h) => h.pres));
  presVals.sort((a, b) => a - b);
  const q = (p) => presVals.length ? presVals[Math.min(presVals.length - 1, Math.floor(presVals.length * p))] : null;
  return {
    frames: C.frame, calls: C.calls, harpyCalls: C.harpyCalls, harpyDrawFrames: C.harpyDrawFrames,
    harpyDraws: sum('draws'), harpyQuads: sum('quads'), harpyFb: sum('fb'), harpyKnife: sum('knife'),
    harpyOob: sum('oob'), harpyGaBad: sum('gaBad'), harpyZero: sum('zero'),
    knifeHits: C.knifeHits, knifeByImg: C.knifeByImg, knifeSamples: C.knifeSamples.slice(0, 10),
    oobSamples: C.oobSamples.slice(0, 10),
    fbSamples: C.fbSamples.slice(0, 8),
    zeroPresCount: C.zeroPres.length, zeroPres: C.zeroPres.slice(0, 30),
    rasCalls: C.rasCalls, rasHarpy: C.rasHarpy,
    glwQuadTotal: C.glwQuad, glwEndAccTotal: C.glwEndAcc,
    presence: { n: presVals.length, p00_1: q(0.001), p01: q(0.01), p05: q(0.05), p50: q(0.5), min: presVals[0] ?? null },
    accFailLedger: Object.fromEntries(Object.entries(shim?.constructor?.accFailLedger ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 12)),
    degradeOps: Object.fromEntries(Object.entries(shim?.constructor?.degradeOps ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 12)),
  };
});
console.log('== v5 总账 ==');
console.log(JSON.stringify(battleOut, null, 1));
console.log('shots dir:', OUT);
await page.browser().close();
