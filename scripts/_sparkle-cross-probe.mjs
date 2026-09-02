// 星芒黑十字在案取证（现役代码 ?sparkle=1）：冻结帧 A/B 对拍。
// 流程：SW 清缓存换新模块 → 载真档 → 天顶剑齐射 → 冻结在星芒窗(counter∈[20,35])
// → 截 A(sparkle on) → history.replaceState 关 sparkle → 截 B → 逐像素 diff。
// 判据：A 相对 B 的【变暗像素】= 黑十字复现；全亮 = 无暗底。
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const OUT = '/tmp/sparkle-repro';

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
page.on('console', (m) => { const t = m.text(); if (t.includes('[Game]') || t.includes('sparkle')) console.log('CONSOLE:', t.slice(0, 160)); });

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5216') + '/?sparkle=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 清 SW 供新模块（cache-first 坑）
await page.evaluate(async () => {
  try {
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    await Promise.all((await navigator.serviceWorker?.getRegistrations?.() ?? []).map((r) => r.unregister()));
  } catch {}
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
// 菜单幕布/splash 窗口期：真点角落过音频门（先角落真点,探针三坑之一）
await page.waitForFunction(() => !!window.__swLoadJson, { timeout: 90000, polling: 500 });
try { await page.mouse.click(8, 8); } catch {}
await new Promise((r) => setTimeout(r, 800));

// ① 执行代码指纹（防陈旧 bundle）：prettyStarSparkle 源码须含现役隔离式合成特征
const fingerprint = await page.evaluate(async () => {
  const m = await import('/src/render/Renderer.ts');
  const src = m.prettyStarSparkle.toString();
  return {
    hasSparkleGate: src.includes("'sparkle'") || src.includes('sparkle'),
    hasLighter: src.includes('lighter'),
    hasIsolatedSbuf: src.includes('sbuf'),
    len: src.length,
  };
});
console.log('FINGERPRINT', JSON.stringify(fingerprint));

// ② 载真档 + 布景
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
console.log('BOOT', JSON.stringify(boot));
if (!boot.ok) { await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

// ③ 齐射 + 冻结在星芒窗
const frozen = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.player.x = 3185 * 16 + 8 - g.player.w / 2;
  g.player.y = Math.max(60 * 16, 381 * 16 - 420 * 16 / 4);
  const st = g.world.store;
  const tx = Math.floor(g.player.x / 16), ty = Math.floor(g.player.y / 16) + 3;
  for (let x = tx - 12; x <= tx + 12; x++) for (let y = ty - 6; y < ty; y++) st.setTile(x, y, 0);
  for (let x = tx - 12; x <= tx + 12; x++) st.setTile(x, ty, st.type[st.idx(tx, 400)] ?? 1, 0, 0);
  g.paused = false;
  const inp = g.input;
  inp.mouseX = Math.round((g.renderer.canvas?.width ?? 1280) / 2) - 60;
  inp.mouseY = Math.round((g.renderer.canvas?.height ?? 800) / 2);
  await wait(400);
  // 直构两把定档案剑：4956(天顶本体, 淡绿白) + 155(深蓝档案 → 深蓝臂锥)
  const { ZenithSword, randomFractalProfile } = await import('/src/entities/SwingArc.ts');
  const p = g.player;
  const mk = (profile) => {
    const zs = new ZenithSword(p, p.cx - 120, p.cy + 40, 190, profile, 6.5);
    g.entities.add(zs, 'projectiles');
    return zs;
  };
  const swords = [mk(4956), mk(155), mk(674), mk(2880)];
  window.__probeSwords = swords;
  // 步进到 counter 进入 [22,34]（num≈包络顶）——fixedUpdate 1/60 逐帧
  for (let i = 0; i < 200; i++) {
    g.fixedUpdate(1 / 60);
    const cs = swords.map((s) => (s.dead ? -1 : s.counter ?? 0));
    if (cs.some((c) => c >= 22 && c <= 34)) break;
  }
  g.paused = true;
  await wait(400);   // 等 2 个渲染帧（暂停仅冻结逻辑,渲染照常）
  const live = swords.map((s) => ({ counter: s.counter, opacity: s.opacity, dead: s.dead,
    x: s.cx, y: s.cy }));
  return { live, worldOk: !!g.world };
});
console.log('FROZEN', JSON.stringify(frozen));

// ④ A/B 交错截帧 + 抗漂移对拍（云/风等背景在暂停下仍漂移 → 单帧对拍被污染）。
//   每像素取 min(A1..A3) − max(B1..B3)：背景漂移对 A/B 两侧同等作用而抵消，
//   只剩 sparkle 一侧的稳定差。同时导出剑位 240×160 裁剪帧供目检。
const diff = await page.evaluate(async () => {
  const g = window.__swGame;
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const W = cv.width, H = cv.height;
  const grab = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(cv, 0, 0);
    return cc.getImageData(0, 0, W, H);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const setSparkle = (v) => {
    const u = new URL(location.href); u.searchParams.set('sparkle', v);
    history.replaceState(null, '', u.toString());
  };
  const grabs = { A: [], B: [] };
  // A/B 差分机制（?sparkle 门已撤）：B 态 = 四剑平移 +5000px 出屏（本体/残影/拖尾/
  // 星芒全部随 cx/cy+trail 移走）——同一静态场景的无星芒参照。暂停下位置稳定。
  const shift = (dx: number) => {
    for (const s of (window.__probeSwords ?? [])) {
      if (!s || s.dead) continue;
      s.x += dx; s.trail = s.trail.map((v: number, i: number) => (i % 3 === 0 ? v + dx : v));
    }
  };
  shift(0);
  setSparkle('1'); await wait(90); grabs.A.push(grab());
  shift(5000); await wait(90); grabs.B.push(grab());
  shift(-5000); await wait(90); grabs.A.push(grab());
  shift(5000); await wait(90); grabs.B.push(grab());
  shift(-5000); await wait(90);
  const Aref = grab(); grabs.A.push(Aref);
  shift(5000);
  // 剑位裁剪帧（世界→屏幕）
  const cam = g.camera;
  const crops = [];
  for (const s of (window.__probeSwords ?? [])) {
    if (!s || s.dead) continue;
    const [sx, sy] = cam.worldToScreen ? cam.worldToScreen(s.cx, s.cy) : [s.cx, s.cy];
    const c = document.createElement('canvas');
    c.width = 240; c.height = 160;
    const cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(cv, Math.max(0, Math.min(W - 240, sx - 120 | 0)), Math.max(0, Math.min(H - 160, sy - 80 | 0)), 240, 160, 0, 0, 240, 160);
    crops.push({ sx: sx | 0, sy: sy | 0, url: c.toDataURL('image/png') });
  }
  // ★局部化 + 形态学：只统计星芒臂包围盒（zoom=2 时横臂 720×72、纵臂 72×288），
  //   且要求 8×8 块内 ≥60% 像素一致变暗（云/星闪烁=散点,整带=块状）——
  //   黑十字若在,横带应有 ~90×9=810 个块命中
  const [A1, A2, A3] = grabs.A, [B1, B2] = grabs.B;
  const perSword = [];
  for (const s of (window.__probeSwords ?? [])) {
    if (!s || s.dead) continue;
    const [sx0, sy0] = cam.worldToScreen ? cam.worldToScreen(s.cx, s.cy) : [s.cx, s.cy];
    const cx0 = Math.round(sx0), cy0 = Math.round(sy0);
    const bands = [
      { x: cx0 - 380, y: cy0 - 40, w: 760, h: 80 },     // 横臂带(zoom≈2: 720×72)
      { x: cx0 - 40, y: cy0 - 150, w: 80, h: 300 },     // 纵臂带(72×288)
    ];
    let darkPx = 0, brightPx = 0, tot = 0, darkBlocks = 0, brightBlocks = 0;
    const mark = [];
    for (const b of bands) {
      const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y);
      const x1 = Math.min(W, b.x + b.w), y1 = Math.min(H, b.y + b.h);
      for (let by = y0; by < y1; by += 8) {
        for (let bxx = x0; bxx < x1; bxx += 8) {
          let dn = 0, bn = 0, n = 0;
          for (let yy = by; yy < Math.min(by + 8, y1); yy++) {
            for (let xx = bxx; xx < Math.min(bxx + 8, x1); xx++) {
              const i = (yy * W + xx) * 4;
              const mnA = Math.min(A1.data[i], A2.data[i], A3.data[i]);
              const mxB = Math.max(B1.data[i], B2.data[i]);
              const mxA = Math.max(A1.data[i], A2.data[i], A3.data[i]);
              const mnB = Math.min(B1.data[i], B2.data[i]);
              n++; tot++;
              if (mnA - mxB <= -14) { dn++; darkPx++; }
              else if (mxA - mnB >= 14) { bn++; brightPx++; }
            }
          }
          if (n && dn / n >= 0.6) darkBlocks++;
          if (n && bn / n >= 0.6) brightBlocks++;
        }
      }
    }
    perSword.push({ counter: s.counter, cx: cx0, cy: cy0, darkPx, brightPx, darkBlocks, brightBlocks, boxPx: tot });
  }
  return { W, H, perSword, crops };
});
console.log('DIFF', JSON.stringify({ ...diff, crops: diff.crops.map((c) => ({ sx: c.sx, sy: c.sy, bytes: c.url.length })) }));
let ci = 0;
for (const c of diff.crops) {
  const f = OUT + `/ingame-crop-${ci++}.png`;
  (await import('node:fs')).writeFileSync(f, Buffer.from(c.url.split(',')[1], 'base64'));
  console.log('CROP', f, '@', c.sx, c.sy);
}
await page.screenshot({ path: OUT + '/ingame-frozen.png' });
await browser.close();
const totDark = diff.perSword.reduce((a, s) => a + s.darkBlocks, 0);
const totBright = diff.perSword.reduce((a, s) => a + s.brightBlocks, 0);
const verdict = totDark > 20 ? '❌ 黑十字复现: ' + totDark + ' 暗块(带状) 明块=' + totBright
  : '✅ 星区带状暗块=0(明块=' + totBright + ' 为星体正控) —— 无黑十字';
console.log('VERDICT:', verdict);
console.log('PER-SWORD', JSON.stringify(diff.perSword));
