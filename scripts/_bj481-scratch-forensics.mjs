// ★BJ481 刮擦布法证探针:逐 blit scratch 内容直读 + 手工烘焙复刻对拍。
//   probe1 异象:16 blit 中 12 画布零差分 + 全部 scratch 无 α=255 像素 →
//   烘焙产物疑空/全透明。本探针直接读烘焙点 scratch 内容判别:
//     F1 逐 blit scratch α 直方图（a=0 / 1..254 / 255）+ 非零 α bbox + 样本 rgb
//     F2 部件 spawnAlpha/ai0（globalAlpha=0 → 烘焙全透明假象排除面）
//     F3 手工复刻烘焙（同 setWorldXf + drawPart 至新鲜画布）→ 同直方图
//        —— 手工空=烘焙数病;手工非空+实机空=运行时路径差
// 用法: SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj481-scratch-forensics.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'bj481');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/?play=small',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(1000);

// 玩家免死（百万血 + 周期回满）——防月总击杀污染测量
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.statLifeMax2 = 1000000; p.statLife = 1000000;
  window.__heal = setInterval(() => { p.statLife = p.statLifeMax2; }, 200);
});

// ---- 逐 blit scratch 法证仪器 ----
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const st = r.__f = { blits: [], recording: false, MAX: 8 };
  const orig = r.applyMoonLordLightFloor.bind(r);
  r.applyMoonLordLightFloor = function (...args) {
    if (!st.recording) return orig(...args);
    const ctx = this.ctx;
    const origDraw = ctx.drawImage;
    const self = this;
    ctx.drawImage = function (img, a, b) {
      const isComp = img === self.mlFloorScratch
        && ctx.globalCompositeOperation === 'lighter'
        && arguments.length === 3;
      if (!isComp || st.blits.length >= st.MAX) return origDraw.apply(ctx, arguments);
      origDraw.call(ctx, img, a, b);
      try {
        const w = img.width, h = img.height;
        const d = img.getContext('2d').getImageData(0, 0, w, h).data;
        let a0 = 0, aMid = 0, a255 = 0, colored = 0, minx = w, miny = h, maxx = -1, maxy = -1;
        let maxC = 0, sample = null;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, al = d[i + 3];
            if (al === 0) { a0++; continue; }
            if (al === 255) a255++; else aMid++;
            if (d[i] || d[i + 1] || d[i + 2]) colored++;
            const c = Math.max(d[i], d[i + 1], d[i + 2]);
            if (c > maxC) maxC = c;
            if (al > 0) {
              if (x < minx) minx = x; if (x > maxx) maxx = x;
              if (y < miny) miny = y; if (y > maxy) maxy = y;
              if (!sample && al === 255 && c > 30) sample = [x, y, d[i], d[i + 1], d[i + 2], al];
            }
          }
        }
        st.blits.push({ a, b, w, h, a0, aMid, a255, colored, maxC,
          bbox: maxx >= 0 ? [minx, miny, maxx, maxy] : null, sample });
      } catch (e) { st.blits.push({ a, b, err: String(e).slice(0, 80) }); }
      return undefined;
    };
    try {
      return orig(...args);
    } finally {
      ctx.drawImage = origDraw;
    }
  };
});

// ---- 暗穴 + 召月总 ----
const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  const deepY = Math.min(st.h - 40, 330);
  const cx0 = Math.floor(p.cx / 16);
  for (let yy = deepY - 26; yy <= deepY; yy++) {
    for (let xx = cx0 - 22; xx <= cx0 + 22; xx++) st.setTileSilent(xx, yy, 0);
  }
  for (let xx = cx0 - 24; xx <= cx0 + 24; xx++) if (!st.isSolid(xx, deepY + 1)) st.setTile(xx, deepY + 1, 1, 0, 0);
  p.x = cx0 * 16; p.y = (deepY - 8) * 16; p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
  const e = spawnVanillaEnemy(g, 398, p.cx, p.cy - 220);
  if (e) { e.x = p.cx - e.w / 2; e.y = p.cy - 220 - e.h / 2; e.vx = 0; e.vy = 0; }
  return { deepY, cx0, spawned: !!e };
});
await wait(5000);
const parts = await page.evaluate(() => {
  const g = window.__swGame;
  return (g.entities.enemies || []).filter((e) => e && !e.dead
    && [396, 397, 398, 400].includes(e.vanillaId))
    .map((e) => ({ id: e.vanillaId, ai0: e.ai0, spawnAlpha: e.spawnAlpha,
      cx: Math.round(e.cx), cy: Math.round(e.cy), w: e.w, h: e.h }));
});
console.log('scene:', JSON.stringify(scene));
console.log('parts:', JSON.stringify(parts));

