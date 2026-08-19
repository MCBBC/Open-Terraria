// F6 召唤面板 boss 可见性探针:页面内驱动 DebugSummonPanel 纯逻辑
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const mod = await import('/src/core/DebugSummonPanel.ts');
  const lang = await import('/src/i18n/Lang.ts');
  const nameOf = (id) => lang.Lang.npcName(id);
  const def = mod.filterSummonEntries('', 240, nameOf);
  const zh = mod.filterSummonEntries('世纪之花', 240, nameOf);
  const zh2 = mod.filterSummonEntries('石巨人', 240, nameOf);
  const all = mod.SUMMON_ENTRIES.filter((e) => e.boss).map((e) => e.id);
  return {
    bossIds: all,
    defaultFirst30: def.slice(0, 30).map((e) => `${e.id}:${nameOf(e.id) ?? e.name}`),
    zhPlantera: zh.map((e) => e.id),
    zhGolem: zh2.map((e) => e.id),
    allBossesInDefault: all.every((b) => def.some((e) => e.id === b)),
  };
});
console.log('boss ids:', out.bossIds.join(','));
console.log('默认视图前30行:');
out.defaultFirst30.forEach((t, i) => console.log(' ', i, t));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('默认视图含全部 boss(含 262 世纪之花/245 石巨人)', out.allBossesInDefault, `boss数=${out.bossesInDefault ?? out.bossIds.length}`);
check('中文搜索"世纪之花"命中 262', out.zhPlantera.includes(262), JSON.stringify(out.zhPlantera));
check('中文搜索"石巨人"命中 245', out.zhGolem.includes(245), JSON.stringify(out.zhGolem));
check('boss 行置顶(前 N=表内 boss 总数行均为 boss)', out.defaultFirst30.slice(0, out.bossIds.length).every((t) => out.bossIds.includes(Number(t.split(':')[0]))));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
