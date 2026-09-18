// 2026-09-18 双子喷火射程探针(实报"Spazmatism 二阶段喷火屏幕外能喷到"):
//   定谳:原版弹 101 = aiStyle23 帽 timeLeft≤60(Projectile.cs:26201-26203)+EU3
//   ⇒ 弹寿 15t,射程 ≈ 360-560px。修复后本仓实测:每发火焰射程 ≤ 600px 包络。
//   另:雷眼二阶段激光 100(life 2700)存活性抽样(150t 后仍在飞=老 300 早已灭)。
// 跑法:SW_ORIGIN=http://localhost:5237 node tools/run-diag.mjs scripts/_twins-flame-range-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(String(process.env.SW_ORIGIN ?? 'http://localhost:5237'), { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const res = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- 观测台:清空域 + 石板地(同 _bossfix-audit-probe;±90 格宽走激光走廊) ----
  const st = w.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  for (let dx = -90; dx <= 90; dx++) for (let dy = -14; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -90; dx <= 90; dx++) st.setTile(px0 + dx, gy + 1, 1);
  w.clock.timeOfDay = 0;                       // 夜(白天双子离场)
  g.player.hp = g.player.maxHp = 100000;
  g.player.x = (px0 + 24) * 16;                // 玩家在台东 24 格(≈384px)
  g.player.y = (gy - 6) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  for (const e of g.entities.enemies) e.dead = true;
  await wait(300);

  const stepN = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };
  const flames = () => g.entities.projectiles.filter((p) => !p.dead && p.projId === 101);

  // ---- A. Spazmatism 二阶段喷火射程 ----
  const spaz = Enemy.fromVanilla(126, (px0 - 8) * 16, (gy - 8) * 16);
  spaz.id = 990001; g.entities.add(spaz, 'enemies');
  spaz.bInit = true;                           // 免 AI 首帧 ai0 复位(否则走变身链 200t)
  spaz.ai0 = 3; spaz.ai1 = 0; spaz.ai2 = 0; spaz.ai3 = 0; spaz.lai1 = 0; spaz.lai2 = 0;
  spaz.vx = 0; spaz.vy = 0;
  spaz.hp = Math.floor(spaz.maxHp * 0.05);     // <10% → 6/拍 → 每 2 拍一发
  const tracked = new Map();                   // Arrow → {x0,y0,max}
  const ranges = [];
  let cadenceTicks = [];
  let lastFlame = -1, tick = 0;
  for (tick = 0; tick < 240; tick++) {
    g.player.hp = g.player.maxHp; g.player.dead = false;   // 火焰流 pierce=-1 逐拍叠伤会烧死玩家→复活钉活
    if (tick % 60 === 0) { g.player.x = (px0 + 24) * 16; g.player.y = (gy - 6) * 16; g.player.vx = 0; g.player.vy = 0; }
    for (const f of flames()) {
      if (!tracked.has(f)) tracked.set(f, { x0: f.cx, y0: f.cy, max: 0, born: tick });
      const t = tracked.get(f);
      t.max = Math.max(t.max, Math.hypot(f.cx - t.x0, f.cy - t.y0));
    }
    for (const [f, t] of tracked) {
      if (f.dead && !t.done) { t.done = true; ranges.push({ range: t.max, age: tick - t.born }); }
    }
    const n = flames().length;
    if (n > 0 && lastFlame <= 0) cadenceTicks.push(tick);
    lastFlame = n;
    stepN(1);
  }
  res.flameCount = ranges.length;
  res.flameRangesMax = Math.max(...ranges.map((r) => r.range));
  res.flameRangesMean = ranges.reduce((s, r) => s + r.range, 0) / (ranges.length || 1);
  res.flameAgeMaxTicks = Math.max(...ranges.map((r) => r.age));
  res.flameCadence = cadenceTicks.slice(0, 6).join(',');
  res.spazPhase = spaz.ai0;
  // 眼位→玩家距离(触发距离面:门=视线非距离)
  res.spazPlayerDist = Math.hypot(spaz.cx - g.player.cx, spaz.cy - g.player.cy);

  for (const e of g.entities.enemies) e.dead = true;
  g.boss = null;
  for (const p of g.entities.projectiles) p.dead = true;

  // ---- B. 雷眼二阶段激光 100 射程(life 2700+EU2 → |v|×900t;旧缺省 300 → 100t) ----
  //  几何无关口径:读出生弹 |v| 与 life → maxRange = |v| × life/(1+EU)(子步递减语义)
  g.player.hp = g.player.maxHp; g.player.dead = false;       // 复活(A 段余烬可致死)
  g.player.iframes = 999999;                   // 免命中(pierce 会耗尽)
  g.player.x = (px0 + 24) * 16; g.player.y = (gy - 8) * 16;
  g.player.vx = 0; g.player.vy = 0;
  const ret = Enemy.fromVanilla(125, (px0 - 8) * 16, (gy - 8) * 16);
  ret.id = 990002; g.entities.add(ret, 'enemies');
  ret.bInit = true;
  ret.ai0 = 3; ret.ai1 = 0; ret.ai2 = 0; ret.ai3 = 0; ret.lai1 = 180; ret.vx = 0; ret.vy = 0;
  ret.hp = ret.maxHp;
  let laser = null;
  for (let i = 0; i < 300 && !laser; i++) {
    g.player.dead = false; g.player.hp = g.player.maxHp;
    stepN(1);
    laser = g.entities.projectiles.find((p) => !p.dead && p.projId === 100) ?? null;
  }
  if (laser) {
    const spd = Math.hypot(laser.vx, laser.vy);
    res.laserSpeed = +spd.toFixed(2);
    res.laserLife = laser.life;
    res.laserMaxRange = Math.round(spd * laser.life / 3);   // EU=2 → 3 子步/t
  }
  res.laserFound = !!laser;

  for (const e of g.entities.enemies) e.dead = true;
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('喷火触发: ≥30 发火焰产生(视线门通,无距离门)', (out.flameCount ?? 0) >= 30, `count=${out.flameCount} cadence=[${out.flameCadence}]`);
check('喷火射程上限 ≤ 600px(原版包络,修复前 ~1800px)', (out.flameRangesMax ?? 9e9) <= 600, `max=${out.flameRangesMax?.toFixed(1)}px mean=${out.flameRangesMean?.toFixed(1)}px`);
check('喷火弹寿 ≤ 16t(原版 15t+采样余量)', (out.flameAgeMaxTicks ?? 9e9) <= 16, `ageMax=${out.flameAgeMaxTicks}t`);
check('触发距离 ≈ 380px(眼-玩家距,门=CanHit 非距离门)', (out.spazPlayerDist ?? 0) < 600, `dist=${out.spazPlayerDist?.toFixed(0)}px`);
check('雷眼激光射程 = |v|×life/3 ≈ 7650px(life 2700 承载,旧缺省 300 → 2550)', out.laserFound && out.laserLife >= 2600 && out.laserMaxRange > 7000, `speed=${out.laserSpeed} life=${out.laserLife} maxRange=${out.laserMaxRange}px`);
check('无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n== ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