// ---- F1/F2: 实机烘焙点 scratch 直读 ----
await page.evaluate(() => { const st = window.__swGame.renderer.__f; st.blits.length = 0; st.recording = true; });
await wait(1500);
const f1 = await page.evaluate(() => {
  const st = window.__swGame.renderer.__f;
  st.recording = false;
  return st.blits;
});
console.log('F1 scratch forensics:', JSON.stringify(f1, null, 1));
await page.screenshot({ path: join(OUT, 'bj481-forensics-mid.png'), encoding: 'binary' }).catch(() => {});

// ---- F3: 手工复刻烘焙（同公式新画布） ----
const f3 = await page.evaluate(() => {
  const r = window.__swGame.renderer, g = window.__swGame;
  const e = (g.entities.enemies || []).find((x) => x && !x.dead && x.vanillaId === 398);
  if (!e) return { err: 'no core' };
  const cam = r.camera ?? g.camera;
  const viewW = r.canvas.width, viewH = r.canvas.height;
  const z = cam.zoom;
  const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
  const R = 380 * z;
  const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
  const bx0 = Math.max(0, Math.floor(sx - R)), by0 = Math.max(0, Math.floor(sy - R));
  const bx1 = Math.min(viewW, Math.ceil(sx + R)), by1 = Math.min(viewH, Math.ceil(sy + R));
  const bw = bx1 - bx0, bh = by1 - by0;
  const cv = document.createElement('canvas');
  cv.width = bw; cv.height = bh;
  const sctx = cv.getContext('2d', { willReadFrequently: true });
  const setWorldXf = () => sctx.setTransform(z, 0, 0, z,
    Math.round(viewW / 2) - bx0 - camRX * z, Math.round(viewH / 2) - by0 - camRY * z);
  const oc = r.ctx;
  r.ctx = sctx;
  try {
    setWorldXf();
    r.drawMoonLordCore(e, g.entities.enemies);
  } finally {
    r.ctx = oc;
  }
  const d = sctx.getImageData(0, 0, bw, bh).data;
  let a0 = 0, aMid = 0, a255 = 0, colored = 0, maxC = 0, sample = null;
  let minx = bw, miny = bh, maxx = -1, maxy = -1;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (y * bw + x) * 4, al = d[i + 3];
      if (al === 0) { a0++; continue; }
      if (al === 255) a255++; else aMid++;
      if (d[i] || d[i + 1] || d[i + 2]) colored++;
      const c = Math.max(d[i], d[i + 1], d[i + 2]);
      if (c > maxC) maxC = c;
      if (al > 0) {
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (!sample && al === 255 && c > 30) sample = [x, y, d[i], d[i + 1], d[i + 2], al];
      }
    }
  }
  return { bw, bh, a0, aMid, a255, colored, maxC,
    bbox: maxx >= 0 ? [minx, miny, maxx, maxy] : null, sample,
    sx: Math.round(sx), sy: Math.round(sy) };
});
console.log('F3 manual bake:', JSON.stringify(f3, null, 1));

writeFileSync(join(OUT, 'bj481-forensics.json'), JSON.stringify({ scene, parts, f1, f3, pageErrs: errors }, null, 2));
console.log(`pageErrs=${errors.length}`);
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
