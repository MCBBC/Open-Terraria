// R30/R31 蓝队合并修复探针(蓝队自证,2026-08-25):
//   (a) 新注册武器可达性:__swFlow.itemByKey 双向在册 + spawnDrop 不静默丢 + combatWeapon 分流
//   (b) Dark Lance 同目标两跳(复击窗,playerImmune=10t 全局档)
//   (c) 鞭挥出 per-type 拖尾尘(848 d172 / 915 d267 / 849 d191)
//   (d) 哨兵放置模型:悬浮 643 恒悬浮 / 地面 308 先降后停 + 出生尘爆 80×d185+Item46
//   (e) 彩虹水晶 643 射速 cd=26(对假人 hurt 间隔)
//   (f) Chain Guillotines 481 出程-回收全链
//   附加:R29 移交件(197/4060/4381/4058/1121)可达性
// 运行:SW_ORIGIN=http://localhost:5220 node tools/run-diag.mjs scripts/_r30r31-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
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

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};

  // ---- 平坦竞技场(地表上方清空) ----
  const px0 = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) - 30;
  for (let dx = -90; dx <= 90; dx++) for (let dy = -36; dy <= 2; dy++) {
    st.setTile(px0 + dx, gy + dy, 0);
    st.liquid[st.idx(px0 + dx, gy + dy)] = 0;
  }
  for (let dx = -90; dx <= 90; dx++) st.setTile(px0 + dx, gy + 3, 2);   // 地面(y=(gy+3)*16)
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  // ---- dust/sfx/burst 捕获 ----
  const dusts = []; const sfx = [];
  const origDust = g.spawnDust ? g.spawnDust.bind(g) : null;
  if (g.spawnDust) g.spawnDust = (...a) => { dusts.push({ type: a[4], scale: a[9] ?? 1 }); return origDust(...a); };
  const origSfx = g.playSfxFiles.bind(g);
  g.playSfxFiles = (files, ...rest) => { sfx.push(String(files[0])); return origSfx(files, ...rest); };

  // ---- (a) 注册可达性 ----
  const flow = window.__swFlow;
  const reach = {};
  // 字面键(vanilla.json Pascal 键——自动注册循环命名规则 vi_<id>_<key 去非字母数字>)
  const LITERAL_KEYS = {
    cascade: 'vi_3282_Cascade', enchanted: 'vi_55_EnchantedBoomerang',
    ballOHurt: 'vi_162_BallOHurt', gungnir: 'vi_550_Gungnir', mushroom: 'vi_756_MushroomSpear',
    hornet: 'vi_2364_HornetStaff', rainbowCrystal: 'vi_3571_RainbowCrystalStaff',
    ooaTower: 'vi_3818_DD2FlameburstTowerT1Popper', pirateStaff: 'vi_2584_PirateStaff',
    starCannon: 'vi_197_StarCannon', superStar: 'vi_4060_SuperStarCannon',
    bloodRainBow: 'vi_4381_BloodRainBow', skeletonBow: 'vi_4058_SkeletonBow', beeGun: 'vi_1121_BeeGun',
  };
  // 动态 import 数据模块做分流核(失败仅降级 a2)
  let combatMod = null, modErr = [];
  try { combatMod = await import('/src/data/vanillaItemCombat.ts'); } catch (e) { try { combatMod = await import('/src/data/vanillaItemCombat'); } catch (e2) { modErr.push('combat:' + e2.message); } }
  res.modErr = modErr;
  res.keyProbe = { type: typeof flow.itemByKey, cascadeDirect: flow.itemByKey(LITERAL_KEYS.cascade) };
  res.reach = {};
  for (const [name, key] of Object.entries(LITERAL_KEYS)) {
    const byKey = flow.itemByKey(key);
    let kind = null;
    if (combatMod && byKey >= 0) {
      const cw = combatMod.combatWeapon({ key });
      kind = cw ? cw.kind : `ammo:${combatMod.rangedAmmoWeapon({ key })}`;
    }
    res.reach[name] = { key, iid: byKey, kind };
  }
  // spawner 链:spawnDrop 用 Cascade 键落物不静默丢
  const drop = g.spawnDrop ? g.spawnDrop(g.player.cx + 20, g.player.cy - 10, 'vi_3282_Cascade', 1, 0, 0) : null;
  res.dropCascade = drop ? { alive: !drop.dead } : null;

  // ---- 共用:真敌假人(hurt 打桩+iframes 时钟衰减由 Enemy 自身 update 承担) ----
  const airY = (gy - 14) * 16;
  const mkDummy = (dx, dy) => {
    const e = flow.spawnVanillaEnemy
      ? null : null;
    void e;
    return null;
  };
  const dummyAt = async (sx, sy) => {
    const en = await flow.spawnVanillaEnemy(1, sx, sy);   // 绿史莱姆 1
    return en;
  };
  const findEnemyById = (id) => (g.entities.enemies || []).find((e) => e.id === id);

  // ---- (b) Dark Lance 两跳:SpearProj(46) 对重叠大假人 ----
  {
    const { SpearProj } = await import('/src/entities/WeaponProj.ts').catch(() => import('/src/entities/WeaponProj'));
    const big = await flow.spawnVanillaEnemy(1, g.player.cx + 60, g.player.cy - 20);
    const E = findEnemyById(big.id);
    if (E) {
      E.hp = 1e9; E.realLife = null;   // 肉假人:两跳不致死
      E.x = g.player.cx + 24; E.w = 260; E.h = 60; E.y = g.player.cy - 30;  // 全程重叠
    }
    const s = new SpearProj(1, 0, 6, 22, 30, 5, 46);
    g.entities.add(s, 'projectiles');
    const hurts = [];
    if (E) { const oh = E.hurt.bind(E); E.hurt = (...a) => { hurts.push(g.tickCount ?? hurts.length); return oh(...a); }; }
    const trace = { x0: E?.x, y0: E?.y, x1: 0, y1: 0, ifr: [], err: '' };
    for (let i = 0; i < 30; i++) {
      try {
        if (E) { E.x = g.player.cx + 24; E.y = g.player.cy - 30; E.vx = 0; E.vy = 0; }  // 钉位防 AI 漂移
        g.fixedUpdate(1 / 60);
      } catch (e) { trace.err = e.message; break; }
      if (E && i % 6 === 0) trace.ifr.push(E.iframes);
      await sleep(0);
    }
    if (E) { trace.x1 = Math.round(E.x); trace.y1 = Math.round(E.y); }
    res.dlTrace = trace;
    res.dlHits = hurts.length;
    res.dlAlive = E ? !E.dead : false;
    if (E) E.dead = true;
  }

  // ---- (c) 鞭拖尾尘:848/915/849 各挥一鞭 ----
  {
    const { WhipProj } = await import('/src/entities/WhipProj.ts').catch(() => import('/src/entities/WhipProj'));
    const owner = () => g.player;
    const whipTypes = {};
    for (const projId of [848, 915, 849]) {
      const before = dusts.length;
      const w = new WhipProj(g.player.cx, g.player.cy, 0, projId, projId === 848 ? 4679 : projId === 915 ? 4914 : 4680,
        20, 2, 30, 10, () => owner(), () => 0);
      g.entities.add(w, 'projectiles');
      for (let i = 0; i < 100 && !w.dead; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
      whipTypes[projId] = dusts.slice(before).map((d) => d.type);
    }
    res.whip172 = whipTypes[848].includes(172);
    res.whip267 = whipTypes[915].includes(267);
    res.whip191 = whipTypes[849].includes(191);
  }

  // ---- (d)+(e) 哨兵:悬浮 643 漂移 → 643 对假人 volley 节拍 → 地面 308 下坠落定+出生尘爆
  //      （同场至多一哨兵,避开 maxSentries 驱逐互扰）----
  {
    const { MinionProj } = await import('/src/entities/MinionProj.ts').catch(() => import('/src/entities/MinionProj'));
    const fl = new MinionProj(px0 * 16 - 200, airY, 643, 30, 2, true, 0, false, () => g.player);
    g.entities.add(fl, 'projectiles');
    const ys = [];
    for (let i = 0; i < 45; i++) { g.fixedUpdate(1 / 60); ys.push(fl.y); await sleep(0); }
    res.floatDrift = Math.max(...ys) - Math.min(...ys);

    // (e) 643 volley 节拍(悬浮哨兵在场,cd=26 → hurt 间隔 ~26t)
    const tgt = await flow.spawnVanillaEnemy(1, px0 * 16 - 200 + 40, airY - 20);
    const T = findEnemyById(tgt.id);
    if (T) { T.hp = 1e9; T.realLife = null; }
    const volleyTicks = [];
    if (T) { const oh = T.hurt.bind(T); T.hurt = (...a) => { volleyTicks.push(g.tickCount ?? 0); return oh(...a); }; }
    for (let i = 0; i < 240; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
    res.volleyCount = volleyTicks.length;
    if (volleyTicks.length >= 3) {
      const gaps = volleyTicks.slice(1).map((t, i) => t - volleyTicks[i]);
      res.volleyGapMedian = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    }
    if (T) T.dead = true;
    fl.dead = true;   // 让位:避免 maxSentries 驱逐互扰

    dusts.length = 0; sfx.length = 0;
    const groundStartY = (gy - 12) * 16;
    const gr = new MinionProj(px0 * 16 + 120, groundStartY, 308, 30, 2, true, 0, false, () => g.player);
    g.entities.add(gr, 'projectiles');
    const gys = [];
    const grTrace = { err: '', vy: [], life: gr.life };
    for (let i = 0; i < 140; i++) {
      try { g.fixedUpdate(1 / 60); } catch (e) { grTrace.err = e.message; break; }
      gys.push(gr.y);
      if (i % 20 === 0) grTrace.vy.push(Math.round(gr.vy * 100) / 100);
      await sleep(0);
    }
    res.groundFallDelta = Math.round(gys[gys.length - 1] - groundStartY);   // 下坠为正
    res.groundMonotonic = gys.every((y, i) => i === 0 || y >= gys[i - 1] - 0.01);
    res.groundSettled = Math.abs(gys[gys.length - 1] - Math.max(...gys.slice(-10))) < 0.01 && res.groundMonotonic;
    res.grOnGround = gr.onGround;
    res.grTrace = grTrace;
    res.grDead = gr.dead;
    res.hydraDust185 = dusts.filter((d) => d.type === 185).length;
    res.item46 = sfx.includes('Item_46');
  }

  // ---- (f) Chain Guillotines 481 出程回收 ----
  {
    const { SpearProj } = await import('/src/entities/WeaponProj.ts').catch(() => import('/src/entities/WeaponProj'));
    const s481 = new SpearProj(1, 0, 10, 999, 59, 6.5, 481);
    g.entities.add(s481, 'projectiles');
    let maxDist = 0, sawReturn = false;
    for (let i = 0; i < 400 && !s481.dead; i++) {
      g.fixedUpdate(1 / 60); await sleep(0);
      maxDist = Math.max(maxDist, s481.cx - g.player.cx);
      if (maxDist > 300 && s481.vx < 0) sawReturn = true;
    }
    res.cgMaxDist = Math.round(maxDist);
    res.cgReturned = sawReturn;
    res.cgDead = s481.dead;
  }

  return res;
});

