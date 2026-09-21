// ★BJ227 实机探针：水上漂靴/泰拉靴液面站立-行走-下潜全链（用户实报「站一会慢慢沉」）。
// 场景：4200×1200 实尺寸世界（边框钳 B=640px 豁免域内选点），手工池 255 满液。
// 断言（vanilla 语义,守卫网=tests/bj227-waterwalk-surface-pin.test.ts）：
//   A 水上漂靴 863 落水面 → 钉位面顶（底=面顶±1px）、6s 逐样不沉、干态（inWater/wetSticky 假）、不没顶
//   B 面上行走 → x 推进、恒干态、底恒面顶
//   C 按 ↓ → 下潜入湿态（钉位豁免）
//   D 无靴对照 → 正常沉底入湿态
//   E 泰拉靴 5000 → 岩浆面钉位、inLava 恒假（探针缩 6px 不触浆）
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).catch(() => '<unser>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail/i.test(line)) console.log('[console]', line.slice(0, 300));
});

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5241') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { void window.__swFlow.newWorld('0522', 4200, 1200); });
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.player && window.__swGame?.world && window.__swItems));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}
console.log('[probe] world ready');

const build = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  // 清场 + 双池（水/岩浆）几何：floor 行 by+8、侧墙 ±41（防液体模拟侧漏降面）、
  // 液 4 行 by+4..by+7（面顶=(by+4)*16）
  for (let dx = -52; dx <= 170; dx++) for (let dy = -16; dy <= 10; dy++) st.setTile(bx + dx, by + dy, 0);
  const mk = (type, off) => {
    for (let dx = -40; dx <= 40; dx++) {
      st.setTile(bx + dx + off, by + 8, 1);
      for (let dy = 4; dy <= 7; dy++) st.setLiquid(bx + dx + off, by + dy, 255, type);
    }
    for (const wx of [-41, 41]) for (let dy = 2; dy <= 8; dy++) st.setTile(bx + wx + off, by + dy, 1);
  };
  mk(1, 0);            // 水池（原地）
  mk(2, 120);          // 岩浆池（右 120 格）
  return { bx, by, waterSurf: (by + 4) * 16, lavaX: (bx + 120) * 16, lavaSurf: (by + 4) * 16 };
});
console.log('[probe] built', JSON.stringify(build));
await new Promise((r) => setTimeout(r, 300));

const equip = await page.evaluate((vid) => {
  const g = window.__swGame;
  const p = g.player;
  const keys = Object.keys(window.__swItems);
  const k = keys.find((x) => new RegExp(`^vi_${vid}_`).test(x));
  if (!k) return { fail: 'item-missing', vid };
  p.inv.armor[3] = { id: window.__swItems[k], stack: 1 };
  return { ok: true, key: k, waterWalk: p.equipStats.waterWalk, waterWalkLava: p.equipStats.waterWalkLava };
}, 863);
console.log('[probe] equip 863', JSON.stringify(equip));
if (!equip.ok) { await browser.close(); process.exit(1); }

// ---- A：落水面钉位 + 6s 逐样不沉 + 干态 ----
const place = await page.evaluate((s) => {
  const p = window.__swGame.player;
  const st = window.__swGame.world.store;
  const bx = Math.floor(p.x / 16);
  st.setTile(bx - 2, s.by - 1, 0); st.setTile(bx - 2, s.by - 2, 0);
  p.x = bx * 16; p.y = (s.by - 6) * 16; p.vx = 0; p.vy = 0; p.fallStartY = null;
  return { ok: true, y: p.y };
}, build);
console.log('[probe] placed', JSON.stringify(place));
await new Promise((r) => setTimeout(r, 1500));   // 落定
const samples = [];
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => {
    const p = window.__swGame.player;
    return { y: p.y, vy: p.vy, inWater: p.inWater, wet: p.wetSticky, head: p.headUnderwater, ws: p.onWaterSurface, bottom: p.y + p.h };
  });
  samples.push(s);
  await new Promise((r) => setTimeout(r, 150));
}
const surf = build.waterSurf;
const maxB = Math.max(...samples.map((s) => s.bottom));
const minB = Math.min(...samples.map((s) => s.bottom));
const L = [];
L.push(['A1 面顶钉位', Math.abs(maxB - surf) <= 1, `bottom=${maxB.toFixed(1)} surf=${surf}`]);
L.push(['A2 6s 不沉（max-min≤1px）', maxB - minB <= 1, `drift=${(maxB - minB).toFixed(2)}`]);
L.push(['A3 干态站立', samples.every((s) => !s.inWater && !s.wet), 'inWater/wetSticky 全假']);
L.push(['A4 不没顶', samples.every((s) => !s.head), 'headUnderwater 全假']);
L.push(['A5 onWaterSurface 置位', samples.every((s) => s.ws), '全真']);

