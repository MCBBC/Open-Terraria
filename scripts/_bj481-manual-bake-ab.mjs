// ★BJ481 F3 手工烘焙 A/B:drawPart(setWorldXf) 至新鲜画布,判别「烘焙数病 vs 运行时态差」。
//   F3a = 仅 step1（drawPart @setWorldXf）→ 空=烘焙数学/函数态病
//   F3b = drawPart @identity 固定偏移 → 空=函数在 raw ctx 上根本画不出（更深的病）
//   F3c = atlas 源矩形直画（vnpc398 帧 + Extra_13）→ 空=源贴图缺（另案）
//   F3d = 复刻完整三步烘焙（step1+multiply+destination-in）→ 与实机 scratch 对拍
// 用法: SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj481-manual-bake-ab.mjs
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

// 玩家硬免死:hp 池 + 每帧回满（fixedUpdate 钩)
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.statLifeMax2 = 1000000; p.statLife = 1000000;
  const fu = g.fixedUpdate?.bind(g);
  if (fu) {
    g.fixedUpdate = (...a) => { p.statLife = p.statLifeMax2; return fu(...a); };
  }
  window.__heal2 = setInterval(() => { p.statLife = p.statLifeMax2; }, 50);
});

// 暗穴 + 召月总
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
await wait(3000);   // 出生演出(60t)+α 衰减(~17t)+部件召出;即刻测量缩短暴露窗
const parts = await page.evaluate(() => {
  const g = window.__swGame;
  return (g.entities.enemies || []).filter((e) => e && !e.dead
    && [396, 397, 398, 400].includes(e.vanillaId))
    .map((e) => ({ id: e.vanillaId, ai0: e.ai0, spawnAlpha: e.spawnAlpha, hp: e.hp,
      cx: Math.round(e.cx), cy: Math.round(e.cy) }));
});
console.log('scene:', JSON.stringify(scene));
console.log('parts:', JSON.stringify(parts));

const F = await page.evaluate(() => {
  const r = window.__swGame.renderer, g = window.__swGame;
  const e = (g.entities.enemies || []).find((x) => x && !x.dead && x.vanillaId === 398);
  if (!e) return { err: 'no core' };
  const cam = g.camera ?? r.camera;
  const viewW = r.canvas.width, viewH = r.canvas.height;
  const z = cam.zoom;
  const [sx, sy] = cam.worldToScreen(e.cx, e.cy);
  const R = 380 * z;
  const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
  const bx0 = Math.max(0, Math.floor(sx - R)), by0 = Math.max(0, Math.floor(sy - R));
  const bx1 = Math.min(viewW, Math.ceil(sx + R)), by1 = Math.min(viewH, Math.ceil(sy + R));
  const bw = bx1 - bx0, bh = by1 - by0;
  const setWorldXf = (c) => c.setTransform(z, 0, 0, z,
    Math.round(viewW / 2) - bx0 - camRX * z, Math.round(viewH / 2) - by0 - camRY * z);
  const stats = (cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let a0 = 0, aMid = 0, a255 = 0, colored = 0, maxC = 0, sample = null;
    let minx = cv.width, miny = cv.height, maxx = -1, maxy = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4, al = d[i + 3];
        if (al === 0) { a0++; continue; }
        if (al === 255) a255++; else aMid++;
        if (d[i] || d[i + 1] || d[i + 2]) colored++;
        const c = Math.max(d[i], d[i + 1], d[i + 2]);
        if (c > maxC) maxC = c;
        if (al > 0) {
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y;
          if (!sample && al === 255 && c > 30) sample = [x, y, d[i], d[i + 1], d[i + 2]];
        }
      }
    }
    return { a0, aMid, a255, colored, maxC, bbox: maxx >= 0 ? [minx, miny, maxx, maxy] : null, sample };
  };
  const out = { bw, bh, sx: Math.round(sx), sy: Math.round(sy) };

  // F3a: 仅 step1（drawPart @setWorldXf）
  {
    const cv = document.createElement('canvas');
    cv.width = bw; cv.height = bh;
    const sctx = cv.getContext('2d', { willReadFrequently: true });
    const oc = r.ctx;
    r.ctx = sctx;
    try { setWorldXf(sctx); r.drawMoonLordCore(e, g.entities.enemies); }
    finally { r.ctx = oc; }
    out.f3a = stats(cv);
  }
  // F3b: identity 变换固定偏移（屏坐标直绘）
  {
    const cv = document.createElement('canvas');
    cv.width = viewW; cv.height = viewH;
    const sctx = cv.getContext('2d', { willReadFrequently: true });
    const oc = r.ctx;
    r.ctx = sctx;
    try { sctx.setTransform(1, 0, 0, 1, 0, 0); r.drawMoonLordCore(e, g.entities.enemies); }
    finally { r.ctx = oc; }
    out.f3b = stats(cv);
  }
  // F3c: atlas 源矩形直画（vnpc398 当前帧 + Extra_13 躯干）
  {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const sctx = cv.getContext('2d', { willReadFrequently: true });
    const frames = Math.max(1, e.vanilla?.frames ?? 1);
    const heart = r.atlas.vnpc(398, r.constructor && window.__vnpcFrame ? 0 : 0) ?? null;
    const fIdx = (typeof window !== 'undefined' && r.vanillaFrameIdx) ? r.vanillaFrameIdx(e, frames) : 0;
    const hf = r.atlas.vnpc(398, fIdx);
    if (hf) sctx.drawImage(hf.img, hf.sx, hf.sy, hf.sw, hf.sh, 0, 0, hf.sw, hf.sh);
    const ex13 = r.atlas.vmisc('vanilla/Extra_13.png');
    if (ex13) sctx.drawImage(ex13.img, ex13.sx, ex13.sy, ex13.sw, ex13.sh, 100, 0, ex13.sw, ex13.sh);
    out.f3c = { heart: !!hf, ex13: !!ex13, ...stats(cv) };
  }
  // F3d: 完整三步烘焙复刻（与 applyMoonLordLightFloor 逐行同式,光=0 → diff=76）
  {
    const cv = document.createElement('canvas');
    cv.width = bw; cv.height = bh;
    const sctx = cv.getContext('2d', { willReadFrequently: true });
    const drawPart = () => r.drawMoonLordCore(e, g.entities.enemies);
    const oc = r.ctx;
    r.ctx = sctx;
    try {
      setWorldXf(sctx);
      drawPart();
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalCompositeOperation = 'multiply';
      sctx.fillStyle = 'rgb(76,76,76)';
      sctx.fillRect(0, 0, bw, bh);
      setWorldXf(sctx);
      sctx.globalCompositeOperation = 'destination-in';
      drawPart();
    } finally { r.ctx = oc; }
    out.f3d = stats(cv);
  }
  return out;
});
console.log('F:', JSON.stringify(F, null, 1));

await page.screenshot({ path: join(OUT, 'bj481-manualbake.png'), encoding: 'binary' }).catch(() => {});
writeFileSync(join(OUT, 'bj481-manualbake.json'), JSON.stringify({ scene, parts, F, pageErrs: errors }, null, 2));
console.log(`pageErrs=${errors.length}`);
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
