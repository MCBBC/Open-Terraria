// IIII245 一次性诊断:标题屏成就按钮点击链取证(点击坐标/控制台错误/直接调桥)。
import { launchBrowser, openPage, gotoApp, waitForBridge } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: [] });
  console.log('goto', await gotoApp(page, process.env.SW_ORIGIN), 'bridge', await waitForBridge(page, { timeout: 120_000 }));
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => !!document.querySelector('.sw-title-menu [data-act=ach]') && !document.getElementById('sw-splash'))) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const info = await page.evaluate(() => {
    const b = document.querySelector('.sw-title-menu [data-act=ach]');
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      topEl: el ? { tag: el.tagName, cls: String(el.className).slice(0, 60), text: (el.textContent ?? '').slice(0, 30) } : null,
      btnText: b.textContent,
      vis: getComputedStyle(b).visibility,
      pe: getComputedStyle(b).pointerEvents,
    };
  });
  console.log('button state:', JSON.stringify(info));
  // 真实鼠标点击
  await page.mouse.click(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
  await new Promise((r) => setTimeout(r, 1200));
  console.log('panel after real click:', await page.evaluate(() => !!document.querySelector('.sw-ach-panel')));
  // 直接 DOM click 兜底取证
  await page.evaluate(() => document.querySelector('.sw-title-menu [data-act=ach]')?.click());
  await new Promise((r) => setTimeout(r, 1200));
  console.log('panel after dom click:', await page.evaluate(() => !!document.querySelector('.sw-ach-panel')));
  console.log('errors:', JSON.stringify(page.__probeErrors ?? [], null, 1).slice(0, 2000));
  await browser.close();
} catch (e) {
  console.error('diag fail', e);
  try { await browser.close(); } catch { /* */ }
  process.exit(1);
}
