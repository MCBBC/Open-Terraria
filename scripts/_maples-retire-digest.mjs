// ★Maples 双轨渲染退役刀——烘焙产物逐位对拍探针(2026-10-16)。
// 目的:刀前后(同固定种子世界+同冻结时钟面)chunk 烘焙 digest md5 必须全等——
//   证明删 AutoTiler/WallTiler/TILE_RULES 三死支/Maples ship 面对烘焙产物零扰动
//   (审计已定谳 Maples 面在烘焙链中三重短路挡死=零消费,本探针是终裁证据)。
// 双臂:?wbake=1 入场——A 臂=主线程烘焙(bakeChunkInto cell=-1);B 臂=worker 烘焙
//   (digestBake 快照)。★BakeClient ship 面(地形 maples 表)本刀变更,双臂都必须跑。
// 世界:?play=small 先入场,再经 __swGame.newWorld 固定种子重生成(★判例:勿用
//   __swFlow.newWorld——hell-bg-anim 判例卡死,__swGame 桥为正)。
// 输出:SW_DIGEST_OUT 指定路径落 JSON({cx,cy,md5W,md5T}[]);stdout 同步打印。
// 运行:SW_ORIGIN=http://localhost:5211 SW_DIGEST_OUT=/tmp/xxx.json \
//      node tools/run-diag.mjs --timeout=600000 scripts/_maples-retire-digest.mjs
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5211';
const SEED = '05162020';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5buf = (buf) => createHash('md5').update(buf).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));

