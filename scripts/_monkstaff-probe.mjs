// DD2 僧杖链实机探针（MonkStaffFury.ts：697 旋棍→698 爆箱 / 699 长戟→700 幽灵）：
//   直构 MonkStaffSpin（owner=实机玩家,prod Game.ts:13175 同款注入 spawnSlam）
//   推 fixedUpdate 至 ai0 越过 NUM-3=47 砸地窗：
//   (a) dd2_monk_staff_ground_impact 三变体组恰播一次（Projectile.cs:70583/
//       SoundID.cs:1008）+ MonkSlam 入桶（dmg×3/vx=dir）
//   再构 GhastlyGlaiveProj 命中假敌（HitTarget stub）：
//   (b) SummonMonkGhast → MonkGhast 入桶 + ghost 音首帧一次三变体
//       （:15238-15265 / :71058 SoundID.cs:1004）
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_monkstaff-probe.mjs
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
  await page.keyboard.type('MK');
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
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  p.dead = false; p.iframes = 600;

  // ---- 净空竞技场（CutTiles/尘在空区做无害功）----
  const st = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(6, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st.isSolid(Math.floor(p.cx / TILE), Math.floor((p.y + p.h / 2) / TILE))) break;
    sy -= 1;
  }
  for (let dx = -20; dx <= 20; dx++) {
    for (let dy = -16; dy <= 2; dy++) {
      const i = st.idx(px + dx, sy + dy);
      if (dy < 0) { st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0; }
    }
    st.setTileSilent(px + dx, sy, 2);
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);

  // ---- SFX spy（playSfxFiles 组播录制在先）----
  window.__mkGrp = [];
  if (!g.__mkSpyOn) {
    g.__mkSpyOn = true;
    g.__oPlaySfxFilesM = g.playSfxFiles.bind(g);
    g.playSfxFiles = (files, ...a) => {
      try { window.__mkGrp.push([...files]); } catch {}
      return g.__oPlaySfxFilesM(files, ...a);
    };
  }

  // ---- 隔离敌怪桶：暂换 g.enemies 注入假敌（防野外怪游进判定区）----
  const oEnemies = g.enemies.bind(g);
  g.enemies = () => [];

  const { MonkStaffSpin, MonkSlam, GhastlyGlaiveProj, MonkGhast } =
    await import('/src/entities/MonkStaffFury.ts');

  // ================= (a) 697 砸地段 =================
  window.__mkGrp.length = 0;
  const owner = p;                                            // cx/cy/facing/dead 实时引用（同 prod）
  const slams = [];
  const spin = new MonkStaffSpin(owner, 24, 0, 50, 7,
    () => true, () => ({ x: p.cx + 500, y: p.cy }), () => {});
  spin.critChance = 0;
  spin.spawnSlam = (sx2, sy2, svx, svy, sdm) => {             // prod Game.ts:13182 同款注入口
    const sl = new MonkSlam(sx2, sy2, svx, svy, sdm);
    sl.critChance = 0;
    g.entities.add(sl, 'projectiles');
    slams.push(sl);
  };
  let t = 0;
  for (; t < 80 && !spin.dead; t++) spin.fixedUpdate(1 / 60, g);
  R.dbg.spinTicks = t;
  const giGroups = window.__mkGrp.filter((f) => f.length && f[0].startsWith('dd2_monk_staff_ground_impact'));
  ck('(a) 收棍完成（满程 ~40t<50t,持按电平恒真）', spin.dead === true, `ticks=${t}`);
  ck('(a) 越过 ai0≥47 恰一帧生成 MonkSlam（单次掷）', slams.length === 1, `n=${slams.length}`);
  ck('(a) ground_impact 组恰播一次', giGroups.length === 1,
    `pushes=${giGroups.length}/${window.__mkGrp.length}`);
  ck('(a) 组=三变体全档（SoundID.cs:1008 CreateTrackable …,3）',
    giGroups.length === 1 && giGroups[0].length === 3
      && giGroups[0].every((f, i) => f === `dd2_monk_staff_ground_impact_${i}`),
    JSON.stringify(giGroups[0] ?? []));
  const slam = slams[0];
  ck('(a) MonkSlam 已入 projectiles 桶', !!slam && g.entities.projectiles.includes(slam), '');
  if (slam) {
    ck('(a) 爆箱伤=damage×3（:70511 num5）、vel=(dir,0)',
      slam.damage === 150 && slam.vx === 1 && slam.vy === 0,
      `dmg=${slam.damage} v=(${slam.vx},${slam.vy})`);
    slam.dead = true;                                         // 清场(不让背景循环继续消费)
  } else {
    ck('(a) 爆箱伤=damage×3、vel=(dir,0)', false, 'no slam');
  }
  spin.dead = true;

  // ================= (b) 699 命中→700 幽灵 =================
  const hurtCalls = { n: 0 };
  const foe = {
    id: 990001, x: p.cx - 60, y: p.cy - 20, w: 40, h: 40, dead: false,
    def: { lifeMax: 100, friendly: false },
    hurt() { hurtCalls.n++; return true; },
  };
  g.enemies = () => [foe];                                    // HitTarget stub 注入
  window.__mkGrp.length = 0;
  let animT = 27;                                             // itemAnimation 代理（swing.t 递减语义）
  const ghosts = [];
  const glaive = new GhastlyGlaiveProj(p, 42, 0, 45, 7,
    31.5, () => animT, 27, () => {});
  glaive.critChance = 0;
  glaive.spawnGhast = (gx, gy, gvx, gvy, gdmg) => {           // prod Game.ts:13209 同款注入口
    const gh = new MonkGhast(gx, gy, gvx, gvy, gdmg);
    gh.critChance = 0;
    g.entities.add(gh, 'projectiles');
    ghosts.push(gh);
  };
  glaive.fixedUpdate(1 / 60, g);
  const ghostGroupsPre = window.__mkGrp.filter((f) => f[0]?.startsWith('dd2_ghastly_glaive_impact_ghost'));
  ck('(b) 命中假敌：hurt 结算走通', hurtCalls.n >= 1, `hurtCalls=${hurtCalls.n}`);
  ck('(b) SummonMonkGhast 恰一次 → MonkGhast 入桶',
    ghosts.length === 1 && g.entities.projectiles.includes(ghosts[0]),
    `ghosts=${ghosts.length}`);
  ck('(b) 699 自身不播幽灵音（音由 700 首帧负责）', ghostGroupsPre.length === 0,
    JSON.stringify(ghostGroupsPre));
  if (ghosts[0]) {
    const gh = ghosts[0];
    ck('(b) 幽灵继承 699 当前伤害（NewProjectile 实参 :15257）', gh.damage === 45, `dmg=${gh.damage}`);
    window.__mkGrp.length = 0;
    gh.fixedUpdate(1 / 60, g);                                // 首帧
    const first = [...window.__mkGrp];
    gh.fixedUpdate(1 / 60, g);
    gh.fixedUpdate(1 / 60, g);
    ck('(b) ghost 音首帧一次+三变体组（SoundID.cs:1004）',
      first.length === 1 && first[0].length === 3
        && first[0][0] === 'dd2_ghastly_glaive_impact_ghost_0'
        && window.__mkGrp.length === 1,
      JSON.stringify(window.__mkGrp));
    gh.dead = true;
  } else {
    ck('(b) ghost 音首帧一次+三变体组', false, 'no ghast');
  }
  glaive.dead = true;

  // 还原
  g.enemies = oEnemies;
  return R;
});

for (const c of out.checks) check(c.n, c.ok, c.d);
console.log(`\ndbg=${JSON.stringify(out.dbg)}`);
if (errors.length) { console.log(`FAIL: 页面异常 ${errors.length} 处`); fail += errors.length; }
console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
