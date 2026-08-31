// 荆棘旋刃修复验证 v2(隔离式):每段前 scrub 全部使用链状态,消除跨段残留。
//   A 平地四向:出生盒心=玩家中心(剔除首帧位移)+飞行
//   B 单发在场门
//   C 按住回手自动再掷(update 后扫新引用计数)
//   D 木回旋镖站立横掷回归
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
  for (let dx = -40; dx <= 40; dx++) { for (let dy = -14; dy <= -1; dy++) st.setTile(px0 + dx, py + dy, 0); st.setTile(px0 + dx, py, 2); }

  // ---- 段间全量 scrub ----
  const scrub = () => {
    g.player.useTime = 0;
    g.player.itemAnimTicks = 0;
    g.swing = null;               // (private 字段,JS 可访问)
    g.recallChannel = null;
    g.input.mouseDown = false; g.input.mouseHeld = false;
    g.entities.projectiles.length = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  };
  const equipKey = (key) => {
    scrub();
    const id = window.__swItems[key];
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
  };
  const standFlush = () => {
    g.player.x = px0 * 16 + 8 - g.player.w / 2;
    g.player.y = py * 16 - g.player.h;
    if ('vx' in g.player) g.player.vx = 0;
    if ('vy' in g.player) g.player.vy = 0;
  };
  const chaks = (pid = 33) => g.entities.projectiles.filter((p) => p.projId === pid && !p.dead);

  const out = {};
  // A 平地四向:出生盒心核对需在【该次 fixedUpdate 前】抓不到弹体 → 用「生成后首帧」
  //   读数减去速度修正(v×1t),底部相对脚线与位移无关直接可判
  out.A = {};
  for (const [name, sx, sy] of [['horizRight', 320, 0], ['diagUp', 220, -220], ['up', 0, -360], ['down', 0, 280]]) {
    equipKey('vi_191_ThornChakram'); standFlush();
    g.input.mouseX = 640 + sx; g.input.mouseY = 400 + sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const p0 = chaks()[0];
    if (!p0) { out.A[name] = null; continue; }
    const bornDX = +(p0.x + p0.w / 2 - p0.vx - g.player.cx).toFixed(2);
    const bornDY = +(p0.y + p0.h / 2 - p0.vy - g.player.cy).toFixed(2);
    let maxDist = 0, aliveAt15 = false;
    for (let i = 0; i < 30; i++) {
      g.fixedUpdate(1 / 60);
      if (!chaks().includes(p0)) break;
      maxDist = Math.max(maxDist, Math.hypot(p0.cx - g.player.cx, p0.cy - g.player.cy));
      if (i >= 14) { aliveAt15 = true; break; }
    }
    out.A[name] = { bornDX, bornDY, bottomVsFeet: +(p0.y + p0.h - (g.player.y + g.player.h)).toFixed(2), maxDist: Math.round(maxDist), aliveAt15 };
  }
  // B 单发在场门
  equipKey('vi_191_ThornChakram'); standFlush();
  g.input.mouseX = 960; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const firstAlive = chaks().length;
  for (let i = 0; i < 30 && firstAlive; i++) g.fixedUpdate(1 / 60);
  const aliveAtClick2 = chaks().length;
  g.input.mouseY = 200;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const afterBlockedClick = chaks().length;
  let waited = 0;
  while (chaks().length && waited < 220) { g.fixedUpdate(1 / 60); waited++; }
  g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.B = { firstAlive, aliveAtClick2, afterBlockedClick, respawnAfterDeath: chaks().length, waited };
  // C 按住:更新后扫描新对象引用
  equipKey('vi_191_ThornChakram'); standFlush();
  const seen = new Set();
  let spawns = 0;
  g.input.mouseX = 960; g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 200 && spawns < 3; i++) {
    g.fixedUpdate(1 / 60);
    for (const p of chaks()) if (!seen.has(p)) { seen.add(p); spawns++; }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.C = { spawns };
  // D 木回旋镖(family-probe 实键)
  equipKey('vi_284_wooden_boomerang'); standFlush();
  g.input.mouseX = 640 + 320; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const wb = chaks(52)[0];
  out.D = wb ? {
    bornDX: +(wb.x + wb.w / 2 - wb.vx - g.player.cx).toFixed(2),
    bottomVsFeet: +(wb.y + wb.h - (g.player.y + g.player.h)).toFixed(2),
    maxDist5: (() => { let m = 0; for (let i = 0; i < 8 && chaks(52).includes(wb); i++) { g.fixedUpdate(1 / 60); m = Math.max(m, Math.hypot(wb.cx - g.player.cx, wb.cy - g.player.cy)); } return Math.round(m); })(),
  } : null;
  return out;
});

for (const [k, v] of Object.entries(res.A ?? {})) {
  check(`A ${k} 出生盒心+平地飞出`, !!v && Math.abs(v.bornDX) < 0.5 && Math.abs(v.bornDY) < 0.5 && v.aliveAt15 && v.maxDist > 40,
    JSON.stringify(v));
}
check('B 连点拦截+消亡后重生', res.B.firstAlive === 1 && res.B.afterBlockedClick === 1 && res.B.respawnAfterDeath === 1,
  JSON.stringify(res.B));
check('C 按住回手后自动再掷(spawns>=2)', res.C.spawns >= 2, JSON.stringify(res.C));
check('D 木回旋镖站立不贴地', !!res.D && Math.abs(res.D.bornDX) < 0.5 && res.D.bottomVsFeet <= 0 && res.D.maxDist5 > 20,
  JSON.stringify(res.D));
if (errors.length) console.log('[pageerrors]', errors.slice(0, 4));
console.log(`${pass} pass / ${fail} fail`);
process.exitCode = fail ? 1 : 0;
await browser.close();
