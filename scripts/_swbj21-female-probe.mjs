// SW-BJ21 2026-09-07 定谳探针:实时链女体胸口镂空 变体扫描
//  假说:sheetRect 就绪门/回退链未实现原版 CopyVariant(PlayerDataInitializer.cs)
//  —— 女性子变体 5/6/7/9 的设计缺省通道(3=躯干肤等)按 vanilla 取变体 4 表,
//  本仓直落 Player_0_* → 男表 (0,2) 格为空 → 胸口/衣摆中缝露背景。
//  方法:高空纯天空背景 + 极端色外观(品红肤/红衫/绿底衫/黄发),zoom 8,
//  实机画布胸区扫描:同扫描行内两侧都是精灵色、中间夹背景段 = 镂空。
//  变体 4(表齐)为对照组,期望 0;5/6/7/9 期望 >0(修复前)。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj21';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5212';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj21-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(2000);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /我已知晓|知道/.test(x.textContent || ''));
  if (b) b.click();
  const g = window.__swGame;
  g.camera.zoom = 8; g.camera.zoomTarget = 8;
  g.world.clock.timeOfDay = 0.5;   // 正午蓝天,均匀背景
  const p = g.player;
  // 高空平台(头顶留白,脚下石墩),周围 8 格清空防树冠
  const wx = Math.floor(p.x / 16), wy = 80;
  for (let dx = -6; dx <= 6; dx++) {
    g.world.store.setTile(wx + dx, wy, 1, 0, 0);
    for (let dy = 1; dy <= 5; dy++) g.world.store.setTile(wx + dx, wy + dy, 1, 0, 0);
    for (let dy = 1; dy <= 14; dy++) { g.world.store.setTile(wx + dx, wy - dy, 0, 0, 0); }
  }
  p.x = (wx + 0.5) * 16 - p.w / 2; p.y = (wy - 4) * 16 - p.h;
  p.vx = 0; p.vy = 0; p.facing = 1;
});

// 统一外观:极端色(乘法调色后色域可识别)。skin=白(灰度原样) 不行——要色域;
// 用品红肤/红衫/绿底衫/蓝裤/黄发/黑瞳
const APP = (v) => JSON.stringify({ name: 'probe', hair: 1, skinVariant: v,
  hairColor: { r: 255, g: 255, b: 0 }, skinColor: { r: 255, g: 0, b: 255 },
  eyeColor: { r: 0, g: 0, b: 0 }, shirtColor: { r: 255, g: 0, b: 0 },
  undershirtColor: { r: 0, g: 255, b: 0 }, pantsColor: { r: 0, g: 0, b: 255 },
  shoeColor: { r: 255, g: 255, b: 255 }, difficulty: 0 });

const setup = (v) => page.evaluate(async (vv) => {
  const g = window.__swGame, p = g.player;
  const pd = await import('/src/player/PaperDoll.ts');
  const at = await import('/src/assets/SpriteAtlas.ts');
  p.appearance = JSON.parse(document.__swApp(vv));
  p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
  p.vx = 0; p.vy = 0; p.facing = 1;
  pd.clearPaperDollCache();
  // 等烘焙就绪(懒载自愈,最多 ~12s)
  let doll = null;
  for (let k = 0; k < 40 && !doll; k++) {
    doll = pd.compositePaperDoll(p.appearance, { head: null, body: null, legs: null });
    if (!doll) await new Promise((r) => setTimeout(r, 300));
  }
  return { baked: !!doll };
}, v);
await page.evaluate((fnSrc) => { document.__swApp = new Function('return ' + fnSrc)(); }, `(v)=>${'JSON.parse(' + 'null)'}`);
// 上面占位不对——直接换成页面内联表
await page.evaluate(() => {
  document.__swApp = (v) => JSON.stringify({ name: 'probe', hair: 1, skinVariant: v,
    hairColor: { r: 255, g: 255, b: 0 }, skinColor: { r: 255, g: 0, b: 255 },
    eyeColor: { r: 0, g: 0, b: 0 }, shirtColor: { r: 255, g: 0, b: 0 },
    undershirtColor: { r: 0, g: 255, b: 0 }, pantsColor: { r: 0, g: 0, b: 255 },
    shoeColor: { r: 255, g: 255, b: 255 }, difficulty: 0 });
});

