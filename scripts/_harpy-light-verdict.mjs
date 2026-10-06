// ★鸟妖「本体消失」终审定谳探针 v6：0 光暗屋假说直接验证
//   v5 铁证:零在位窗=鸟妖群飞入出生点旁天空岛房屋暗内部（ZP 截图黑屋+玩家可见）
//   本探针:同一场景 + 鸟妖位置光照值采样(lightMaskCanvas/主画布亮度)+全页截图
//   运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_harpy-light-verdict.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5221';
const BATTLE_MS = Number(process.env.BATTLE_MS || 90000);
const OUT = '/tmp/harpy-vanish';
fs.mkdirSync(OUT, { recursive: true });

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: console.log });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'harpygun', size: 'small', pinRandom: 20261006, log: console.log });
console.log('createGame:', made?.ok, made?.why || '');

// 玩家/相机置天空（与 v5 同点——出生点旁天空岛屋）
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
  const C = globalThis.__hc = { ok: true, frame: 0, samples: [], zeroEvents: 0 };
  const pcv = document.createElement('canvas'); pcv.width = 64; pcv.height = 64;
  const pctx = pcv.getContext('2d', { willReadFrequently: true });
  // 鸟妖位置亮度（主画布 bbox 平均亮度）
  globalThis.__sampleLight = (scr) => {
    try {
      const main = g.renderer.canvas;
      const x = Math.max(0, Math.round(scr[0] - 30)), y = Math.max(0, Math.round(scr[1] - 30));
      const w = Math.min(60, main.width - x), h = Math.min(60, main.height - y);
      if (w < 30 || h < 30) return null;
      pctx.drawImage(main, x, y, w, h, 0, 0, w, h);
      const d = pctx.getImageData(0, 0, w, h).data;
      let lum = 0;
      for (let i = 0; i < w * h; i++) lum += (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.6 + d[i * 4 + 2] * 0.1);
      return +(lum / (w * h) / 255).toFixed(4);
    } catch { return null; }
  };
  if (!g.__origFrameH6) {
    g.__origFrameH6 = g.frame;
    g.frame = function (...a) {
      C.frame++;
      const f = C.frame;
      const r = g.__origFrameH6.apply(this, a);
      if ((f % 6) === 0) {
        const cam = g.camera;
        const W = g.renderer.canvas?.width ?? 1280, H = g.renderer.canvas?.height ?? 800;
        for (const e of (g.entities?.enemies ?? [])) {
          if (e?.vanillaId !== 48 || e.dead) continue;
          const scr = cam.worldToScreen(e.cx, e.cy);
          if (scr[0] < 0 || scr[0] > W || scr[1] < 0 || scr[1] > H) continue;
          const lum = globalThis.__sampleLight(scr);
          C.samples.push({ f, id: e.id, lum, scr: [Math.round(scr[0]), Math.round(scr[1])] });
          if (lum != null && lum < 0.03) { C.zeroEvents++; if (C.zeroEvents <= 6) C.zeroSample = { f, id: e.id, lum, scr: [Math.round(scr[0]), Math.round(scr[1])] }; }
        }
        if (C.samples.length > 20000) C.samples.splice(0, 5000);
      }
      return r;
    };
  }
  return { ok: true };
});
console.log('instrument:', JSON.stringify(inst));

await page.evaluate(async () => {
  const g = window.__swGame;
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
let shotN = 0;
while (Date.now() - t0 < BATTLE_MS) {
  await sleep(200);
  const st = await page.evaluate(() => { const C = globalThis.__hc; return { z: C.zeroEvents, s: C.zeroSample || null, alive: (window.__swGame.entities?.enemies ?? []).filter((e) => e?.vanillaId === 48 && !e.dead).length }; });
  if (st.z > 0 && st.s && shotN < 8) {
    try {
      const buf = await page.screenshot({ type: 'png' });
      fs.writeFileSync(`${OUT}/v6-full-${++shotN}.png`, buf);
      console.log('dark shot:', JSON.stringify(st.s));
      await page.evaluate(() => { globalThis.__hc.zeroEvents = 0; globalThis.__hc.zeroSample = null; });
    } catch { }
  }
  // 保活+瞄准
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
}

const out = await page.evaluate(() => {
  const C = globalThis.__hc;
  const s = C.samples.filter((x) => x.lum != null);
  const lums = s.map((x) => x.lum).sort((a, b) => a - b);
  const q = (p) => lums.length ? lums[Math.min(lums.length - 1, Math.floor(lums.length * p))] : null;
  const dark = s.filter((x) => x.lum < 0.05);
  return {
    frames: C.frame, samples: s.length,
    lum: { min: lums[0] ?? null, p01: q(0.01), p05: q(0.05), p50: q(0.5), max: lums[lums.length - 1] ?? null },
    darkSamples: dark.length,
    darkFrames: [...new Set(dark.map((x) => x.f))].sort((a, b) => a - b).slice(0, 40),
    darkScr: dark.slice(0, 12).map((x) => ({ f: x.f, id: x.id, lum: x.lum, scr: x.scr })),
  };
});
console.log('== v6 光照账 ==');
console.log(JSON.stringify(out, null, 1));
console.log('shots:', OUT);
await page.browser().close();
