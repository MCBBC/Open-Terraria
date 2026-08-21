// 重复项修复·UI 探针（2026-08-21）：
// ①道具搜索"雷管"恰 1 行（修复前 2 行同 vid 双注册）
// ②道具搜索"dynamite"全族可见且无同 vid 重复
// ③召唤面板默认视图无重复 id 行；僵尸族行带英文消歧后缀
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
  const ui = window.__swUI;
  // 道具搜索面板（UI.openItemSearch）
  ui.openItemSearch();
  await wait(200);
  const panel = [...document.querySelectorAll('body > div')].find(d => d.style.zIndex === '1200');
  const input = panel?.querySelector('input');
  const setQ = async (q) => {
    input.value = q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);
    return [...panel.querySelectorAll('div')].filter(d => (d.getAttribute('style') ?? '').includes('width: 170px')).map(d => d.textContent.trim());
  };
  const dyn = await setQ('雷管');
  const dynExact = dyn.filter(t => t === '雷管');
  const dynEn = await setQ('dynamite');
  // 同 vid 重复检测：行 title 含 key,抽 vid 比较
  const vidOf = (t) => /vi_(\d+)_/.exec(t)?.[1];
  const titles = [...panel.querySelectorAll('div[title]')].map(d => d.title);
  const dynVids = titles.map(vidOf).filter(Boolean);
  const dynVidDup = dynVids.length !== new Set(dynVids).size;
  ui.closeItemSearch();

  // 召唤面板
  g.toggleSummonPanel();
  await wait(200);
  const pEl = [...document.querySelectorAll('div')].find(d => d.textContent.includes('召唤面板') && d.style.zIndex);
  const rows = [...pEl.querySelectorAll('div[style*="cursor: pointer"]')];
  const ids = rows.map(r => Number(r.firstElementChild.textContent));
  const idDup = ids.length !== new Set(ids).size;
  const zombieRows = rows.filter(r => { const sp = r.querySelectorAll('span'); return sp[1]?.textContent === '僵尸'; });
  const zombieWithSuffix = zombieRows.filter(r => /Zombie/.test(r.textContent)).length;
  g.toggleSummonPanel();
  return {
    dynRows: dyn.length, dynExact: dynExact.length, dynRowTexts: dyn.slice(0, 4),
    dynEnCount: dynEn.length, dynVidDup,
    panelRows: rows.length, idDup,
    zombieRows: zombieRows.length, zombieWithSuffix,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
const ok = out.dynExact === 1 && out.dynRows === 4 && !out.dynVidDup && !out.idDup
  && out.zombieRows > 0 && out.zombieWithSuffix === out.zombieRows;
process.exit(errors.length || !ok ? 1 : 0);