// 胸区镂空扫描:帧空间 x∈[6,36], y∈[12,44];zoom 邻域;精灵色=品红/红/绿/蓝/黄 主导
const scan = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, Z = Math.round(g.camera.zoom);
  const isSprite = (r, gr, b) =>
    (r > 120 && gr < 110 && b > 120)     // 品红(肤)
    || (r > 120 && gr < 110 && b < 110)  // 红(衫)/暗红边
    || (gr > 120 && r < 110 && b < 110)  // 绿(底衫)
    || (b > 120 && r < 110 && gr < 110)  // 蓝(裤)
    || (r > 120 && gr > 120 && b < 110); // 黄(发)
  const [axs, ays] = g.camera.worldToScreen(p.cx - p.facing * 2.5, p.y + p.h + (p.stepRenderY || 0));
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  const X0 = 6, X1 = 36, Y0 = 12, Y1 = 44;      // 帧空间胸区(含衣摆)
  const W = (X1 - X0) * Z, H = (Y1 - Y0) * Z;
  c2.width = W; c2.height = H;
  const cc = c2.getContext('2d', { willReadFrequently: true });
  const sx0 = Math.round(axs) + X0 * Z, sy0 = Math.round(ays) + (Y0 - 56) * Z;
  cc.drawImage(cv, sx0, sy0, W, H, 0, 0, W, H);
  const d = cc.getImageData(0, 0, W, H).data;
  const spr = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) spr[j] = isSprite(d[i], d[i + 1], d[i + 2]) ? 1 : 0;
  // 行扫描:两侧都是精灵、中段连续背景 ≥2 帧-px(≥2Z 实机px) = 镂空
  let holes = 0; const runs = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (spr[y * W + x]) { x++; continue; }
      let e = x; while (e < W && !spr[y * W + e]) e++;
      const left = x > 0 && spr[y * W + (x - 1)], right = e < W && spr[y * W + e];
      const spanFrames = (e - x) / Z;
      if (left && right && spanFrames >= 1.5) { holes += (e - x); runs.push([Math.round((x / Z) + X0), Math.round((y / Z) + Y0), Math.round(spanFrames)]); }
      x = e;
    }
  }
  return { holes, runs: runs.slice(0, 12) };
});

const shot = (tag) => page.evaluate((t) => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return { x: Math.max(0, Math.round(sx - 170)), y: Math.max(0, Math.round(sy - 210)), width: 340, height: 420, __tag: t };
}, tag).then((clip) => page.screenshot({ path: `${OUT}/${clip.__tag}.png`, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } }));

const report = {};
// ---- A 变体扫描(站立) ----
for (const v of [4, 5, 6, 7, 9]) {
  const r = await setup(v);
  await sleep(700);
  const s = await scan();
  report[`v${v}-stand`] = { baked: r.baked, ...s };
  await shot(`bj21-v${v}-stand`);
}
// ---- B 变体 6 三姿态 ----
await page.evaluate(() => { window.__swGame.player.vx = 2.5; });
await sleep(450); report['v6-walk'] = await scan(); await shot('bj21-v6-walk');
await page.evaluate(() => { window.__swGame.player.vx = 0; });
await sleep(400);
// 坐姿:木椅(15) frameX=18/frameY=40 底格 + 上半 frameY=0,坐点=底格
report['v6-sit'] = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const { getSittingTargetInfo } = await import('/src/player/PlayerSitting.ts');
  const st = g.world.store;
  const wx = Math.floor(p.cx / 16), wy = Math.floor((p.y + p.h) / 16);   // 脚下那格
  for (let dx = -2; dx <= 2; dx++) st.setTileSilent(wx + dx, wy - 1, 0, 0, 0);  // 清出椅身
  st.setTileSilent(wx, wy - 1, 15, 18, 0);      // 椅上半
  st.setTileSilent(wx, wy, 15, 18, 40);         // 椅下半(坐点格)
  const t = getSittingTargetInfo(st, wx, wy, 1);
  if (!t) return { err: 'no seat target' };
  p.x = t.sittingX - p.w / 2; p.y = t.sittingY - p.h;
  p.facing = t.targetDirection; p.sitting = true;
  p.seatOffsetX = t.offsetX; p.seatOffsetY = t.offsetY;
  p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 600));
  return { seated: p.sitting };
}).then(async (sitInfo) => ({ ...sitInfo, ...(sitInfo.seated ? await scan() : {}) }));
await shot('bj21-v6-sit');
console.log('BJ21-REPORT ' + JSON.stringify(report));
await browser.close();
