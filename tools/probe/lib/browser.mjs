/**
 * IIII236 统一探针框架 —— Chrome/页面工厂。
 *
 * 坑史锚(memory: lavaslope-infiltration-type-blind-enhancement 五坑#1/#2、
 * spikeball-chain-anchor-pixels-paladin-ai-verdict「headless 0.44× 时间膨胀」、
 * diag-script-orphan-prevention「puppeteer 探针泄漏 66 进程」):
 *   - headless 后台 tab rAF 节流 → 游戏循环停摆/截图黑屏:launch args 必须带
 *     三件套(--disable-background-timer-throttling --disable-renderer-backgrounding
 *     --disable-backgrounding-occluded-windows),且每步前 bringToFront;
 *   - headless Chrome rAF ~27fps → 全局 0.44× 时间膨胀:墙钟采样全偏,
 *     周期计量必须用游戏 tick(g.fixedUpdate 直泵,不走 rAF);
 *   - browser 必须 try/finally close + SIGTERM 兜底,否则 headless Chrome 成孤儿。
 */
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './env.mjs';

/** 本进程内所有活 browser——SIGTERM/SIGINT 处理器与 finally 统一收口,防孤儿。 */
const activeBrowsers = new Set();

/** 有头/headless 启动。headed=true 供人眼复核(探针默认 headless)。 */
export async function launchBrowser({ headed = false, viewport = { width: 1280, height: 800 }, protocolTimeout = 600_000 } = {}) {
  const executablePath = resolveChromePath();
  if (!executablePath) {
    throw new Error('[probe] 找不到 Chrome——设 SW_CHROME=/path/to/chrome 或安装 Google Chrome');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: headed ? false : 'new',
    defaultViewport: viewport,
    protocolTimeout,
    args: [
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-dev-shm-usage',
    ],
  });
  activeBrowsers.add(browser);
  const origClose = browser.close.bind(browser);
  browser.close = async () => { activeBrowsers.delete(browser); return origClose(); };
  return browser;
}

/** 收口全部活 browser(SIGTERM 兜底;幂等)。 */
export async function closeAllBrowsers() {
  const list = [...activeBrowsers];
  await Promise.allSettled(list.map((b) => b.close()));
}

/**
 * 开探针页:错误环(pageerror + console error)自动入账,不刷屏;
 * navigator.webdriver=true 是引擎音频门的探针直通旗(main.ts:812 判据),
 * 本框架所有页面天然满足,无需合成手势即可过音频门。
 */
export async function openPage(browser, { errors = [], consoleErrors = null, maxErrors = 40 } = {}) {
  const page = await browser.newPage();
  const errRing = errors;
  const conRing = consoleErrors ?? errors;
  page.on('pageerror', (e) => {
    if (errRing.length < maxErrors) errRing.push('pageerror: ' + String(e?.message ?? e).slice(0, 300));
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && conRing.length < maxErrors) conRing.push('console: ' + m.text().slice(0, 300));
  });
  page.__probeErrors = errRing;
  await page.bringToFront().catch(() => { /* 单页会话无窗口竞争 */ });
  return page;
}

/** 每步证据采集前调用(后台 tab 节流坑的另一半解)。 */
export async function front(page) {
  try { await page.bringToFront(); } catch { /* 单页会话 */ }
}
