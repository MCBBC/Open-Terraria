// ★普查收尾冒烟（2026-09-25）：acc 整层帧在「font/textAlign 镜像+attachAcc 残 FBO
//  弃用+blendMult 精确式」三刀后仍健康——b2b-acc 路径在位、零降级建面、零页错。
// 运行: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=180000 scripts/_census-acc-smoke.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
console.log('createGame:', gen?.ok ?? gen?.why);
await pump(page, 60);
const st = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    path: r.bglPathUsed,
    stats: r.bglPathStats,
    creations: r.b2bWorldCanvasCreations,
    shim: r.bglShimStats(),
  };
});
console.log(JSON.stringify(st, null, 1));
const okPath = typeof st.path === 'string' && st.path.startsWith('b2b-acc');
const okNoCreate = st.creations === 0;
const okNoErr = pageErrors.length === 0;
console.log(`${okPath ? 'PASS' : 'FAIL'} acc 路径在位 (${st.path})`);
console.log(`${okNoCreate ? 'PASS' : 'FAIL'} 零降级建面 (creations=${st.creations})`);
console.log(`${okNoErr ? 'PASS' : 'FAIL'} 零页错 (${pageErrors.length})`);
if (pageErrors.length) console.log(pageErrors.slice(0, 5));
await browser.close();
const fails = [okPath, okNoCreate, okNoErr].filter((x) => !x).length;
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
