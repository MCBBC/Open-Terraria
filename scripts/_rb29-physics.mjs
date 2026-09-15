// ★RB29-physics 红队取证探针（FX34b Hoik 三怪癖修复审计,2026-09-15）。
//  攻击面:①hoik=true 全局化的非预期受益者(NPC/敌怪/掉落物/弹幕)②嵌格 continue
//  对非 hoik 场景的误放行③半砖平台 +8 影响面④贴墙/门/平台/绳全量回归。
//  全部走实机(__swGame.player)+真实输入(g.input.keys);轨迹采样 40ms。
//  运行:SW_ORIGIN=http://localhost:5230 node tools/run-diag.mjs scripts/_rb29-physics.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 500));
} catch { /* 无弹窗 */ }
let pass = 0, fail = 0, inconclusive = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const note = (n, x = '') => { console.log(`INFO: ${n}${x ? '  ' + x : ''}`); inconclusive++; };
const clearMobs = () => page.evaluate(() => {
  const g = window.__swGame;
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  g.entities.critters.length = 0; g.entities.props.length = 0;
  const p = g.player; p.dead = false; p.respawnTimer = 0; p.statLife = p.statLifeMax2;
});
const vacuum = (bx, by) => page.evaluate(({ bx, by }) => {
  const g = window.__swGame, st = g.world.store;
  for (let dx = -100; dx <= 100; dx++) for (let dy = -90; dy <= 90; dy++) {
    st.setTile(bx + dx, by + dy, 0); st.setSlope(bx + dx, by + dy, 0); st.setHalfBrick(bx + dx, by + dy, false);
  }
  g.entities.drops.length = 0;
  return { w: st.w, h: st.h };
}, { bx, by });

// 地面基座:全探针共用一条地板(y=GY),各 rig 水平错开——一次性清空全部 rig 域
// (天然地形干扰:此前只清 ±100 格导致 4xx-6xx 列残天然实体=假 fail)
const GY = 300;
const BX = 300;
await page.evaluate((GY) => {
  const st = window.__swGame.world.store;
  for (let x = 130; x <= 630; x++) for (let y = GY - 95; y <= GY + 45; y++) {
    st.setTile(x, y, 0); st.setSlope(x, y, 0); st.setHalfBrick(x, y, false);
  }
}, GY);
await vacuum(BX, GY);
await page.evaluate((GY) => {
  const g = window.__swGame, st = g.world.store;
  for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
  const p = g.player;
  p.x = 180 * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = false;
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  p.mount?.dismount?.();
}, GY);
await new Promise((r) => setTimeout(r, 400));

// ============ P0 hoik 受益者普查 ============
{
  await clearMobs();
  await page.evaluate((GY) => {
    const g = window.__swGame;
    g.spawnNpcByVanilla?.(3, g.player.x + 300, (GY - 4) * 16);   // 僵尸(Enemy 桶)
  }, GY);
  try {
    await page.evaluate(async (GY) => {
      const g = window.__swGame;
      if (g.entities.drops.length > 0) return 'have';
      const t = Date.now();
      const m = await import(`/src/entities/ItemDrop.ts?t=${t}`);
      const iid = (g.player.inv?.slots?.[0]?.itemId ?? g.player.inv?.[0]?.itemId ?? 2);
      g.entities.drops.push(new m.ItemDrop(g.player.x + 60, (GY - 6) * 16, iid, 1));
      return 'spawned';
    }, GY);
  } catch (e) { console.log('INFO: drops 采样失败', e.message); }
  await new Promise((r) => setTimeout(r, 800));
  const census = await page.evaluate(() => {
    const g = window.__swGame, E = g.entities;
    const pick = (e) => e && ({ k: e.constructor?.name, hoik: (e).hoik === undefined ? 'undefined' : String(e.hoik) });
    return {
      player: { hoik: String(g.player.hoik) },
      enemies: E.enemies.filter((e) => !e.dead).slice(0, 3).map(pick),
      npcs: E.npcs.slice(0, 2).map(pick),
      drops: E.drops.slice(0, 3).map(pick),
      projs: E.projectiles.slice(0, 3).map(pick),
      critters: E.critters.slice(0, 2).map(pick),
    };
  });
  console.log('P0 hoik 普查:', JSON.stringify(census));
  check('P0 玩家 hoik=true(FX34b 恢复半边)', census.player.hoik === 'true');
  const others = [...census.enemies, ...census.npcs, ...census.drops, ...census.projs, ...census.critters];
  check('P0 非玩家实体无人携带 hoik=true(无穿墙受益者)', others.every((o) => o.hoik !== 'true'),
    others.map((o) => `${o.k}:${o.hoik}`).join(',') || '(空样本)');
}

