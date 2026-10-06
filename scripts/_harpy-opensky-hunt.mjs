// ★鸟妖「本体消失」终局狩猎 v8：开阔天空窗(四角均匀=度量可信)+绿血条目击
//   v7 定谳:零在位样本两类伪象——①繁忙背景击穿角差分度量(f579 剪片鸟妖明明可见)
//   ②小地图面板遮挡(右上金框黑板)。本探针只在【四角均匀天空】窗开火+全页截图。
//   运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=280000 scripts/_harpy-opensky-hunt.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5221';
const BATTLE_MS = Number(process.env.BATTLE_MS || 120000);
const OUT = '/tmp/harpy-vanish';
fs.mkdirSync(OUT, { recursive: true });

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: console.log });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'harpygun', size: 'small', pinRandom: 20261006, log: console.log });
console.log('createGame:', made?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const gl = (g.world?.groundLevel ?? 300);
  const px = g.player.cx;
  g.player.x = px; g.player.y = (gl - 70) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = px; g.camera.y = (gl - 70) * 16;   // 更高处=纯天空背景(避开岛/树)
});
await sleep(600);

const inst = await page.evaluate(() => {
  const g = window.__swGame;
  const C = globalThis.__hc = { ok: true, frame: 0, events: [], checked: 0 };
  const pcv = document.createElement('canvas'); pcv.width = 96; pcv.height = 96;
  const pctx = pcv.getContext('2d', { willReadFrequently: true });
  // 返回 {uniform, pres, greenBar, yellowText}:uniform=四角天空均匀(度量可信)
  globalThis.__probe = (scr) => {
    try {
      const main = g.renderer.canvas;
      const x = Math.max(0, Math.round(scr[0] - 40)), y = Math.max(0, Math.round(scr[1] - 40));
      const w = Math.min(80, main.width - x), h = Math.min(80, main.height - y);
      if (w < 60 || h < 60) return null;
      pctx.drawImage(main, x, y, w, h, 0, 0, w, h);
      const d = pctx.getImageData(0, 0, w, h).data;
      const at = (i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
      const cs = [at(0), at(w - 1), at((h - 1) * w), at(h * w - 1)];
      // 四角均匀性（互相差 ≤18=纯天空,度量可信窗）
      let uni = true;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        if (Math.abs(cs[i][0] - cs[j][0]) > 18 || Math.abs(cs[i][1] - cs[j][1]) > 18 || Math.abs(cs[i][2] - cs[j][2]) > 18) uni = false;
      }
      let diff = 0, green = 0, bright = 0;
      for (let i = 0; i < w * h; i++) {
        const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
        const dr = Math.max(Math.abs(r - cs[0][0]), Math.abs(r - cs[1][0]), Math.abs(r - cs[2][0]), Math.abs(r - cs[3][0]));
        const dg = Math.max(Math.abs(gg - cs[0][1]), Math.abs(gg - cs[1][1]), Math.abs(gg - cs[2][1]), Math.abs(gg - cs[3][1]));
        const db = Math.max(Math.abs(b - cs[0][2]), Math.abs(b - cs[1][2]), Math.abs(b - cs[2][2]), Math.abs(b - cs[3][2]));
        if (dr > 44 || dg > 44 || db > 44) diff++;
        // 绿血条（亮绿:G 高 R/B 低）与亮字（近白/近黄——伤害数字）
        if (gg > 140 && r < 110 && b < 110) green++;
        if (r > 200 && gg > 200 && b > 140) bright++;
      }
      return { uniform: uni, pres: +(diff / (w * h)).toFixed(4), green, bright };
    } catch { return null; }
  };
  if (!g.__origFrameH8) {
    g.__origFrameH8 = g.frame;
    g.frame = function (...a) {
      C.frame++;
      const f = C.frame;
      const r = g.__origFrameH8.apply(this, a);
      if ((f % 3) === 0) {
        const cam = g.camera;
        const W = g.renderer.canvas?.width ?? 1280, H = g.renderer.canvas?.height ?? 800;
        for (const e of (g.entities?.enemies ?? [])) {
          if (e?.vanillaId !== 48 || e.dead) continue;
          const scr = cam.worldToScreen(e.cx, e.cy);
          // 避开小地图面板区(右上)与屏幕边缘
          if (scr[0] < 60 || scr[0] > W - 340 || scr[1] < 60 || scr[1] > H - 60) continue;
          const p = globalThis.__probe(scr);
          if (!p) continue;
          C.checked++;
          if (p.uniform && p.pres < 0.02) {
            C.events.push({ f, id: e.id, scr: [Math.round(scr[0]), Math.round(scr[1])], ...p });
            if (C.events.length > 60) C.events.shift();
          }
        }
      }
      return r;
    };
  }
  return { ok: true };
});
console.log('instrument:', JSON.stringify(inst));

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
let shotN = 0, lastE = 0;
while (Date.now() - t0 < BATTLE_MS) {
  await sleep(150);
  const st = await page.evaluate(() => { const C = globalThis.__hc; return { n: C.events.length, last: C.events[C.events.length - 1] || null, checked: C.checked }; });
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
  if (st.n > lastE && st.last) {
    lastE = st.n;
    const m = st.last;
    try {
      const buf = await page.screenshot({ type: 'png' });
      fs.writeFileSync(`${OUT}/v8-f${m.f}-id${m.id}-${++shotN}.png`, buf);
      console.log('OPEN-SKY VANISH:', JSON.stringify(m), 'checked:', st.checked);
      if (shotN >= 6) break;
    } catch { }
  }
}

const out = await page.evaluate(() => { const C = globalThis.__hc; return { checked: C.checked, events: C.events.slice(0, 20) }; });
console.log('== v8 账 ==');
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
