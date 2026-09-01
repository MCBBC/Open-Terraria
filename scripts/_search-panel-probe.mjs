// 复现用户"道具搜索":复制 tab→搜「神圣种子」/「神圣」→枚举条目(名+是否可点+研究态)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const dump = async (q) => await page.evaluate(async (q) => {
  const JP = await import('/src/ui/JourneyPowersUI.ts');
  JP.openJourneyPowersPanel(window.__swGame);
  await new Promise((r) => setTimeout(r, 400));
  const tab = [...document.querySelectorAll('button,[class*=sw-btn]')].find((b) => b.textContent?.trim() === '复制');
  if (tab) { tab.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 500)); }
  const input = document.querySelector('.sw-jp-search input');
  if (!input) return { err: 'no search input' };
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  const cells = [...document.querySelectorAll('.sw-jp-cell')];
  return {
    query: q,
    countLine: document.querySelector('.sw-jp-note')?.textContent ?? null,
    cells: cells.slice(0, 12).map((c) => ({ title: c.title, partial: c.className.includes('partial') })),
  };
}, q);
for (const q of ['神圣种子', '神圣', '种子']) console.log(JSON.stringify(await dump(q), null, 2));
await browser.close();
