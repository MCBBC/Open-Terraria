// Duke Fishron 补全立项·实机验收探针（2026-09-03）
// 闸门3：蠕虫饵海洋垂钓 → 370 spawn → 三阶段状态机走查 → 掉落/成就/存档旗
//       + 蠕虫饵 critter(374→375 钻地) 实机走查 + 372/373 镜像回归截图
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_duke-accept-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const SHOT = '/tmp/duke-accept';
fs.mkdirSync(SHOT, { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 900000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
// ★renderMode 注入必须等 boot 完成：items.ts 顶层音乐盒循环读 devices.ts 绑定
// （MUSIC_BOX_ITEM_BY_STYLE），动态 import 抢在 main.ts DFS 之前会触发 TDZ——
// 先等菜单出现（boot 完=模块序已定型），再进 Options 链（2026-09-03 实测定谳）
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.evaluate(async () => {
  const options = await import('/src/core/Options.ts');
  for (let i = 0; i < 100; i++) {
    if (options.options?.data) { options.options.data.renderMode = 'cpu'; return; }
    await new Promise((r) => setTimeout(r, 50));
  }
});
await new Promise((r) => setTimeout(r, 800));
await click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await click('.sw-char-row input[type=text]');
  await page.keyboard.type('DUKE');
  await new Promise((r) => setTimeout(r, 200));
  await click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await click('[data-act=create]');
} else {
  await click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}

await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

// ============================ 主体 ============================
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  // ★先钉 wiring/devices 再 items——items.ts 顶层音乐盒循环读 MUSIC_BOX_ITEM_BY_STYLE,
  // 模块初始化序敏感(devices 先行则绑定就绪,2026-09-03 实机探针实测)
  await import('/src/world/wiring/devices.ts');
  const items = await import('/src/data/items.ts');
  const musicMod = await import('/src/data/Music.ts');
  const R = { checks: [], dbg: {} };
  const ok = (n, c, x) => R.checks.push([c ? '✓' : '✗', n, c ? '' : (x ?? '')]);
  const yieldFrame = () => new Promise((r) => requestAnimationFrame(r));
  const ticksFast = async (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };

  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  g.world.difficulty = 0;   // 经典杀：NotExpert 武器池/面具/翅膀可达
  g.paused = false;

  // ---- 道具：木钓竿 2289 + 松露虫饵 2673 ----
  const rodId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[2289]];
  const wormId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[2673]];
  if (!rodId || !wormId) { R.fatal = 'item-missing ' + [rodId, wormId]; return R; }
  g.player.inv.slots[2] = { id: rodId, stack: 1 };
  g.player.inv.slots[3] = { id: wormId, stack: 10 };

  // ---- 找左侧海洋岸点（x<380 格门内）+ 统计池水量 ----
  let shoreX = -1, shoreY = -1, waterX = -1;
  // ★海面可在 groundLevel 上方（sea level ≠ groundLevel）——全行扫取最宽液面行
  const y0 = Math.max(10, g.world.groundLevel - 90), y1 = Math.min(st.h - 12, g.world.groundLevel + 80);
  let best = null;
  for (let y = y0; y < y1; y++) {
    let x = 1;
    while (x < 380) {
      if (st.liquid[st.idx(x, y)] > 60) {
        let e = x;
        while (e < 380 && st.liquid[st.idx(e, y)] > 60) e++;
        const run = e - x;
        if (!best || run > best.run) best = { x, y, run };
        x = e;
      } else x++;
    }
  }
  if (!best || best.run < 40) { R.fatal = 'no-ocean-shore ' + JSON.stringify(best); return R; }
  waterX = best.x; shoreY = best.y;   // shoreX = 水面最左（岸点取水左缘）
  shoreX = best.x - 1;
  let minX = waterX, maxX = waterX;
  while (minX > 1 && st.liquid[st.idx(minX, shoreY)] > 0) minX--;
  while (maxX < st.w - 1 && st.liquid[st.idx(maxX, shoreY)] > 0) maxX++;
  let pond = 0;
  for (let x = minX; x <= maxX; x++) for (let y = shoreY; y < st.h - 10; y++) {
    if (st.liquid[st.idx(x, y)] > 0 && !st.isSolid(x, y)) pond++; else break;
  }
  R.dbg.pond = { shoreX, shoreY, minX, maxX, pond, wTiles: st.w };
  ok('海洋池水量>1000（原版 truffle 门）', pond > 1000, pond);
  ok('岸点在 x<380 门内', shoreX < 380, shoreX);
  // ---- 沙滩站位（水右缘向右找实心地）+ 抛点（水内 30 格列的液面行）----
  let standX = -1, standY = -1;
  for (let x = maxX + 2; x < maxX + 120; x++) {
    for (let y = Math.max(4, shoreY - 50); y < Math.min(st.h - 4, shoreY + 60); y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) { standX = x; standY = y; break; }
    }
    if (standX > 0) break;
  }
  if (standX < 0) { R.fatal = 'no-beach-stand'; return R; }
  // ★抛点选择按原版 GetFishingPondState 口径预扫：池塘从浮漂行横向展开逐列下数,
  // 曲面边缘列的水量会塌缩——须选「该列起算 >1000」的列,否则松露门不开(原版正确)
  let castCol = -1, castRow = -1, castPond = 0;
  const pondFrom = (col, row) => {
    let mn = col, mx = col;
    while (mn > 1 && st.liquid[st.idx(mn, row)] > 0 && !st.isSolid(mn, row)) mn--;
    while (mx < st.w - 1 && st.liquid[st.idx(mx, row)] > 0 && !st.isSolid(mx, row)) mx++;
    let n = 0;
    for (let x = mn; x <= mx; x++) for (let y = row; y < st.h - 10; y++) {
      if (st.liquid[st.idx(x, y)] > 0 && !st.isSolid(x, y)) n++; else break;
    }
    return n;
  };
  for (let col = maxX - 6; col >= 2 && castCol < 0; col--) {
    for (let y = Math.max(4, shoreY - 60); y < st.h - 4; y++) {
      if (st.liquid[st.idx(col, y)] > 60) {
        const n = pondFrom(col, y);
        if (n > 1000) { castCol = col; castRow = y; castPond = n; }
        break;
      }
    }
  }
  if (castCol < 0) { R.fatal = 'no-cast-col'; return R; }
  // 站位重定到抛点近旁的滩头（≤900px 收线门内）
  for (let x = castCol + 2; x < castCol + 130; x++) {
    for (let y = Math.max(4, castRow - 50); y < Math.min(st.h - 4, castRow + 60); y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) { standX = x; standY = y; break; }
    }
    if (standX > 0) break;
  }
  if (standX < 0) { R.fatal = 'no-beach-stand'; return R; }
  R.dbg.stand = { standX, standY, castCol, castRow, castPond };

  // ---- 蠕虫饵 critter 实机：374 玩家贴近 90t → 钻地变 375 ----
  {
    const EnemyMod = await import('/src/entities/Enemy.ts');
    const worm = EnemyMod.Enemy.fromVanilla(374, (standX + 2) * TILE, (standY - 3) * TILE);
    if (!worm) ok('374 fromVanilla 构造', false);
    else {
      g.entities.add(worm, 'enemies');
      g.player.x = standX * TILE; g.player.y = (standY - 3) * TILE;
      g.player.vx = 0; g.player.vy = 0;
      await ticksFast(110);
      const t375 = (g.entities.enemies).some((e) => e.vanillaId === 375 && !e.dead);
      ok('松露虫 374 贴近 90t 钻地 → 375', t375, 'still=' + worm.vanillaId);
      worm.dead = true;
    }
  }

  // ---- 海洋垂钓：抛竿 → 松露虫咬钩 → 收竿召 Duke ----
  g.player.x = standX * TILE; g.player.y = (standY - 3) * TILE;
  g.player.vx = 0; g.player.vy = 0;
  await ticksFast(10);
  const isBobber = (e) => e && e.constructor && e.constructor.name === 'Bobber';
  let bobber = null, castTries = 0;
  while (castTries++ < 5 && !bobber) {
    g.player.inv.selected = 2;
    g.input.mouseX = Math.round(castCol * TILE + 8);
    g.input.mouseY = Math.round((castRow - 1) * TILE);
    g.input.mouseDown = true; g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60); g.input.mouseDown = false;
    for (let i = 0; i < 240; i++) {
      await ticksFast(1);
      if (i % 60 === 59) await yieldFrame();
      const b = g.entities.projectiles.find((e) => isBobber(e) && !e.dead);
      if (b && b.floating) { bobber = b; break; }
    }
  }
  if (!bobber) { R.fatal = 'cast-failed'; R.dbg.toast = (g.toasts ?? []).slice(-1)[0]; return R; }
  ok('抛竿落水漂浮', true);
  let biteInfo = '';
  let bit = false;
  for (let i = 0; i < 8000 && !bit; i++) {
    await ticksFast(1);
    if (i % 240 === 239) await yieldFrame();
    if (bobber.dead) { R.fatal = 'bobber-died-early info=' + (g.player.displayedFishingInfo ?? ''); return R; }
    if (bobber.truffleBite || bobber.biteT > 0) bit = true;
    biteInfo = g.player.displayedFishingInfo ?? '';
    if (i === 600 || i === 2400 || i === 4800) R.dbg['wait' + i] = { info: biteInfo, bite: bobber.biteT };
  }
  ok('松露虫咬钩（truffleBite 窗开）', bit, biteInfo);
  // 渔情行由信息层逐 tick 清（单 tick 瞬态,探针采样恒落空）——机制正确性由
  // truffleBite 本身证明;此处只验 l10n 键在（UI 有文案可显）
  const Lang = (await import('/src/i18n/Lang.ts')).Lang;
  let warnText = '';
  try { warnText = Lang.text('GameUI.FishingWarning'); } catch { warnText = ''; }
  ok('渔情文案键在（GameUI.FishingWarning）', typeof warnText === 'string' && warnText.length > 0 && !/GameUI\./.test(warnText), warnText);
  const wormBefore = g.player.inv.slots[3]?.stack ?? 0;
  g.player.inv.selected = 2;   // 收竿（窗口内）→ SpawnOnPlayer 370
  await ticksFast(12);         // 竿 useTime 冷却清零
  g.input.mouseDown = true; g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60); g.input.mouseDown = false;
  await ticksFast(5);
  const duke = (g.entities.enemies).find((e) => e.vanillaId === 370 && !e.dead);
  ok('Duke 370 已生成', !!duke, g.entities.enemies.map((e) => e.vanillaId).join(','));
  if (!duke) { R.fatal = 'no-duke'; return R; }
  ok('boss 槽=Duke', g.boss === duke, g.boss?.vanillaId);
  // SpawnBoss 段置 15000,但屏内 CheckActive 每 tick 重置 750(原版 activeTime 语义)——
  // 探针读到的是重置后值,断言「存活且被 Boss 槽接管」即可
  ok('boss despawnTimer 存活（SpawnOnPlayer 段置位后被屏内重置收敛）', duke.despawnTimer > 0, duke.despawnTimer);
  const wormAfter = g.player.inv.slots[3]?.stack ?? 0;
  ok('鱼饵已消耗（必耗支 :53163）', wormAfter === wormBefore - 1, [wormBefore, wormAfter]);
  ok('音乐映射 370→58', musicMod.bossMusicFor(370) === 58, musicMod.bossMusicFor(370));
  const baseDmg = duke.def.damage;   // 出生/悬浮态无相位修正 = 缩放基值

  // ---- 三阶段状态机走查 ----
  const phases = new Set();
  for (let i = 0; i < 5000; i++) {
    await ticksFast(1);
    if (i % 300 === 299) await yieldFrame();
    if (duke.dead) break;
    phases.add(duke.ai0);
    if (duke.ai0 >= 4) break;
  }
  ok('一阶段状态集 ⊇ {0,1,2,3}', [0, 1, 2, 3].every((s) => phases.has(s)), [...phases].sort().join(','));
  duke.hp = Math.floor(duke.maxHp * 0.4);       // 半血 → 变身 4 → 二阶段 5
  const p2set = new Set(phases);
  for (let i = 0; i < 3000 && duke.ai0 < 5; i++) {
    await ticksFast(1);
    if (i % 300 === 299) await yieldFrame();
    p2set.add(duke.ai0);
  }
  ok('半血触发变身(4)且进入二阶段(5)', duke.ai0 >= 5, [...p2set].sort().join(','));
  await ticksFast(1);   // AI 顶部按 tick 初 ai0 计修正——转换拍尾读到的还是一阶段值
  ok('二阶段伤害=基值×1.2', duke.def.damage === Math.round(baseDmg * 1.2), [duke.def.damage, baseDmg]);
  // 大师档 flag2（difficulty≥1 且血≤15%）→ 9 → 10-13
  g.world.difficulty = 2;
  duke.hp = Math.floor(duke.maxHp * 0.14);
  const p3set = new Set();
  for (let i = 0; i < 5000 && duke.ai0 < 10; i++) {
    await ticksFast(1);
    if (i % 300 === 299) await yieldFrame();
    p3set.add(duke.ai0);
  }
  ok('flag2(15%血) 触发二段变身(9→10+)', duke.ai0 >= 10, [...p3set].sort().join(','));
  g.world.difficulty = 0;                        // 回经典杀（NotExpert 池）

  // ---- 击杀（经典档）→ 掉落/成就/存档旗（玩家拉远防拾取干扰）----
  // ★NotRemixSeedHardmode 门 = !remix && hardMode（Conditions.cs）——武器池只在
  //   过肉山世界掉;fresh 世界 hardMode=false 不掉=原版正确。置旗模拟过肉山经典档。
  g.world.flags.hardMode = true;
  g.player.x = standX * TILE + 1500; g.player.vx = 0; g.player.vy = 0;
  const { vanillaIdOfItem } = await import('/src/stats/Shimmer.ts');
  const dropsOf = () => (g.entities.drops ?? []).map((d) => d.itemId);
  const dropVids = () => dropsOf().map((id) => { try { return vanillaIdOfItem(id); } catch { return id; } });
  const poolVids = [5526, 2624, 2622, 2621, 5478, 3291, 2623];
  let killed = false;
  for (let i = 0; i < 6 && !killed; i++) {
    duke.hurt(999999, 0, 0, g);
    await ticksFast(4);
    killed = duke.dead || !((g.entities.enemies).some((e) => e.vanillaId === 370 && !e.dead));
  }
  await ticksFast(10);
  ok('Duke 已死亡（经典档）', killed, duke.hp);
  ok('downed_370 存档旗', g.world.flags['downed_370'] === true, g.world.flags['downed_370']);
  ok('成就 FISH_OUT_OF_WATER', g.achievements.isCompleted('FISH_OUT_OF_WATER'));
  const vids1 = dropVids();
  ok('经典池武器必掉一支（oneOf 7 件）', poolVids.some((v) => vids1.includes(v)), JSON.stringify(vids1));
  ok('强效治疗药水 499 掉落', vids1.includes(499), JSON.stringify(vids1));
  ok('心 58 掉落', vids1.includes(58));
  ok('钱币掉落（value=250000）', vids1.some((v) => [71, 72, 73, 74].includes(v)), JSON.stringify(vids1));

  // ---- 专家档第二杀 → 宝袋 3330 ----
  g.world.difficulty = 1;
  const EnemyMod = await import('/src/entities/Enemy.ts');
  // 贴玩家出生（>5600px 会走 EncourageDespawn 逃逸=无掉落,2026-09-03 实测边界假红）
  const duke2 = EnemyMod.Enemy.fromVanilla(370, g.player.cx, g.player.cy - 200);
  if (duke2) {
    g.entities.add(duke2, 'enemies');
    await ticksFast(80);   // 走完 75t 出生段（invuln=true 期间 hurt 全被吸收,2026-09-03 实测）
    let killed2 = false;
    for (let i = 0; i < 6 && !killed2; i++) {
      duke2.hurt(999999, 0, 0, g);
      await ticksFast(4);
      killed2 = duke2.dead;
    }
    await ticksFast(10);
    const vids2 = dropVids();
    ok('专家档 Duke2 构造并击杀', !!duke2 && killed2, [!!duke2, killed2]);
    const expertNow = g.world.difficulty >= 1;
    ok('专家袋 3330 掉落（专家档第二杀）', expertNow && killed2 && vids2.includes(3330),
      JSON.stringify({ d: g.world.difficulty, killed2, vids: vids2 }));
    duke2.dead = true;
  } else ok('专家档第二杀构造', false);

  // ---- 372/373 镜像回归素材：dash 左/右截图（Node 侧拍屏）----
  const sharkMod = await import('/src/entities/bossAI_duke_moonlord.ts');
  const dukeFishronAI = sharkMod.dukeFishronAI;
  window.__sharkSetup = (side) => {
    const s = EnemyMod.Enemy.fromVanilla(372, g.player.cx + side * 160, (g.world.groundLevel - 6) * TILE);
    if (!s) return null;
    g.entities.add(s, 'enemies');
    for (let i = 0; i < 92; i++) sharkMod.sharkronAI(s, g, g.player);   // 蓄力 90t → 起扑
    return { id: s.id, spin: s.spin, vx: s.vx };
  };
  window.__enemyMod = EnemyMod;
  window.__dukeTick = (d) => { dukeFishronAI(d, g, g.player); };
  window.__sharkWobble = () => {
    const s = EnemyMod.Enemy.fromVanilla(373, g.player.cx + 120, (g.world.groundLevel - 6) * TILE);
    if (!s) return null;
    g.entities.add(s, 'enemies');
    s.ai2 = 100; s.ai3 = -1.5;
    const sdirs = new Set();
    for (let i = 0; i < 40; i++) { sharkMod.sharkronAI(s, g, g.player); sdirs.add(s.sharkronSdir); }
    s.dead = true;
    return [...sdirs];
  };
  return R;
}).catch((e) => ({ fatal: 'evaluate: ' + String(e).slice(0, 300) }));