// ---- 判定 ----
const r = out.reach ?? {};
check('(a1) 抽样武器 itemByKey 全可达(Cascade/Enchanted/BallOHurt/Gungnir/Mushroom/Hornet/RainbowCrystal/OOA/PirateStaff/蜂枪)',
  ['cascade', 'enchanted', 'ballOHurt', 'gungnir', 'mushroom', 'hornet', 'rainbowCrystal', 'ooaTower', 'pirateStaff', 'beeGun']
    .every((k) => r[k] && r[k].iid >= 0),
  JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.iid]))) + ' modErr=' + JSON.stringify(out.modErr));
check('(a2) 分流正确(yoyo×2/flail/spear×2/summon×4/magic 蜂枪/ammo 弓炮×4)',
  ['cascade,enchanted'.length > 0]
    && r.cascade?.kind === 'yoyo' && r.enchanted?.kind === 'boomerang'
    && r.ballOHurt?.kind === 'flail' && r.gungnir?.kind === 'spear' && r.mushroom?.kind === 'spear'
    && r.hornet?.kind === 'summon' && r.rainbowCrystal?.kind === 'summon' && r.ooaTower?.kind === 'summon'
    && r.pirateStaff?.kind === 'summon' && r.beeGun?.kind === 'magic'
    && String(r.starCannon?.kind).startsWith('ammo') && String(r.superStar?.kind).startsWith('ammo')
    && String(r.bloodRainBow?.kind).startsWith('ammo') && String(r.skeletonBow?.kind).startsWith('ammo'),
  JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.kind]))));
