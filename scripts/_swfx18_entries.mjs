// 一次性:SW-FX18 成就页双入口实机探针——标题主菜单第三钮（Main.cs:49733 同位）
// 点击开面板、面板行渲染、✕ 关闭;设置面板入口（IngameOptions.cs:294 同位）渲染。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等标题菜单（splash 渐显后按钮可点;轮询 data-act=sp 出现）
let titleReady = false;
for (let i = 0; i < 60 && !titleReady; i++) {
  titleReady = await page.evaluate(() => !!document.querySelector('[data-act="sp"]')).catch(() => false);
  if (!titleReady) await new Promise((r) => setTimeout(r, 1000));
}
const titleOut = await page.evaluate(async () => {
  const achBtn = document.querySelector('[data-act="ach"]');
  const label = achBtn?.textContent?.trim() ?? null;
  if (!achBtn) return { achBtnPresent: false, label };
  achBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  const panel = document.querySelector('.sw-ach-panel');
  const rows = document.querySelectorAll('.sw-ach-row').length;
  const doneRows = document.querySelectorAll('.sw-ach-row.done').length;
  const closeBtn = panel?.querySelector('.sw-head button, button');
  if (closeBtn) { closeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
  await new Promise((r) => setTimeout(r, 300));
  return {
    achBtnPresent: true, label,
    panelOpened: !!panel, rows, doneRows,
    panelClosed: !document.querySelector('.sw-ach-panel'),
  };
});
// 设置面板入口（主菜单 → 设置 → 左列应含"成就"项——有 onAchievements 桥,主菜单直开也可用）
const setOut = await page.evaluate(async () => {
  document.querySelector('[data-act="set"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  const cats = [...document.querySelectorAll('.sw-set-cats div')].map((d) => d.textContent.trim());
  const achCat = [...document.querySelectorAll('.sw-set-cats div')].find((d) => d.dataset.cat === 'achievements');
  let openedFromSettings = false;
  if (achCat) {
    achCat.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    openedFromSettings = !!document.querySelector('.sw-ach-panel');
  }
  return { settingsCats: cats, settingsAchEntry: !!achCat, openedFromSettings };
});
console.log(JSON.stringify({ titleReady, title: titleOut, settings: setOut }, null, 1));
await browser.close();
