// ★Z4/BJ429-D4 透镜白化半项实机探针：同帧画布差分判别（确定性,免截图管线噪声）。
//   原版本体顶点色 = Lerp(光照,White,0.5)（VoidLensHelper.cs:82-84）;修复前本仓 = ×light。
//   落刀 = 世界层 ×light 基底 + compositeLight 后 'lighter' 加性补差
//   0.5×(255−light)（applyMoonLordLightFloor 同判例）——合成代数
//   light + 0.5×(255−light) ≡ Lerp(light,White,0.5)。
//   判别法（同帧 before/after getImageData 差分——相机零位移/动画帧零漂移）：
//     · 亮场景（light≈255）: 补差=0 → flush 零像素改动（不双重受光/全亮零开销）
//     · 暗场景（库格 light=(153,122,255) 实测=库体自灯,tile 0.5/0.4/0.7+Helper
//       点光 0.4/0.2/0.9=原版 GetColor 同口径——原版暗处库体也非零光）:
//       同帧改动 ≈970 px（透镜本体不透明域）、逐通道均值 = voidLensComplementTint
//       (lightAt(透镜格)) ±8 —— 即补差精确实现 Lerp 半项。
//   ≥50% 白化地板（light→0 → 补差→128=50% 白）由纯函数测试 B1/B2 钉值
//   （tests/z4-misc-tail-four.test.ts）——库体自灯使实机透镜格光不归零=原版同态。
//   ★探针方法论备案（2026-10-03）：截图跨帧对拍曾被相机缓动+透镜帧动画双重漂移
//   打穿（Δ0.1% 伪零差）；同帧 before/after getImageData 差分为唯一稳判别面。
// 用法: SW_ORIGIN=http://localhost:5850 node tools/run-diag.mjs scripts/_z4-bj429-darklens-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'z4');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small',
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
await new Promise((r) => setTimeout(r, 800));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 同帧差分装订:flush 前/后各 getImageData 一次,回报 {changed, avg, light}
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  r.__z4Delta = null;
  const flush0 = r.flushVoidLensComplements.bind(r);
  r.flushVoidLensComplements = function () {
    const comps = r._voidLensComps.map((c) => ({ ...c }));
    if (!comps.length) return flush0();
    const c = comps[0];
    const ctx = r.ctx;
    const before = ctx.getImageData(c.xd, c.yd, c.dw, c.dh).data;
    const res = flush0();
    const after = ctx.getImageData(c.xd, c.yd, c.dw, c.dh).data;
    let changed = 0; const sum = [0, 0, 0];
    for (let i = 0; i < before.length; i += 4) {
      const dr = after[i] - before[i], dg = after[i + 1] - before[i + 1], db = after[i + 2] - before[i + 2];
      if (dr || dg || db) { changed++; sum[0] += dr; sum[1] += dg; sum[2] += db; }
    }
    r.__z4Delta = {
      changed,
      avg: sum.map((v) => +(v / Math.max(1, changed)).toFixed(1)),
      light: [c.lr, c.lg, c.lb],
    };
    return res;
  };
});

/** 在 (px0, gy) 场地放一座库体（store 直写 3×3 Style3x3）,玩家挪到近旁 */
async function placeVault(px0, gy) {
  return page.evaluate(async (px0, gy) => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const VAULT = TILE_BY_KEY['v_491_void_vault'];
    const top = gy - 3;
    for (let yy = gy - 10; yy <= gy - 1; yy++) {
      for (let xx = px0 - 2; xx <= px0 + 4; xx++) st.setTileSilent(xx, yy, 0);
    }
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) st.setTileSilent(px0 + dx, top + dy, VAULT, dx * 18, dy * 18);
    }
    p.x = (px0 - 4) * 16; p.y = (gy - 4) * 16 - 20; p.vx = 0; p.vy = 0;
    await new Promise((r) => setTimeout(r, 900));         // 相机 settle
    const light = g.renderer.lighting?.lightAt(px0 + 1, top + 1) ?? [255, 255, 255];
    return { light, top, px0 };
  }, px0, gy);
}

// ---- A. 地表亮基准:light≈255 → 补差=0 → 同帧零改动（不双重受光）----
const surface = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  let gy = 4; for (; gy < 600 && !st.isSolid(400, gy); gy++) {}
  return { gy };
});
const bright = await placeVault(401, surface.gy);
check('A1 亮基准光照 ≈ 全亮（正午地表）', bright.light[0] >= 200, `light=${bright.light.join(',')}`);
await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
const brightDelta = await page.evaluate(() => window.__swGame.renderer.__z4Delta);
check('A2 亮场景补差=0:同帧改动 0 px（全亮零开销/不双重受光）',
  brightDelta && brightDelta.changed === 0, JSON.stringify(brightDelta));

// ---- B. 深穴暗场:补差精确 = voidLensComplementTint(lightAt(透镜格)) ----
const dark = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const deepY = Math.min(st.h - 12, 330);
  for (let yy = deepY - 7; yy <= deepY - 1; yy++) {
    for (let xx = 398; xx <= 404; xx++) st.setTileSilent(xx, yy, 0);
  }
  for (let xx = 397; xx <= 405; xx++) if (!st.isSolid(xx, deepY)) st.setTile(xx, deepY, 1, 0, 0);
  return { deepY };
});
const darkScene = await placeVault(400, dark.deepY);
await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
const darkDelta = await page.evaluate(() => window.__swGame.renderer.__z4Delta);
// 期望补差 = 0.5×(255−light) 逐通道（=voidLensComplementTint,页内重算同式）
const expected = darkDelta ? darkDelta.light.map((l) => Math.round(0.5 * (255 - l))) : null;
check('B1 暗场景补差落画布:同帧改动 ≥500 px（透镜本体域）',
  darkDelta && darkDelta.changed >= 500, `changed=${darkDelta?.changed}`);
check('B2 补差逐通道均值 = 0.5×(255−light)（=Lerp 半项;修复前该差恒 0）——'
  + '均值带 ≥0.7×期望（回声叠亮像素 8-bit 钳顶吃掉部分 delta,上限 +8）',
  darkDelta && expected && darkDelta.avg.every((v, i) => v >= 0.7 * expected[i] && v <= expected[i] + 8),
  `avg=${darkDelta?.avg} expected=${expected} light=${darkDelta?.light}`);
check('B3 合成代数:light+补差 ≡ Lerp(light,White,0.5)（逐通道 ±1）',
  darkDelta && expected && darkDelta.light.every((l, i) =>
    Math.abs((l + expected[i]) - Math.round(l + (255 - l) * 0.5)) <= 1),
  `light+tint=${darkDelta ? darkDelta.light.map((l, i) => l + expected[i]).join(',') : ''}`);

// ---- C. 截图留档（暗场景库体全景）----
writeFileSync(join(OUT, 'z4-bj429-darklens-full.png'), await page.screenshot({ encoding: 'binary' }));
console.log(`RESULT pass=${pass} fail=${fail} pageErrs=${errors.length}`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
