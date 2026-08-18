// InputTrigger 全局替换探针:页面内查蠕虫罐头 tooltip 与按键名替换
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
for (let i = 0; i < 40; i++) {
  const ready = await page.evaluate(async () => (await import('/src/i18n/Lang.ts')).Lang.loaded);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}
const out = await page.evaluate(async () => {
  const mod = await import('/src/i18n/Lang.ts');
  const canOfWorms = mod.Lang.text('ItemTooltip.CanOfWorms');
  const goodie = mod.Lang.text('ItemTooltip.GoodieBag');
  const sniper = mod.Lang.text('ItemTooltip.SniperRifle');
  const nurse = mod.Lang.text('GameUI.NurseHasArrived').catch?.(() => null);
  return {
    canOfWorms, goodie, sniper,
    rightClick: mod.Lang.text('Controls.RightClick'),
    noRawToken: !canOfWorms.includes('{InputTrigger'),
    // 批量扫描:全 ItemTooltip + GameUI 无任何裸 {InputTrigger/{NPCName 类 token
    // (进世界前 NPC 名/动态值未注入会保留 token——菜单态只验 InputTrigger 族)
    leakScan: (() => {
      const lm = (await import('/src/i18n/LanguageManager.ts')).languageManager;
      return null; // 占位——zh 包在浏览器是 fetch 的,直接经 Lang 抽查高频键
    })(),
  };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('蠕虫罐头 tooltip 无裸 {InputTrigger token', out.noRawToken, `=> ${out.canOfWorms}`);
check('替换源=Controls.RightClick 本地化键名', out.canOfWorms.startsWith(out.rightClick), `${out.rightClick} | ${out.canOfWorms}`);
check('狙击枪 tooltip 同替换生效', !out.sniper.includes('{InputTrigger'), `=> ${out.sniper}`);
// 全量泄漏抽查:仪式/礼袋/药草袋/Boss袋/旗帜族/加载提示
const more = await page.evaluate(async () => {
  const mod = await import('/src/i18n/Lang.ts');
  const keys = ['ItemTooltip.WoodenCrate', 'ItemTooltip.HerbBag', 'ItemTooltip.LockBox',
    'ItemTooltip.KingSlimeBossBag', 'ItemTooltip.BlueCultistFighterBanner',
    'ItemTooltip.SniperRifle', 'ItemTooltip.CanOfWorms'];
  return keys.map((k) => mod.Lang.text(k));
});
const leak = more.filter((t) => t.includes('{InputTrigger') || t.includes('{$'));
check('抽查 7 键零裸 token/零 {$ 残留', leak.length === 0, leak.join(' | ').slice(0, 120));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
