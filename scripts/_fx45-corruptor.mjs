// SW-FX45 实机探针：腐化者(94)唾液 Vile Spit(112) 粒子站 1:1 复验。
//   (0) 直驱 Vile Spit 112：出生相 ai0==2 → 恰 20× 尘 18 爆裂 + NPC_Killed_9 音；
//       飞行尾迹每 tick 恰 2× 尘 18（α80/scale1.3/尘速×0.1 入参 ×0.3 后置）
//   (1) 尘池实装面：vanillaDust 池内 active d18 尾迹 > 0,画布读回非空
//   (2) 全链路：真腐化者 94 实机 180t 唾液周期 → NewNPC 112 入敌桶 + 自带爆裂
// 截图 /tmp/fx45-corruptor.png（飞行尾迹帧,画布内直读,无 rAF 时序漂移）
// 运行:SW_ORIGIN=http://localhost:5244 node tools/run-diag.mjs scripts/_fx45-corruptor.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5244';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
try { await page.waitForSelector('.sw-vsel', { timeout: 15000 }); }
catch { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 45000 }); }
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('FX45');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
// 关首进欢迎弹窗（遮世界渲染面）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [class*=btn], [class*=Btn]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
});
await new Promise((r) => setTimeout(r, 800));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [], dbg: {} };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  const p = g.player;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  const st = g.world.store;

  // ---- 台面：真实地表线整平大空气走廊（groundLevel 是世界均值,山丘 x 处实际
  //      地表可高 40+ 格——曾把走廊建在山体内=无日照黑屏,尾迹只在纯黑上显影）----
  const px0 = Math.floor(p.x / TILE);
  let sy = 5;
  while (sy < st.h - 10 && !st.isSolid(px0, sy)) sy++;
  for (let dx = -30; dx <= 30; dx++) {
    for (let dy = -10; dy <= 0; dy++) {
      const i = st.idx(px0 + dx, sy + dy);
      st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0;
    }
    st.setTileSilent(px0 + dx, sy, 2);
  }
  p.x = px0 * TILE;
  p.y = sy * TILE - p.h - 2;
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);

  // ---- 尘站记录器（call-through,真实尘照常入池渲染）----
  const origSpawnDust = g.spawnDust.bind(g);
  const dustCalls = [];
  g.spawnDust = (...a) => {
    dustCalls.push({ type: a[4], alpha: a[7], scale: a[9], noGravity: !!a[10] });
    return origSpawnDust(...a);
  };
  const d18 = () => dustCalls.filter((c) => c.type === 18);
  const pool18 = () => {
    let n = 0;
    for (const d of g.vanillaDust.pool) if (d.active && d.type === 18) n++;
    return n;
  };

  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { addEnemy } = await import('/src/entities/bossAI.ts');

  // ---- (0) 直驱 Vile Spit 112：出生爆裂 + 尾迹频数 ----
  const spit = Enemy.fromVanilla(112, (px0 + 20) * TILE, (sy - 6) * TILE);
  addEnemy(g, spit);
  const before18 = d18().length;
  g.fixedUpdate(1 / 60);                                  // tick1：尾迹 2
  const t1 = d18().length - before18;
  g.fixedUpdate(1 / 60);                                  // tick2：爆裂 20 + 尾迹 2
  const t2 = d18().length - before18 - t1;
  R.dbg.tick1 = t1; R.dbg.tick2 = t2;
  ck('(0) tick1 尾迹恰 2 粒 d18', t1 === 2, `n=${t1}`);
  ck('(0) tick2 爆裂恰 20 粒 d18（+尾迹2）', t2 === 22, `n=${t2}`);
  const burst = d18().slice(0, t1 + t2).filter((c) => c.scale === 1.8);
  ck('(0) 爆裂参数 α100/scale1.8/noGravity', burst.length === 20
    && burst.every((c) => c.alpha === 100 && c.noGravity), `n=${burst.length}`);
  const trail = d18().filter((c) => c.alpha === 80);
  ck('(0) 尾迹参数 α80/scale1.3/noGravity', trail.length >= 4
    && trail.every((c) => c.scale === 1.3 && c.noGravity), `n=${trail.length}`);

  // ---- (1) 再补一颗西侧弹（双向尾迹同框）+ 尾迹渲染面 ----
  const spit2 = Enemy.fromVanilla(112, (px0 - 20) * TILE, (sy - 6) * TILE);
  addEnemy(g, spit2);
  for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
  R.dbg.pool18 = pool18();
  ck('(1) 尘池 active d18 尾迹 >0（真渲染面）', R.dbg.pool18 > 0, `n=${R.dbg.pool18}`);

  // ---- (2) 全链路：真腐化者 94 → 180t 唾液周期 → 112 入敌桶 ----
  const corr = Enemy.fromVanilla(94, (px0 + 14) * TILE, (sy - 8) * TILE);
  addEnemy(g, corr);
  const enemies0 = g.enemies().length;                    // 基线含腐化者自身
  let fired = 0;
  for (let i = 0; i < 200 && fired === 0; i++) {
    g.fixedUpdate(1 / 60);
    const has112 = g.enemies().some((e) => e !== corr && e.vanillaId === 112);
    if (has112) fired = 1;
  }
  const newEnemies = g.enemies().filter((e) => e.vanillaId === 112).map((e) => e.vanillaId);
  R.dbg.newEnemies = newEnemies;
  R.dbg.fired = fired;
  ck('(2) 腐化者 180t 周期发射 → 敌桶出现 112', fired === 1 && newEnemies.includes(112),
    `new=[${newEnemies}]`);
  R.dbg.dustTotal = dustCalls.length;

  // ---- (3) 截图帧：清场后补一颗fresh弹在玩家东侧 14 格同高,直驱 25t（球体
  //      飞行中段、身后拖 ~50 粒尾迹）。Node 侧紧接 page.screenshot（DOM 合成
  //      全层捕获——canvas 读回曾得纯黑帧,rAF 合成时序竞态,弃）----
  for (const e of g.enemies()) if (e.vanillaId === 112 || e.vanillaId === 94) e.dead = true;
  g.vanillaDust.pool.forEach((d) => { d.active = false; });
  dustCalls.length = 0;
  const shotSpit = Enemy.fromVanilla(112, (px0 + 14) * TILE, (sy - 5) * TILE);
  addEnemy(g, shotSpit);
  for (let i = 0; i < 25; i++) g.fixedUpdate(1 / 60);
  R.dbg.shotPool18 = pool18();
  R.dbg.shotSpitAlive = !shotSpit.dead;
  ck('(3) 截图帧：弹体存活 + 尾迹在池', R.dbg.shotSpitAlive && R.dbg.shotPool18 >= 20,
    `pool18=${R.dbg.shotPool18} trailCalls=${d18().length}`);
  return R;
});

// DOM 合成截图（rAF 继续跑,弹体仍在飞行,尾迹持续产尘——首拍即尾迹帧）
await page.screenshot({ path: '/tmp/fx45-corruptor.png' });
console.log('screenshot /tmp/fx45-corruptor.png');

for (const c of (out?.checks ?? [])) check(c.n, c.ok, c.d ?? '');
for (const e of errors.slice(0, 5)) check('页面零异常', false, e);
console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail === 0 ? 0 : 2);
