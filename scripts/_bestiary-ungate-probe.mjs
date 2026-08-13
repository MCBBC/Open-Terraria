// 图鉴免门+tooltip 说明行页面内实证（一次性）：零杀条目 unlockState=4 + ItemTooltip 链路
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const mod = await import('/src/data/Bestiary.ts');
  const t = g.world.bestiary;
  const enemy = mod.bestiaryEntries().find((e) => e.kind === 'enemy');
  const lang = await import('/src/i18n/Lang.ts');
  const idn = await import('/src/i18n/idNames.generated.ts');
  return {
    unlockAll: mod.bestiaryGating.unlockAll,
    unseenState: t.unlockState(enemy),           // 期望 4（免门）
    torchKey: idn.ITEM_NAME_BY_ID[8],
    torchTip: lang.Lang.text('ItemTooltip.Torch'),
  };
}).catch((e) => ({ err: String(e) }));
console.log(JSON.stringify(out));
console.log('errs:', errors.slice(0, 2));
await browser.close();
