// 一次性探针:equipStats 帧级结构键缓存(IIIII251)活机验证。
// 用法:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs scripts/_equip-key-probe.mjs
// 证据面:
//  A. 每拍 equipStats 访问量(包裹 getter)与结构段重建量(包裹 equipStatsStructKey)
//     ——修复前=每访问一次结构段全量重扫;修复后=武装窗内每拍恰 1 次。
//  B. A/B 计时:解除态读(=旧逐访问路径,与旧代码同构+一次合成)vs 武装窗内读。
//  C. 正确性抽查:直写盔甲(解除态立即 42)/buff(立即 jumpSpd+0.2)/词缀重铸(Warding→Arcane)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE-EXC', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const out = await page.evaluate(async () => {
  const [{ Player }, { Inventory, ACC_ARMOR_START }, { World }, { ITEM_BY_KEY }, { vanillaItemKey }] = await Promise.all([
    import('/src/entities/Player.ts'), import('/src/items/Inventory.ts'), import('/src/world/World.ts'),
    import('/src/data/items.ts'), import('/src/data/vanillaRecipes.ts'),
  ]);
  const w = new World(120, 120, 72, 'equip-probe');
  for (let x = 10; x <= 100; x++) w.store.setTileSilent(x, 60, 1);
  const hooks = {
    world: w, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: () => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {}, playerEmote: () => {},
    spawnRainForced: () => {},
  };
  const p = new Player(20 * 16, 58 * 16, new Inventory());
  hooks.player = p;

  // ---- 计数器(仅探针内,产品码零污染) ----
  const proto = Object.getPrototypeOf(p);
  let structBuilds = 0, tailBuilds = 0, getterHits = 0;
  const dS = Object.getOwnPropertyDescriptor(proto, 'equipStats');
  const origGet = dS.get;
  const origStruct = proto.equipStatsStructKey;
  const origTail = proto.equipStatsTailKey;
  Object.defineProperty(proto, 'equipStats', { ...dS, get() { getterHits++; return origGet.call(this); } });
  proto.equipStatsStructKey = function () { structBuilds++; return origStruct.call(this); };
  proto.equipStatsTailKey = function () { tailBuilds++; return origTail.call(this); };

  // ---- A:120 tick 实驱(真实武装窗+真实窗内消费位) ----
  getterHits = 0; structBuilds = 0; tailBuilds = 0;
  for (let i = 0; i < 120; i++) p.fixedUpdate(1 / 60, hooks);
  const perTick = { ticks: 120, getterAccesses: getterHits, structBuilds, tailBuilds,
    accessesPerTick: +(getterHits / 120).toFixed(1), structBuildsPerTick: +(structBuilds / 120).toFixed(2) };

  // ---- B:A/B 计时:解除态读(旧路径同构) vs 武装窗内读 ----
  const N = 20000;
  // 解除态(=旧路径:每访问结构段全量重扫)
  let t1 = performance.now();
  for (let i = 0; i < N; i++) { void p.equipStats; }
  const disarmedPerAccessUs = (performance.now() - t1) * 1000 / N;
  // 武装窗内:进入窗口(清缓存+置武装)后连读——每访问=缓存结构段+尾段现算
  p._equipStatsArm = true; p._equipStatsStructKeyCache = null;
  void p.equipStats;                     // 窗内首读:建结构段一次
  t1 = performance.now();
  for (let i = 0; i < N; i++) { void p.equipStats; }
  const armedPerAccessUs = (performance.now() - t1) * 1000 / N;
  p._equipStatsArm = false; p._equipStatsStructKeyCache = null;

  // ---- C:正确性抽查 ----
  const checks = {};
  const acc49 = ITEM_BY_KEY[vanillaItemKey(49)];
  // C1 解除态直写立即生效:Warding +4 def → Arcane +20 mana(重铸词缀面)
  p.inv.armor[ACC_ARMOR_START] = { id: acc49, stack: 1, prefix: 65 };
  checks.wardingDef = p.equipStats.def;                       // 期望 4
  p.inv.armor[ACC_ARMOR_START] = { id: acc49, stack: 1, prefix: 66 };
  checks.arcaneDef = p.equipStats.def;                        // 期望 0
  checks.arcaneMana = p.equipStats.mana;                      // 期望 20
  // C2 解除态直写潜水头盔 268 → breathCDMax 42
  p.inv.armor[ACC_ARMOR_START] = null;
  p.inv.armor[0] = { id: ITEM_BY_KEY[vanillaItemKey(268)], stack: 1 };
  checks.divingBreath = p.breathCDMax;                        // 期望 42
  p.inv.armor[0] = null;
  checks.breathAfterUnequip = p.breathCDMax;                  // 期望 7
  // C3 buff 立即跟随(Werewolf jumpSpd +0.2)
  const baseJump = p.equipStats.jumpSpd;
  p.buffs.apply(71, 600);                                     // BuffType.Werewolf=71
  checks.werewolfJump = +(p.equipStats.jumpSpd - baseJump).toFixed(4);  // 期望 0.2
  p.buffs.remove(71);
  checks.werewolfRemoved = +(p.equipStats.jumpSpd - baseJump).toFixed(4);  // 期望 0
  // C4 武装窗内 tick 后换装=下一 tick 生效(结构段窗内恒定,窗外自愈)
  p.fixedUpdate(1 / 60, hooks);                               // 一个空 tick(窗开合)
  const defBefore = p.equipStats.def;
  p.inv.armor[ACC_ARMOR_START] = { id: acc49, stack: 1, prefix: 65 };   // tick 外直写
  checks.outOfWindowDef = p.equipStats.def;                   // 解除态:立即 4
  p.fixedUpdate(1 / 60, hooks);
  checks.afterTickDef = p.equipStats.def;                     // 期望 4(稳定)
  checks.defBefore = defBefore;                               // 期望 0

  // 还原插桩
  Object.defineProperty(proto, 'equipStats', dS);
  proto.equipStatsStructKey = origStruct;
  proto.equipStatsTailKey = origTail;
  return { perTick, disarmedPerAccessUs: +disarmedPerAccessUs.toFixed(3), armedPerAccessUs: +armedPerAccessUs.toFixed(3), checks };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
