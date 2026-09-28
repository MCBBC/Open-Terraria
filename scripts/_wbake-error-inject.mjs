// ★wbake error 注入自愈探针（2026-09-28 占位对账本缺口修复刃实机锁）。
// 机制（tests/wbake-placeholder-requeue.test.ts 红测已锁,本探针钉真机链）：
//  注入单请求 error 回包 → inflight 反查清账 → 占位对拆对 → dirtyQueue → 重派。
// 运行：SW_ORIGIN=http://localhost:5256 node tools/run-diag.mjs scripts/_wbake-error-inject.mjs
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5256';
const OUT = '/tmp/wbake-error-inject';

async function main() {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await bootstrap(page, ORIGIN);
  await gotoApp(page, ORIGIN, { extraQuery: '?wbake=1', tries: 30 });
  await waitForBridge(page);
  const [W, H] = sizeDims('small');
  await page.evaluate(({ w, h }) => { void window.__swFlow.newWorld('05162020', w, h); }, { w: W, h: H });
  await page.waitForFunction('window.__swGame?.world && window.__swGame?.chunks?.bakeClient', { timeout: 240000, polling: 500 });
  await new Promise((r) => setTimeout(r, 4000));   // 入场波排空

  const r = await page.evaluate(() => {
    const g = window.__swGame;
    const cc = g.chunks;
    const client = cc.bakeClient;
    // 视口外 chunk：get() 建 placeholder（混合路由:animView 外=占位+worker）
    const v = cc.animView;
    const cs = 256;
    let cx = 2, cy = 2;
    for (; cy < 20; cy++) {
      const px = cx * cs + 128, py = cy * cs + 128;
      if (v && px > v.x0 && px < v.x1 && py > v.y0 && py < v.y1) continue;
      break;
    }
    const k = ((cx & 0xffff) | ((cy & 0xffff) << 16));
    const pair = cc.get(cx, cy);
    const phBefore = !!pair.placeholder;
    const hasPair = cc.chunks.get(k) !== undefined;
    // 注入 error 回包（id=该 chunk 的在飞请求 id——inflight 反查表）
    let injectId = null;
    for (const [id, kk] of client.inflight) if (kk === k) injectId = id;
    if (injectId === null) return { fatal: 'no inflight id for key', phBefore, hasPair };
    client.onMessage({ type: 'error', id: injectId, message: 'probe-inject' });
    const pendingGone = !client.pending.has(k);
    const pairAfter = cc.chunks.get(k);
    const decomposed = pairAfter === undefined;          // 占位对被拆=哨兵
    const inQueue = cc.dirtyQueue.includes(k);
    // flushDirty → 重派（视口外=worker request;pending 再现）
    cc.flushDirty();
    const redispatched = client.pending.has(k);
    return { phBefore, hasPair, pendingGone, decomposed, inQueue, redispatched };
  });
  await page.screenshot({ path: `${OUT}/final.png` });
  await browser.close();
  console.log(JSON.stringify(r, null, 1));
  const ok = !r.fatal && r.phBefore === true && r.hasPair === true && r.pendingGone === true
    && r.decomposed === true && r.inQueue === true && r.redispatched === true && errors.length === 0;
  console.log(`VERDICT: ${ok ? 'PASS' : 'FAIL'}  pageErrors=${errors.length}`);
  process.exit(ok ? 0 : 1);
}
// ★顶层 await 纪律（run-diag 双层架构契约）:模块求值必须占满脚本全程——
// main() fire-and-forget 会让 import 提前 resolve,child 模式 500ms FLUSH 定时器
// 把探针半途 exit(0)（teleport 探针顶层 await 同契约幸存）。
await main().catch((e) => { console.error(e); process.exit(1); });
