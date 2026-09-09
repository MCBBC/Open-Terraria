// SW-BJ45 渔夫任务链法证探针：复现用户场景——
// 交蝙蝠鱼(2450=ANGLER_QUEST_ITEMS[0]) → 日切重掷 → 同鱼连抽(1/41 合法) → 持鱼提交
// 逐状态位直读（完成旗/名单/任务索引/计数/比对域/角标/台词池/uniqueStack 门）。
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_sw-bj45-angler-quest.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const { VI_ID } = await import('/src/data/itemKeys.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Bobber } = await import('/src/entities/Bobber.ts');
  const { ANGLER_QUEST_ITEMS, rollAnglerQuest, seededRng } = await import('/src/data/vanillaFishing.ts');
  const { Clock } = await import('/src/world/World.ts');
  const res = { pageErrors: [] };

  // ---- S0 基线：域映射 + 表 ----
  const w = g.world, pl = g.player;
  g.enemySpawnEnabled = false;
  w.clock.timeOfDay = 0.5;                 // 正午,避开黎明事件干扰
  g._lastClockT = 0.5;
  const batfishVid = 2450;
  res.s0 = {
    tableIndex0: ANGLER_QUEST_ITEMS[0],
    vi_id_2450: VI_ID(batfishVid),
    key_2450: ITEM_BY_KEY[Object.keys(ITEM_BY_KEY).find(k => k.startsWith('vi_2450_'))] ?? null,
    dayCount: w.clock.dayCount, seed: w.seed,
    quest: w.anglerQuest, finished: w.anglerQuestFinished,
    list: [...w.anglerWhoFinishedToday], count: pl.anglerQuestsFinished,
    playerName: g.playerName(),
  };

  // 渔夫 TownNPC(369) 放玩家旁（探针域：直接实体注入）
  const TILE = 16;
  let angler = g.entities.npcs.find(n => n.npcKey === 'angler' && !n.dead && n.vanillaId === 369);
  if (!angler) {
    angler = new TownNPC('angler', pl.x + 48, pl.y);
    g.entities.add(angler, 'npcs');
  }
  res.s0.anglerVid = angler.vanillaId;

  // 台词捕获（cb.onNpcDialog 挂钩）
  let last = null;
  g.cb.onNpcDialog = (name, chat, buttons, portrait, vid, corner) => {
    last = { chat: String(chat), corner, buttons: (buttons || []).map(x => x.id) };
  };
  const giveFish = (n = 1) => {
    const id = VI_ID(batfishVid);
    const s = pl.inv.slots.find(x => x && x.id === id);
    if (s) s.stack += n; else pl.inv.slots[10] = { id, stack: n };
  };
  const takeFish = () => {
    const id = VI_ID(batfishVid);
    const i = pl.inv.slots.findIndex(x => x && x.id === id);
    if (i >= 0) pl.inv.slots[i] = null;
  };
  const fishCount = () => pl.inv.slots.filter(x => x && x.id === VI_ID(batfishVid)).reduce((a, x) => a + x.stack, 0);
  const snap = () => ({
    quest: w.anglerQuest, questVid: ANGLER_QUEST_ITEMS[w.anglerQuest],
    finished: w.anglerQuestFinished, list: [...w.anglerWhoFinishedToday],
    count: pl.anglerQuestsFinished, fish: fishCount(), chat: last?.chat, corner: last?.corner,
  });

  // ---- S1 第 1 天：任务=蝙蝠鱼(索引0)，持鱼提交 → 应成功 ----
  w.anglerQuest = 0; w.anglerWhoFinishedToday = []; w.anglerQuestFinished = false;
  pl.anglerQuestsFinished = 0;
  giveFish(1);
  g.dialogNpc = angler;
  g.anglerQuestTurnIn();
  res.s1_turnIn = snap();

  // ---- S2 日切（真黎明跨越链）：timeOfDay 拨到 DAWN 前沿 → 等 tick 跨越 ----
  w.clock.timeOfDay = Clock.DAWN - 2e-6;
  g._lastClockT = Clock.DAWN - 3e-6;
  await sleep(600);
  const expectedIdx = rollAnglerQuest(
    {
      hardMode: !!w.flags.hardMode,
      evil: w.crimson ? 'crimson' : 'corrupt',
      anyBoss: !!(w.flags['downed_4'] || w.flags.downedEyeOfCthulhu || w.flags['downed_13'] || w.flags['downed_266']
        || w.flags.downedSkeletron || w.flags['downed_35'] || w.flags.hardMode
        || w.flags.downedSlimeKing || w.flags['downed_50'] || w.flags['downed_222']),
      hasWorldSurface: w.groundLevel > 50,
    },
    seededRng((w.seed ^ Math.imul(w.clock.dayCount, 0x9E3779B1)) | 0));
  res.s2_dawn = { ...snap(), expectedIdx, crossed: w.clock.timeOfDay >= Clock.DAWN };

  // ---- S3 用户核心场景：连抽同鱼（强制索引0=蝙蝠鱼，1/41 合法域内）→ 持鱼提交 → 应成功 ----
  w.anglerQuest = 0;
  giveFish(1);
  g.anglerQuestTurnIn();
  res.s3_sameFishTurnIn = snap();

  // ---- S4 无鱼提交 → 不应改任何状态 ----
  takeFish();
  w.anglerWhoFinishedToday = []; w.anglerQuestFinished = false;
  const before4 = snap();
  g.anglerQuestTurnIn();
  res.s4_noFish = { before: before4, after: snap() };

  // ---- S6 uniqueStack 门（FishingCheck_ProbeForQuestFish）：持鱼时不可再钓 ----
  const hooks = { world: w, npcs: () => g.entities.npcs };
  const bob = new Bobber(pl.x, pl.y - 40, 0, 0, 30, 0, 50, () => pl);
  w.anglerQuest = 0; w.anglerQuestFinished = false; w.anglerWhoFinishedToday = [];
  giveFish(1);
  const s6_withFish = bob.probeQuestFish(pl, hooks);
  takeFish();
  const s6_noFish = bob.probeQuestFish(pl, hooks);
  w.anglerQuestFinished = true;
  const s6_finished = bob.probeQuestFish(pl, hooks);
  w.anglerQuestFinished = false;
  const savedAnglerAlive = w.anglerQuest;
  res.s6_uniqueGate = { withFish: s6_withFish, noFish: s6_noFish, finished: s6_finished, questNow: savedAnglerAlive };

  // ---- S5 同日读档端到端（原版 WorldGen.cs:6781-6784 重构链）：名单回填 →
  //      走读档支重跑装配尾（pendingTownNpcs 非空=读档支,不触发 swap）→
  //      finished 应重构 true → 持鱼提交被拦且台词=NoQuest 池/角标 0 ----
  w.anglerWhoFinishedToday = [g.playerName()]; w.anglerQuestFinished = false;
  w.pendingTownNpcs = [{ key: 'guide', x: Math.floor(pl.x / TILE) + 2, y: Math.floor(pl.y / TILE) }];
  g.afterWorldLoad();
  const s5_reconstructed = { finished: w.anglerQuestFinished };
  giveFish(1);
  const before5 = snap();
  g.anglerQuestTurnIn();
  res.s5_sameDayReload = { reconstructed: s5_reconstructed, before: before5, after: snap() };
  takeFish();

  // ---- S7 对话按钮面：quest 按钮存在 + excl 语义 ----
  g.dialogNpc = angler;
  const btns = g.npcDialogButtons(angler);
  res.s7_buttons = { ids: btns.map(x => x.id), excl: btns.find(x => x.id === 'quest')?.excl };

  // ---- S8 连抽同鱼统计（同种子日序列 0..40 天，量化"又抽到蝙蝠鱼"概率）----
  const mkGates = () => ({
    hardMode: !!w.flags.hardMode,
    evil: w.crimson ? 'crimson' : 'corrupt',
    anyBoss: !!(w.flags['downed_4'] || w.flags.downedEyeOfCthulhu || w.flags['downed_13'] || w.flags['downed_266']
      || w.flags.downedSkeletron || w.flags['downed_35'] || w.flags.hardMode
      || w.flags.downedSlimeKing || w.flags['downed_50'] || w.flags['downed_222']),
    hasWorldSurface: w.groundLevel > 50,
  });
  let same = 0, batfish = 0, prev = -1;
  const idxSeq = [];
  for (let d = 1; d <= 200; d++) {
    const q = rollAnglerQuest(mkGates(), seededRng((w.seed ^ Math.imul(d, 0x9E3779B1)) | 0));
    if (q === prev) same++;
    if (ANGLER_QUEST_ITEMS[q] === 2450) batfish++;
    idxSeq.push(q); prev = q;
  }
  res.s8_stats = { sameAdjacent: same, batfishDays: batfish, days: 200, first10: idxSeq.slice(0, 10) };

  return res;
});

console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('PAGE ERRORS:', JSON.stringify(errs, null, 2));
await b.close();
