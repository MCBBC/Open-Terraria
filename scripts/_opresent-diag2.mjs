// ★opresent 逃生门验证:?opresent=0 直载（不经探针 bootstrap——其洗参为平台已知项）
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
for (const q of ['?opresent=0', '?opresent=1', '']) {
  await page.goto(ORIGIN + '/' + q, { waitUntil: 'domcontentloaded' });
  const flag = await page.evaluate(async () => {
    const m = await import('/src/render/Renderer.ts');
    return m.Renderer.opresent;
  });
  console.log(`URL='${q || '(none)'}' → opresent=${flag}`);
}
await browser.close();