/** 采样驱动:按住 keys ms 毫秒,40ms 采样 {x,feet};返回样本数组与末态 */
async function driveSampled(keys, ms, start, dropKeys = true) {
  await clearMobs();
  await page.evaluate(({ start }) => {
    const g = window.__swGame, p = g.player;
    p.x = start.x; p.y = start.y; p.vx = 0; p.vy = 0; p.onGround = false; p.dropThrough = false;
  }, { start });
  await new Promise((r) => setTimeout(r, 500));   // 落地稳住
  await page.evaluate(({ keys }) => {
    const g = window.__swGame;
    g.__rbSamples = []; g.__rbSawHitWall = false;
    g.__rbSampler = setInterval(() => {
      const p = g.player;
      g.__rbSamples.push({ x: p.x, feet: p.y + p.h, onG: p.onGround, hw: p.hitWall === true });
      if (p.hitWall) g.__rbSawHitWall = true;
    }, 40);
    for (const k of keys) g.input.keys.add(k);
  }, { keys });
  await new Promise((r) => setTimeout(r, ms));
  return page.evaluate(({ keys, dropKeys }) => {
    const g = window.__swGame, p = g.player;
    clearInterval(g.__rbSampler);
    if (dropKeys) for (const k of keys) g.input.keys.delete(k);
    return { samples: g.__rbSamples, sawHitWall: g.__rbSawHitWall, x: p.x, feet: p.y + p.h, onGround: p.onGround };
  }, { keys, dropKeys });
}

/** 转运段抬升统计:samples 中 x∈[x0,x1] 时 feet 高于 groundLine−liftMin 的帧数与最大抬升 */
function elevationStats(samples, x0, x1, groundLine, liftMin = 10) {
  let frames = 0, maxLift = 0, minX = 1e9, maxX = -1e9; const liftXs = [];
  for (const s of samples) {
    if (s.x < x0 || s.x > x1) continue;
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    if (s.feet < groundLine - liftMin) {
      frames++; maxLift = Math.max(maxLift, groundLine - s.feet);
      if (liftXs.length < 6) liftXs.push(`${s.x.toFixed(0)}:${(groundLine - s.feet).toFixed(0)}`);
    }
  }
  return { frames, maxLift, minX, maxX, liftXs };
}

// ============ P1 普通实心墙负面控制(hoik=true 不得开启通用穿墙) ============
{
  const wx = 400;   // 墙列 x=wx,3 高(GY-3..GY-1)
  await vacuum(BX, GY);
  await page.evaluate(({ GY, wx }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    for (let y = GY - 3; y <= GY - 1; y++) st.setTile(wx, y, 1);
  }, { GY, wx });
  const r = await driveSampled(['KeyD'], 2600, { x: (wx - 6) * 16, y: GY * 16 - 42 });
  const stopAt = wx * 16 - 20;
  const blocked = Math.abs(r.x - stopAt) <= 2 && r.sawHitWall;
  check('P1 实心墙:玩家被拦在墙左缘+hitWall(hoik 未开通用穿墙)', blocked,
    `x=${r.x.toFixed(1)} 期望停位=${stopAt} sawHitWall=${r.sawHitWall}`);
}