// Node 侧截图：dash 左/右（玩家在鲨左侧 → dash 向左；右侧同理）
if (!out?.fatal) {
  try {
    // 关闭首进世界的欢迎弹窗（遮挡鲨鱼）
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button, [class*=btn], [data-act]')]
        .find((b) => (b.textContent ?? '').includes('我已知晓'));
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => { const g = window.__swGame; g.player.x -= 400; g.player.vx = 0; });
    await new Promise((r) => setTimeout(r, 200));
    const left = await page.evaluate(() => window.__sharkSetup(-1));
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: SHOT + '/shark-dash-left.png' });
    await page.evaluate((info) => {
      const g = window.__swGame;
      const s = g.entities.enemies.find((e) => e.id === info.id);
      if (s) s.dead = true;
      g.player.x += 800; g.player.vx = 0;
    }, left);
    await new Promise((r) => setTimeout(r, 200));
    const right = await page.evaluate(() => window.__sharkSetup(1));
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: SHOT + '/shark-dash-right.png' });
    await page.evaluate((info) => {
      const g = window.__swGame;
      const s = g.entities.enemies.find((e) => e.id === info.id);
      if (s) s.dead = true;
    }, right);
    const wobble = await page.evaluate(() => window.__sharkWobble());
    out.checks.push([wobble && wobble.includes(-1) && wobble.includes(1) ? '✓' : '✗',
      '373 蓄力摆头 sdir 双值翻转（批4 修复回归）', (wobble ?? []).join(',')]);
    // ---- 370 本体 flip + 鲨左扑证据（红蓝对抗 B1-E10/R1-F1 回归素材）----
    const dukeFace = await page.evaluate(() => {
      const g = window.__swGame;
      const EnemyMod2 = window.__enemyMod;
      const d = EnemyMod2.Enemy.fromVanilla(370, g.player.cx - 260, g.player.cy - 60);
      if (!d) return null;
      g.entities.add(d, 'enemies');
      d.bInit = true; d.ai0 = 0; d.ai2 = 0; d.ai1 = 300;   // 直置悬浮态(玩家居左 → spr=+1 → flip)
      for (let i = 0; i < 30; i++) window.__dukeTick(d);
      return { facing: d.facing, spin: +d.spin.toFixed(3) };
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: SHOT + '/duke-player-left.png' });
    await page.evaluate(() => {
      const g = window.__swGame;
      const d = g.entities.enemies.find((e) => e.vanillaId === 370);
      if (d) d.dead = true;
    });
    out.checks.push([dukeFace && dukeFace.facing > 0 ? '✓' : '✗',
      '370 玩家居左 facing=spr=+1（Renderer flip 证据帧）', JSON.stringify(dukeFace)]);
  } catch (e) {
    out.checks.push(['✗', '截图段异常', String(e).slice(0, 200)]);
  }
}

console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('PAGE ERRORS:', errs.join(' | '));
await browser.close();
const bad = (out?.checks ?? []).filter((c) => c[0] === '✗').length;
console.log((out?.fatal ? 'FATAL: ' + out.fatal + '\n' : '') + 'RESULT: ' + ((out?.checks ?? []).filter((c) => c[0] === '✓').length) + ' ok, ' + bad + ' bad');
process.exit(out?.fatal || bad > 0 ? 1 : 0);
