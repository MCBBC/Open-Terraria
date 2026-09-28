// ★C4 烘焙 Worker 化——双路径逐字节 md5 对拍（2026-09-28;?wbake=1 灰度验收①）。
// 判据：同一 chunk 在同一冻结时钟面（tick/GTW/wind/plates428）下——
//   A 臂 = 主线程烘焙全链（ChunkCache.bakeChunkInto cell=-1 独立 256² 目标,现状内核）;
//   B 臂 = worker 烘焙（快照→BakeWorker→共享内核→ImageBitmap 回传）。
//   两臂 getImageData 字节 md5 必须全等（内核同源+切片协议保真的最终裁决面）。
// 覆盖面：玩家周界 5×5（地表/树族/建筑）+ 深处 2 chunk（洞穴/墙密度）+ 宝箱格。
// 运行:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs --timeout=600000 scripts/_wbake-digest.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5211';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5buf = (buf) => createHash('md5').update(buf).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
// ★旗页进入：bootstrap 裸 origin（清存储/等桥）→ gotoApp extraQuery 带旗重入
// （bootstrap(origin+query) 会被 gotoApp 的 `origin/?t=` 拼接洗掉旗值,实测
//   wbake=1 变 wbake=1/?t=… → get('wbake')!=='1'=旗假关）
await bootstrap(page, ORIGIN);
await gotoApp(page, ORIGIN, { extraQuery: '?wbake=1' });   // gotoApp extraQuery 约定含前导 ?
await waitForBridge(page);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 冻结时钟面（两臂同相;129 晶簇 GTW/719·452 tick 钟/风门）----
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = true;                                   // 世界停更:store 冻结
  window.__wbakeArm = null;
});
await page.evaluate(async () => {
  const ta = await import('/src/render/TileAnim.ts');
  ta.tileAnim.tick = 4800;                           // 冻结 tick 钟
  const gt = await import('/src/core/GameTime.ts');
  gt.pinGameTimeTicks(654321);                       // 冻结 GTW（生产禁调;探针专用）
  const vt = await import('/src/render/VanillaTiler.ts');
  vt.renderEnv.wind = 0;
  vt.renderEnv.worldSurface = window.__swGame.world.groundLevel;
  vt.renderEnv.remix = false;
});
await new Promise((r) => setTimeout(r, 1500));       // 在飞烘焙回包落定

// ---- wbake 客户端就绪探测（旗真开 + bakeClient 装配）----
chk('旗面真开（__swBakeFlags.enabled）', await page.evaluate(() => window.__swBakeFlags?.enabled === true));
async function waitClient(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate(() => {
      const g = window.__swGame;
      return !!(g?.chunks?.bakeClient && g.world);
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
chk('wbake 客户端就绪', await waitClient());

// ---- 选 chunk：玩家周界 5×5 + 地下 2 + 旗面观测 ----
// 坐标口径：player.cx/cy = 世界像素（÷16=tile,÷256=chunk）
const chunkList = await page.evaluate(() => {
  const g = window.__swGame;
  const pcx = Math.floor(g.player.cx / 16 / 16), pcy = Math.floor(g.player.cy / 16 / 16);
  const list = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) list.push([pcx + dx, pcy + dy]);
  }
  list.push([pcx, pcy + 6], [pcx - 1, pcy + 8]);     // 地下洞穴带
  const W = g.world.w, H = g.world.h;
  return list.filter(([cx, cy]) => cx >= 0 && cy >= 0 && cx * 16 < W && cy * 16 < H);
});
console.log(`[wbake-digest] chunk 覆盖 ${chunkList.length} 块 @${chunkList[0]}`);

// ---- 群系特化 chunk 扫描（棕榈 323 深扫描/仙人掌 80/树 5/宝石树 583-589 的
//      深度扫描带与大表路径;稀疏采样世界 store 找命中格 → 折算 chunk）----
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
const extra = biomeChunks.map(b => [b.cx, b.cy]);
console.log(`[wbake-digest] 群系特化 ${extra.length} 块（sheets: ${[...new Set(biomeChunks.map(b => b.sheet))].join(',')}）`);
chunkList.push(...extra);

// ---- 双臂对拍（node 侧 md5 终裁;全量字节 base64 回传）----
// ★A 臂先行暖场：远区 chunk 首烘会触发主线程懒加载（fallback 烤进首烘）——
//   烘两次中间等 1s,第二次 = 表落位后的【settled 主线程产物】;与 B 臂对拍用
//   settled 臂（worker 侧经 missing→ship 链天然只产 settled 产物）。
const md5s = await page.evaluate(async (chunkList) => {
  const g = window.__swGame;
  const chunks = g.chunks;
  const client = chunks.bakeClient;
  const b64 = (d) => { let s = ''; const u8 = d; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const bakeA = (cx, cy) => {
    const mw = document.createElement('canvas'); mw.width = 256; mw.height = 256;
    const mt = document.createElement('canvas'); mt.width = 256; mt.height = 256;
    chunks.bakeChunkInto(cx, cy, mw, mt, -1);
    return { aW: b64(mw.getContext('2d').getImageData(0, 0, 256, 256).data),
             aT: b64(mt.getContext('2d').getImageData(0, 0, 256, 256).data) };
  };
  const out = [];
  for (const [cx, cy] of chunkList) {
    // A 臂（暖场 + settled）
    bakeA(cx, cy);
    await new Promise((res) => setTimeout(res, 900));
    const a = bakeA(cx, cy);
    // B 臂：worker 快照烘焙（missing → 补送 → 重试,≤8 轮）
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

let pass = 0, fail = 0;
for (const m of md5s) {
  const hA = md5buf(Buffer.from(m.aW, 'base64')) + md5buf(Buffer.from(m.aT, 'base64'));
  if (m.bW === null) { chk(`chunk(${m.cx},${m.cy})`, false, 'worker 侧缺表: ' + m.missing.join(',')); fail++; continue; }
  const hB = md5buf(Buffer.from(m.bW, 'base64')) + md5buf(Buffer.from(m.bT, 'base64'));
  if (hA === hB) { pass++; }
  else {
    fail++;
    console.log(`  MISMATCH chunk(${m.cx},${m.cy}) wallMD5=${md5buf(Buffer.from(m.bW, 'base64'))} vs ${md5buf(Buffer.from(m.aW, 'base64'))}`);
  }
}
chk(`双路径逐字节 md5 全等（${pass}/${md5s.length} chunk × 墙/tile 双层）`, fail === 0);
chk('无页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

console.log('\n==== C4 wbake digest 判语 ====');
console.log(JSON.stringify({ pass, fail, pageErrors: pageErrors.length }, null, 2));
await browser.close();
process.exit(fail === 0 && pageErrors.length === 0 ? 0 : 1);
