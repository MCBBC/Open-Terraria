// 最小 boot 诊断:页面 console 全量 dump + bridge 存在性
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type?.()}] ${(m.text?.() ?? '').slice(0, 180)}`));
page.on('pageerror', (e) => msgs.push('[pageerror]' + String(e?.message ?? e).slice(0, 300)));
page.on('requestfailed', (r) => msgs.push('[reqfail]' + r.url().slice(-80) + ' ' + (r.failure()?.errorText ?? '')));
page.on('response', (r) => { if (r.status() >= 400) msgs.push(`[http${r.status()}]` + r.url().slice(-100)); });
await page.goto(`${ORIGIN}/?pbust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const has = await page.evaluate(() => typeof (window).__swFlow === 'object').catch(() => false);
  if (has) { msgs.push(`[__swFlow] ready @${(i + 1) * 2}s`); break; }
}
const state = await page.evaluate(() => ({
  bridge: !!(window).__swGame,
  readyState: document.readyState,
  title: document.title,
  canvas: !!document.querySelector('canvas'),
})).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
console.log('[bootcheck] state=', JSON.stringify(state));
console.log('[bootcheck] msgs(', msgs.length, ')=\n' + msgs.slice(0, 40).join('\n'));
await page.close();
process.exit(0);
