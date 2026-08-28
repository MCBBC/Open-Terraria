// 资源徽标"暖缓存不闪 0%"验证:第一轮冷载(会真实下载/校准)→ 第二轮暖载
//   逐 200ms 采样徽标文本,断言全程不含 '%',且最终徽标卸载(完成淡出)。
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const PORT = 8124;
const GAME = `http://localhost:${PORT}/`;
const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('../dist', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
// 轮询器:装载即采徽标文本
await page.evaluateOnNewDocument(() => {
  window.__badgeSamples = [];
  setInterval(() => {
    const el = document.querySelector('.sw-asset-badge .txt');
    if (el) window.__badgeSamples.push(el.textContent);
  }, 200);
});
await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swAssetCache?.state?.()?.version, { timeout: 60000 });
// 冷载:等徽标卸载或 40s
const waitGone = async () => { const t0 = Date.now(); while (Date.now() - t0 < 40000) { const g = await page.evaluate(() => !document.querySelector('.sw-asset-badge')); if (g) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
const gone1 = await waitGone();
const coldSamples = await page.evaluate(() => window.__badgeSamples.slice());
// 第二轮(暖缓存)
await page.reload({ waitUntil: 'domcontentloaded' });
await page.evaluate(() => { window.__badgeSamples = []; });
await page.waitForFunction(() => !!window.__swAssetCache?.state?.()?.version, { timeout: 60000 });
const gone2 = await waitGone();
const warmEnd = await page.evaluate(() => {
  const st = window.__swAssetCache?.state?.();
  const el = document.querySelector('.sw-asset-badge .txt');
  return { st: st ? { phase: st.phase, done: st.done, total: st.total, warming: st.warming,
    calibrated: st.calibrated, coverage: st.coveragePct, enabled: st.enabled, version: st.version } : null,
    txt: el ? el.textContent : null };
});
const warmSamples = await page.evaluate(() => window.__badgeSamples.slice());
const warmHasPct = warmSamples.some((t) => t && t.includes('%'));
console.log(JSON.stringify({
  gone1, coldSamples: coldSamples.slice(0, 6),
  gone2, warmEnd, warmSamples: warmSamples.slice(0, 4), warmTail: warmSamples.slice(-6),
  warmHasPct,
}, null, 1));
await browser.close(); srv.kill();
process.exit(warmSamples.length > 0 && !warmHasPct && gone2 ? 0 : 1);
