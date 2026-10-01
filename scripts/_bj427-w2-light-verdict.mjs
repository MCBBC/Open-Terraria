// ★BJ427-W2 定谳探针 v3：液体变更→光照响应链三嫌疑分定性实测。
//  【v1→v3 教训】v1 采样行取池外原地形(全0无判别力);v2 暗室开顶,天空光 blur 下渗
//  (0.91^11×255≈90>判别阈)。v3:S1-S5 用全封闭石壳暗室（顶盖实体块阻断渗漏+池内
//  石墙 wallOk 门挡直射天空光）→ 池内行纯岩浆发射判别面（有液 R≈173-190/无液≈0）。
//  【场景】各自新页（W2_ONLY=S1,S4… 可过滤）:
//   S1 裸写+worker 缺省           ——裸 setLiquid 点亮延迟（预测 ≤3 帧）
//   S2 裸写+touch 助推            ——现行 workaround 是否必要（预测与 S1 无差）
//   S3 裸写+本地 ?lightworker=0   ——本地 20Hz 节流面（预测 ≤3 tick）
//   S4 真实桶倒 useBucket(207)    ——gameplay 写链+sim 流动格光照滞后量化
//                                    （sim 直写不入写日志→worker delta 影子陈旧 ≤120 帧?）
//   S5 裸写+?lightdelta=0 全量切片 ——差量面/全量面对照
//   S6b 原探针布局复现（玩家 bx+60 相机锁池心+touch+240 帧排干）——区域几何裁剪实锤
//  运行：SW_ORIGIN=http://localhost:5700 W2_ONLY=S1,S2,S3 node tools/run-diag.mjs --timeout=300000 scripts/_bj427-w2-light-verdict.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5700';
const OUT = process.env.BJ427_OUT || '/tmp/bj427-w2-out';
mkdirSync(OUT, { recursive: true });
const report = {};
const t0 = Date.now();
const log = (...a) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

// ---- 场景装配 ----
// vault=true:封闭石壳暗室（顶盖 by+1 行实体+池内石墙）;vault=false:原探针开池
async function buildScene(page, vault) {
  return page.evaluate((vault) => {
    const g = window.__swGame;
    const p = g.player, st = g.world.store;
    const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
    for (let dx = -40; dx <= 40; dx++) for (let dy = -20; dy <= 24; dy++) st.setTile(bx + dx, by + dy, 0);
    for (const wx of [-22, -21, 21, 22]) for (let dy = -3; dy <= 16; dy++) st.setTile(bx + wx, by + dy, 1);
    for (let dx = -20; dx <= 20; dx++) for (let dy = 14; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
    if (vault) {
      // 顶盖（实体块阻断 blur 下渗）+ 池内石墙（wallOk 门挡直射天空光）→ 暗室
      for (let dx = -20; dx <= 20; dx++) st.setTile(bx + dx, by + 1, 1);
      for (let dx = -20; dx <= 20; dx++) for (let dy = 2; dy <= 13; dy++) st.setWall(bx + dx, by + dy, 1);
      // 玩家钉池心池底（暗室内;区域=玩家±(viewW/2+29) ⇒ 全池在区内=游戏内可达布局）
      p.x = bx * 16 + 8; p.y = (by + 13) * 16 - p.h + 16; p.vx = 0; p.vy = 0;
      g.camera.x = bx * 16; g.camera.y = (by + 8) * 16;
    } else {
      for (let dx = -20; dx <= 20; dx++) for (let dy = 0; dy <= 13; dy++) st.setWall(bx + dx, by + dy, 1);
    }
    if (p.statLife !== undefined && p.statLifeMax2 !== undefined) p.statLife = p.statLifeMax2;
    g.camera.follow = () => {};
    try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } } catch { /* 容忍 */ }
    return { bx, by, gl: g.world.groundLevel };
  }, vault);
}

