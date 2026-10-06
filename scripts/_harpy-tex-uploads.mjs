// ★鸟妖「本体消失」v7：GL 纹理面上探——texFromRegion 鸟妖键重传节奏+层重建账
//   v6 定谳:零在位窗=鸟妖 sheet quad 落空（血条/数字等 WHITE 纹理实心 quad 同帧正常）
//   假说:区域纹理在某个上传窗口拿到空/坏像素后被 texCache 按键钉死→整组隐形,
//   直到 LRU 逐出/层重建重传自愈。运行:
//   SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_harpy-tex-uploads.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5221';
const BATTLE_MS = Number(process.env.BATTLE_MS || 150000);
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
  const C = globalThis.__hc = {
    ok: true, frame: 0, uploads: [], uploadTotal: 0, layerNew: 0, layerDisposed: 0,
    unpresent: [], zero: [], harpyImgs: [],
  };
  const names = new WeakMap(); let seq = 0;
  const imgName = (img) => {
    if (!img) return 'null';
    let n = names.get(img);
    if (n) return n;
    try {
      if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
        const m = /([^/]+)$/.exec(img.src || ''); n = m ? decodeURIComponent(m[1]) : 'img#' + (++seq);
      } else if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
        n = 'cv' + img.width + 'x' + img.height + '#' + (++seq);
      } else n = 'bmp' + (img.width ?? '?') + 'x' + (img.height ?? '?') + '#' + (++seq);
    } catch { n = 'unk#' + (++seq); }
    names.set(img, n);
    return n;
  };
  // 鸟妖贴图身份（懒）
  globalThis.__resolveH = () => {
    const himg = g.renderer.atlas?.ensureVImage?.('vanilla/NPC_48.png');
    if (himg && himg.width > 0 && !C.himg) { C.himg = himg; C.himgName = imgName(himg); }
    return C.himg ?? null;
  };
  const isHarpy = (img) => C.himg && img === C.himg;

  // GLSpriteLayer.prototype 层面补丁（覆盖宿主持有的所有层实例）
  const W = window;
  const GLSL = (() => {
    // 从 shim 宿主拿一个实例的 proto
    const shim = g.renderer.bglEntShim;
    const w = shim && (shim.glw ?? shim['glw'] ?? (shim.host && (shim.host['_accGlw'] ?? shim.host['glw'])));
    if (w) return Object.getPrototypeOf(w).constructor;
    return null;
  })();
  C.glslFound = !!GLSL;
  if (GLSL) {
    const gp = GLSL.prototype;
    if (gp.texFromRegion) {
      const orig = gp.texFromRegion;
      gp.texFromRegion = function (key, img, sx, sy, sw, sh) {
        const e = orig.call(this, key, img, sx, sy, sw, sh);
        if (e) {
          C.uploadTotal++;
          if (isHarpy(img) || (C.himgName && String(key).includes('er:'))) {
            // 只记 harpy sheet 的 er: 键（尺寸指纹 100x86 或 img 命中）
            const harpy = isHarpy(img) || (img && img.width === 100 && img.height === 516);
            if (harpy) {
              C.uploads.push({ f: C.frame, key, ok: !!e, w: this.w, h: this.h });
              if (C.uploads.length > 200) C.uploads.shift();
            }
          }
        }
        return e;
      };
    }
    // 层重建/释放账
    const origDispose = gp.dispose;
    if (origDispose) {
      gp.dispose = function (...a) { C.layerDisposed++; return origDispose.apply(this, a); };
    }
  }
  // 层新建账:宿主 acquireGl 包裹
  const host = g.renderer.bglEntShim?.host;
  if (host && typeof host.acquireGl === 'function') {
    const origA = host.acquireGl.bind(host);
    host.acquireGl = (...a) => {
      const w = origA(...a);
      if (w && w !== C.lastGlw) { C.layerNew++; C.lastGlw = w; }
      return w;
    };
  }
  // Renderer._accGlw 轮询补丁（acc 层在宿主上）
  if (!C.accGlwPatched) {
    const tryPatch = () => {
      const w = g.renderer['_accGlw'];
      if (w && !C['__p_' + (w.uid ?? 'x')]) {
        C['__p_' + (w.uid ?? 'x')] = true;
        const wp = Object.getPrototypeOf(w);
        if (wp.texFromRegion && !C.tfrPatched) {
          C.tfrPatched = true;
          const orig = wp.texFromRegion;
          wp.texFromRegion = function (key, img, sx, sy, sw, sh) {
            const e = orig.call(this, key, img, sx, sy, sw, sh);
            if (e && (isHarpy(img) || (img && img.width === 100 && img.height === 516))) {
              C.uploadTotal++;
              C.uploads.push({ f: C.frame, key, w: this.w, h: this.h });
              if (C.uploads.length > 200) C.uploads.shift();
            }
            return e;
          };
        }
        if (wp.dispose && !C.dispPatched) {
          C.dispPatched = true;
          const od = wp.dispose;
          wp.dispose = function (...a) { C.layerDisposed++; return od.apply(this, a); };
        }
        return true;
      }
      return false;
    };
    C.tryPatch = tryPatch;
  }

  // 像素在位率仪（同 v5）+ 鸟妖血条可见性对照
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
        const dr = Math.min(Math.abs(r - c0[0]), Math.abs(r - c1[0]), Math.abs(r - c1[0]), Math.abs(r - c2[0]), Math.abs(r - c3[0]));
        const dg = Math.min(Math.abs(gg - c0[1]), Math.abs(gg - c1[1]), Math.abs(gg - c2[1]), Math.abs(gg - c3[1]));
        const db = Math.min(Math.abs(b - c0[2]), Math.abs(b - c1[2]), Math.abs(b - c2[2]), Math.abs(b - c3[2]));
        if (dr > 44 || dg > 44 || db > 44) diff++;
      }
      return diff / (w * h);
    } catch { return null; }
  };

  if (!g.__origFrameH7) {
    g.__origFrameH7 = g.frame;
    g.frame = function (...a) {
      C.frame++;
      const f = C.frame;
      if ((f & 31) === 0) { globalThis.__resolveH(); C.tryPatch?.(); }
      const r = g.__origFrameH7.apply(this, a);
      if ((f % 3) === 0) {
        const cam = g.camera;
        const W2 = g.renderer.canvas?.width ?? 1280, H2 = g.renderer.canvas?.height ?? 800;
        for (const e of (g.entities?.enemies ?? [])) {
          if (e?.vanillaId !== 48 || e.dead) continue;
          const scr = cam.worldToScreen(e.cx, e.cy);
          const onScreen = scr[0] > 0 && scr[0] < W2 && scr[1] > 0 && scr[1] < H2;
          if (!onScreen) continue;
          const pres = globalThis.__harpyPresence(scr);
          if (pres != null && pres < 0.02) {
            C.zero.push({ f, id: e.id, scr: [Math.round(scr[0]), Math.round(scr[1])], pres: +pres.toFixed(4) });
            if (C.zero.length > 200) C.zero.shift();
          }
        }
      }
      return r;
    };
  }
  return { ok: true, glslFound: C.glslFound };
});
console.log('instrument:', JSON.stringify(inst));
if (!inst?.ok) { console.error('fail'); await page.browser().close(); process.exit(1); }

