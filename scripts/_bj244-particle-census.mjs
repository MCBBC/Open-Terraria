// ★BJ244 实机探针：怪物粒子普查落刀三面+飞龙判谳锁。
// 断言：①飞龙 87（含段链 88-92）2.5s 内按最近实体归属的 dust/particles 计数=0
//        （原版零粒子判谳,REFUTED 不落刀）；
//      ②387 部署环绕尘 ~8 粒/tick（2s ≈ 900+,尘 226）；
//      ③388 蓄力态蓝尘拖尾（尘 226 持续在场）；
//      ④412 头火尘 2 粒/tick（2s ≈ 200+,尘 6）。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj244-particle-census.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1024, height: 720 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('bj244', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未就绪'); process.exit(1); }

/** 装归属计数器：dust/particles 按最近活跃实体 vanillaId 归属（400px 内） */
const armCounter = () => page.evaluate(() => {
  const g = window.__swGame;
  const rec = { dust: {}, parts: {} };
  g.__bj244rec = rec;
  const origD = g.spawnDust.bind(g);
  g.spawnDust = (...a) => {
    const d = origD(...a);
    let vid = -1, best = 400 * 400;
    for (const o of g.enemies()) {
      if (o.dead) continue;
      const dx = o.cx - a[0], dy = o.cy - a[1], q = dx * dx + dy * dy;
      if (q < best) { best = q; vid = o.vanillaId ?? -1; }
    }
    rec.dust[vid] = (rec.dust[vid] || 0) + 1;
    return d;
  };
  const origP = g.spawnParticles ? g.spawnParticles.bind(g) : null;
  if (origP) {
    g.spawnParticles = (...a) => {
      // spawnParticles 首参多为 x——归属放宽：只对 4 实参形态记总账
      rec.parts._all = (rec.parts._all || 0) + 1;
      return origP(...a);
    };
  }
  return true;
});
const unarm = () => page.evaluate(() => {
  const g = window.__swGame;
  delete g.__bj244rec;
  return true;
});
await armCounter();

// ---- ① 飞龙判谳锁：87 头 + 段链,2.5s 计数 ----
const wyv = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  const e = Enemy.fromVanilla(87, p.x + 6 * 16, p.y - 8 * 16);
  if (!e) return { fail: 'fromVanilla(87)' };
  g.entities.add(e, 'enemies');
  const t0 = performance.now();
  const segs = [];
  while (performance.now() - t0 < 2500) {
    g.camera.x = e.cx; g.camera.y = e.cy;
    await new Promise((r) => setTimeout(r, 50));
  }
  for (const o of g.enemies()) if (!o.dead && o.vanillaId >= 87 && o.vanillaId <= 92) segs.push(o.vanillaId);
  return { rec: g.__bj244rec, segs, headAlive: !e.dead };
});
console.log('WYVERN=' + JSON.stringify(wyv));

// ---- ② 387 部署环绕尘 ----
const turret = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  const e = Enemy.fromVanilla(387, p.x + 5 * 16, p.y - 2 * 16);
  if (!e) return { fail: 'fromVanilla(387)' };
  g.entities.add(e, 'enemies');
  const rec = g.__bj244rec;
  rec.dust[387] = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 2000) {
    g.camera.x = e.cx; g.camera.y = e.cy;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { dust226: rec.dust[387] ?? 0, ai1: e.ai1, alive: !e.dead };
});
console.log('TURRET=' + JSON.stringify(turret));
await page.screenshot({ path: '/tmp/bj244-turret-swirl.png' });

// ---- ③ 388 蓄力态拖尾 ----
const drone = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  const e = Enemy.fromVanilla(388, p.x - 5 * 16, p.y - 6 * 16);
  if (!e) return { fail: 'fromVanilla(388)' };
  g.entities.add(e, 'enemies');
  e.bInit = true;
  e.ai0 = 1; e.ai1 = 0; e.ai2 = 1; e.ai3 = 0;   // 锁蓄力态
  const rec = g.__bj244rec;
  rec.dust[388] = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 2000) {
    e.ai0 = 1;                                   // 持续钉在蓄力态（风闸 30t 会转态）
    g.camera.x = e.cx; g.camera.y = e.cy;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { dust226: rec.dust[388] ?? 0, alive: !e.dead };
});
console.log('DRONE=' + JSON.stringify(drone));
await page.screenshot({ path: '/tmp/bj244-drone-trail.png' });

// ---- ④ 412 头火尘 ----
const crawler = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  const e = Enemy.fromVanilla(412, p.x + 8 * 16, p.y - 10 * 16);
  if (!e) return { fail: 'fromVanilla(412)' };
  g.entities.add(e, 'enemies');
  const rec = g.__bj244rec;
  rec.dust[412] = 0;
  const trace = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 2000) {
    // 探针坑：前序敌怪（飞龙/无人机）可能打死玩家 → crawltipedeAI !player 早退
    // （尘块在其后）——每拍复活保活，与尘面判读无关
    p.hp = p.maxHp; p.dead = false;
    g.camera.x = e.cx; g.camera.y = e.cy;
    await new Promise((r) => setTimeout(r, 500));
    trace.push({ x: Math.round(e.x), y: Math.round(e.y), dead: e.dead, inList: g.enemies().includes(e),
      aiT: e.aiT, netPuppet: e.netPuppet, aiStyle: e.vanilla && e.vanilla.aiStyle,
      wnDead: e.wormNext ? !!e.wormNext.dead : null, wnVid: e.wormNext ? e.wormNext.vanillaId : null,
      vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2) });
  }
  // 归属按最近实体——头旁首段 413 常比头更近，按链 412-414 合计口径
  const chain6 = (rec.dust[412] ?? 0) + (rec.dust[413] ?? 0) + (rec.dust[414] ?? 0);
  return { dust6: chain6, dustByVid: rec.dust, alive: !e.dead, chain: e.wormNext ? 1 : 0, trace };
});
console.log('CRAWLER=' + JSON.stringify(crawler));
await page.screenshot({ path: '/tmp/bj244-crawler-ember.png' });
await unarm();

console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
const ok = wyv.rec && Object.keys(wyv.rec.dust).every((k) => +k !== 87 && +k !== 88 && +k !== 89 && +k !== 90 && +k !== 91 && +k !== 92)
  && turret.dust226 > 600 && drone.dust226 > 60 && crawler.dust6 > 200;
console.log(ok ? 'PROBE=PASS' : 'PROBE=CHECK');
await browser.close().catch(() => {});
process.exit(ok && errors.length === 0 ? 0 : 2);
