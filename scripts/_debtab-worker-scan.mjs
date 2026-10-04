// worker 枚举方式验证:page session Target.getTargets vs browser.targets()
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await page.goto(`${ORIGIN}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await bootstrap(page, ORIGIN, { clean: false });
const cdp = await page.createCDPSession();
const r = await cdp.send('Target.getTargets');
const rows = r.targetInfos.filter((t) => /worker/i.test(t.type));
console.log('page-session Target.getTargets worker rows:', rows.length);
for (const t of rows) console.log(`  - ${t.type} ${t.url.replace(/[?#].*$/, '').slice(-70)} attached=${t.attached}`);
// 语义补丁后进世界再看
await page.evaluate(() => void window.__swFlow.newWorld('05162020', 4200, 1200));
await new Promise((r2) => setTimeout(r2, 12000));
const r2 = await cdp.send('Target.getTargets');
const rows2 = r2.targetInfos.filter((t) => /worker/i.test(t.type));
console.log('in-world worker rows:', rows2.length);
for (const t of rows2) console.log(`  - ${t.type} ${t.url.replace(/[?#].*$/, '').slice(-70)} attached=${t.attached}`);
await browser.close();
process.exit(0);
