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
  };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('蠕虫罐头 tooltip 无裸 {InputTrigger token', out.noRawToken, `=> ${out.canOfWorms}`);
check('替换源=Controls.RightClick 本地化键名', out.canOfWorms.startsWith(out.rightClick), `${out.rightClick} | ${out.canOfWorms}`);
check('狙击枪 tooltip 同替换生效', !out.sniper.includes('{InputTrigger'), `=> ${out.sniper}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
