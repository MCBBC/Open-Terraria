// ★bakenoread 读回消除刀——双臂 md5 逐位对拍 + 读回计数量化（2026-10-08）。
// 判据：同一 chunk（同种子 pinRandom 世界+同注入+同冻结时钟面）在
//   A 臂 = 缺省（?bakenoread 缺省关:油漆 pass 逐漆格 16² 页读回,现状）
//   B 臂 = ?bakenoread=1（每漆层 1 次 256² 整 cell 快照 + CPU 行拷贝 tint）
//   两臂 bakeChunkInto 外部目标（cell=-1）墙/tile 256² 像素 SHA-256 必须全等
//   （渲染产物逐位不变红线）;未注入漆的控制 chunk 同帧对拍 = 世界确定性金丝。
// 量化面：bake 期 getImageData 中【页读回】op/字节/自耗（计数包装,烘焙窗口外还原
//   =插桩中立）+ bake 均耗时（Mac 口径）——Windows 投影 = Trace-202608T175748
//   31ms/s × (B 臂页读 op / A 臂页读 op)。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=600000 scripts/_bake-noread-digest.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const SEED = '05162020', PIN = 20260928;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 单臂跑批：开页→旗页进入→钉种子建世界→冻时钟→注入漆→外目标烘焙+对拍 */
async function runArm(browser, flag) {
  const page = await openPage(browser, {});
  const errors = [];
  await bootstrap(page, ORIGIN);
  const okNav = await gotoApp(page, ORIGIN, { extraQuery: flag ? '?bakenoread=1' : '?x=1' });
  if (!okNav) throw new Error('gotoApp failed');
  await waitForBridge(page);
  const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: PIN, timeout: 240000 });
  if (!gen?.ok) throw new Error('createGame: ' + gen?.why);
  await page.evaluate(() => { window.__swGame.paused = true; });
  await page.evaluate(async () => {
    const ta = await import('/src/render/TileAnim.ts');
    ta.tileAnim.tick = 4800;
    const gt = await import('/src/core/GameTime.ts');
    gt.pinGameTimeTicks(654321);
    const vt = await import('/src/render/VanillaTiler.ts');
    vt.renderEnv.wind = 0;
    vt.renderEnv.worldSurface = window.__swGame.world.groundLevel;
    vt.renderEnv.remix = false;
  });
  await sleep(1200);
  const flagSeen = await page.evaluate(() => window.__swBakeNoRead === true);
  const out = await page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    const pcx = Math.floor(g.player.cx / 16 / 16), pcy = Math.floor(g.player.cy / 16 / 16);
    // ---- 注入漆（全由 (x,y) 确定式生成;双臂同式同世界=同店态）----
    const bx0 = pcx * 16, by0 = pcy * 16;
    for (let y = by0; y < by0 + 32; y++) {
      for (let x = bx0; x < bx0 + 48; x++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] !== 0) {
          st.paint[i] = ((x * 7 + y * 13) % 30) + 1;         // 1..30 含负相 30
          if ((x + y) % 11 === 0) st.wire[i] |= 32;          // 致动∧漆（filter 支）
          if ((x * 3 + y) % 23 === 0) st.half[i] = 1;        // 半砖∧漆（漆后清顶 8px 支）
        }
        if (st.wall[i] !== 0) st.paintWall[i] = ((x * 5 + y * 3) % 30) + 1;
      }
    }
    // ---- chunk 集：6 漆 chunk + 2 控制（漆矩形外）----
    const all = [
      [pcx, pcy], [pcx + 1, pcy], [pcx + 2, pcy],
      [pcx, pcy + 1], [pcx + 1, pcy + 1], [pcx + 2, pcy + 1],
      [pcx + 5, pcy + 4], [pcx - 4, pcy + 3],
    ];
    const chunks = all.filter(([cx, cy]) => cx >= 0 && cy >= 0 && cx * 16 < st.w && cy * 16 < st.h)
      .map(([cx, cy]) => ({ cx, cy, control: cx > pcx + 2 || cy > pcy + 1 }));
    // ---- 读回计数包装（烘焙窗口内生效,结束后还原=插桩中立）----
    const stats = { opsAll: 0, bytesAll: 0, msAll: 0, opsPage: 0, bytesPage: 0, msPage: 0 };
    const targets = new Set();
    const p1 = CanvasRenderingContext2D.prototype, p2 = OffscreenCanvasRenderingContext2D.prototype;
    const o1 = p1.getImageData, o2 = p2.getImageData;
    const wrap = (orig) => function (sx, sy, sw, sh) {
      const t0 = performance.now();
      const r = orig.call(this, sx, sy, sw, sh);
      const dt = performance.now() - t0;
      stats.opsAll++; stats.bytesAll += sw * sh * 4; stats.msAll += dt;
      if (targets.has(this.canvas)) { stats.opsPage++; stats.bytesPage += sw * sh * 4; stats.msPage += dt; }
      return r;
    };
    p1.getImageData = wrap(o1); p2.getImageData = wrap(o2);
    try {
      const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const results = [];
      for (const c of chunks) {
        const wall = document.createElement('canvas'); wall.width = wall.height = 256;
        const tile = document.createElement('canvas'); tile.width = tile.height = 256;
        targets.add(wall); targets.add(tile);
        // 计漆格数（Windows 投影的 k 口径）+ 3 次重烘计时（第 2 次起=暖路径）
        let pwN = 0, ptN = 0;
        for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
          const i = st.idx(c.cx * 16 + lx, c.cy * 16 + ly);
          if (st.paintWall[i] > 0 && st.wall[i] !== 0) pwN++;
          if (st.paint[i] > 0 && st.flags[i] && st.type[i] !== 0) ptN++;
        }
        const times = [];
        for (let rep = 0; rep < 3; rep++) {
          const t0 = performance.now();
          g.chunks.bakeChunkInto(c.cx, c.cy, wall, tile, -1);
          times.push(performance.now() - t0);
        }
        targets.delete(wall); targets.delete(tile);   // 摘出计数面:digest 读不算页读回
        const d = async (cv) => hex(await crypto.subtle.digest('SHA-256',
          cv.getContext('2d').getImageData(0, 0, 256, 256).data.buffer));
        results.push({ ...c, pwN, ptN, wallHash: await d(wall), tileHash: await d(tile),
          bakeMs: Math.min(times[1], times[2]) });
      }
      return { stats, results };
    } finally {
      p1.getImageData = o1; p2.getImageData = o2;
    }
  });
  const errors2 = errors.slice();
  await page.close();
  return { flagSeen, ...out, errors: errors2 };
}

