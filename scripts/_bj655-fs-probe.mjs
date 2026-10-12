// BJ655 一次性探针（run-diag 规约）v6：OPFS 真句柄判别（headless 全兼容——
// showDirectoryPicker/CDP drop/合成 DataTransfer 三路已被 v2-v5 排除,见探针历史）。
// OPFS 根句柄=真 FileSystemDirectoryHandle。判别逻辑：若 granted 态下无手势
// requestPermission 仍被 SecurityError 拒 → activation 门先于态短路 → 手势链内
// 同句柄不拒=「await 不消耗 activation」实锤;若无手势返回 granted → 门不触发
// （granted 短路在前）→ 该路线判别力不足,定谳回落 MDN/Chrome 文档面（已在报告记录）。
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL = `${ORIGIN}/_bj655-probe.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  await page.goto(URL, { waitUntil: 'load' });
  console.log('--- A: CTRL no gesture (OPFS handle) ---');
  await page.evaluate(() => window.opfsArm('CTRL'));
  await sleep(2000);
  console.log((await page.$eval('#out', (el) => el.textContent)).trim());

  console.log('--- B: REQ trusted click (OPFS handle, IDB await in chain) ---');
  const b = await page.$eval('#reqopfs', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const cdp = await page.createCDPSession();
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
  }
  await sleep(2000);
  console.log((await page.$eval('#out', (el) => el.textContent)).trim());
} finally {
  await browser.close();
}
