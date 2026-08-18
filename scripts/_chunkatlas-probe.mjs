// chunk atlas 化 E2E 三重验证(2026-08-18):
//  ① 像素对拍:atlas cell(bakeChunkInto 页路径)vs 独立 256² 目标(cell=-1 同函数)
//    逐字节一致——clip/translate 语义等价性的直接证明
//  ② 运行期画布 churn:createElement('canvas') 计数,玩家横移 ~6000px 后
//    新建画布数应 ≈ 0(旧结构 = 每帧 8 张,数百张量级)
//  ③ 页数上限:pageCount 随移动有界(≤ ceil(活动chunk/16)+1)
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_chunkatlas-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/chunkatlas-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => { console.log('[pageerror]', String(e.message).slice(0, 240)); fail++; });
// canvas 出生计数(严格只数 document.createElement('canvas') 路径)
await page.evaluateOnNewDocument(() => {
  window.__canvasBorn = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') window.__canvasBorn++;
    return orig(tag, ...rest);
  };
});
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
console.log('生成世界…');
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,渲染 5s 让初始 chunk 烤稳…');
await sleep(5000);

// ---- ① 像素对拍 ----
const parity = await page.evaluate(() => {
  const g = window.__swGame;
  const cc = g.chunks;
  const out = { tried: 0, ok: 0, unstable: 0, details: [] };
  const keys = [...cc.chunks.keys()].filter((k) => cc.chunks.get(k)).slice(0, 8);
  for (const k of keys) {
    const cx = k & 0xffff, cy = (k >> 16) & 0xffff;
    const pair = cc.chunks.get(k);
    if (!pair) continue;
    out.tried++;
    // atlas 同源稳定性自检(动画 chunk 换带会让 atlas 内容漂移 → 换样本)
    const pg = pair.wall;
    const pctx = pg.getContext('2d');
    const a1 = pctx.getImageData(pair.sx, pair.sy, 256, 256);
    // 独立 256² 目标,同一烘焙函数(cell=-1 → ox=oy=0)
    const wc = document.createElement('canvas'); wc.width = 256; wc.height = 256;
    const tc = document.createElement('canvas'); tc.width = 256; tc.height = 256;
    cc.bakeChunkInto(cx, cy, wc, tc, -1);
    const ref = wc.getContext('2d').getImageData(0, 0, 256, 256);
    const now = pctx.getImageData(pair.sx, pair.sy, 256, 256);
    let sameAsA1 = true;
    for (let i = 0; i < now.data.length; i += 997 * 4) { if (now.data[i] !== a1.data[i]) { sameAsA1 = false; break; } }
    let diff = 0;
    for (let i = 0; i < ref.data.length; i += 4) {
      if (ref.data[i] !== now.data[i] || ref.data[i + 1] !== now.data[i + 1] || ref.data[i + 2] !== now.data[i + 2] || ref.data[i + 3] !== now.data[i + 3]) diff++;
    }
    if (!sameAsA1) { out.unstable++; out.details.push(`(${cx},${cy}) 动画漂移,跳过`); continue; }
    out.details.push(`(${cx},${cy}) diff=${diff}px`);
    if (diff === 0) out.ok++;
  }
  return out;
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[对拍]', JSON.stringify(parity));
if (parity && !parity.err) {
  const stable = parity.tried - parity.unstable;
  check('像素对拍(atlas cell == 独立目标,逐字节)', parity.ok === stable && stable >= 3,
    `一致 ${parity.ok}/${stable} 稳定样本(动画漂移跳过 ${parity.unstable};<3 稳定样本=采样不足)`);
} else check('像素对拍', false, JSON.stringify(parity).slice(0, 120));

// ---- ② 移动 churn + ③ 页数 ----
const before = await page.evaluate(() => ({
  born: window.__canvasBorn,
  pages: window.__swGame.chunks.pageCount,
  cached: window.__swGame.chunks.chunks.size,
}));
console.log(`[基线] canvasBorn=${before.born} pages=${before.pages} cached=${before.cached}`);
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => { const p = window.__swGame.player; p.x += 600; });
  await sleep(1400);
}
const after = await page.evaluate(() => ({
  born: window.__canvasBorn,
  pages: window.__swGame.chunks.pageCount,
  cached: window.__swGame.chunks.chunks.size,
}));
// 回头路:二次通过同一区域 = 真 churn 证明(首遍的页/帧探测是首见成本,
// 二遍应≈零——chunk 仍在 LRU、帧探测已缓存、云池已热)
const mid = after.born;
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => { const p = window.__swGame.player; p.x -= 600; });
  await sleep(1400);
}
const back = await page.evaluate(() => ({
  born: window.__canvasBorn,
  pages: window.__swGame.chunks.pageCount,
  cached: window.__swGame.chunks.chunks.size,
}));
const d1 = after.born - before.born, d2 = back.born - mid;
console.log(`[去程 6000px] Δ${d1}(首见成本:页+帧探测) | [回程同区域] Δ${d2} | pages=${back.pages} cached=${back.cached}`);
check('运行期画布 churn ≈ 0(回头路二遍,首见成本已付)', d2 <= 20, `二遍新建 ${d2} 张(旧结构每遍 ~6000 张)`);
check('页数有界且远小于 chunk 数', back.pages <= Math.ceil(back.cached / 16) + 1 && back.pages <= 24,
  `${back.pages} 页 / ${back.cached} chunk(画布 ${back.pages * 2} 张 vs 旧 ${back.cached * 2} 张)`);

// 渲染仍活着(有新 chunk 被烤 = drawChunkGrid 在跑)
check('移动后渲染持续(cached 变化)', after.cached !== before.cached || d1 > 0);

console.log(`\n== 结果: ${pass} pass / ${fail} fail ==`);
await browser.close();
process.exit(fail ? 1 : 0);
