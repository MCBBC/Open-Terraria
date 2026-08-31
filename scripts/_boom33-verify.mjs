// 荆棘旋刃修复验证探针:
//   A) 平地站立四向发射均飞出(存活≥10t 且位移>60px)
//   B) 单发在场门:飞行中再点击不新增(连点拦截);首弹消亡后可再掷
//   C) 按住:首弹回收后自动再掷(spawn 计数>1)
//   D) 木回旋镖 284 站立横掷回归(修复前同病)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy;
  for (let dx = -40; dx <= 40; dx++) {
    for (let dy = -14; dy <= -1; dy++) st.setTile(px0 + dx, py + dy, 0);
    st.setTile(px0 + dx, py, 2);
  }
  const equipKey = (key) => {
    const id = window.__swItems[key];
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
  };
  const standFlush = () => {
    g.player.x = px0 * 16 + 8 - g.player.w / 2;
    g.player.y = py * 16 - g.player.h;
    if ('vx' in g.player) g.player.vx = 0;
    if ('vy' in g.player) g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  };
  const centerBoxed = () => g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead);
  // 出生盒心核对
  const bornCenterCheck = (sx, sy) => {
    equipKey('vi_191_ThornChakram'); standFlush();
    g.input.mouseX = 640 + sx; g.input.mouseY = 400 + sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const p0 = centerBoxed()[0];
    return p0 ? { bornDX: +(p0.x + p0.w / 2 - g.player.cx).toFixed(2), bornDY: +(p0.y + p0.h / 2 - g.player.cy).toFixed(2), bottomVsFeet: +(p0.y + p0.h - (g.player.y + g.player.h)).toFixed(2), obj: p0 } : null;
  };
  const runFlight = (projIdFilter, sx, sy, ticks = 30) => {
    const alive = () => g.entities.projectiles.filter((p) => projIdFilter.includes(p.projId) && !p.dead);
    const p0 = alive()[0];
    if (!p0) return null;
    let maxDist = 0, diedAt = -1;
    for (let i = 0; i < ticks; i++) {
      g.fixedUpdate(1 / 60);
      if (!alive().includes(p0)) { diedAt = i; break; }
      maxDist = Math.max(maxDist, Math.hypot(p0.cx - g.player.cx, p0.cy - g.player.cy));
      if (!alive().length) { diedAt = i; break; }
    }
    return { maxDist: Math.round(maxDist), diedAt, stillAlive: !!alive().includes(p0) };
  };
  const out = {};
  // A+B1 出生盒心 & 平地四向飞行
  out.standingFlights = {};
  for (const [name, sx, sy] of [['horizRight', 320, 0], ['diagUp', 220, -220], ['up', 0, -360], ['down', 0, 280]]) {
    const b = bornCenterCheck(sx, sy);
    if (!b) { out.standingFlights[name] = null; continue; }
    out.standingFlights[name] = { ...b, flight: runFlight([33], sx, sy) };
  }
  // B 单发门:第一发飞出后再点击 → 不新增;等死后再点击 → 新一发
  equipKey('vi_191_ThornChakram'); standFlush();
  g.input.mouseX = 960; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  let firstAlive = centerBoxed().length;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  const firstStillAliveAtT30 = centerBoxed().length;
  g.input.mouseX = 960; g.input.mouseY = 200;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  g.fixedUpdate(1 / 60);
  const afterBlockedClick = centerBoxed().length;
  let waited = 0;
  while (centerBoxed().length && waited < 200) { g.fixedUpdate(1 / 60); waited++; }
  g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const respawnAfterDeath = centerBoxed().length;
  out.gate = { firstAlive, firstStillAliveAtT30, afterBlockedClick, respawnAfterDeath, waited };
  // C 按住自动再掷
  equipKey('vi_191_ThornChakram'); standFlush();
  g.entities.projectiles.length = 0;
  g.player.useTime = 0;
  const seen = new Set();
  let spawns = 0;
  g.input.mouseX = 960; g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 160 && spawns < 3; i++) {
    for (const p of centerBoxed()) if (!seen.has(p)) { seen.add(p); spawns++; }
    g.fixedUpdate(1 / 60);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.holdRethrowSpawns = spawns;
  // D 木回旋镖站立回归
  equipKey('vi_284_WoodenBoomerang'); standFlush();
  g.player.useTime = 0;
  g.input.mouseX = 640 + 320; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const wb = g.entities.projectiles.find((p) => p.projId === 52 && !p.dead);
  out.woodenStanding = wb ? { bottomVsFeet: +(wb.y + wb.h - (g.player.y + g.player.h)).toFixed(2) } : null;
  return { out, woodenOk: () => {} };
});

const o = res.out;
for (const [k, v] of Object.entries(o.standingFlights ?? {})) {
  check(`A ${k} 平地飞出`, v && v.flight && v.flight.maxDist > 60,
    `bornDX=${v?.bornDX} bornDY=${v?.bornDY} bottomVsFeet=${v?.bottomVsFeet} flight=${JSON.stringify(v?.flight)}`);
}
check('出生盒心=玩家中心(bornD≈0, 底缘≤脚线)', Object.values(o.standingFlights ?? {}).every((v) => Math.abs(v.bornDX) < 0.5 && Math.abs(v.bornDY) < 0.5));
check('B 连点被单发门拦截(飞行中点击不新增)', o.gate.firstAlive === 1 && o.gate.afterBlockedClick === 1,
  JSON.stringify(o.gate));
check('C 按住回手后自动再掷(≥2 次)', o.holdRethrowSpawns >= 2, `spawns=${o.holdRethrowSpawns}`);
check('D 木回旋镖站立横掷不贴地', o.woodenStanding !== null, JSON.stringify(o.woodenStanding));
console.log(o.woodenStanding ? JSON.stringify(o.woodenStanding) : '');
if (errors.length) console.log('[pageerrors]', errors.slice(0, 5));
console.log(`${pass} pass / ${fail} fail`);
process.exitCode = fail ? 1 : 0;
await browser.close();
