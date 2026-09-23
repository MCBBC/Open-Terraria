// BJ316 探针：开背包掉帧双刀修复验证（私域 5201;SW_ORIGIN 换源）
// ①帧时开/关对比（g.frame 包裹直测） ②puppeteer metrics 计数（RecalcStyleCount/
//   PaintCount/LayoutCount 增量/帧——修复前开包态 ~1 次 style recalc + 94 Paint/帧）
// ③CSS 动画落位断言（animationName/will-change/--invpulse 缺席/opacity 动态变化）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 600));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 500));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ316探针');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 500));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj316probe');
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

// 帧率解控（真机口径 120fps = 用户自调;探针取 0=不锁,量纯帧工）
await page.evaluate(() => {
  const g = window.__swGame;
  const opts = window.__swOptions ?? null;
  // options 模块单例——经 game 侧翻面（若不可达则跳过,以 metrics 增量为主判）
  try {
    const m = g.frame;   // 包裹实例 frame
    const stat = { n: 0, sum: 0, max: 0, last: 0, win: [] };
    g.frame = function (now) {
      const t0 = performance.now();
      m.call(this, now);
      const d = performance.now() - t0;
      stat.n++; stat.sum += d; if (d > stat.max) stat.max = d;
      return d;
    };
    window.__bj316frame = () => {
      const s = stat;
      const out = { n: s.n, avg: +(s.sum / Math.max(1, s.n)).toFixed(3), max: +s.max.toFixed(2) };
      s.n = 0; s.sum = 0; s.max = 0;
      return out;
    };
  } catch (e) { window.__bj316frame = () => ({ err: String(e) }); }
  try {
    // frameCap 翻 0（不走设置 UI,直接改 options 单例存储面）
    import('/src/core/Options.ts').then((o) => {
      if (o?.options?.data) { o.options.data.frameCap = 0; }
    });
  } catch { /* */ }
});
await new Promise((r) => setTimeout(r, 400));

async function sample(label, ms) {
  const m0 = await page.metrics();
  const f0 = await page.evaluate(() => window.__bj316frame());
  await new Promise((r) => setTimeout(r, ms));
  const m1 = await page.metrics();
  const f1 = await page.evaluate(() => window.__bj316frame());
  const dt = (m1.Timestamp - m0.Timestamp);
  return {
    label,
    frameAvgMs: f1.avg, frameMaxMs: f1.max, frames: f1.n,
    fps: +(f1.n / dt).toFixed(1),
    recalcPerFrame: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / Math.max(1, f1.n)).toFixed(3),
    paintPerFrame: +((m1.PaintCount - m0.PaintCount) / Math.max(1, f1.n)).toFixed(3),
    layoutPerFrame: +((m1.LayoutCount - m0.LayoutCount) / Math.max(1, f1.n)).toFixed(3),
    scriptMsPerFrame: +(((m1.ScriptDuration - m0.ScriptDuration) * 1000) / Math.max(1, f1.n)).toFixed(3),
  };
}

// 预热
await sample('warmup', 800);
const closed1 = await sample('closed-1', 2000);
const closed2 = await sample('closed-2', 2000);

// ESC 开背包
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 1500));
const invOpen = await page.evaluate(() => {
  const ui = window.__swUI;
  return {
    open: !!(ui && ui.invPanel && ui.invPanel.style.display === 'block'),
    vinvRoot: !!document.querySelector('.sw-vinv'),
    slots: document.querySelectorAll('.sw-vinv .sw-slot').length,
  };
});
const open1 = await sample('open-1', 2000);
const open2 = await sample('open-2', 2000);

// CSS 动画落位断言
const css = await page.evaluate(() => {
  const slot = document.querySelector('.sw-vinv .sw-slot');
  if (!slot) return { err: 'no-slot' };
  const cs = getComputedStyle(slot, '::after');
  const o1 = parseFloat(cs.opacity);
  const o2 = parseFloat(getComputedStyle(slot, '::after').opacity);
  return {
    animationName: cs.animationName, duration: cs.animationDuration,
    timing: cs.animationTimingFunction, willChange: cs.willChange,
    opacitySample1: o1, opacitySample2: o2,
    invpulseOnRoot: document.querySelector('.sw-vinv').style.getPropertyValue('--invpulse') || '(unset)',
    explicitAlphaSlots: document.querySelectorAll('.sw-vinv .sw-slot[style*="--slot-alpha"]').length,
  };
});
await page.screenshot({ path: '/tmp/bj316-open.png' });
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/bj316-closed.png' });

console.log('closed1:', JSON.stringify(closed1));
console.log('closed2:', JSON.stringify(closed2));
console.log('invOpen:', JSON.stringify(invOpen));
console.log('open1  :', JSON.stringify(open1));
console.log('open2  :', JSON.stringify(open2));
console.log('css    :', JSON.stringify(css));
console.log('pageerrors:', errs.length, errs.slice(0, 3));
await browser.close();
process.exit(0);
