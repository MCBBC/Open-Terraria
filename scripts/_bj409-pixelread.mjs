// BJ409：overlay 画布像素回读——Extra_241 段落点带内是否有非透明像素
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
  const cr = await import('/src/world/CreditsRoll.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  const fill = comp.getCreditsRollFill(true);
  const bg = fill.segments.find((s) => s.k === 'spr' && s.tex === 'Extra_241');
  cr.creditsRoll.tryStarting(fill.endTime);
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1;
  // 停掉 overlay 自己的帧循环,手工单帧绘制（排除 rAF 竞争）
  cancelAnimationFrame(inst.raf);
  inst.t = bg.t + 240;
  const ctx = inst.ctx;
  ctx.clearRect(0, 0, inst.cv.width, inst.cv.height);
  // 手工调用 draw 的私有方法（TS private 仅编译期）
  inst.draw(ctx, inst.t, 1);
  await new Promise((r) => setTimeout(r, 300));   // loadSheet 异步回调落地
  inst.draw(ctx, inst.t, 1);                      // 图已缓存,再画一帧
  const band = ctx.getImageData(0, 0, inst.cv.width, 140).data;
  let lit = 0;
  for (let i = 3; i < band.length; i += 40) if (band[i] > 10) lit++;
  const mid = ctx.getImageData(560, 300, 160, 120).data;   // 人群中心带
  let litMid = 0;
  for (let i = 3; i < mid.length; i += 40) if (mid[i] > 10) litMid++;
  // 该段求值态复算
  const st = { opacity: -1 };
  // 直读 seg 的动作链在 local=240 的 opacity（复刻 evalActs target 语义）
  return { litTopBand: lit, litMidBand: litMid, sheetHas241: inst.sheets.has('Extra_241') };
});
console.log(JSON.stringify(out));
await browser.close();
process.exit(0);
