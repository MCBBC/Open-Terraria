// BJ409：tick 链路验证——只走 tryStarting（月总首杀同链）,不拨状态;
// 3s 后 overlay 应自激活（canPlay→activate,60Hz t++/opacity 斜坡）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false) && i > 8) break;
}
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(async () => {
  const cr = await import('/src/world/CreditsRoll.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  cr.creditsRoll.tryStarting(comp.getCreditsRollFill(true).endTime);
});
await new Promise((r) => setTimeout(r, 3000));
const st = await page.evaluate(async () => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  return { active: inst.active, opacity: inst.opacity, t: inst.t };
});
console.log(JSON.stringify(st));
await browser.close();
process.exit(0);
