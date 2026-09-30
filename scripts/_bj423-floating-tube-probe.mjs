// ★BJ423 浮游圈（FloatingTube 4404）实机探针（用户实报：「浮游圈」没有生效）。
// 判别面：
//  ①模型旗：装备 vi_4404 → equipStats.hasFloatingTube/canFloat 双 true（功能槽）；
//    per-slot 隐藏 → hasFloatingTube 翻 false / canFloat 保持（差分面①）；社交槽
//    13 挂圈 → hasFloatingTube true / canFloat false（差分面②）。
//  ②绘制面：同机位「挂圈/卸圈」双拍像素差分（腰部带区 Extra_105 粉环 255,66,152
//    背带 + 前弧）——卸圈态 diff≈0 基线、挂圈态腰部出现粉色管体像素。
//  ③浮液物理回归锁：入水松手 → 玩家浮至水面附近（ShouldFloatInWater 面,既有
//    实装 BJ 前域,本刀不触碰）。
// 运行：SW_ORIGIN=http://localhost:5620 node tools/run-diag.mjs scripts/_bj423-floating-tube-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5620';
const EV = new URL('../docs/evidence/bj423/', import.meta.url).pathname;
mkdirSync(EV, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
{
  const ack = await page.$('#sw-welcome-announce button');
  if (ack) { await ack.click(); await new Promise((r) => setTimeout(r, 400)); }
}

const grab = () => page.evaluate(() => {
  let best = null, area = 0;
  document.querySelectorAll('canvas').forEach((c) => { if (c.width * c.height > area) { area = c.width * c.height; best = c; } });
  const c2 = best.getContext('2d');
  const d = c2.getImageData(0, 0, best.width, best.height).data;
  return { d: [...d], w: best.width, h: best.height };
});
// 腰部带区粉色管体像素统计（Extra_105 背带主色 255,66,152 家族 + 前弧暗红 85,0,39）
function countTube(d) {
  let pink = 0, dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 140 && g < 140 && b > 60 && b < 200 && r - b > 60) pink++;       // 粉/红高 R 低 G
    else if (r > 40 && r < 130 && g < 45 && b < 80 && r > g + 25) dark++;    // 暗红弧
  }
  return { pink, dark };
}

// ---- ①模型旗三态 ----
const flags = await page.evaluate(() => {
  const g = window.__swGame, byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_4404_/.test(k));
  if (!key) return { ok: false, probe: Object.keys(byKey).filter((k) => /4404/.test(k)) };
  const id = byKey[key];
  const p = g.player;
  // ★探针外观自装（?play=small 快进跳过建角 → appearance=null → legacy 路径,
  //   doll 块整支不执行——2026-10-01 插桩定谳）。装默认外观走真实纸娃娃路径,
  //   与正常玩法（applyAppearance 恒落位）同构。值 = Appearance.ts DEFAULT_COLORS。
  if (!p.appearance) {
    p.appearance = {
      name: 'bj423', hair: 0, skinVariant: 0,
      hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 },
      eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 175, g: 165, b: 140 },
      undershirtColor: { r: 160, g: 180, b: 215 }, pantsColor: { r: 255, g: 230, b: 175 },
      shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 0, team: 0, voicePitchOffset: 0,
    };
  }
  p.inv.armor[3] = { id, stack: 1 };            // 功能槽 3
  const on = { tube: p.equipStats.hasFloatingTube, float: p.equipStats.canFloat };
  p.hideVisibleAccessory[3] = true;             // 差分面①：隐藏挡管不挡浮
  const hidden = { tube: p.equipStats.hasFloatingTube, float: p.equipStats.canFloat };
  p.hideVisibleAccessory[3] = false;
  delete p.inv.armor[13];
  p.inv.armor[13] = { id, stack: 1 };           // 差分面②：社交槽
  delete p.inv.armor[3];
  const vanity = { tube: p.equipStats.hasFloatingTube, float: p.equipStats.canFloat };
  delete p.inv.armor[13];
  const bare = { tube: p.equipStats.hasFloatingTube, float: p.equipStats.canFloat };
  p.inv.armor[3] = { id, stack: 1 };            // 还原功能槽（绘制面用）
  return { ok: true, key, on, hidden, vanity, bare };
});
console.log('FLAGS:', JSON.stringify(flags));
if (!flags.ok) { console.error('FAIL: vi_4404 未注册', JSON.stringify(flags)); await browser.close(); process.exit(2); }

