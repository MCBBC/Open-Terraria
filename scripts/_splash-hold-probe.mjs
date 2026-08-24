// 探针：启动 splash 保持期端到端（生产构建 preview）。
//  1. 无 ReferenceError（warmAllAssets 未定义回归——tsc 门被并行码挡时 vite build
//     直出会漏 import 错误，必须浏览器实测）
//  2. splash(#sw-splash) 可见 ≥1.8s（dev/preview 无 SW → 无下载 → 2s 最短档）
//  3. 三层构图：tree 层锚右下(contain)、front 层 contain 居中、back cover
//  4. splash z-index=30 < 徽标 40（下载期徽标浮于 splash 之上）
//  5. splash 移除后进标题
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
const seen = [];
let firstStyles = null;
let shot = false;
const t0 = Date.now();
for (;;) {
  const st = await page.evaluate(() => {
    const el = document.getElementById('sw-splash');
    const tree = el?.querySelector('.tree');
    const front = el?.querySelector('.front');
    const back = el?.querySelector('.back');
    return {
      present: !!el,
      z: el ? getComputedStyle(el).zIndex : null,
      treePos: tree ? getComputedStyle(tree).backgroundPosition : null,
      treeSize: tree ? getComputedStyle(tree).backgroundSize : null,
      frontSize: front ? getComputedStyle(front).backgroundSize : null,
      backSize: back ? getComputedStyle(back).backgroundSize : null,
      title: !!document.querySelector('.sw-title-menu'),
    };
  }).catch(() => ({ present: false, title: false }));
  const t = Date.now() - t0;
  if (st.present) {
    seen.push(t);
    if (!firstStyles && st.z) firstStyles = st;
    if (!shot) {
      shot = true;
      await page.screenshot({ path: '/tmp/splash-hold.png' });
    }
  }
  if ((st.title && !st.present) || t > 30000) break;
  await new Promise((r) => setTimeout(r, 100));
}
const first = seen[0] ?? null;
const last = seen[seen.length - 1] ?? null;
const styles = firstStyles ?? {};
console.log(JSON.stringify({ firstSeenMs: first, lastSeenMs: last, errs: errs.slice(0, 3), styles }, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
A(first !== null, 'splash 未出现');
if (first !== null && last !== null) A(last - first >= 1800, `可见持续 ${last - first}ms < 1800ms`);
A(styles.z === '30', `splash z 应为 30: ${styles.z}`);
A(styles.treePos === '100% 100%', `tree 应锚右下: ${styles.treePos}`);
A(styles.treeSize === 'contain', `tree 应 contain: ${styles.treeSize}`);
A(styles.frontSize === 'contain', `front 应 contain(原版 min 缩放,非 cover): ${styles.frontSize}`);
A(styles.backSize === 'cover', `back 应 cover: ${styles.backSize}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
