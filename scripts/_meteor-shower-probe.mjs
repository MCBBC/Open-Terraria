// 陨石雨碎块实机探针（MeteorChunk=Projectile 1078，meteorShowerCount 消耗产物）：
//   直构 MeteorChunk 于实心地面之上 1 格 → 逐 tick fixedUpdate 至撞地：
//   (a) 自然掷：撞地播 meteor_shower_N 跟踪音 1..3 次（Kill :76511-76518
//       Next(1,4)×CreateTrackable("meteor_shower",6)）
//   (b) Math.random≡0 强制掉落路：1/16 掉落掷命中 → spawnDrop(vid116 反查 key, Next(2,7)=2)
//       + meteor_shower_0 ×1
//   (c) Math.random≡0.5 强制 miss 路：不掉落，仍播 2 次 meteor_shower_3
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_meteor-shower-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
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
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('MS');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [], dbg: {} };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  const p = g.player;
  const st = g.world.store;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  // ---- 远离玩家的浮空试验场：清空 ±8 列空中区 + 三行实心地板 ----
  const by = Math.floor(g.world.groundLevel);
  const lx = Math.floor(p.cx / TILE) + 34;                    // 玩家右侧 34 格
  for (let dx = -10; dx <= 10; dx++) {
    for (let dy = -14; dy <= 8; dy++) {
      const i = st.idx(lx + dx, by + dy);
      st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0;
    }
  }
  for (let dx = -8; dx <= 8; dx++) {                          // 地板顶行 = by+3
    st.setTileSilent(lx + dx, by + 3, 2);
    st.setTileSilent(lx + dx, by + 4, 2);
    st.setTileSilent(lx + dx, by + 5, 2);
  }

  // ---- SFX/drop spy（录制在先,音频门无关）----
  window.__msWav = [];
  if (!g.__msSpyOn) {
    g.__msSpyOn = true;
    g.__oPlaySfxWav = g.playSfxWav.bind(g);
    g.playSfxWav = (f, ...a) => { try { window.__msWav.push({ f, a }); } catch {} return g.__oPlaySfxWav(f, ...a); };
    g.__oSpawnDrop = g.spawnDrop.bind(g);
    g.spawnDrop = (x, y, key, n, ...a) => {
      window.__msDrops.push({ x, y, key, n });
      return g.__oSpawnDrop(x, y, key, n, ...a);
    };
  }
  window.__msDrops = [];

  const items = await import('/src/data/items.ts');
  const { MeteorChunk } = await import('/src/entities/MeteorChunk.ts');

  /** 造块+落到死；返回 sfx/drop 快照 */
  const runChunk = (label) => {
    const FLOOR_TOP = (by + 3) * TILE;
    const cxx = lx * TILE + 8 - 20;                            // 地板中部左偏一点
    // 实心地面之上 1 格：中心距地板顶面再高 ~6px（vy 初 0、+0.3/t → 约 12-13t 撞地）
    const ch = new MeteorChunk(cxx, FLOOR_TOP - 6 - 7 - TILE, 0, 0);
    window.__msWav.length = 0; window.__msDrops.length = 0;
    let t = 0;
    for (; t < 120 && !ch.dead; t++) ch.fixedUpdate(1 / 60, g);
    return { label, ticks: t, dead: !!ch.dead, w: ch.w, h: ch.h,
      cx: cxx + 7, cy: ch.cy,
      landedOnFloor: FLOOR_TOP <= ch.cy && ch.cy < FLOOR_TOP + TILE * 4,
      wav: window.__msWav.map((w) => ({ f: w.f, vol: w.a[0], pitch: w.a[4] })),
      drops: [...window.__msDrops] };
  };

  const realRandom = Math.random;

  // (a) 自然掷:只断言组形态(次数/命名/音量),不锁定 1/16 命运
  window.__natRun = null;
  try {
    const ra = runChunk('natural');
    R.dbg.natural = ra;
    window.__natRun = ra;
  } catch (e) { R.dbg.natErr = e.message; }

  // (b) Math.random≡0 → 必中 1/16 掉落支(量=Next(2,7) 下界 2)+单发 meteor_shower_0
  Math.random = () => 0;
  let rb = null, errB = '';
  try { rb = runChunk('force-hit'); } catch (e) { errB = e.message; }
  Math.random = realRandom;
  R.dbg.forceHit = rb ?? { err: errB };

  // (c) Math.random≡0.5 → 1/16 miss(不掉落)+双响 meteor_shower_3(hits=1+⌊1.5⌋=2)
  Math.random = () => 0.5;
  let rc = null, errC = '';
  try { rc = runChunk('force-miss'); } catch (e) { errC = e.message; }
  Math.random = realRandom;
  R.dbg.forceMiss = rc ?? { err: errC };

  const oreKey = items.VANILLA_ITEM_KEY_BY_ID[116];
  ck('setup: vid116 反查出 key（掉落链依赖）', !!oreKey, `key=${oreKey}`);
  const nat = window.__natRun;
  ck('(a) 自然掷:撞地消亡且落在地板层', !!nat && nat.dead && nat.landedOnFloor,
    `ticks=${nat?.ticks} cy=${R.dbg.natural?.cy ?? ''}`);
  ck('(a) 弹体盒 SetDefaults 14×14（:9785）', !!nat && nat.w === 14 && nat.h === 14,
    `${nat?.w}x${nat?.h}`);
  ck('(a) 撞地播 meteor_shower_N ∈[1,3] 次', !!nat && nat.wav.length >= 1 && nat.wav.length <= 3,
    `n=${nat?.wav.length}`);
  ck('(a) 音名/音量形态：^meteor_shower_[0-5]$ ×vol0.8',
    !!nat && nat.wav.every((w) => /^meteor_shower_[0-5]$/.test(w.f) && w.vol === 0.8),
    JSON.stringify(nat?.wav ?? []));
  const mh = rb;
  ck('(b) 强制命中:恰好 1 发跟踪音且名 meteor_shower_0',
    !!mh && mh.wav.length === 1 && mh.wav[0].f === 'meteor_shower_0',
    JSON.stringify(mh?.wav ?? []));
  ck('(b) 掉落掷命中:key=vid116 反查 + 量 2∈[2,6]',
    !!mh && mh.drops.length === 1 && mh.drops[0].key === oreKey
      && mh.drops[0].n === 2 && mh.drops[0].n >= 2 && mh.drops[0].n <= 6,
    JSON.stringify(mh?.drops ?? []));
  ck('(b) 掉落锚点=碎块中心(cx,cy)',
    !!mh && mh.drops.length === 1
      && Math.abs(mh.drops[0].x - mh.cx) < 1e-6 && Math.abs(mh.drops[0].y - mh.cy) < 1e-6,
    `drop=${mh?.drops[0] ? `${mh.drops[0].x},${mh.drops[0].y}` : '-'} chunk=${mh ? `${mh.cx},${mh.cy}` : '-'}`);
  const mm = rc;
  ck('(c) 强制 miss:零掉落', !!mm && mm.drops.length === 0,
    `drops=${JSON.stringify(mm?.drops ?? [])}`);
  ck('(c) 仍播跟踪音 hits=2 且名 meteor_shower_3',
    !!mm && mm.wav.length === 2 && mm.wav.every((w) => w.f === 'meteor_shower_3'),
    JSON.stringify(mm?.wav ?? []));
  return R;
});

for (const c of out.checks) check(c.n, c.ok, c.d);
if (errors.length) { console.log(`FAIL: 页面异常 ${errors.length} 处`); fail += errors.length; }
console.log(out.dbg ? `\ndbg=${JSON.stringify(out.dbg).slice(0, 900)}` : '');
console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