// ★wbake=1 旗页进入(?play=small 直入——hell-bg 探针同款;勿走 createGame direct
//  模式的 __swFlow.newWorld)
await page.goto(`${ORIGIN}/?play=small&wbake=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
chk('?play=small 入场', inGame);
if (!inGame) { console.log(JSON.stringify({ fatal: 'entry timeout', errs: pageErrors.slice(0, 5) })); await browser.close(); process.exit(1); }

// 固定种子世界(4200×1200 小档;__swGame 桥)
await page.evaluate(async (seed) => { await window.__swGame.newWorld(seed, 4200, 1200, () => {}); }, SEED);
let worldReady = false;
for (let i = 0; i < 300 && !worldReady; i++) {
  worldReady = await page.evaluate(() => { const g = window.__swGame; return !!(g?.world?.store && g.world.store.w === 4200); }).catch(() => false);
  if (!worldReady) await new Promise((r) => setTimeout(r, 1000));
}
chk('固定种子世界就绪(4200×1200)', worldReady);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });   // BJ144 探针坑:欢迎弹窗遮画布
await new Promise((r) => setTimeout(r, 1500));

// ---- 冻结时钟面(_wbake-digest 同款:paused+tick+GTW+wind+remix)----
await page.evaluate(() => { window.__swGame.paused = true; });
await page.evaluate(async () => {
  const g = window.__swGame;
  const ta = await import('/src/render/TileAnim.ts');
  ta.tileAnim.tick = 4800;
  const gt = await import('/src/core/GameTime.ts');
  gt.pinGameTimeTicks(654321);
  const vt = await import('/src/render/VanillaTiler.ts');
  vt.renderEnv.wind = 0;
  vt.renderEnv.worldSurface = g.world.groundLevel;
  vt.renderEnv.remix = false;
});
await new Promise((r) => setTimeout(r, 1500));

// wbake 客户端就绪探测
chk('wbake 旗真开', await page.evaluate(() => window.__swBakeFlags?.enabled === true));
let clientReady = false;
for (let i = 0; i < 40 && !clientReady; i++) {
  clientReady = await page.evaluate(() => !!(window.__swGame?.chunks?.bakeClient && window.__swGame.world));
  if (!clientReady) await new Promise((r) => setTimeout(r, 500));
}
chk('wbake 客户端就绪', clientReady);

// ---- 选 chunk:玩家周界 5×5 + 地下 2 + 群系特化(_wbake-digest 同源选块)----
const chunkList = await page.evaluate(() => {
  const g = window.__swGame;
  const pcx = Math.floor(g.player.cx / 16 / 16), pcy = Math.floor(g.player.cy / 16 / 16);
  const list = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) list.push([pcx + dx, pcy + dy]);
  list.push([pcx, pcy + 6], [pcx - 1, pcy + 8]);
  const W = g.world.w, H = g.world.h;
  return list.filter(([cx, cy]) => cx >= 0 && cy >= 0 && cx * 16 < W && cy * 16 < H);
});
const biomeChunks = await page.evaluate(async () => {
  const m = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const want = new Set([323, 80, 5, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 72, 171]);
  const found = new Map();
  for (let y = 0; y < st.h; y += 3) {
    for (let x = 0; x < st.w; x += 5) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const d = m.TILE_DEFS[st.type[i]];
      if (d?.vanilla && want.has(d.vanilla.sheet)) {
        const ck = (x >> 4) + ',' + (y >> 4);
        if (!found.has(ck)) found.set(ck, d.vanilla.sheet);
      }
    }
  }
  return [...found.entries()].slice(0, 24).map(([k, sheet]) => { const [cx, cy] = k.split(',').map(Number); return { cx, cy, sheet }; });
});
chunkList.push(...biomeChunks.map((b) => [b.cx, b.cy]));
console.log(`[digest] chunk 覆盖 ${chunkList.length} 块(群系 sheets: ${[...new Set(biomeChunks.map((b) => b.sheet))].join(',')})`);

// ---- 双臂 digest(A settled 暖场双烘 + B worker 快照烘焙)----
const md5s = await page.evaluate(async (chunkList) => {
  const g = window.__swGame;
  const chunks = g.chunks;
  const client = chunks.bakeClient;
  const b64 = (d) => { let s = ''; for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768)); return btoa(s); };
  const bakeA = (cx, cy) => {
    const mw = document.createElement('canvas'); mw.width = 256; mw.height = 256;
    const mt = document.createElement('canvas'); mt.width = 256; mt.height = 256;
    chunks.bakeChunkInto(cx, cy, mw, mt, -1);
    return { aW: b64(mw.getContext('2d').getImageData(0, 0, 256, 256).data),
             aT: b64(mt.getContext('2d').getImageData(0, 0, 256, 256).data) };
  };
  const out = [];
  for (const [cx, cy] of chunkList) {
    bakeA(cx, cy);
    await new Promise((res) => setTimeout(res, 900));
    const a = bakeA(cx, cy);
    let r = null;
    for (let i = 0; i < 8; i++) {
      r = await client.digestBake(cx, cy);
      if (!r) break;
      if (!r.missing.length) break;
      await client.shipForTest(r.missing);
      await new Promise((res) => setTimeout(res, 350));
    }
    if (!r || r.missing.length) { out.push({ cx, cy, aW: a.aW, aT: a.aT, bW: null, bT: null, missing: r?.missing ?? ['<digest-null>'] }); continue; }
    const bw = document.createElement('canvas'); bw.width = 256; bw.height = 256;
    bw.getContext('2d').drawImage(r.wall, 0, 0);
    const bt = document.createElement('canvas'); bt.width = 256; bt.height = 256;
    bt.getContext('2d').drawImage(r.tile, 0, 0);
    out.push({ cx, cy, aW: a.aW, aT: a.aT, bW: b64(bw.getContext('2d').getImageData(0, 0, 256, 256).data), bT: b64(bt.getContext('2d').getImageData(0, 0, 256, 256).data), missing: [] });
  }
  return out;
}, chunkList);

let abPass = 0, abFail = 0;
const digest = [];
for (const m of md5s) {
  const hAW = md5buf(Buffer.from(m.aW, 'base64')), hAT = md5buf(Buffer.from(m.aT, 'base64'));
  if (m.bW === null) { chk(`chunk(${m.cx},${m.cy}) B臂`, false, 'worker 缺表: ' + m.missing.join(',')); abFail++; digest.push({ cx: m.cx, cy: m.cy, md5W: hAW, md5T: hAT, bOk: false }); continue; }
  const hBW = md5buf(Buffer.from(m.bW, 'base64')), hBT = md5buf(Buffer.from(m.bT, 'base64'));
  if (hAW === hBW && hAT === hBT) abPass++;
  else { abFail++; console.log(`  A/B MISMATCH chunk(${m.cx},${m.cy})`); }
  digest.push({ cx: m.cx, cy: m.cy, md5W: hAW, md5T: hAT, bOk: hAW === hBW && hAT === hBT });
}
chk(`A/B 双臂逐字节 md5 全等(${abPass}/${md5s.length})`, abFail === 0);
chk('零页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const payload = { seed: SEED, ts: Date.now(), abFail, chunks: digest };
const out = process.env.SW_DIGEST_OUT;
if (out) { writeFileSync(out, JSON.stringify(payload, null, 1)); console.log(`[digest] 落盘 ${out} (${digest.length} chunks)`); }
console.log('\n==== maples-retire digest 判语 ====');
console.log(JSON.stringify({ abPass, abFail, pageErrors: pageErrors.length, chunkCount: digest.length }, null, 2));
await browser.close();
process.exit(abFail === 0 && pageErrors.length === 0 ? 0 : 1);
