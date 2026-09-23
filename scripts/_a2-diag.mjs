import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });
await page.goto(`${ORIGIN}/?wfbo=0`, { waitUntil: 'domcontentloaded' });
await bootstrap(page, `${ORIGIN}/?wfbo=0`);
await createGame(page, { seed: '05162020', size: 'small' });
await pump(page, 10);
const state = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    hasGame: !!g,
    gameKeys: g ? Object.keys(g).slice(0, 12).join(',') : '',
    hasRenderer: !!(g && g.renderer),
    rendererKeys: g && g.renderer ? Object.keys(g.renderer).slice(0, 20).join(',') : '',
    hasSky: !!(g && g.renderer && g.renderer.sky),
  };
});
console.log(JSON.stringify(state, null, 2));
console.log('page errors:', errors.slice(0, 5));
await browser.close();