// ============ P2 关闭门负面控制(DoorOpeningHelper preference=disabled) ============
{
  const dx0 = 440;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, dx0 }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    for (let y = GY - 3; y <= GY - 1; y++) st.setTile(dx0, y, 17);   // door_closed(实心 1x3)
  }, { GY, dx0 });
  // 关闭自动开门(vanilla DoorOpeningHelper preference=disabled 档)——隔离门因素
  // ★注意:必须不带 ?t 查询串(带查询=第二模块实例,写入落 phantom 不生效)
  await page.evaluate(async () => {
    const m = await import('/src/core/Options.ts');
    m.options.data.doorOpeningPreference = 'disabled';
  });
  const r = await driveSampled(['KeyD'], 2600, { x: (dx0 - 6) * 16, y: GY * 16 - 42 });
  const stopDoor = dx0 * 16 - 20;
  check('P2 关闭门(自动开=disabled):玩家被拦在门缘+hitWall', Math.abs(r.x - stopDoor) <= 2 && r.sawHitWall,
    `x=${r.x.toFixed(1)} 期望停位=${stopDoor} sawHitWall=${r.sawHitWall}`);
  await page.evaluate(async () => {
    const m = await import('/src/core/Options.ts');
    m.options.data.doorOpeningPreference = 'enabled';
  });
}

// ============ P3 平台落面:普通平台 feet=格顶 / 半砖平台 feet=格顶+8 / 按下下穿 ============
{
  const px0 = 460;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, px0 }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    for (let x = px0; x <= px0 + 5; x++) st.setTile(x, GY - 4, 11);            // 普通平台行
  }, { GY, px0 });
  const r1 = await driveSampled([], 1400, { x: (px0 + 3) * 16 + 4, y: (GY - 8) * 16 });
  check('P3a 普通平台落面=格顶', r1.onGround && Math.abs(r1.feet - (GY - 4) * 16) <= 1,
    `feet=${r1.feet.toFixed(1)} 期望=${(GY - 4) * 16}`);
  // 半砖平台行
  await page.evaluate(({ GY, px0 }) => {
    const st = window.__swGame.world.store;
    for (let x = px0; x <= px0 + 5; x++) { st.setTile(x, GY - 4, 11); st.setHalfBrick(x, GY - 4, true); }
  }, { GY, px0 });
  const r2 = await driveSampled([], 1400, { x: (px0 + 3) * 16 + 4, y: (GY - 8) * 16 });
  check('P3b 半砖平台落面=格顶+8(FX34b ③)', r2.onGround && Math.abs(r2.feet - ((GY - 4) * 16 + 8)) <= 1,
    `feet=${r2.feet.toFixed(1)} 期望=${(GY - 4) * 16 + 8}`);
  // 按下下穿(半砖平台仍须可下穿)
  const r3 = await driveSampled(['KeyS'], 1600, { x: (px0 + 3) * 16 + 4, y: (GY - 4) * 16 + 8 - 42 });
  check('P3c 半砖平台按下=下穿', r3.feet > (GY - 4) * 16 + 20, `feet=${r3.feet.toFixed(0)}`);
}

// ============ P4 wiki 水平单向墙(1 厚)对照:穿墙 + 轨迹无抬升 ============
{
  const ax = 480;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, ax }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    for (let y = GY - 3; y <= GY - 1; y++) st.setTile(ax, y, 1);
    for (let y = GY - 3; y <= GY - 1; y++) { st.setTile(ax - 1, y, 11); st.setSlope(ax - 1, y, 2); }
  }, { GY, ax });
  const r = await driveSampled(['KeyD', 'KeyS'], 3600, { x: (ax - 8) * 16, y: GY * 16 - 42 });
  const crossed = r.x > (ax + 1) * 16;
  // 抬升窗收紧到墙列±盒宽:楼梯列(ax-1)的 StepUp 属合法,不计入
  const el = elevationStats(r.samples, ax * 16 - 20, (ax + 1) * 16 + 20, GY * 16, 10);
  check('P4a wiki 1 厚墙 按下+右行→穿墙(正控制)', crossed,
    `x=${r.x.toFixed(0)} 墙右缘=${(ax + 1) * 16}`);
  // ★RB29 定谳(MED):抬升源=unembedPass(本仓自愈发明,vanilla 无)——Body 级 wet 消融
  //  (tests/_tmp-rb29-hoik-transit.test.ts)证实 wet 跳过 unembed 后抬升帧 11→0=原版贴地穿越。
  //  修复(为 unembedPass 加 hoik 穿行豁免)后本行应=0 帧;现为证据记录行。
  note('P4b 1 厚墙转运段抬升取证(unembed 干扰=非原版;修复后应 0 帧)',
    `抬升帧=${el.frames} maxLift=${el.maxLift.toFixed(0)}px 位=[${el.liftXs.join(' ')}]`);
}

