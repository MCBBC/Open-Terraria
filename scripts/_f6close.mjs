// F6 召唤面板 ×按钮关闭回归（2026-08-21）：点 × 后面板拆除 + input.uiBlocking
// 解冻 + 游戏键恢复（修复前 close() 拆 DOM 不解冻 → 键全冻、F6 再按又开回来）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const panelOpen = () => !!document.querySelector('div[style*="z-index: 99999"], div[style*="z-index:99999"]');
  const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));

  // ① F6 开面板
  key('F6');
  await wait(150);
  const openedByF6 = panelOpen() && g.summonPanel?.open && g.input.uiBlocking === true;

  // ② 点 × 关闭
  const btn = document.querySelector('[data-act=close]');
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(150);
  const closedByX = !panelOpen() && !g.summonPanel?.open;
  const unfrozenAfterX = g.input.uiBlocking === false;

  // ③ 解冻实证：A/D 移动键被 Game keydown 派发接受（uiBlocking false 时 touchKeys 生效）
  key('KeyD');
  await wait(250);
  key('KeyD', 'keyup');
  const moveAccepted = Math.abs(g.player.vx) > 0.01 || g.player.moveDir > 0 || g.input.touchKeys.has('KeyD') === false;

  // ④ F6 再开 → Esc 关（原路径回归）
  key('F6');
  await wait(120);
  const reopened = panelOpen() && g.input.uiBlocking === true;
  key('Escape');
  await wait(120);
  const closedByEsc = !panelOpen() && g.input.uiBlocking === false;

  return { openedByF6, closedByX, unfrozenAfterX, moveAccepted, reopened, closedByEsc };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length || !(out.openedByF6 && out.closedByX && out.unfrozenAfterX && out.reopened && out.closedByEsc) ? 1 : 0);
