// ★BJ252 探针：116 光束剑波（真圣剑 723）撞块 4 计实机验证。
// 手段：入世界后经 __swGame 直生 116 弹（freezeClock 关闭——弹体 AI 需真拍）,
// 朝右墙发射,记录每拍 vx 符号翻转与消亡拍;断言 3 次反弹 + 第 4 撞 Kill。
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
let spOk = false;
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); spOk = true; break; }
  catch { }
}
if (!spOk) { console.log('[probe] sp failed'); process.exit(1); }
const mapText = (await import('node:fs')).readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  window.__swLoadJson(t).catch(() => {});
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return { ok: !!window.__swGame?.world };
}, mapText);
if (!boot.ok) { console.log('[probe] world load failed', JSON.stringify(boot)); process.exit(1); }
console.log('[probe] world ready');
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  // 自建靶墙：出生点附近找开阔空气区（3×11 全空）,右缘建 7 高实心墙
  const st2 = g.world.store;
  let bx = -1, by = -1;
  outer: for (let y = py - 24; y < py + 20; y++) {
    for (let x = px + 2; x < px + 60; x++) {
      let open = true;
      for (let dx = -2; dx <= 8 && open; dx++)
        for (let dy = -3; dy <= 3 && open; dy++)
          if (st2.isSolid(x + dx, y + dy)) open = false;
      if (open) { bx = x; by = y; break outer; }
    }
  }
  if (bx < 0) return { fail: 'no-open-area' };
  const wallX2 = bx + 6, wallY2 = by;
  for (let dy = -3; dy <= 3; dy++) {
    st2.setTileSilent(wallX2, wallY2 + dy, 1, 0, 0);          // 右墙
    st2.setTileSilent(bx - 1, wallY2 + dy, 1, 0, 0);          // 左墙（走廊,弹反折返）
  }
  const sx = (bx) * 16 + 8, sy = wallY2 * 16 + 8;
  const proj0 = { sx, sy };
  return { sx: proj0.sx, sy: proj0.sy, wallX: wallX2, wallY: wallY2, px, py };
});
console.log('[probe] scan', JSON.stringify(result));
if (result.fail) { console.log('[probe] FAIL'); process.exit(1); }
// 直生 116:经页面内 dynamic import 拿 Arrow 类
const fire = await page.evaluate(async (s) => {
  const g = window.__swGame;
  const mod = await import('/src/entities/Arrow.ts');
  const Arrow = mod.Arrow;
  const proj = new Arrow(s.sx, s.sy, 11, 0, 100, 2, 116, { grav: 0, life: 600 });
  g.entities.add(proj, 'projectiles');
  const events = [];
  let lastVx = 11, bounces = 0, deadTick = -1, ticks = 0;
  for (let t = 0; t < 240 && !proj.dead; t++) {
    await new Promise((r) => requestAnimationFrame(r));
    ticks++;
    if (Math.sign(proj.vx) !== Math.sign(lastVx) && Math.abs(lastVx) > 0.01) {
      bounces++;
      events.push({ t, vx: +proj.vx.toFixed(3) });
    }
    lastVx = proj.vx;
    if (proj.dead) { deadTick = t; break; }
  }
  // 尘/音面:直生后弹反拍 = 30×d64 —— 计数池内 64 号尘
  let d64 = 0;
  for (const d of (g.vanillaDust?.pool ?? [])) { if (d?.active !== false && d?.type === 64) d64++; }
  return { bounces, deadTick, ticks, events, finalVx: +proj.vx.toFixed(3), d64,
    bouncesField: proj.beam116Bounces };
}, result);
console.log('[probe] 116 fire', JSON.stringify(fire));
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
const ok = fire.bounces === 3 && fire.deadTick > 0 && fire.bouncesField === 4;
console.log('[probe] VERDICT', ok ? 'GREEN' : 'RED', 'bounces=' + fire.bounces, 'deadTick=' + fire.deadTick, 'ai2=' + fire.bouncesField);
await browser.close().catch(() => {});
process.exit(ok && errs.length === 0 ? 0 : 1);
