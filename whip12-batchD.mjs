// 批 D：⑬甲虫壳减伤 ⑭变态刀潜行 ⑰时间蓄能 ⑲菜单时钟
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const r = {};
  const M = (x) => Math.round(x * 100) / 100;
  const wear = (vids) => vids.forEach((v, i) => { pl.inv.armor[i] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]], stack: 1 }; });
  // ⑬ 甲虫壳 2199+2201+2202：3 球 = 45% 减伤
  wear([2199, 2201, 2202]);
  r.beetleDefSet = pl.equipStats.beetleDef;
  pl.beetleOrbs = 3;
  pl.iframes = 0; pl.hp = 400; pl.baseMaxHp = 400;
  const okDmg = pl.damage(100, pl.cx + 10, pl.cy);
  r.shellDmgTaken = okDmg ? 400 - pl.hp : -1;  // round((100-def*0.5)*0.55)
  pl.beetleOrbs = 0;
  // ⑭ 变态刀：持握 + 满潜行 → 近战 ×4 / 暴 +30 / aggro -750
  pl.inv.slots[0] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3106]], stack: 1 };
  pl.inv.selected = 0;
  r.knifeHeld = pl.heldPsychoKnife;
  pl.stealth = 0;  // ★原版极性：0=完全隐匿（满加成），1=完全可见——探针首版写反
  r.knife = { melee: M(pl.damageMult('melee')), crit: pl.critChance('melee'), aggro: pl.aggro };
  pl.stealth = 1;
  pl.inv.slots[0] = null;
  // ⑰ 时间蓄能：穿进攻甲、命中刷新后 ~90 tick 出 1 球（fixedUpdate 100 帧 ≈ 1.7s）
  wear([2199, 2200, 2202]);
  for (let i = 0; i < 5; i++) { pl.onMeleeHit(); await new Promise(s2 => setTimeout(s2, 400)); } // 持续近战续窗
  r.orbByTime = pl.beetleOrbs; // ≥1（~90t 蓄能）
  return r;
});
console.log(JSON.stringify(out));
const ok = out.beetleDefSet === true
  && out.shellDmgTaken === 35          // 100×0.55≈55（防 0）
  && out.knifeHeld === true
  && Math.abs(out.knife.melee - 4) < 0.05 && out.knife.crit === 30 && out.knife.aggro === -750
  && out.orbByTime >= 1;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