check('(a3) Cascade spawnDrop 不静默丢', !!out.dropCascade && out.dropCascade.alive === true, JSON.stringify(out.dropCascade));
check('(b) Dark Lance 同目标两跳(hits>=2)', out.dlHits >= 2, `hits=${out.dlHits} trace=${JSON.stringify(out.dlTrace)} alive=${out.dlAlive}`);
check('(c1) 848 晨星鞭 d172 拖尾尘出现', out.whip172 === true);
check('(c2) 915 万花筒 d267 出现', out.whip267 === true);
check('(c3) 849 黑收成 d191 出现', out.whip191 === true);
check('(d1) 悬浮哨兵 643 恒悬浮(drift<0.5px)', out.floatDrift !== undefined && out.floatDrift < 0.5, `drift=${out.floatDrift}`);
check('(d2) 地面哨兵 308 先降后停(单调下坠+落定)', out.groundSettled === true && out.groundFallDelta > 20 && out.grOnGround === true,
  `delta=${out.groundFallDelta}px mono=${out.groundMonotonic} onGround=${out.grOnGround} dead=${out.grDead} vy=${JSON.stringify(out.grTrace?.vy)} err=${out.grTrace?.err}`);
check('(d3) 冰霜九头蛇出生尘爆 80×d185+Item46 音', out.hydraDust185 === 80 && out.item46 === true, `185=${out.hydraDust185} Item46=${out.item46}`);
check('(e) 643 射速 ~26t 一轮(median gap<=40t 且 >=3 次)', out.volleyCount >= 3 && out.volleyGapMedian <= 40,
  `count=${out.volleyCount} gap=${out.volleyGapMedian}`);
check('(f) Chain Guillotines 出程>450 回收近手消亡', out.cgMaxDist > 450 && out.cgReturned && out.cgDead,
  `max=${out.cgMaxDist} ret=${out.cgReturned} dead=${out.cgDead}`);

console.log(`page errors: ${errors.length}${errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''}`);
for (const e of errors.slice(0, 5)) check('no page error', false, e);
console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
