// 一次性:配装竖列迁移验证(2026-09-07 用户要求)
//  ① 配装列 = eqPage 首列(时装左侧)、竖排列(label 在顶 + 3 钮纵叠)
//  ② 装备四列(配装/时装/装备/染料)顶部 与 杂项列首行(宠物 label)顶部对齐
//  ③ 回归:配装钮 3 枚仍可用、时装/装备/染料列槽位数量不变、追加槽仍挂对列
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await page.evaluate(() => {
  const dock = document.querySelector('.sw-eqdock');
  if (!dock) return { fail: 'no dock' };
  window.__swUI.openInventory();
  const eqPage = dock.querySelector(':scope > div:first-child > div'); // left > eqPage
  // 直接找配装列:含 .sw-loadout-btn 的列
  const loBtn = dock.querySelector('.sw-loadout-btn');
  const loCol = loBtn?.parentElement?.parentElement; // wrap > col
  const loLabel = loCol?.querySelector(':scope > .sw-lbl');
  const colOf = (elm) => {
    // 由列 label 找所在列容器
    return elm ? elm.parentElement : null;
  };
  const labelByName = (t) => [...dock.querySelectorAll('.sw-lbl')].find((e) => e.textContent === t);
  const vanityCol = colOf(labelByName('时装'));
  const equipCol = colOf(labelByName('装备'));
  const dyeCol = colOf(labelByName('染料'));
  const petLbl = labelByName('宠物');
  const petRow = petLbl?.parentElement; // miscRail 首行
  const top = (elm) => elm ? Math.round(elm.getBoundingClientRect().top) : null;
  const rect = (elm) => { const r = elm.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const loBtns = [...dock.querySelectorAll('.sw-loadout-btn')];
  const btnRects = loBtns.map(rect);
  const vertical = btnRects.length === 3
    && btnRects[0].x === btnRects[1].x && btnRects[1].x === btnRects[2].x
    && btnRects[0].y < btnRects[1].y && btnRects[1].y < btnRects[2].y;
  return {
    loColIsFirstEqPageChild: eqPage ? eqPage.firstElementChild === loCol : null,
    loLeftOfVanity: (vanityCol && loCol) ? rect(loCol).x + rect(loCol).w <= rect(vanityCol).x : null,
    vertical,
    loLabelOnTop: loLabel ? top(loLabel) < top(loBtns[0]) : null,
    loLabel: loLabel?.textContent ?? null,
    tops: {
      loadout: top(loLabel), vanity: top(vanityCol?.querySelector('.sw-lbl')),
      equip: top(equipCol?.querySelector('.sw-lbl')), dye: top(dyeCol?.querySelector('.sw-lbl')),
      pet: top(petLbl),
    },
    alignOk: (() => {
      const ts = [top(loLabel), top(vanityCol?.querySelector('.sw-lbl')), top(equipCol?.querySelector('.sw-lbl')), top(dyeCol?.querySelector('.sw-lbl')), top(petLbl)];
      return ts.every((t) => t != null) && Math.max(...ts) - Math.min(...ts) <= 2;
    })(),
    counts: {
      armor: dock.querySelectorAll('.sw-slot[data-where="armor"]').length,
      dye: dock.querySelectorAll('.sw-slot[data-where="dye"]').length,
      misc: dock.querySelectorAll('.sw-slot[data-where="misc"]').length,
      miscDye: dock.querySelectorAll('.sw-slot[data-where="miscDye"]').length,
      loadoutBtns: loBtns.length,
    },
    dockAlign: getComputedStyle(dock).alignItems,
  };
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/eqdock-loadout-vertical.png' });
console.log(JSON.stringify(res, null, 1));
console.log('pageErrors:', errs.length ? errs : 'none');
await browser.close();