// ---- B：行走 ----
await page.keyboard.down('ArrowRight');
await new Promise((r) => setTimeout(r, 2000));
const x1 = await page.evaluate(() => window.__swGame.player.x);
await page.keyboard.up('ArrowRight');
const walk = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { inWater: p.inWater, wet: p.wetSticky, bottom: p.y + p.h };
});
L.push(['B1 水面行走推进', x1 - (build.bx * 16) >= 100, `dx=${(x1 - build.bx * 16).toFixed(0)}px`]);
L.push(['B2 行走恒干态', !walk.inWater && !walk.wet, '']);
L.push(['B3 行走恒面顶', Math.abs(walk.bottom - surf) <= 1, `bottom=${walk.bottom.toFixed(1)}`]);

// ---- C：按 ↓ 下潜 ----
await page.keyboard.down('ArrowDown');
await new Promise((r) => setTimeout(r, 1500));
const dive = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { y: p.y, inWater: p.inWater, wet: p.wetSticky, ws: p.onWaterSurface };
});
await page.keyboard.up('ArrowDown');
L.push(['C1 下潜入水', dive.y > (build.by - 6) * 16 + 24, `dy=${(dive.y - (build.by - 6) * 16).toFixed(0)}px`]);
L.push(['C2 湿态翻转', dive.inWater || dive.wet, '']);

// ---- D：无靴对照（摘靴落同池） ----
await page.evaluate((s) => {
  const p = window.__swGame.player;
  p.inv.armor[3] = null;
  const bx = Math.floor(p.x / 16);
  void bx; void s;
  p.x = s.bx * 16; p.y = (s.by - 6) * 16; p.vx = 0; p.vy = 0;
}, build);
await new Promise((r) => setTimeout(r, 2000));
const ctl = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { bottom: p.y + p.h, inWater: p.inWater, og: p.onGround };
});
L.push(['D1 无靴下沉', ctl.bottom > surf + 32, `bottom=${ctl.bottom.toFixed(1)} vs surf=${surf}`]);
L.push(['D2 无靴湿态', ctl.inWater, '']);

// ---- E：泰拉靴岩浆面 ----
const equip2 = await page.evaluate((vid) => {
  const g = window.__swGame;
  const p = g.player;
  const keys = Object.keys(window.__swItems);
  const k = keys.find((x) => new RegExp(`^vi_${vid}_`).test(x));
  if (!k) return { fail: 'item-missing', vid };
  p.inv.armor[3] = { id: window.__swItems[k], stack: 1 };
  p.x = (Math.floor(p.x / 16) + 120) * 16; p.y = (Math.floor(p.y / 16) - 14) * 16;
  p.vx = 0; p.vy = 0;
  return { ok: true, waterWalkLava: p.equipStats.waterWalkLava };
}, 5000);
console.log('[probe] equip 5000', JSON.stringify(equip2));
await new Promise((r) => setTimeout(r, 2000));
const lava = [];
for (let i = 0; i < 20; i++) {
  const s = await page.evaluate(() => {
    const p = window.__swGame.player;
    return { bottom: p.y + p.h, inLava: p.inLava, ws: p.onWaterSurface, hp: p.hp };
  });
  lava.push(s);
  await new Promise((r) => setTimeout(r, 150));
}
const maxL = Math.max(...lava.map((s) => s.bottom));
L.push(['E1 泰拉靴岩浆面钉位', Math.abs(maxL - build.lavaSurf) <= 1, `bottom=${maxL.toFixed(1)} surf=${build.lavaSurf}`]);
L.push(['E2 不触浆（探针缩6px）', lava.every((s) => !s.inLava), 'inLava 全假']);
L.push(['E3 存活', lava.every((s) => s.hp > 0), `hp=${lava[lava.length - 1].hp}`]);

console.log('\n===== BJ227 探针判读 =====');
let pass = true;
for (const [name, ok, note] of L) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`);
  if (!ok) pass = false;
}
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(pass && errs.length === 0 ? 0 : 1);
