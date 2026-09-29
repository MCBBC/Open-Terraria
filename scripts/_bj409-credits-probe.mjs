// BJ409 探针：通关名单演出（credits）NPC 表现实机取证。
// 用法：SW_ORIGIN=http://localhost:5380 node tools/run-diag.mjs scripts/_bj409-credits-probe.mjs
//  1. 进世界（?play=small）
//  2. 经 vite ESM 模块图直调 creditsRoll.tryStarting(composer endTime)（月总首杀同链）
//  3. 取 Extra_241 段（收场群像）开场帧 t，把 overlay 时钟拨到 t+240（群像+跳 wave 中段）
//  4. 截图 final 场 + 早期场（Guide/Zombie 895）+ 泄漏取证（t=段窗外仍绘制计数）
//     ——泄漏取证不依赖像素：直接调 draw 前的可见性谓词同式复算（npc/spr 段
//     blankState 初值 + 窗外）在页面内对全部段统计"t=100 时将绘制"的段数。
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
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inWorld = false;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  inWorld = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (inWorld && i > 8) break;
}
if (!inWorld) { console.log(JSON.stringify({ fatal: 'world boot timeout', errs })); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 3000));
// 关欢迎弹窗（WelcomeAnnounce 覆层,若在场）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /我已知晓|Got it|OK/.test(x.textContent ?? ''));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 800));

const info = await page.evaluate(async () => {
  const cr = await import('/src/world/CreditsRoll.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  const fill = comp.getCreditsRollFill(true);
  const bgSeg = fill.segments.find((s) => s.k === 'spr' && s.tex === 'Extra_241');
  // 触发链 = 月总首杀同链（NPC.cs:79587 case 10 → TryStartingCreditsRoll）
  cr.creditsRoll.tryStarting(fill.endTime);
  return {
    endTime: fill.endTime,
    count: fill.segments.length,
    bgT: bgSeg ? bgSeg.t : -1,
    remaining: cr.creditsRoll.remainingTime,
  };
});
if (info.bgT < 0) { console.log(JSON.stringify({ fatal: 'Extra_241 segment missing', info, errs })); await browser.close(); process.exit(1); }

// 泄漏取证：t=100（第 2 段文字期）统计会被绘制的 npc/spr 段（复算 overlay 谓词）
const leak = await page.evaluate(async () => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  const fill = comp.getCreditsRollFill(true);
  const T = 100;
  let npcLeak = 0, sprLeak = 0, npcTotal = 0, sprTotal = 0;
  for (const seg of fill.segments) {
    if (seg.k === 'npc') {
      npcTotal++;
      const local = T - seg.t;
      let alpha = 0;   // blankState
      if (local >= 0) alpha = 255;   // 首个 fade(255) 延迟 0,一进窗即隐
      if (alpha < 255) npcLeak++;
    } else if (seg.k === 'spr') {
      sprTotal++;
      const local = T - seg.t;
      let op = 1;    // blankState
      if (local >= 0) op = 0;      // 首个 fade(0) 延迟 0,一进窗即隐
      if (op > 0) sprLeak++;
    }
  }
  return { npcLeak, npcTotal, sprLeak, sprTotal };
});

// 拨钟到收场群像中段（Extra_241 开场 +240：群像在场、跳 wave 进行中）
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, info.bgT + 240);
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: `${OUT}/before-final-scene.png` });

// 拨钟到早期场（Guide/Zombie 895 开场 +150）
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, 895 + 150);
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: `${OUT}/before-early-scene.png` });

// 展示 1.2 秒后自然推进帧（收场段尾,emote 窗对比用）
await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
}, info.bgT + 560);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/before-final-late.png` });

// === 绘制计数取证（BJ409）——包装 overlay ctx,统计 drawImage 调用 ===
const draws = await page.evaluate(async (t) => {
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1; inst.t = t;
  const ctx = inst.ctx;
  const counts = { drawImage: 0, samples: [] };
  if (!ctx.__bj409Wrapped) {
    const origImg = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (...a) {
      counts.drawImage++;
      if (counts.samples.length < 60) {
        try {
          const m = ctx.getTransform();
          // 换算绝对落点:abs = translate + m × local
          const dx = a[5], dy = a[6], dw = a[7], dh = a[8];
          const e = m.e, f = m.f;
          counts.samples.push({
            ax: Math.round(e + dx * m.a), ay: Math.round(f + dy * m.d),
            w: Math.round(dw * m.a), h: Math.round(dh * m.d),
          });
        } catch { /* ignore */ }
      }
      return origImg(...a);
    };
    ctx.__bj409Wrapped = true;
  }
  await new Promise((r) => setTimeout(r, 120));
  await new Promise((r) => setTimeout(r, 30));
  return { counts, sheets: inst.sheets.size, failed: [...inst.failed.keys()] };
}, info.bgT + 240);

console.log(JSON.stringify({ info, leak, draws, errs: errs.slice(0, 5) }, null, 1));
await browser.close();
process.exit(0);