// ---- ②绘制面双拍（同机位：卸圈 vs 挂圈） ----
await new Promise((r) => setTimeout(r, 600));
const withTubeShot = await grab();
const withTube = countTube(withTubeShot.d);
await page.evaluate(() => { delete window.__swGame.player.inv.armor[3]; });   // 卸圈
await new Promise((r) => setTimeout(r, 600));
const noTubeShot = await grab();
const noTube = countTube(noTubeShot.d);
await page.evaluate(() => { window.__swGame.player.inv.armor[3] = { id: window.__swItems['vi_4404_inner_tube'] ?? window.__swItems[Object.keys(window.__swItems).find((k) => /^vi_4404_/.test(k))], stack: 1 }; });
await new Promise((r) => setTimeout(r, 300));

let pixelDiff = 0;
for (let i = 0; i < withTubeShot.d.length; i += 4) {
  if (Math.abs(withTubeShot.d[i] - noTubeShot.d[i]) > 12
    || Math.abs(withTubeShot.d[i + 1] - noTubeShot.d[i + 1]) > 12
    || Math.abs(withTubeShot.d[i + 2] - noTubeShot.d[i + 2]) > 12) pixelDiff++;
}
console.log('PIXELS:', JSON.stringify({ withTube, noTube, pixelDiff }));

// 截图留档（挂圈态）
await page.evaluate(() => { /* 还原挂圈态已在上一步 */ });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${EV}bj423-tube-equipped.png` });

// ---- ③浮液物理（入水松手 → 上浮至水面） ----
const water = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const st = g.world.store;
  // ★亮场景定谳（2026-10-01 二跑教训：传送洞穴湖/图边海=黑屏证据无效）：出生点
  //   地表自建带壁水池（API=_b2b-indoor-repro st.type/flags + _behavior2-smoke
  //   liquid/liquidType）——地表日光全亮,管体/浮姿同帧可证。
  const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
  let gy = ty;
  while (gy < st.h - 6 && !st.isSolid(tx, gy)) gy++;
  // 池壁（土块）: 两侧柱 gy-4..gy-1 + 池底密封层 gy 全宽（地表坡度=排水漏点,
  // 2026-10-01 三跑教训：仅两侧柱时坡地水从池底侧漏 → FLOAT 态 wet=false）
  for (let dx = -4; dx <= 4; dx++) {
    const i = st.idx(tx + dx, gy);
    st.type[i] = 1; st.flags[i] = 1;
  }
  for (const wx of [tx - 4, tx + 4]) {
    for (let dy = 1; dy <= 4; dy++) {
      const i = st.idx(wx, gy - dy);
      st.type[i] = 1; st.flags[i] = 1;
    }
  }
  // 池体: tx-3..tx+3 × gy-3..gy-1 清格+满水
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      const i = st.idx(tx + dx, gy - dy);
      st.type[i] = 0; st.flags[i] = 0;
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  // 玩家置池心水下
  p.x = tx * 16 + 8 - p.w / 2; p.y = (gy - 2) * 16; p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 900));
  return { ok: true, spot: { x: tx, y: gy - 3 }, x: p.x, y: p.y, gy };
});
console.log('WATER:', JSON.stringify(water));
// 松手 2.5s 采样（不按键——ShouldFloatInWater 要求 !controlDown）
await new Promise((r) => setTimeout(r, 2500));
const floatState = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { y: Math.round(p.y), vy: Math.round(p.vy * 100) / 100, wet: p.inWater, dead: !!p.dead };
});
console.log('FLOAT:', JSON.stringify(floatState));
await page.screenshot({ path: `${EV}bj423-tube-in-water.png` });

const verdict = {
  flagsOk: flags.on.tube === true && flags.on.float === true
    && flags.hidden.tube === false && flags.hidden.float === true
    && flags.vanity.tube === true && flags.vanity.float === false
    && flags.bare.tube === false && flags.bare.float === false,
  drawOk: pixelDiff > 40 && withTube.pink > 8,
  floatOk: floatState.wet && !floatState.dead && floatState.vy < 3,
  pageErrors: errs,
};
console.log('VERDICT:', JSON.stringify(verdict));
await browser.close();
process.exit(verdict.flagsOk && verdict.drawOk ? 0 : 1);