await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const inv = g.player.inv;
  inv.slots[0] = { id: flow.itemByVid(98), stack: 1 };
  inv.slots[54] = { id: flow.itemByVid(97), stack: 9999 };
  inv.selected = 0;
  const px = g.player.cx, py = g.player.cy;
  const out = [];
  for (let i = 0; i < 8; i++) {
    const e = await window.__swFlow.spawnVanillaEnemy(48, px - 260 + i * 75, py - 40 - (i % 3) * 70);
    out.push(e ? (e.id ?? true) : null);
  }
  return out;
});
await sleep(1200);

const { aimAt, mouseHold } = await import('../tools/probe/lib/world.mjs');
await mouseHold(page, true);

const t0 = Date.now();
let shotN = 0, lastZ = 0;
while (Date.now() - t0 < BATTLE_MS) {
  await sleep(200);
  const st = await page.evaluate(() => { const C = globalThis.__hc; return { z: C.zero.length, last: C.zero[C.zero.length - 1] || null, up: C.uploadTotal }; });
  const tgt = await page.evaluate(() => {
    const g = window.__swGame;
    const hs = (g.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead);
    for (const e of hs) { const mx = e.maxHp ?? e.def?.hp ?? 100; if (!(e.hp > mx * 0.5)) e.hp = mx; }
    if (g.player && g.player.hp < (g.player.maxHp ?? 100)) g.player.hp = g.player.maxHp ?? 100;
    if (!hs.length) return null;
    hs.sort((a, b) => (Math.abs(a.cx - g.player.cx) + Math.abs(a.cy - g.player.cy)) - (Math.abs(b.cx - g.player.cx) + Math.abs(b.cy - g.player.cy)));
    return { cx: hs[0].cx, cy: hs[0].cy };
  });
  if (tgt) await aimAt(page, tgt.cx, tgt.cy);
  if (st.z > lastZ && st.last) {
    lastZ = st.z;
    const m = st.last;
    const vw = page.viewport()?.width ?? 1280, vh = page.viewport()?.height ?? 800;
    try {
      const buf = await page.screenshot({ type: 'png', clip: { x: Math.max(0, m.scr[0] - 60), y: Math.max(0, m.scr[1] - 60), width: 160, height: 160 } });
      fs.writeFileSync(`${OUT}/v7-zp-f${m.f}-${++shotN}.png`, buf);
      if (shotN <= 8) console.log('ZP:', JSON.stringify(m), 'uploads:', st.up);
    } catch { }
  }
}

const out = await page.evaluate(() => {
  const C = globalThis.__hc;
  const zf = [...new Set(C.zero.map((z) => z.f))];
  return {
    frames: C.frame, uploadTotal: C.uploadTotal, layerNew: C.layerNew, layerDisposed: C.layerDisposed,
    zeroCount: C.zero.length, zeroFrames: zf.slice(0, 40),
    uploads: C.uploads.slice(0, 30),
  };
});
console.log('== v7 纹理账 ==');
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
