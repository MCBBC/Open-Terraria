// 移动场景生成位置验证：玩家持续跑动（模拟真实游玩），记录每个新生成敌人
// 出生瞬间相对【相机视口】的可见性 + 与玩家距离分布
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForSelector('select', { timeout: 30000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;
  // 地表清一条跑道（防卡墙），让玩家持续右跑
  const py = Math.floor(g.world.groundLevel) - 4;
  for (let x = 100; x < st.w - 100; x++) {
    for (let y = py - 6; y <= py; y++) st.setTile(x, y, 0);
    st.setTile(x, py + 1, 2);
  }
  g.player.x = 150 * 16; g.player.y = py * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  // 记录：相机视口内的"新出现"敌人 + spawner 落脚点追踪
  const events = [];
  const origSpawn = g.vanillaSpawner.spawn.bind(g.vanillaSpawner);
  g.vanillaSpawner.spawn = (px, py, rng, hw, hh) => {
    const e = origSpawn(px, py, rng, hw, hh);
    if (e) events.push({
      track: 'spawn-return',
      key: e.key, vanillaId: e.vanillaId,
      tileX: g.vanillaSpawner.currentSpawnX, tileY: g.vanillaSpawner.currentSpawnY,
      entX: Math.floor((e.x ?? 0) / 16), entY: Math.floor((e.y ?? 0) / 16),
      playerTX: Math.floor(g.player.cx / 16), playerTY: Math.floor(g.player.cy / 16),
    });
    return e;
  };
  const seen = new Set();
  const enemiesArr = () => g.entities.enemies;
  const inView = (e) => {
    const halfW = g.camera.viewW / (g.camera.zoom || 1) / 2;
    const halfH = g.camera.viewH / (g.camera.zoom || 1) / 2;
    return Math.abs(e.cx - g.camera.x) < halfW && Math.abs(e.cy - g.camera.y) < halfH;
  };
  let dir = 1;
  for (let i = 0; i < 60 * 60; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    // 模拟跑动输入
    g.input.keys.KeyD = dir > 0; g.input.keys.KeyA = dir < 0;
    g.fixedUpdate(1 / 60);
    // 每 10 tick 扫一次新敌人
    if (i % 10 === 0) {
      for (const e of enemiesArr()) {
        if (seen.has(e.id) || e.dead) continue;
        seen.add(e.id);
        const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
        const etx = Math.floor(e.cx / 16), ety = Math.floor(e.cy / 16);
        events.push({
          key: e.key, vanillaId: e.vanillaId,
          bornInCameraView: inView(e),
          distTiles: Math.round(Math.hypot(etx - ptx, ety - pty)),
          dy: ety - pty, // 负=上方 正=下方（洞穴钻出）
        });
      }
    }
    // 撞到跑道尽头折返
    if (g.player.cx / 16 > st.w - 150) dir = -1;
    if (g.player.cx / 16 < 150) dir = 1;
  }
  g.input.keys.KeyD = false; g.input.keys.KeyA = false;
  const inViewCount = events.filter((e) => e.bornInCameraView).length;
  const close = events.filter((e) => e.distTiles < 25);
  const fromBelow = events.filter((e) => e.dy > 12);
  return {
    total: events.length,
    inViewCount,
    closeCount: close.length,
    fromBelow: fromBelow.length,
    inViewSamples: events.filter((e) => e.bornInCameraView).slice(0, 10),
    all: events.slice(0, 15),
  };
});
console.log(JSON.stringify(out, null, 1));
check('移动场景有生成样本', out.total > 0, `total=${out.total}`);
check('无相机视口内出生（原版 safeArea 语义）', out.inViewCount === 0, `inView=${out.inViewCount}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