const browser = await launchBrowser({});
let A, B;
try {
  console.log('[arm A] 缺省（逐格页读回现状）');
  A = await runArm(browser, false);
  console.log('[arm B] ?bakenoread=1（整 cell 快照支路）');
  B = await runArm(browser, true);
} finally {
  await browser.close().catch(() => {});
}

// ---- 裁决 ----
let fail = 0;
const chk = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!ok) fail++;
};
chk('A 臂旗面=false', A.flagSeen === false);
chk('B 臂旗面=true', B.flagSeen === true);
chk('双臂无 pageerror', A.errors.length === 0 && B.errors.length === 0,
  `A:${A.errors.length} B:${B.errors.length}`);

const mapB = new Map(B.results.map((r) => [`${r.cx},${r.cy}`, r]));
let digestOk = true, firstDiff = '';
for (const a of A.results) {
  const b = mapB.get(`${a.cx},${a.cy}`);
  if (!b) { digestOk = false; firstDiff = `chunk ${a.cx},${a.cy} B 臂缺失`; break; }
  if (a.control) continue;   // 控制 chunk 只看世界确定性（同断言,下方单列）
  if (a.wallHash !== b.wallHash || a.tileHash !== b.tileHash) {
    digestOk = false;
    firstDiff = `chunk ${a.cx},${a.cy} wall=${a.wallHash === b.wallHash ? '=' : 'DIFF'} tile=${a.tileHash === b.tileHash ? '=' : 'DIFF'}`;
    break;
  }
}
chk(`漆 chunk 产物逐位（SHA-256 ${A.results.filter((r) => !r.control).length} 块×2 层）`, digestOk, firstDiff);

const ctrlOk = A.results.filter((r) => r.control).every((a) => {
  const b = mapB.get(`${a.cx},${a.cy}`);
  return b && a.wallHash === b.wallHash && a.tileHash === b.tileHash;
});
chk('控制 chunk（无漆）双臂全等=世界确定性金丝', ctrlOk);

// ---- 量化 ----
const REPS = 3;
const opsA = A.stats.opsPage / REPS;    // 每次烘焙的逐格页读回 op（漆格数）
const opsB = B.stats.opsPage / REPS;    // 每次烘焙的整 cell 快照 op（漆层数）
const paintChunks = A.results.filter((r) => !r.control && (r.pwN + r.ptN) > 0).length;
console.log('---- 量化（Mac 口径;页读回=bakeChunkInto 油漆 pass 对烘焙目标页的 getImageData;每次烘焙基）----');
console.log(`A 臂: 页读回 op=${opsA.toFixed(1)}/烘 bytes=${(A.stats.bytesPage / REPS).toFixed(0)} self=${(A.stats.msPage / REPS).toFixed(2)}ms | 全部 getImageData self=${(A.stats.msAll / REPS).toFixed(2)}ms/烘`);
console.log(`B 臂: 页读回 op=${opsB.toFixed(1)}/烘 bytes=${(B.stats.bytesPage / REPS).toFixed(0)} self=${(B.stats.msPage / REPS).toFixed(2)}ms | 全部 getImageData self=${(B.stats.msAll / REPS).toFixed(2)}ms/烘`);
const bakeA = A.results.reduce((s, r) => s + r.bakeMs, 0) / A.results.length;
const bakeB = B.results.reduce((s, r) => s + r.bakeMs, 0) / B.results.length;
console.log(`bake 均耗（漆 chunk 暖路径）: A=${bakeA.toFixed(3)}ms B=${bakeB.toFixed(3)}ms（Mac headless）`);
const ratio = opsA > 0 ? (opsB / opsA) : 1;
console.log(`Windows 投影: 31ms/s × ${opsB.toFixed(1)}/${opsA.toFixed(1)} = ${(31 * ratio).toFixed(2)}ms/s 残留（消除 ${(31 * (1 - ratio)).toFixed(1)}ms/s;漆 chunk ${paintChunks} 块,逐格读 ${opsA.toFixed(0)} op/烘 → 整 cell 快照 ${opsB.toFixed(0)} op/烘）`);
console.log(fail === 0 ? 'RESULT: PASS (bakenoread 双臂产物逐位 + 读回消除量化)' : `RESULT: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