async function openScenario(urlFlag) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
    const page = await openPage(browser, {});
    // ★BJ95 教训:gotoApp 会洗 origin 后拼的 query——旗面走 gotoApp extraQuery 正道
    //  （bootstrap 的 pre-goto+cleanStorage 组合对带旗二次导航会卡桥,见探针 v2 记录;
    //   本探针不需存档卫生,直跳 cleanStorage）
    const { gotoApp, waitForBridge, ackWelcome } = await import('../tools/probe/lib/boot.mjs');
    await gotoApp(page, ORIGIN, { extraQuery: urlFlag || '' });
    if (!(await waitForBridge(page, { timeout: 60000 }))) {
      await browser.close();
      if (attempt === 1) throw new Error('bridge-timeout ' + urlFlag);
      continue;
    }
    await ackWelcome(page, true).catch(() => {});
    const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
    if (!gen.ok) { await browser.close(); if (attempt === 1) throw new Error('createGame fail ' + urlFlag + ' why=' + gen.why); continue; }
    await freezeClock(page, { tod: 0.5 });
    await pump(page, 30);
    return { browser, page };
  }
}

async function installSampler(page) {
  await page.evaluate(() => {
    globalThis.__w2 = {
      async series(cells, frames) {
        const g = window.__swGame, st = g.world.store, li = g.lighting;
        const out = [];
        for (let f = 0; f < frames; f++) {
          await new Promise((r) => requestAnimationFrame(r));
          const P = g.player;
          if (P.statLife !== undefined && P.statLifeMax2 !== undefined) P.statLife = P.statLifeMax2;
          const snap = { f };
          for (const [name, cx, cy] of cells) {
            const [r, gg] = li.lightAt(cx, cy);
            snap[name] = r; snap[name + 'G'] = gg;
            snap[name + 'L'] = st.liquid[st.idx(cx, cy)];
          }
          snap.dirty = li.dirty; snap.liqDirty = li.liquidDirty;
          snap.rx = li.rx; snap.rw = li.rw;
          out.push(snap);
        }
        return out;
      },
    };
  });
}

function firstLit(series, key, base) {
  for (const s of series) if (s[key] >= base + 60) return s.f;
  return -1;
}
function liquidAt(series, key) {
  for (const s of series) if (s[key + 'L'] > 0) return s.f;
  return -1;
}

async function runScenario(name, { urlFlag, fill, touch, bucket, frames = 150 }) {
  log(name, 'open');
  const { browser, page } = await openScenario(urlFlag);
  const scene = await buildScene(page, true);
  await pump(page, 20);
  await installSampler(page);
  const { bx, by, gl } = scene;
  const row = by + 10;   // 暗室内行（封闭后无天空光渗漏）
  const cells = [
    ['left', bx - 12, row], ['mid', bx, row], ['right', bx + 12, row],
    ['sky', bx, by - 10],
  ];
  const base = await page.evaluate(async (c) => globalThis.__w2.series(c, 5), cells);
  const baseR = {};
  for (const [nm] of cells) baseR[nm] = Math.round(base.reduce((a, s) => a + s[nm], 0) / base.length);
  log(name, 'base', JSON.stringify(baseR));

  if (fill) {
    await page.evaluate(({ bx, by }) => {
      const st = window.__swGame.world.store;
      for (let dx = -20; dx <= 20; dx++) for (let dy = 2; dy <= 13; dy++) st.setLiquid(bx + dx, by + dy, 255, 2);
    }, { bx, by });
    if (touch) {
      await page.evaluate(({ bx, by }) => {
        const st = window.__swGame.world.store;
        for (let dx = -24; dx <= 24; dx++) st.setTile(bx + dx, by - 2, 0);
      }, { bx, by });
    }
  }
  if (bucket) {
    // 真实 gameplay 写函数（useBucket→bucketUse→setLiquid 同链;射程盒内 dx=4,dy=1）
    await page.evaluate(({ bx, by }) => { window.__swGame.useBucket(207, bx + 4, by + 12); }, { bx, by });
  }

  const S = bucket
    ? [...cells, ['pour', bx + 4, by + 13], ['flow1', bx + 8, by + 13], ['flow2', bx + 12, by + 13], ['flow3', bx + 16, by + 13]]
    : cells;
  const series = await page.evaluate(async ({ c, frames }) => globalThis.__w2.series(c, frames), { c: S, frames });
  await browser.close();

  const out = { name, urlFlag: urlFlag || '(default)', bx, by, gl, row, baseR, lit: {}, liq: {}, region: { rx: series[0].rx, rxEnd: series[0].rx + series[0].rw } };
  for (const [nm] of S) {
    if (nm === 'sky') continue;
    out.lit[nm] = firstLit(series, nm, baseR[nm]);
    out.liq[nm] = liquidAt(series, nm);
  }
  writeFileSync(`${OUT}/w2-${name}.json`, JSON.stringify({ out, series: series.filter((_, i) => i % 3 === 0) }, null, 1));
  log(name, 'done', JSON.stringify(out.lit), JSON.stringify(out.liq));
  return out;
}

