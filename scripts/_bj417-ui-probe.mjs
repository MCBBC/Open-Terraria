// BJ417 探针①：PvP 剑按钮帧制 + 成就 Advisor 落位（宽屏大卡/窄屏内联）实测。
// 用法: SW_ORIGIN=http://localhost:5530 node tools/run-diag.mjs scripts/_bj417-ui-probe.mjs [wide|narrow|classic]
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// run-diag 子进程 argv = [node, script, --_child, target, ...args]
const mode = process.argv[4] ?? process.argv[2] ?? 'wide';
const { mkdirSync } = await import('node:fs');
mkdirSync('docs/evidence/bj417', { recursive: true });
const vp = mode === 'narrow' ? { width: 900, height: 900 }
  : mode === 'classic' ? { width: 1280, height: 800 }
  : { width: 1280, height: 800 };
const urlExtra = mode === 'classic' ? '&invlayout=legacy' : '';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: vp });
const page = await browser.newPage();
await page.setViewport(vp);
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small' + urlExtra, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log(JSON.stringify({ fatal: 'game boot timeout' })); await browser.close(); process.exit(1); }
// 欢迎弹窗「我已知晓」先确认（挡 KeyE）
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('我已知晓'));
  if (b) b.click();   // onclick 处理器,须真 click
});
await new Promise((r) => setTimeout(r, 400));
await page.mouse.click(vp.width / 2, vp.height / 2);   // 画布点一下抢焦点
await new Promise((r) => setTimeout(r, 250));
await page.keyboard.press('Escape');   // Inventory 缺省绑 Escape（SW-BN2）
await new Promise((r) => setTimeout(r, 900));
const out = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const rect = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, display: getComputedStyle(e).display };
  };
  const swords = [...document.querySelectorAll('button')].filter((b) => ((b.style.backgroundImage || getComputedStyle(b).backgroundImage || '') + '').includes('UI_PVP_0'));
  const sword = swords[0];
  const cs = sword ? getComputedStyle(sword) : null;
  const advisors = [...document.querySelectorAll('.sw-ach-advisor')];
  const advisor = advisors.find((a) => a.getBoundingClientRect().width > 0) ?? advisors[0];
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    layout: q('.sw-vinv') ? 'vanilla' : 'classic',
    pvpSwordCount: swords.length,
    pvpSword: sword ? {
      rect: rect(sword),
      bgSize: cs.backgroundSize,
      bgPos: cs.backgroundPosition,
      inlineStylePos: sword.style.backgroundPosition || null,
      overlayChild: !!sword.querySelector('[data-pvp-hover]'),
    } : null,
    advisorAll: advisors.map((a) => ({ ...rect(a), inlineCls: a.closest('.sw-ach-inline') != null, text: a.textContent.slice(0, 16) })),
    advisorInlineClass: advisor?.closest('.sw-ach-inline') != null,
  };
});
// 悬停态 PvP 帧（真实 mouse.move——:hover 伪类不认合成事件）
if (out.pvpSword && out.pvpSword.rect.w > 0) {
  const r = out.pvpSword.rect;
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2, { steps: 4 });
  await new Promise((res2) => setTimeout(res2, 250));
  const hoverState = await page.evaluate(() => {
    const sword = [...document.querySelectorAll('button')].find((b) => ((b.style.backgroundImage || getComputedStyle(b).backgroundImage || '') + '').includes('UI_PVP_0'));
    return {
      hoverMatches: sword.matches(':hover'),
      posAfterHover: sword.style.backgroundPosition || null,
      overlayShown: sword.querySelector('[data-pvp-hover]')?.style.display ?? null,
      overlayPos: sword.querySelector('[data-pvp-hover]')?.style.backgroundPosition ?? null,
      opacity: sword.style.opacity,
    };
  });
  out.pvpHover = hoverState;
  await page.screenshot({ path: `docs/evidence/bj417/bj417-ui-${mode}-pvp-hover.png`, clip: { x: Math.max(0, r.x - 40), y: Math.max(0, r.y - 40), width: 160, height: 140 } });
  await page.mouse.move(10, vp.height - 10, { steps: 4 });   // 移开
  await new Promise((res2) => setTimeout(res2, 200));
}
// 截图：整屏 + 右上 260px 带（advisor/pvp 区）
await page.screenshot({ path: `docs/evidence/bj417/bj417-ui-${mode}-full.png` });
await page.screenshot({ path: `docs/evidence/bj417/bj417-ui-${mode}-top.png`, clip: { x: 0, y: 0, width: Math.min(vp.width, 760), height: 320 } });
await page.screenshot({ path: `docs/evidence/bj417/bj417-ui-${mode}-right.png`, clip: { x: Math.max(0, vp.width - 320), y: 0, width: 320, height: Math.min(500, vp.height) } });
console.log(JSON.stringify(out, null, 1));
await browser.close();
