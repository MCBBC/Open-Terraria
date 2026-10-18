// 墓碑/标牌悬停文本对齐取证探针(2026-09-01 用户实报"文字与底板错位"):
// 合成 tombstone_v(2×2)+world.signs 悬停条目(死因\n日期 双行 epitaph),
// 鼠标悬停 → 截图量底板/文字几何;并挂 fillText 探针记录 textAlign/baseline 泄漏态。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (20).json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
// fillText 状态探针:凡绘制含"凶手"的文本,记录当时 align/baseline/transform
await p.evaluateOnNewDocument(() => {
  (window).__tombLog = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
    if (typeof t === 'string' && t.includes('凶手')) {
      const m = this.getTransform();
      (window).__tombLog.push({ t: String(t).slice(0, 26), x: Math.round(x), y: Math.round(y), align: this.textAlign, base: this.textBaseline, scale: +m.a.toFixed(2) });
    }
    return orig.call(this, t, x, y);
  };
});
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const text = fs.readFileSync(MAP, 'utf8');
await p.evaluate((t) => window.__swFlow.loadJson(t), text);
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await sleep(2000);
await p.evaluate(() => {
  document.getElementById('sw-boot-prime')?.remove();
  document.getElementById('sw-splash')?.remove();
  const btn = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('我已知晓'));
  if (btn) btn.click();
});

const STYLE = Number(process.env.SW_TOMB_STYLE ?? 0);   // ★style≠0 才暴露锚 %2 缺失
const scene = await p.evaluate(async (style) => {
  const g = window.__swGame;
  const T = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const tid = T.TILE_BY_KEY['tombstone_v'];
  const bx = g.world.spawnX + 4;
  let sy = 0;
  for (let y = 10; y < g.world.h - 10; y++) { if (st.isSolid(bx + 1, y)) { sy = y; break; } }
  const top = sy - 2;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    st.setTileSilent(bx + dx, top + dy, tid, style * 36 + dx * 18, dy * 18);
  }
  g.world.signs.push({ x: bx, y: top, text: 'Vinlic被腰斩了，凶手是史莱姆王。\n2026年8月31日' });
  g.player.x = (bx - 3) * 16; g.player.y = (sy - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.renderer.fullbright = true;
  window.__tombPos = { bx, top, sy, style };
  return window.__tombPos;
}, STYLE);
console.log('scene:', JSON.stringify(scene));
await sleep(1500);
// 把鼠标挪到墓碑上(屏坐标由相机算)——★悬停右列格(最坏列)非锚格
const scr = await p.evaluate(() => {
  const g = window.__swGame;
  const cam = g.renderer?.camera ?? g.camera;
  return { sx: Math.round((__tombPos.bx * 16 + 24 - cam.x) * (cam.zoom ?? 1) + innerWidth / 2), sy: Math.round((__tombPos.top * 16 + 8 - cam.y) * (cam.zoom ?? 1) + innerHeight / 2) };
});
console.log('screen:', JSON.stringify(scr));
await p.mouse.move(scr.sx, scr.sy);
await sleep(1200);
const hoverState = await p.evaluate(() => {
  const g = window.__swGame;
  const cam = g.renderer?.camera ?? g.camera;
  const r = g.renderer;
  const expX = Math.round((__tombPos.bx * 16 + 16 - cam.x) * (cam.zoom ?? 1) + innerWidth / 2);
  return {
    signHoverText: r.signHoverText ? r.signHoverText.slice(0, 18) : '',
    bubble: r.signBubbleScreen,
    bubbleExpectedX: expX,                       // 锚右缘屏 x(泡=+8)
    drift: r.signBubbleScreen ? r.signBubbleScreen.x - expX : null,
  };
});
console.log('hoverState:', JSON.stringify(hoverState));
const log = await p.evaluate(() => window.__tombLog.slice(0, 12));
console.log('fillText log:', JSON.stringify(log, null, 1));
await p.screenshot({ path: '/tmp/tomb-hover.png' });
console.log('shot saved');
await b.close();
console.log('done');