// ---- ★S4-paired：同场景 worker vs local 对跑（sim 直写光照滞后差分定谳仪） ----
// 封闭横巷道（顶 by+11 行实体+底 by+13 行实体,巷道行=by+12,两端石墙封）:桶倒
// (bx-6,by+12) 后 lava 只能沿巷道横流;采样格=巷道流径格本身（覆盖后=发射格）。
// 判读:lag=lightArr−liqArr——local 路径 ≤5 帧(重算面直读活数组);worker 路径
// sim 直写不入写日志 → 光照只能随 ~120 帧锚帧/区域移动投递 → lag≈锚签名。
async function runS4paired(name, urlFlag) {
  log(name, 'open');
  const { browser, page } = await openScenario(urlFlag);
  const scene = await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player, st = g.world.store;
    const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
    for (let dx = -40; dx <= 40; dx++) for (let dy = -20; dy <= 24; dy++) st.setTile(bx + dx, by + dy, 0);
    for (const wx of [-22, -21, 21, 22]) for (let dy = -3; dy <= 20; dy++) st.setTile(bx + wx, by + dy, 1);
    // 巷道壳:顶 by+11/底 by+13 实体,两端 bx±20 竖墙,巷道行 by+12 空腔+石墙
    for (let dx = -20; dx <= 20; dx++) { st.setTile(bx + dx, by + 11, 1); st.setTile(bx + dx, by + 13, 1); st.setWall(bx + dx, by + 12, 1); }
    for (const wx of [-21, 21]) st.setTile(bx + wx, by + 12, 1);
    // 暗室参考格（同 row 侧厅,无液）
    p.x = bx * 16 + 8; p.y = (by + 12) * 16 - p.h + 16; p.vx = 0; p.vy = 0;
    if (p.statLife !== undefined && p.statLifeMax2 !== undefined) p.statLife = p.statLifeMax2;
    g.camera.follow = () => {}; g.camera.x = bx * 16; g.camera.y = (by + 12) * 16;
    try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } } catch { /* 容忍 */ }
    return { bx, by, gl: g.world.groundLevel };
  });
  await pump(page, 20);
  await installSampler(page);
  const { bx, by } = scene;
  const rowC = by + 12;
  const cells = [
    ['pour', bx - 4, rowC], ['ch1', bx + 1, rowC], ['ch2', bx + 6, rowC], ['ch3', bx + 12, rowC], ['ch4', bx + 18, rowC],
  ];
  const base = await page.evaluate(async (c) => globalThis.__w2.series(c, 5), cells);
  const baseR = {};
  for (const [nm] of cells) baseR[nm] = Math.round(base.reduce((a, s) => a + s[nm], 0) / base.length);
  log(name, 'base', JSON.stringify(baseR));
  // 真实桶倒（useBucket 原语;setLiquid=记账写）:玩家在巷道内 dx=4 达 pour 格右侧
  await page.evaluate(({ bx, by }) => { window.__swGame.useBucket(207, bx - 4, by + 12); }, { bx, by });
  const frames = 280;
  const series = await page.evaluate(async ({ c, frames }) => globalThis.__w2.series(c, frames), { c: cells, frames });
  await browser.close();
  const out = { name, urlFlag: urlFlag || '(default)', bx, by, baseR, cells: {}, region: { rx: series[0].rx, rxEnd: series[0].rx + series[0].rw } };
  for (const [nm] of cells) {
    const liq = liquidAt(series, nm);
    // lightArr:阈=base+30（巷道格覆盖后=发射格,后 blur 值 ~110-180;渗漏基线 ~73）
    let lit = -1;
    for (const s of series) if (s[nm] >= baseR[nm] + 30) { lit = s.f; break; }
    out.cells[nm] = { liq, lit, lag: lit >= 0 && liq >= 0 ? lit - liq : null, R50: series[50] ? series[50][nm] : null, R120: series[120] ? series[120][nm] : null, R200: series[200] ? series[200][nm] : null };
  }
  writeFileSync(`${OUT}/w2-${name}.json`, JSON.stringify({ out, series: series.filter((_, i) => i % 2 === 0) }, null, 1));
  log(name, 'done', JSON.stringify(out.cells));
  return out;
}

