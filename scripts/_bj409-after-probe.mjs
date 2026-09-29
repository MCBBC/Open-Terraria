// BJ409 修后实机验证：触发 credits → Renderer 背景段绘制（DrawRemainingDepth 位）
//  取证：①泄漏复测（t=100 绘制段数应为 0）②收场群像实拍（画板+人群+世界遮挡）
//  ③早期场实拍。私有端口探针（SW_ORIGIN）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_EVIDENCE ?? '/tmp/bj409';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inWorld = false;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  inWorld = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (inWorld && i > 8) break;
}
if (!inWorld) { console.log(JSON.stringify({ fatal: 'boot timeout', errs })); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|Got it/.test(x.textContent ?? ''));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 800));

const info = await page.evaluate(async () => {
  const cr = await import('/src/world/CreditsRoll.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const fill = comp.getCreditsRollFill(true);
  const bgSeg = fill.segments.find((s) => s.k === 'spr' && s.tex === 'Extra_241');
  cr.creditsRoll.tryStarting(fill.endTime);
  // 泄漏复测：窗门谓词逐段复算（修后 t=100 应 0 段可见）
  let leakNpc = 0, leakSpr = 0;
  for (const s of fill.segments) {
    if (s.k === 'npc' || s.k === 'spr') {
      const local = 100 - s.t;
      if (local >= 0 && local <= s.acts.time) { if (s.k === 'npc') leakNpc++; else leakSpr++; }
    }
  }
  // 拨演出时钟到收场群像中段（tick 由 Game 60Hz 档推进,此处直设状态）
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = bgSeg.t + 240;
  return { endTime: fill.endTime, bgT: bgSeg.t, leakNpc, leakSpr };
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/after-final-scene.png` });

// 早期场（Guide/Zombie 895+150）
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, 895 + 150);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/after-early-scene.png` });

// 收场段尾（emote 窗：t0+580 → 663 气泡窗 [608,668) 内）
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, info.bgT + 630);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/after-final-emote.png` });

console.log(JSON.stringify({ ...info, errs: errs.slice(0, 5) }));
await browser.close();
process.exit(0);
