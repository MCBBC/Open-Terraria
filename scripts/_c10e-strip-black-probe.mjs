// C10e 条带黑块验证探针:发 Zenith(4956)/Rainbow Rod(4955)→挥砍→连拍截图
// 目检黑带是否根除(修复前=条带几何全域 a=1 黑 texel 经 lighter 叠透明 HUD=黑带)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { giveItems } from '../tools/probe/lib/entities.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/?c10e=1&');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
// 黄昏(0.75≈17:00 后天空+星可见,同用户截图环境)
await page.evaluate(() => { const g = window.__swGame; try { g.world.time = 0.78 * g.world.dayLength; } catch { /* 时钟域名差异不致命 */ } });
const give = await giveItems(page, [{ vid: 4956, stack: 1, slot: 0 }, { vid: 4955, stack: 1, slot: 1 }], { select: 0 });
console.log('give:', JSON.stringify(give).slice(0, 200));
// 面向右,光标放角色前上方(条带弧扫天空区),按住左键挥砍 3s 连拍
await page.mouse.move(800, 300);
await page.mouse.down();
for (let t = 1; t <= 6; t++) {
  await new Promise((r) => setTimeout(r, 500));
  await page.mouse.move(800 + (t % 2 ? 120 : -120), 300 + (t % 2 ? 60 : -40));
  await page.screenshot({ path: `shots/c10e-trail/strip-t${t}.png` });
}
await page.mouse.up();
// 换彩虹魔杖点射循环(回魔+每 600ms 单击,确保入膛)
await page.evaluate(() => { const g = window.__swGame; g.player.inv.selected = 1; g.player.statMana = g.player.statManaMax2 || 200; });
let t = 7;
const iv = setInterval(async () => {
  await page.mouse.move(780 + (t % 2 ? 130 : -130), 280 + (t % 2 ? 70 : -50));
  await page.mouse.down(); await new Promise((r) => setTimeout(r, 80)); await page.mouse.up();
  await page.screenshot({ path: `shots/c10e-trail/strip-t${t}.png` });
  t++;
  if (t > 12) { clearInterval(iv); process.exit(0); }
}, 600);
process.on('exit', () => console.log('errs:', errs.slice(0, 4)));
