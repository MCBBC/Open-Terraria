// 探针：菜单期加载收窄回归（2026-08-24 HAR 审计）。
//  禁载断言：logo_1..8 / Inventory_Back*+Tick / Moon_1..8 / Combat_*+Item_Stack /
//  UI_UI_BossBar / UI_MapPing / UI_TitleLinkButtons
//  保载断言：Logo.png/Logo2/Logo5/Logo6（标题 logo）、Moon_0（菜单满月）、
//  UI chrome（面板/按钮/光标）、Splash 三件套、天空组（Sun/Cloud/Star/Background）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const reqs = new Set();
page.on('request', (r) => {
  const u = decodeURIComponent(r.url());
  if (u.includes('/sprites/')) reqs.add(u.split('/sprites/')[1]);
});
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 9000)); // 菜单稳定期
const banned = [];
const required = ['Logo.png', 'Logo2.png', 'Moon_0.png', 'UI_PanelBackground.png', 'UI_Cursor_0.png',
  'UI_ButtonPlay.png', 'UI_Scrollbar.png', 'UI_PlayerBackground.png', 'UI_WorldGen_Outer_Corrupt.png'];
for (const r of reqs) {
  if (/^vanilla-ui\/logo_\d\.png$/.test(r)) banned.push(r);
  if (/^vanilla-ui\/Inventory_(Back\d*|Tick)_/.test(r)) banned.push(r);
  if (/^vanilla\/Moon_[1-8]\.png$/.test(r)) banned.push(r);
  if (/^vanilla\/(Combat_Text|Combat_Crit|Item_Stack)_/.test(r)) banned.push(r);
  if (r === 'vanilla-ui/UI_UI_BossBar.png' || r === 'vanilla-ui/UI_MapPing.png' || r === 'vanilla-ui/UI_TitleLinkButtons.png') banned.push(r);
  if (r === 'vanilla-ui/UI_Sunflower_Loading.png') banned.push(r);
}
const missing = required.filter((r) => ![...reqs].some((x) => x === r || x.endsWith('/' + r)));
console.log(JSON.stringify({ total: reqs.size, banned, missing }, null, 1));
const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(banned.length === 0, `菜单期仍加载禁载项: ${banned.join(', ')}`);
A(missing.length === 0, `菜单必需项缺失: ${missing.join(', ')}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
