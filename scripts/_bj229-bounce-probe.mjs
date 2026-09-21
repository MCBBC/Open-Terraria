// ★BJ229 实机探针：水矢 27 / 水晶风暴 94 撞墙反弹（真实引擎循环）。
// 断言：走廊内发射 → vx 反号（反弹）、弹体存活、Item_10 反弹音被播（27）、
//       94 多次反号（无限反弹）。对照：普通箭 1 撞墙消亡。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5231';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const M = await import('/src/entities/Arrow.ts');
  const Arrow = M.Arrow;
  const store = g.world.store;
  const TILE = 16;
  const pcx = Math.floor(g.player.cx / TILE), pcy = Math.floor(g.player.cy / TILE);
  // 走廊：从玩家向右刻 14 格空气,尽头立 2 厚实心墙（石 1）,上下各 6 格
  const wx = pcx + 14;
  for (let x = pcx + 2; x < wx; x++) {
    for (let y = pcy - 6; y <= pcy + 6; y++) store.setTileSilent(x, y, 0, 0, 0);
  }
  for (let x = wx; x <= wx + 1; x++) {
    for (let y = pcy - 6; y <= pcy + 6; y++) store.setTileSilent(x, y, 1, 0, 0);
  }
  // 音效记录（挂 Game 实例方法,Arrow 走 game.playSfxFiles 通道）
  const sfxLog = [];
  const origSfx = g.playSfxFiles.bind(g);
  g.playSfxFiles = (f, ...a) => { sfxLog.push(Array.isArray(f) ? String(f[0]) : String(f)); return origSfx(f, ...a); };
  // 发射：水矢 27(4.5 速) / 水晶风暴 94(16 速) / 对照箭 1(4.5 速)
  const mk = (dx, dy, vx, vid) => {
    const p = new Arrow((pcx + 3) * TILE + dx, (pcy) * TILE + dy, vx, 0, 100, 2, vid,
      { grav: 0, life: vid === 27 ? 1800 : 600 });
    g.entities.add(p, 'projectiles');
    return p;
  };
  const wb = mk(0, -8, 4.5, 27);
  const cs = new Arrow((pcx + 3) * TILE, (pcy) * TILE + 40, 16, 0, 100, 2, 94, { grav: 0, life: 600 });
  g.entities.add(cs, 'projectiles');
  const ar = mk(0, 80, 4.5, 1);
  // 采样：每 200ms 记 vx 符号,持续 2.4s（≈144 tick;94 缩径杀 150t 前）
  const samples = { wb: [], cs: [], ar: [] };
  for (let i = 0; i < 12; i++) {
    await wait(200);
    samples.wb.push({ s: Math.sign(wb.vx), dead: wb.dead, x: Math.round(wb.x) });
    samples.cs.push({ s: Math.sign(cs.vx), dead: cs.dead, x: Math.round(cs.x) });
    samples.ar.push({ dead: ar.dead });
  }
  const flips = (arr) => {
    let n = 0, last = 0;
    for (const p of arr) { if (p.s !== 0 && p.s !== last && last !== 0) n++; if (p.s !== 0) last = p.s; }
    return n;
  };
  return {
    spawn: { pcx, pcy, wallX: wx },
    wb: { alive: !wb.dead, vxNow: Math.round(wb.vx * 100) / 100, flips: flips(samples.wb), minX: Math.min(...samples.wb.map(p => p.x)), maxX: Math.max(...samples.wb.map(p => p.x)) },
    cs: { alive: !cs.dead, flips: flips(samples.cs), minX: Math.min(...samples.cs.map(p => p.x)), maxX: Math.max(...samples.cs.map(p => p.x)) },
    ar: { dead: ar.dead },
    sfxLog,
    playerX: g.player.cx,
  };
});
console.log('[probe] result', JSON.stringify(res, null, 1));
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
const ok = res && res.wb.alive && res.wb.flips >= 1 && res.wb.vxNow < 0
  && res.cs.alive && res.cs.flips >= 3
  && res.ar.dead
  && res.wb.maxX <= (res.spawn.wallX * 16 + 20) && res.cs.maxX <= (res.spawn.wallX * 16 + 20)
  && res.sfxLog.length >= 1;
await browser.close().catch(() => {});
process.exit(ok && errs.length === 0 ? 0 : 1);
