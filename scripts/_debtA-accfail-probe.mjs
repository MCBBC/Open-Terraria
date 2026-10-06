// ★债A 定谳探针（accFail 弃队窗=首 flush 预解析门期,鸟妖定谳刀登记）。
//  ①触发条件与频率:群系扫掠（新贴图页加载=texReady 半加载窗）+地表行走（尘/实体
//    队列深度）+水池波相位（亚像素区域族历史 'tex' 产地）——逐场景采样
//    GLShimExecutor.accFailPreopen（FBO 未开窗触达数）+ accFailLedger（why 分布）。
//  ②acc 路径在位验证:bglPathUsed 前缀 b2b-acc（非 acc 帧=测量无效）。
//  判读:preopen=0 → 窗为潜伏态（健康会话未观测）;preopen>0 → 逐次触达即整队弃。
//  运行:SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=280000 scripts/_debtA-accfail-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261006 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__teleport = (x, y) => {
    g.player.x = x * 16; g.player.y = y * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    g.world.store; // 触碰保活
  };
  window.__diag = () => {
    const r = g.renderer;
    const d = r.accDiag();
    return { used: d.used, preopen: d.accFailPreopen, ledger: d.accFailLedger,
      wc: d.worldCanvasCreations, replays: d.shim?.replays ?? null, fb: d.shim?.fallback ?? null,
      draws: d.shim?.draws ?? null };
  };
});

await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/render/glshim/GLShimExecutor.ts').then((m) => { window.__gse = m; }));
await page.evaluate(() => window.__drive(30));

// ---- 场景 A:群系扫掠（新页加载=texReady 半加载窗;'tex' 生产类）----
const surf = await page.evaluate(() => Math.floor(window.__swGame.world.groundLevel));
const SPOTS = [
  ['spawn-forest', null, null],        // 原地
  ['ocean', 120, surf - 2],
  ['desert', 2100, surf - 2],
  ['snow', 3300, surf - 2],
  ['jungle', 4400, surf - 2],
  ['corrupt', 1500, surf - 2],
  ['dungeon-edge', 6200, surf - 2],
  ['underground', 3000, surf + 120],
];
const sceneRows = [];
for (const [name, tx, ty] of SPOTS) {
  const before = await page.evaluate(() => ({ p: window.__gse.GLShimExecutor.accFailPreopen, l: { ...window.__gse.GLShimExecutor.accFailLedger } }));
  await page.evaluate(([x, y]) => window.__teleport(x ?? window.__swGame.player.x / 16, y ?? window.__swGame.player.y / 16), [tx, ty]);
  // 行走驱动（尘+实体队列深度）
  for (let i = 0; i < 12; i++) {
    await page.evaluate((k) => {
      const g = window.__swGame;
      g.player.vx = (k % 2 === 0 ? 1 : -1) * 2;
      window.__drive(15);
      g.camera.x = g.player.x; g.camera.y = g.player.y;
    }, i);
  }
  const row = await page.evaluate(() => window.__diag());
  const beforePre = before.p;
  sceneRows.push({ name, preopen: row.preopen, delta: row.preopen - beforePre, ledger: row.ledger, used: row.used, replays: row.replays });
  console.log(`[scene ${name}] used=${row.used} preopen=${row.preopen}(+${row.preopen - beforePre}) ledger=${JSON.stringify(row.ledger)} replays=${row.replays}`);
}

// ---- 场景 B:水池（波相位亚像素族历史产地;c13b 同构场面）----
const pool = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const surfY = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const x0 = px - 60, x1 = px + 60, ry = surfY + 1, depth = 8;
  for (let x = x0 - 10; x <= x1 + 10; x++) for (let y = ry - 8; y <= ry + depth + 8; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); if (st.setWall) st.setWall(x, y, 0); }
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 1);
  g.player.x = (x1 + 8) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  return { x0, x1, ry };
});
const beforePool = await page.evaluate(() => ({ p: window.__gse.GLShimExecutor.accFailPreopen, l: { ...window.__gse.GLShimExecutor.accFailLedger } }));
await page.evaluate(() => window.__drive(600));
const poolRow = await page.evaluate(() => window.__diag());
console.log(`[scene water-pool] used=${poolRow.used} preopen=${poolRow.preopen}(+${poolRow.preopen - beforePool.p}) ledger=${JSON.stringify(poolRow.ledger)} replays=${poolRow.replays}`);

// ---- 判读 ----
const accActive = sceneRows.filter((r) => r.used.startsWith('b2b-acc')).length;
chk('②acc 路径在位（扫掠场景 acc 帧占比 ≥80%）', accActive >= sceneRows.length * 0.8, `${accActive}/${sceneRows.length} used=${sceneRows[0]?.used}`);
const totalPreopen = poolRow.preopen;
chk('①弃队窗触达计数（report）', true, `preopen=${totalPreopen} ledger=${JSON.stringify(poolRow.ledger)}`);
chk('页面零错误', pageErrors.filter((e) => !e.includes('favicon')).length === 0, pageErrors.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
