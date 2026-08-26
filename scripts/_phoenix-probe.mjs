// 幻影凤凰弓（3854）通道实机探针（PhoenixBowProj.ts）：
//   直构 PhoenixChannel（owner=实机玩家,prod Game.ts:10721 同款 fire 注入）推拍：
//   (a) 节拍序列：拍1/拍2 双箭(pid1→燃烧箭2 换体),第 3 拍转单发 706 凤凰弹
//       （phantomPhoneixCounter≥3 :68333-68341；伤×2=100）
//   (b) 706 出膛实体为 PhoenixBolt + dd2_phantom_phoenix_shot 三变体组
//       首帧恰一声（SoundID.cs:1014 / Projectile.cs:56750-56753）
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_phoenix-probe.mjs
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
  await page.keyboard.type('PX');
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

  // ---- 高空净空走廊：凤凰弹横向飞行区无实心/液体 ----
  const st = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(6, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st.isSolid(Math.floor(p.cx / TILE), Math.floor((p.y + p.h / 2) / TILE))) break;
    sy -= 1;
  }
  const airRow = sy - 14;
  for (let dx = -40; dx <= 40; dx++) {
    for (let dy = -6; dy <= 6; dy++) {
      const i = st.idx(px + dx, airRow + dy);
      st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0;
    }
  }
  p.vx = 0; p.vy = 0;
  g.input.uiBlocking = false;
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);

  // ---- SFX spy ----
  window.__pxGrp = [];
  if (!g.__pxSpyOn) {
    g.__pxSpyOn = true;
    g.__oPlaySfxFilesP = g.playSfxFiles.bind(g);
    g.playSfxFiles = (files, ...a) => {
      try { window.__pxGrp.push([...files]); } catch {}
      return g.__oPlaySfxFilesP(files, ...a);
    };
    g.__oPlaySfxFileP = g.playSfxFile.bind(g);
    g.playSfxFile = (f, ...a) => {
      try { window.__pxFile.push({ f, t: window.__pxTick ?? -1 }); } catch {}
      return g.__oPlaySfxFileP(f, ...a);
    };
  }
  window.__pxFile = [];
  window.__pxTick = 0;

  const { PhoenixChannel, PhoenixBolt } = await import('/src/entities/PhoenixBowProj.ts');
  const npcData = await import('/src/data/vanillaNpcs.ts');

  // ---- 载体：owner=实机玩家，fire 注入同 prod Game.ts:10739 分支 ----
  const fires = [];
  const bolts706 = [];
  const carrier = new PhoenixChannel(p, 11, 0, 32, 2, 18, {
    channel: () => true,
    aim: () => ({ x: p.cx + 500, y: p.cy }),
    volley: () => ({ pid: 1, dmg: 50, kb: 3, speed: 12 }),     // 木箭弹药（→ 燃烧箭 2 换体）
    fire: (pid, fx, fy, fvx, fvy, fdmg, fkb) => {
      fires.push({ pid, x: fx, y: fy, vx: fvx, vy: fvy, dmg: fdmg, kb: fkb, atTick: tickNow });
      if (pid === 706) bolts706.push(new PhoenixBolt(fx, fy, fvx, fvy, fdmg, fkb));
    },
  });
  carrier.critChance = 0;

  let tickNow = 0;
  const beats = [];
  let prevCount = 0;
  for (tickNow = 1; tickNow <= 92 && !carrier.dead; tickNow++) {
    window.__pxTick = tickNow;
    carrier.fixedUpdate(1 / 60, g);
    if (fires.length > prevCount) { beats.push(tickNow); prevCount = fires.length; }
  }
  R.dbg.beats = [...beats];
  R.dbg.fires = fires.map((f) => ({ pid: f.pid, dmg: f.dmg, tick: f.atTick }));
  // 节拍器音戳记须在清场前快照（(b) 段会重置录制数组）
  const i5Stamps = window.__pxFile.filter((e) => e.f === 'Item_5').map((e) => e.t);

  ck('(a) 首拍即发（ai[1] 初值归零触发）', beats[0] === 1, `beat0=${beats[0]}`);
  ck('(a) 拍点数 ≥3（两轮双箭+一次凤凰弹）', beats.length >= 3, JSON.stringify(beats));
  const phx = fires.filter((f) => f.pid === 706);
  const arrows3 = fires.filter((f) => f.pid !== 706 && f.atTick <= beats[2]);
  ck('(a) 前两拍各双箭共 4 发', arrows3.length === 4,
    `arrows(≤t${beats[2]})=${arrows3.length}`);
  ck('(a) 木箭 1 就地换燃烧箭 2（:68330-68332）',
    fires.filter((f) => f.pid !== 706).every((f) => f.pid === 2),
    `pids=${[...new Set(fires.filter((f) => f.pid !== 706).map((f) => f.pid))]}`);
  ck('(a) 第 3 拍转单发 706 凤凰弹', phx.length === 1, `n=${phx.length}`);
  ck('(a) 凤凰弹伤×2=100（:68337 Damage4*=2）', phx[0]?.dmg === 100,
    `dmg=${phx[0]?.dmg} ctrAfter=${p.ppPhoenixCounter}`);
  ck('(a) 凤凰弹速 |v|=16、散布 0',
    !!phx[0] && Math.abs(Math.hypot(phx[0].vx, phx[0].vy) - 16) < 1e-9,
    `|v|=${phx[0] ? Math.hypot(phx[0].vx, phx[0].vy).toFixed(3) : '-'}`);
  ck('(a) 常规节拍 18t：拍1→拍2→拍3', beats.length >= 3
    && beats[1] - beats[0] === 18 && beats[2] - beats[1] === 18,
    `${R.dbg.beats.join('→')}`);
  ck('(a) 凤凰拍后 ai[1]×1.5 → 间隔 27t', beats.length >= 4 && beats[3] - beats[2] === 27,
    R.dbg.beats.join('→'));
  ck('(a) 计数复位后回 interval 18', beats.length >= 5 && beats[4] - beats[3] === 18,
    R.dbg.beats.join('→'));

  // ---- (b) 706 实体首帧 shot 音 ----
  window.__pxGrp.length = 0;
  window.__pxFile.length = 0;
  const bolt = bolts706[0];
  ck('(b) 706 出膛=PhoenixBolt 实例',
    !!bolt && (bolt instanceof PhoenixBolt || bolt.constructor?.name === 'PhoenixBolt'), '');
  if (bolt) {
    bolt.x = px * TILE + 8;                                    // 高空净空走廊原点
    bolt.y = airRow * TILE;
    bolt.vx = 16; bolt.vy = 0;                                 // 水平直飞
    bolt.fixedUpdate(1 / 60, g);                               // 首帧
    const firstLen = window.__pxGrp.length;
    bolt.fixedUpdate(1 / 60, g);
    bolt.fixedUpdate(1 / 60, g);
    ck('(b) dd2_phantom_phoenix_shot 三变体组首帧一声且仅一次',
      firstLen === 1 && window.__pxGrp.length === 1
        && JSON.stringify(window.__pxGrp[0]) === JSON.stringify(npcData.soundTrackFiles('dd2_phantom_phoenix_shot')),
      `${firstLen}/${window.__pxGrp.length} ${JSON.stringify(window.__pxGrp[0] ?? [])}`);
    ck('(b) 弹存活未触轨/未湿灭（净空走廊成立）', !bolt.dead, `dead=${bolt.dead}`);
  }

  // ---- 节拍器音（旁证，(a) 段快照）：Item_5 每 interval=18 响（t=19/37/55/73/91），
  //      首拍 age==1 豁免（:68303）----
  ck('(b) 通道节拍器 Item_5 首拍豁免+逐拍响(t=19,37,55,73,91)',
    JSON.stringify(i5Stamps) === JSON.stringify([19, 37, 55, 73, 91]),
    JSON.stringify(i5Stamps));
  return R;
});

for (const c of out.checks) check(c.n, c.ok, c.d);
console.log(`\ndbg=${JSON.stringify(out.dbg)}`);
if (errors.length) { console.log(`FAIL: 页面异常 ${errors.length} 处`); fail += errors.length; }
console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
