// 低频行族端到端：鞭/悠悠球/研究行/亮度脉冲/泥土魔杖
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

await page.evaluate(async () => {
  const v = await fetch('/sprites/vanilla.json').then((r) => r.json());
  window.__keys = {};
  for (const vid of ['4672', '3262', '832', '4']) window.__keys[vid] = `vi_${vid}_${v.items[vid].key}`;
});
const hover = async (vid) => page.evaluate(async (v) => {
  const g = window.__swGame, ui = window.__swUI;
  const key = window.__keys[v];
  if (!key) return { why: 'no key' };
  const d = g.spawnDrop(g.player.cx, g.player.y + 4, key, 1, 0, -1);
  if (!d) return { why: 'no drop ' + key };
  const want = d.itemId;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const sel = g.player.inv.slots.findIndex((sl) => sl && sl.id === want);
  if (sel < 0) return { why: 'no pickup' };
  inv0: g.player.inv.selected = sel;
  ui['showTooltipFor'](sel, 'inv');
  await new Promise((r) => setTimeout(r, 500));
  return { text: ui.tooltip.innerText, logo: !!ui.tooltip.querySelector('.sw-yoyo-logo') };
}, vid);

const whip = await hover('4672');
check('皮鞭：召唤伤害+速度档（鞭例外）', whip.text?.includes('召唤伤害') && whip.text?.includes('速度'), (whip.text ?? '').split('\n').slice(1, 4).join(' | '));
const yoyo = await hover('3262');
check('悠悠球：OneDropLogo 商标位', yoyo.logo === true, (yoyo.text ?? '').split('\n').slice(1, 3).join(' | '));
const rod = await hover('832');
check('活木魔杖：消耗 木材 行', rod.text?.includes('消耗') && rod.text?.includes('木材'), (rod.text ?? '').split('\n').slice(1, 4).join(' | '));

// 亮度脉冲：两次采样 filter 变化
const pulse = await page.evaluate(async () => {
  const ui = window.__swUI;
  const el = ui.tooltip.querySelector('.sw-tooltip-lines');
  if (!el) return { f1: null, f2: null };
  const f1 = el.style.filter;
  await new Promise((r) => setTimeout(r, 700));
  return { f1, f2: el.style.filter };
});
check('亮度脉冲（文字层 190↔255 呼吸，面板恒定）', pulse.f1 !== pulse.f2 && !!pulse.f1, `${pulse.f1} → ${pulse.f2}`);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
