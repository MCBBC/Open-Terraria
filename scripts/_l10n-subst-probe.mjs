// InputTrigger 全局替换探针:蠕虫罐头/键位名/批量泄漏抽查
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
  const keys = ['ItemTooltip.CanOfWorms', 'ItemTooltip.GoodieBag', 'ItemTooltip.SniperRifle',
    'ItemTooltip.WoodenCrate', 'ItemTooltip.HerbBag', 'ItemTooltip.LockBox',
    'ItemTooltip.KingSlimeBossBag', 'ItemTooltip.BlueCultistFighterBanner'];
  return {
    texts: keys.map((k) => mod.Lang.text(k)),
    rightClick: mod.Lang.text('Controls.RightClick'),
  };
});
out.texts.forEach((t, i) => console.log(i, '=>', t.replace(/\n/g, '\\n')));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const [canOfWorms, , sniper, crate, herb, lock, bossBag, banner] = out.texts;
check('蠕虫罐头无裸 token 且以键名开头', !canOfWorms.includes('{') && canOfWorms.startsWith(out.rightClick), `=> ${canOfWorms}`);
check('狙击枪完整中文', sniper.includes(out.rightClick) && !sniper.includes('{'), `=> ${sniper.replace(/\n/g, '|')}`);
check('旗帜族无 {$ 残留(构建期已落裸键名)', !banner.includes('{$'), `=> ${banner}`);
check('抽查 8 键零 {InputTrigger/零 {$ 残留', out.texts.every((t) => !t.includes('{InputTrigger') && !t.includes('{$')),
  `${crate} | ${herb} | ${lock} | ${bossBag}`.slice(0, 100));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
