// 城镇 NPC 全量移植验证：①初始只有向导 ②bound 救援 NPC 放置 ③解救→入驻条件
// ④商店数据驱动(商人 27 件含门) ⑤新对话分支采样 ⑥裁缝入驻(败骷髅王)
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { Lang } = await import('/src/i18n/Lang.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const res = {};
  const list = () => g.entities.npcs.map((n) => ({ key: n.npcKey, bound: !!n.bound, home: !!n.home }));

  // ① 初始：向导 + 老人 + 5 名 bound 救援 NPC
  res.initial = list();

  // ② bound 采样对话与解救：造一个哥布林直接判条件 + 解救在场地牢机械师
  const goblin = g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer');
  res.goblinBound = goblin ? !!goblin.bound : null;
  // 解救一名（直接调用私有方法模拟右键）
  if (goblin) { g.freeBoundNpc(goblin); }
  res.afterFree = {
    flag: g.world.flags.savedGoblin,
    bound: g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer')?.bound,
  };
  // 解救后对话应走正式池(哥布林 121-136/126/309/Chatter)
  if (goblin) {
    const pool = new Set();
    ['121','122','123','124','125','126','127','128','129','130','131','132','133','134','135','136','309']
      .forEach((k) => pool.add(Lang.text('LegacyDialog.' + k)));
    pool.add(Lang.chatter('GoblinTinkererChatter'));
    let ok = true;
    for (let i = 0; i < 40; i++) if (!pool.has(g.townNpcChat(goblin))) ok = false;
    res.goblinChat = ok;
  }

  // ③ 商店：商人股票来自 JSON（基础含火把 8/砧 35，夜晚荧光棒 282，困难模式治疗药水 188）
  const merch = new TownNPC('merchant', 0, 0);
  g.world.clock.timeOfDay = 0.5; // 白天
  const dayStock = g.shopStockFor(merch).map((e) => e[0]);
  g.world.clock.timeOfDay = 0.9; // 夜晚
  const nightStock = g.shopStockFor(merch).map((e) => e[0]);
  res.merchantShop = {
    count: dayStock.length,
    hasTorch: dayStock.includes(8),
    hasAnvil: dayStock.includes(35),
    nightGlowstick: nightStock.includes(282) && !dayStock.includes(282),
  };
  g.world.clock.timeOfDay = 0.5;
  // 其他 NPC 店铺非空
  res.otherShops = {};
  for (const key of ['arms_dealer', 'dryad', 'demolitionist', 'mechanic', 'wizard', 'painter', 'witch_doctor']) {
    const n = new TownNPC(key, 0, 0);
    res.otherShops[key] = g.shopStockFor(n).length;
  }

  // ④ 对话分支采样：裁缝/树妖/军火商/巫医/税务员
  const sampleOk = (npc, nums, n = 40) => {
    const pool = new Set(nums.map((k) => Lang.text('LegacyDialog.' + k)));
    for (let i = 0; i < n; i++) if (!pool.has(g.townNpcChat(npc))) return false;
    return true;
  };
  res.chats = {
    clothier: sampleOk(new TownNPC('clothier', 0, 0), [110, 237, 112, 114, 115, 116, 117, 118, 119]),
    dryad: sampleOk(new TownNPC('dryad', 0, 0), [69, 70, 71, 72, 77, 78, 79, 80, 81, 332, 333]),
    arms: sampleOk(new TownNPC('arms_dealer', 0, 0), [58, 59, 60, 61, 62, 63, 66, 67, 68]),
    witch_doctor: sampleOk(new TownNPC('witch_doctor', 0, 0), [261, 262, 263, 264]),
    tax: sampleOk(new TownNPC('tax_collector', 0, 0), [364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374]),
    princess: (() => { const s = new Set(); for (let i = 0; i < 10; i++) s.add(g.townNpcChat(new TownNPC('princess', 0, 0))); return s.size > 0 && ![...s].includes('……'); })(),
  };

  // ⑤ 裁缝入驻：败骷髅王 → 条件满足
  g.world.flags['downed_35'] = true;
  res.clothierAllowed = g.townNpcSpawnAllowed('clothier');
  res.clothierPrio = (() => { g.updateTownNpcArrival(); return g.entities.npcs.some((n) => n.npcKey === 'clothier'); })();

  return res;
});
console.log(JSON.stringify(out));
await b.close();