// ---- 场景批（W2_ONLY 过滤） ----
const ONLY = (process.env.W2_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (k) => ONLY.length === 0 || ONLY.includes(k);
if (want('S1')) report.S1 = await runScenario('S1-bare-worker', { fill: true });
if (want('S2')) report.S2 = await runScenario('S2-bare-touch', { fill: true, touch: true });
if (want('S3')) report.S3 = await runScenario('S3-bare-local', { urlFlag: '/?lightworker=0', fill: true });
if (want('S4')) report.S4 = await runScenario('S4-bucket-worker', { bucket: true, frames: 260 });
if (want('S4w')) report.S4w = await runS4paired('S4w-paired-worker', '');
if (want('S4l')) report.S4l = await runS4paired('S4l-paired-local', '/?lightworker=0');
if (want('S5')) report.S5 = await runScenario('S5-bare-legacy', { urlFlag: '/?lightdelta=0', fill: true });

// S6b 原探针布局复现:玩家瞬移 bx+60+相机留池心+touch+240 帧排干——黑区应=区域几何
if (want('S6b')) {
  log('S6b', 'open');
  const { browser, page } = await openScenario('');
  const scene = await buildScene(page, false);
  await page.evaluate(({ bx, by }) => {
    const p = window.__swGame.player;
    p.x = (bx + 60) * 16 + 8; p.y = (by - 4) * 16; p.vx = 0; p.vy = 0;
    for (let dx = -20; dx <= 20; dx++) for (let dy = 0; dy <= 13; dy++) window.__swGame.world.store.setLiquid(bx + dx, by + dy, 255, 2);
    for (let dx = -24; dx <= 24; dx++) window.__swGame.world.store.setTile(bx + dx, by - 2, 0);
  }, scene);
  await pump(page, 30);
  for (let i = 0; i < 240; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  await installSampler(page);
  const { bx, by, gl } = scene;
  const row = by + 10;
  const cells = [['left', bx - 15, row], ['mid', bx, row], ['right', bx + 15, row]];
  const series = await page.evaluate(async (c) => globalThis.__w2.series(c, 30), cells);
  report.S6b = {
    name: 'S6b 原探针布局（玩家bx+60/相机池心/touch+240帧排干后）',
    bx, by, gl, row,
    region: { rx: series[0].rx, rxEnd: series[0].rx + series[0].rw },
    predRegionLeft: bx - 9,
    R: { left: series.map((s) => s.left), mid: series.map((s) => s.mid), right: series.map((s) => s.right) },
    判读: 'left(bx-15) 应在区域左缘(bx-9)之左=恒黑;mid/right 区内=岩浆亮 → 黑区=区域几何裁剪',
  };
  writeFileSync(`${OUT}/w2-S6b.json`, JSON.stringify(report.S6b, null, 1));
  log('S6b', 'done', 'region', JSON.stringify(report.S6b.region), 'pred', report.S6b.predRegionLeft);
  await browser.close();
}

writeFileSync(`${OUT}/w2-report.json`, JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(report)) {
  if (v.lit) console.log(`[${k}] lit=${JSON.stringify(v.lit)} liqArr=${JSON.stringify(v.liq)} region=[${v.region.rx},${v.region.rxEnd}) base=${JSON.stringify(v.baseR)}`);
  else console.log(`[${k}] ${JSON.stringify(v).slice(0, 400)}`);
}
console.log('[probe] done →', OUT);
