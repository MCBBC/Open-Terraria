import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
for (const q of ['?bglshim=0', '', '?liqgl=0']) {
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(ORIGIN + '/' + q + (q ? '&' : '?') + 't=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => errs.push('goto: ' + e.message));
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 60000) {
    ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`q='${q}' bridge=${ok} errs=${errs.slice(0,3).join(' | ')}`);
  await page.close();
}
process.exit(0);
