// M5 键位重映射 + F1-F3 配装 + 设置页冒烟（_ 一次性探针,tools/run-diag.mjs 运行）：
//   进世界 → F2 切配装2（原版语义,无敌已迁 Shift+F2）→ Shift+F2 开关无敌 →
//   M 开/关全屏地图 → 设置控制页 40 行渲染 → 重绑 Jump=KeyZ 生效→恢复默认。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- F2 = Loadout2（原版 PlayerInput.cs:1924）----
let out = await page.evaluate(() => ({ cur: window.__swGame.player.inv.currentLoadout, god: !!window.__swGame.player.debugGod }));
check('初始配装 0 + 无敌关', out.cur === 0 && !out.god);
await page.keyboard.press('F2');
await new Promise((r) => setTimeout(r, 300));
out = await page.evaluate(() => ({ cur: window.__swGame.player.inv.currentLoadout, god: !!window.__swGame.player.debugGod }));
check('F2 → 配装 2（无敌不再触发）', out.cur === 1 && !out.god, JSON.stringify(out));
await page.keyboard.press('F1');
await new Promise((r) => setTimeout(r, 200));
out = await page.evaluate(() => window.__swGame.player.inv.currentLoadout);
check('F1 → 配装 1', out === 0);
await page.keyboard.press('F3');
await new Promise((r) => setTimeout(r, 200));
out = await page.evaluate(() => window.__swGame.player.inv.currentLoadout);
check('F3 → 配装 3（调试碰撞盒让位 Shift+F3）', out === 2);
out = await page.evaluate(() => window.__swGame.renderer.debugMode);
check('裸 F3 不开调试碰撞盒', out === false);

// ---- Shift+F2 无敌（调试键迁移）----
await page.keyboard.down('Shift'); await page.keyboard.press('F2'); await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 300));
out = await page.evaluate(() => ({ god: !!window.__swGame.player.debugGod }));
check('Shift+F2 → 无敌开', out.god);
await page.keyboard.down('Shift'); await page.keyboard.press('F2'); await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 200));
out = await page.evaluate(() => !!window.__swGame.player.debugGod);
check('Shift+F2 再按关', !out);

// ---- M = 全屏地图开关（MapFull）----
await page.keyboard.press('KeyM');
await new Promise((r) => setTimeout(r, 400));
out = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
check('M 开全屏地图', out === true);
await page.keyboard.press('KeyM');
await new Promise((r) => setTimeout(r, 300));
out = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
check('M 再按关', out === false);

// ---- 设置 → 控制页：40 行 + 重绑 Jump=KeyZ ----
await page.evaluate(async () => {
  const { SettingsPanel } = await import('/src/ui/Settings.ts');
  new SettingsPanel(document.body, { onBack() {} });
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const cats = Array.from(document.querySelectorAll('.sw-set-cats div'));
  const ctl = cats.find((c) => c.textContent.includes('按键绑定') || c.dataset.cat === 'controls');
  if (ctl) ctl.click();
});
await new Promise((r) => setTimeout(r, 300));
out = await page.evaluate(() => ({
  rows: document.querySelectorAll('.sw-kb-row').length,
  jumpLabel: Array.from(document.querySelectorAll('.sw-kb-row')).find((r) => r.textContent.includes('跳'))?.querySelector('.sw-kb-btn')?.textContent ?? '',
}));
check('控制页 40 键位行渲染', out.rows === 40, `rows=${out.rows}`);
check('Jump 行默认键 Space', out.jumpLabel === 'Space', out.jumpLabel);

// 重绑：点击 Jump 行按钮 → 按 Z
await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('.sw-kb-row')).find((r) => r.textContent.includes('跳'));
  row.querySelector('.sw-kb-btn').click();
});
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press('KeyZ');
await new Promise((r) => setTimeout(r, 300));
out = await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('.sw-kb-row')).find((r) => r.textContent.includes('跳'));
  return { label: row.querySelector('.sw-kb-btn').textContent, bound: window.__swGame.input.downAction('Jump') };
});
check('重绑 Jump=Z 生效（行显示 Z）', out.label === 'Z', out.label);
// 游戏内按 Z 跳（先关设置面板）
await page.evaluate(() => document.querySelector('.sw-set-footer .sw-set-back')?.click());
await new Promise((r) => setTimeout(r, 300));
const y0 = await page.evaluate(() => window.__swGame.player.y);
await page.keyboard.down('KeyZ');
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.up('KeyZ');
out = await page.evaluate((y0) => {
  const g = window.__swGame;
  return {
    y: g.player.y, vy: g.player.vy, y0,
    paused: g.paused, blocking: g.input.uiBlocking,
    keysZ: g.input.keys.has('KeyZ'), act: g.input.downAction('Jump'),
    onGround: g.player.onGround, inputJump: g.player.inputJump,
    panelOpen: !!document.querySelector('.sw-set-panel'),
    binds: JSON.stringify((window.__swOpts ?? {}).keybinds ?? null),
  };
}, y0);
check('游戏内 Z 触发跳跃（绑定表驱动）', out.y < y0 - 1 || out.vy < -0.1, JSON.stringify(out));
// 恢复默认（持久化层也回写）
await page.evaluate(async () => {
  const { SettingsPanel } = await import('/src/ui/Settings.ts');
  new SettingsPanel(document.body, { onBack() {} });
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const cats = Array.from(document.querySelectorAll('.sw-set-cats div'));
  const ctl = cats.find((c) => c.dataset.cat === 'controls');
  if (ctl) ctl.click();
});
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.sw-set-btns button'));
  const reset = btns.find((b) => b.textContent.includes('恢复默认键位'));
  if (reset) reset.click();
});
await new Promise((r) => setTimeout(r, 400));
out = await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('.sw-kb-row')).find((r) => r.textContent.includes('跳'));
  return { label: row?.querySelector('.sw-kb-btn')?.textContent ?? '?', kb: JSON.stringify((window.__swGame.input.keys.size, 0)) };
});
check('恢复默认键位（Jump 回 Space）', out.label === 'Space', out.label);
await page.evaluate(() => document.querySelector('.sw-set-footer .sw-set-back')?.click());

// ---- 杂项开关读数（11 项默认值经 options）----
out = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('sandboxworld.options') ?? '{}');
  return {
    opts: {
      autoSave: d.autoSave, invasionProgressMode: d.invasionProgressMode,
      showItemText: d.showItemText, opaqueBox: d.opaqueBoxBehindTooltips,
    },
    data: {
      autoSave: window.__swOptionsProbe?.autoSave,
    },
  };
});
check('options 默认值快照', out.opts.invasionProgressMode === 2 && out.opts.autoSave !== false, JSON.stringify(out.opts));

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
