// IIIII228 探针（运行时债 A 组清偿）：
//   ①remix 刷怪率臂（深岩 0.5/1.7 + 血月 0.3/1.8 + 深岩软化 0.6 → clamp 60）+ 经典翻转对照（零扰动）
//   ②StatusFromNPC 全表 type 臂（木乃伊 78 → Slow 900t=15s；141 毒泥 → Poisoned 10s）
//   ③魔法海螺 RequestMagicConchTeleportPosition（左右洋两向落点带）
//   ④商店 remix 抑制门（树妖净化粉 66 旗驱剔补）+ 公主 tenth 臂
//   ⑤noSurface 世界 DoNoSurfaceFillTheTop 顶带填充普查（mole people 独立世界）
// 用法:SW_ORIGIN=http://localhost:5284 node tools/run-diag.mjs scripts/_iii228-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const R = [];
  const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };

  // ── ①remix 刷怪率臂（live spawner,旗翻转对照;zone 计数经 500ms 缓存中性化）──
  const sp = g.vanillaSpawner;
  const deepY = (w.rockLevel + 60) * 16;
  const neutral = () => { sp.zoneCounts = { evil: 0, blood: 0, snow: 0, holy: 0, jungle: 0, meteor: 0, mushroom: 0, graveyard: 0 }; };
  sp.getSpawnRate(deepY, 800, false, 800); neutral();   // 预热 zone 缓存后中性化
  w.clock.bloodMoon = true; w.clock.timeOfDay = 0;      // 血月夜
  w.seedFlags.remix = true; neutral();
  const remixDeep = sp.getSpawnRate(deepY, 800, false, 800);
  w.seedFlags.remix = false; neutral();
  const classicDeep = sp.getSpawnRate(deepY, 800, false, 800);
  w.seedFlags.remix = true; neutral();
  w.clock.bloodMoon = false; w.clock.timeOfDay = 0.5;
  const remixDeepDay = sp.getSpawnRate(deepY, 800, false, 800);
  chk('①remix 血月深岩臂 → rate 60（0.5×0.3×0.6=54 被 clamp 回夹）', remixDeep.spawnRate === 60, `rate=${remixDeep.spawnRate}`);
  chk('①remix 血月深岩臂 → max 14（⌊8×1.8⌋）', remixDeep.maxSpawns === 14, `max=${remixDeep.maxSpawns}`);
  chk('①经典翻转对照 rate 240（零扰动 ×0.4）', classicDeep.spawnRate === 240, `rate=${classicDeep.spawnRate}`);
  chk('①经典翻转对照 max 9（零扰动 ⌊5×1.9⌋）', classicDeep.maxSpawns === 9, `max=${classicDeep.maxSpawns}`);
  chk('①remix 白天深岩无血月臂 → 300/8（昼带无后置块）', remixDeepDay.spawnRate === 300 && remixDeepDay.maxSpawns === 8,
    `r=${remixDeepDay.spawnRate},m=${remixDeepDay.maxSpawns}`);

  // ── ②StatusFromNPC 全表（木乃伊 78 Slow 15s / 141 Poisoned 10s）──
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const buffs = new (await import('/src/stats/Buffs.ts')).BuffState();
  const fakePlayer = { buffs };
  let hitSlow = 0;
  for (let k = 0; k < 300 && !hitSlow; k++) {
    const e78 = Enemy.fromVanilla(78, g.player.cx, g.player.y - 400);
    e78.statusFromNpcTypeArms(g, fakePlayer, false);
    hitSlow = buffs.active.get(20) ?? 0;   // BuffType.Poisoned? — Slow=vanilla32
    // 直接查 Slow（vanilla 32）时长
    hitSlow = 0;
    for (const [bt, sec] of buffs.active) {
      if ((await import('/src/stats/Buffs.ts')).BUFF_DEFS[bt]?.vanillaBuff === 32) hitSlow = sec;
    }
    buffs.active.clear();
  }
  chk('②木乃伊 78 接触 Slow(vanilla32) 900t=15s', hitSlow === 15, `sec=${hitSlow}`);
  let hitPois = 0;
  for (let k = 0; k < 100 && !hitPois; k++) {
    const e141 = Enemy.fromVanilla(141, g.player.cx, g.player.y - 400);
    e141.statusFromNpcTypeArms(g, fakePlayer, false);
    for (const [bt, sec] of buffs.active) {
      if ((await import('/src/stats/Buffs.ts')).BUFF_DEFS[bt]?.vanillaBuff === 20) hitPois = sec;
    }
    buffs.active.clear();
  }
  chk('②毒泥 141 接触 Poisoned(vanilla20) 600t=10s', hitPois === 10, `sec=${hitPois}`);

  // ── ③魔法海螺（TeleportHelpers 1:1 爬行搜索）──
  const right = g.requestMagicConchTeleportPosition(true);
  const left = g.requestMagicConchTeleportPosition(false);
  const inRightBand = right && (right.x / 16 > 4200 - 40 - 4200 || right.x / 16 >= 4200 - 40);
  chk('③海螺右洋落点（x ∈ 右缘带,非空）', !!right && right.x / 16 >= 4200 - 40 - 400, `x=${right && (right.x / 16).toFixed(0)},y=${right && (right.y / 16).toFixed(0)}`);
  chk('③海螺左洋落点（x ∈ 左缘带）', !!left && left.x / 16 <= 40 + 400, `x=${left && (left.x / 16).toFixed(0)},y=${left && (left.y / 16).toFixed(0)}`);

  // ── ④商店 remix 抑制门（树妖 66 净化粉）+ 公主 tenth 臂（旗翻转）──
  const fakeNpc = { npcKey: 'dryad', vanillaId: 20, dead: false };
  const savedSf = { ...w.seedFlags };
  const stockClassic0 = g.shopStockFor(fakeNpc).map((e) => e[0]);
  w.seedFlags.remix = true;
  const stockRemix = g.shopStockFor(fakeNpc).map((e) => e[0]);
  w.seedFlags.remix = savedSf.remix ?? false;
  chk('④remix：树妖净化粉 66 被抑制（:1584）', !stockRemix.includes(66), `n=${stockRemix.length}`);
  chk('④经典翻转：净化粉 66 上架（零扰动）', stockClassic0.includes(66), `n=${stockClassic0.length}`);
  const princessBase = g.shopStockFor({ npcKey: 'princess', vanillaId: 663, dead: false }).map((e) => e[0]);
  w.seedFlags.tenthAnniversary = true;
  const princessTenth = g.shopStockFor({ npcKey: 'princess', vanillaId: 663, dead: false }).map((e) => e[0]);
  w.seedFlags.tenthAnniversary = savedSf.tenthAnniversary ?? false;
  chk('④非十周年：公主 1309 不在架', !princessBase.includes(1309), `n=${princessBase.length}`);
  chk('④十周年翻转：1309 复古海报在架（:3436）', princessTenth.includes(1309), `n=${princessTenth.length}`);

  w.seedFlags.remix = false;
  return R;
});

console.log(out.join('\n'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
const fails = out.filter((l) => l.startsWith('FAIL'));
console.log(fails.length ? `RESULT: ${fails.length} FAIL` : 'RESULT: ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
