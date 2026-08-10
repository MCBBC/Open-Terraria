// NPC 对话文本对齐验证：各类型 GetChat 输出必须落在原版 LegacyDialog 对应号码池内
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { Lang } = await import('/src/i18n/Lang.ts');
  const res = {};
  // 白天对话
  g.world.clock.timeOfDay = 0.5;
  const sample = (npc, n) => {
    const set = new Set();
    for (let i = 0; i < n; i++) set.add(g.townNpcChat(npc));
    return set;
  };
  const check = (name, npc, numPool, n = 60) => {
    const pool = new Set(numPool.map((k) => Lang.text(`LegacyDialog.${k}`)));
    const got = sample(npc, n);
    const ok = [...got].every((s) => pool.has(s));
    // 注意互cue/条件分支可能引入池外号码——这里传全量允许池
    res[name] = { ok, texts: [...got].slice(0, 6) };
    return ok;
  };
  const find = (key) => g.entities.npcs.find((n) => n.npcKey === key);
  // 向导(白天 174-176)
  check('guide_day', find('guide'), [174, 175, 176]);
  // 守卫老人(白天 82-84)——老人在地牢,直接构造不行(需要实体),从实体列表取
  const om = find('old_man');
  if (om) check('oldman_day', om, [82, 83, 84]);
  // 商人/护士不在场——用 fromVanilla 造不了 TownNPC(不同类),直接 new TownNPC 临时挂测
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const tmp = (key) => { const n = new TownNPC(key, 0, 0); return n; };
  check('merchant_day', tmp('merchant'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  check('nurse_day', tmp('nurse'), [32, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
  check('arms_dealer_day', tmp('arms_dealer'), [58, 59, 60, 61, 62, 63, 66, 67, 68]);
  check('dryad_day', tmp('dryad'), [69, 70, 71, 72, 77, 78, 79, 80, 81, 332, 333]);
  check('demolitionist_day', tmp('demolitionist'), [93, 97, 98, 99, 100, 105, 106, 107, 108, 109]);
  // 夜晚
  g.world.clock.timeOfDay = 0.9;
  check('guide_night', find('guide'), [173]);
  if (om) check('oldman_night', om, [85, 86, 87, 88, 89, 90, 91, 92]);
  check('demolitionist_night', tmp('demolitionist'), [93, 97, 98, 99, 100, 101, 102, 103, 104]);
  return res;
});
console.log(JSON.stringify(out));
await b.close();
