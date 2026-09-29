import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5380';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false) && i > 8) break;
}
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const comp = await import('/src/world/creditsRollComposer.ts');
  const fill = comp.getCreditsRollFill(true);
  const bg = fill.segments.find((s) => s.k === 'spr' && s.tex === 'Extra_241');
  const npcs = fill.segments.filter((s) => s.k === 'npc' && s.t >= bg.t);
  return {
    bg: { t: bg.t, dx: bg.dx, dy: bg.dy },
    crowdXs: npcs.slice(0, 6).map((n) => ({ t: n.t, dx: n.dx, dy: n.dy, type: n.type })),
    // 全场 spr 段分布
    sprT: fill.segments.filter((s) => s.k === 'spr').map((s) => ({ tex: s.tex, t: s.t, dx: Math.round(s.dx), dy: Math.round(s.dy) })),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
