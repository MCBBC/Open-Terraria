// BJ82 微探针:GPU renderer 环境锚(一次性)
import { launchBrowser, openPage, bootstrap, ledger, sleep } from '../tools/probe/lib/index.mjs';
const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await bootstrap(page, process.env.SW_ORIGIN);
  await sleep(800);
  const info = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return {
      renderer: String(gl.getParameter(gl.RENDERER) ?? ''),
      vendor: String(gl.getParameter(gl.VENDOR) ?? ''),
      ua: navigator.userAgent.slice(0, 120),
      cores: navigator.hardwareConcurrency,
    };
  });
  L.say('gpu=' + JSON.stringify(info));
  L.say('probe-done');
  process.exit(L.exitCode());
} finally { await browser.close(); }