// ============ P5 tent 缝(h 头高单块+右邻 slope3):慢速穿行 unembed 介入取证 ============
{
  const bx5 = 520;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, bx5 }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    st.setTile(bx5, GY - 3, 1);                            // 悬臂实心(头高)
    st.setTile(bx5 + 1, GY - 3, 1); st.setSlope(bx5 + 1, GY - 3, 3);   // 右邻天花板坡(真 tent 形)
  }, { GY, bx5 });
  const r = await driveSampled(['KeyA'], 3600, { x: (bx5 + 6) * 16, y: GY * 16 - 42 });
  const crossed = r.x < bx5 * 16 - 20;
  const el = elevationStats(r.samples, bx5 * 16 - 20, (bx5 + 1) * 16 + 20, GY * 16, 10);
  const traj = r.samples.filter((_, i) => i % 6 === 0).map((s) => `${(s.x / 16).toFixed(1)}t:${(s.feet / 16 - GY).toFixed(1)}`).join(' ');
  console.log('P5 轨迹(tile:feetRel):', traj);
  note('P5 tent 缝玩家穿越(hoik 正控制+unembed 介入取证)',
    `crossed=${crossed} x=${r.x.toFixed(0)} 抬升帧=${el.frames} maxLift=${el.maxLift.toFixed(0)}px 位=[${el.liftXs.join(' ')}]`);
}

// ============ P6 wiki 2 厚墙(转运 >15t):centerSolid 嵌格 unembed 介入取证 ============
{
  const ax6 = 560;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, ax6 }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    for (let y = GY - 3; y <= GY - 1; y++) { st.setTile(ax6, y, 1); st.setTile(ax6 + 1, y, 1); }
    for (let y = GY - 3; y <= GY - 1; y++) { st.setTile(ax6 - 1, y, 11); st.setSlope(ax6 - 1, y, 2); }
  }, { GY, ax6 });
  const r = await driveSampled(['KeyD', 'KeyS'], 4200, { x: (ax6 - 8) * 16, y: GY * 16 - 42 });
  const crossed = r.x > (ax6 + 2) * 16;
  const el = elevationStats(r.samples, ax6 * 16 - 20, (ax6 + 2) * 16 + 20, GY * 16, 10);
  // 轨迹梗概(每 6 样)定位停走/抬升发生点
  const traj = r.samples.filter((_, i) => i % 6 === 0).map((s) => `${(s.x / 16).toFixed(1)}t:${(s.feet / 16 - GY).toFixed(1)}`).join(' ');
  console.log('P6 轨迹(tile:feetRel):', traj);
  // ★vanilla 参考机已证:2 厚墙第二列无坡邻豁免 → 原版同样不可越(blocked,x 恰停第二列缘)
  //  (tests/_tmp-rb29-hoik-transit.test.ts vanilla 参考机支 crossed=false,x=572=第二列左缘)
  check('P6a 2 厚墙=vanilla 同款不可越(第二列无豁免,嵌第一列内)', !crossed,
    `x=${r.x.toFixed(0)} 墙右缘=${(ax6 + 2) * 16}`);
  // ★RB29 定谳(MED):dry 下 unembed 连续抬升 16→32→48px 把玩家送上墙顶越墙(vanilla=堵死);
  //  wet 消融=原版同款贴地嵌停。修复后本行应=0 帧;现为证据记录行。
  note('P6b 2 厚墙抬升取证(unembed 连锁抬升越墙=非原版;修复后应 0 帧)',
    `抬升帧=${el.frames} maxLift=${el.maxLift.toFixed(0)}px 位=[${el.liftXs.join(' ')}]`);
}

// ============ P7 僵尸 vs tent 缝:非玩家不得穿(hoik 不外溢) ============
{
  const bx7 = 300;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, bx7 }) => {
    const st = window.__swGame.world.store, g = window.__swGame;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    st.setTile(bx7, GY - 3, 1);
    st.setTile(bx7 + 1, GY - 3, 1); st.setSlope(bx7 + 1, GY - 3, 3);   // 实心载体坡(真 tent 案形)
    g.entities.enemies.length = 0;
    g.spawnNpcByVanilla?.(3, (bx7 + 3) * 16, GY * 16 - 42);            // 僵尸紧贴缝右侧
    g.player.x = (bx7 - 4) * 16; g.player.y = GY * 16 - 42; g.player.vx = 0; g.player.vy = 0;
    g.__rbZMin = Infinity;
    g.__rbZSampler = setInterval(() => {
      const e = [...g.entities.enemies, ...g.entities.critters].find((n) => !n.dead && n.vanillaId === 3);
      if (e) g.__rbZMin = Math.min(g.__rbZMin, e.x);
    }, 40);
  }, { GY, bx7 });
  await new Promise((r) => setTimeout(r, 2600));
  await page.evaluate(() => { clearInterval(window.__swGame.__rbZSampler); });
  const z = await page.evaluate(({ bx7 }) => {
    const g = window.__swGame;
    const e = [...g.entities.enemies, ...g.entities.critters].find((n) => !n.dead && n.vanillaId === 3);
    return e ? { x: e.x, minX: g.__rbZMin, feet: e.y + e.h, hw: e.hitWall === true } : null;
  }, { bx7 });
  check('P7 僵尸不穿越 tent 缝(hoik 不外溢=登记债方向保守)', !!z && z.minX >= (bx7 + 1) * 16 - 2,
    z ? `zX=${z.x.toFixed(0)} minX=${z.minX.toFixed(0)} 不得低于=${(bx7 + 1) * 16} feet=${z.feet.toFixed(0)} hitWall=${z.hw}` : '(僵尸未生成= inconclusive)');
}

// ============ P8 绳探索针:绳列贴墙攀爬不入墙 ============
{
  const rx = 200, wx8 = 202;
  await vacuum(BX, GY);
  await page.evaluate(({ GY, rx, wx8 }) => {
    const st = window.__swGame.world.store;
    for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
    for (let y = GY - 12; y <= GY - 1; y++) st.setTile(rx, y, 263);      // rope(v_213)
    for (let y = GY - 12; y <= GY - 1; y++) st.setTile(wx8, y, 1);       // 贴邻实心墙
  }, { GY, rx, wx8 });
  const r = await driveSampled(['KeyW'], 2400, { x: rx * 16 + 2, y: (GY - 2) * 16 - 42 });
  const climbed = r.samples.some((s) => s.feet < (GY - 4) * 16);
  const inWall = r.samples.some((s) => s.x + 20 > wx8 * 16 + 2 && s.feet > (GY - 1) * 16 - 4);
  check('P8 绳列可攀爬', climbed, `topFeet=${Math.min(...r.samples.map((s) => s.feet)).toFixed(0)}`);
  note('P8 绳贴墙不入墙观察', `inWall样本=${inWall ? '有(需人工判读)' : '无'} x=${r.x.toFixed(0)}`);
}

console.log(`RESULT: ${pass} pass / ${fail} fail / ${inconclusive} info`);
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
process.exit(fail > 0 ? 1 : 0);
