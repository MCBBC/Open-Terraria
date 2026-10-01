// ★BJ427-W2 定谳探针 v2：液体变更→光照响应链三嫌疑分定性实测。
//  【v1→v2 教训】v1 采样行取 max(by+8,gl+2)——seed 0522 出生点高空(by=274,gl=337),
//  场景悬浮天空全 sky-lit,采样行落在池外原地形 → 全 0 无判别力。v2:池内砌石墙
//  （surfaceSky wallOk 门=挡天空光,TileLightScanner.ts:814）造暗室,池内行=纯岩浆
//  发射判别面（有液 R≈173-190 / 无液 R≈0）。
//  【场景】六场景各自新页:
//   S1 裸写+worker 缺省           ——裸 setLiquid 点亮延迟（预测 ≤3 帧）
//   S2 裸写+touch 助推            ——现行 workaround 是否必要（预测与 S1 无差）
//   S3 裸写+本地 ?lightworker=0   ——本地 20Hz 节流面（预测 ≤3 tick）
//   S4 真实桶倒 useBucket(207)    ——gameplay 写链+sim 流动格光照滞后（sim 直写
//                                    不入写日志→worker delta 影子陈旧 ≤120 帧?）
//   S5 裸写+?lightdelta=0 全量切片 ——差量面/全量面对照
//   S6 原探针布局复现（玩家 bx+60 相机锁池心）——区域几何裁剪实锤
//  运行：SW_ORIGIN=http://localhost:5700 node tools/run-diag.mjs --timeout=540000 scripts/_bj427-w2-light-verdict.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5700';
const OUT = process.env.BJ427_OUT || '/tmp/bj427-w2-out';
mkdirSync(OUT, { recursive: true });
const report = {};

// ---- 场景装配（干池+池内石墙暗室:天空光被 wallOk 门挡住→池内暗,岩浆发射可判别） ----
async function buildScene(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player, st = g.world.store;
    const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
    for (let dx = -40; dx <= 40; dx++) for (let dy = -20; dy <= 24; dy++) st.setTile(bx + dx, by + dy, 0);
    for (const wx of [-22, -21, 21, 22]) for (let dy = -3; dy <= 16; dy++) st.setTile(bx + wx, by + dy, 1);
    for (let dx = -20; dx <= 20; dx++) for (let dy = 14; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
    // 池内暗室:石墙填充（blocksLight 墙支挡天空光;岩浆发射 ApplyLiquidLight 与墙无关）
    for (let dx = -20; dx <= 20; dx++) for (let dy = 0; dy <= 13; dy++) st.setWall(bx + dx, by + dy, 1);
    // 玩家钉池心池底（区域=玩家±(viewW/2+29) ⇒ 全池在区内=游戏内可达布局）
    p.x = bx * 16 + 8; p.y = (by + 13) * 16 - p.h + 16; p.vx = 0; p.vy = 0;
    if (p.statLife !== undefined && p.statLifeMax2 !== undefined) p.statLife = p.statLifeMax2;
    g.camera.follow = () => {};
    g.camera.x = bx * 16; g.camera.y = (by + 6) * 16;
    try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } } catch { /* 容忍 */ }
    return { bx, by, gl: g.world.groundLevel };
  });
}

async function openScenario(urlFlag) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
    const page = await openPage(browser, {});
    // ★BJ95 教训:gotoApp 会洗 origin 后拼的 query——先 goto 带参页,bootstrap 经
    //  carryQuery 透传（boot.mjs:158 carried 机制）
    if (urlFlag) {
      await page.goto(ORIGIN + urlFlag, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
    await bootstrap(page, ORIGIN);
    const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
    if (!gen.ok) { await browser.close(); if (attempt === 1) throw new Error('createGame fail ' + urlFlag + ' why=' + gen.why); continue; }
    await freezeClock(page, { tod: 0.5 });
    await pump(page, 30);
    const scene = await buildScene(page);
    await pump(page, 20);
    return { browser, page, scene };
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

async function runScenario(name, { urlFlag, fill, touch, bucket, frames = 180 }) {
  const { browser, page, scene } = await openScenario(urlFlag);
  await installSampler(page);
  const { bx, by, gl } = scene;
  const row = by + 10;   // 池内暗室行（石墙后无天空光）
  const cells = [
    ['left', bx - 12, row], ['mid', bx, row], ['right', bx + 12, row],
    ['sky', bx, by - 10],
  ];
  const base = await page.evaluate(async (c) => globalThis.__w2.series(c, 5), cells);
  const baseR = {};
  for (const [nm] of cells) baseR[nm] = Math.round(base.reduce((a, s) => a + s[nm], 0) / base.length);

  if (fill) {
    await page.evaluate(({ bx, by }) => {
      const st = window.__swGame.world.store;
      for (let dx = -20; dx <= 20; dx++) for (let dy = 0; dy <= 13; dy++) st.setLiquid(bx + dx, by + dy, 255, 2);
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

  const out = { name, urlFlag: urlFlag || '(default)', bx, by, gl, row, baseR, lit: {}, liq: {}, lw: series[0].lw, region: { rx: series[0].rx, rxEnd: series[0].rx + series[0].rw } };
  for (const [nm] of S) {
    if (nm === 'sky') continue;
    out.lit[nm] = firstLit(series, nm, baseR[nm]);
    out.liq[nm] = liquidAt(series, nm);
  }
  writeFileSync(`${OUT}/w2-${name}.json`, JSON.stringify({ out, series: series.filter((_, i) => i % 3 === 0) }, null, 1));
  return out;
}

// ---- 六场景 ----
report.S1 = await runScenario('S1-bare-worker', { fill: true });
report.S2 = await runScenario('S2-bare-touch', { fill: true, touch: true });
report.S3 = await runScenario('S3-bare-local', { urlFlag: '/?lightworker=0', fill: true });
report.S4 = await runScenario('S4-bucket-worker', { bucket: true, frames: 260 });
report.S5 = await runScenario('S5-bare-legacy', { urlFlag: '/?lightdelta=0', fill: true });
report.S6 = await runScenario('S6-region-geom', { fill: true, frames: 60 });

// S6b 原探针布局复现:玩家瞬移 bx+60+相机留池心+touch+240 帧排干——黑区应=区域几何
{
  const { browser, page, scene } = await openScenario('');
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
  await browser.close();
}

writeFileSync(`${OUT}/w2-report.json`, JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(report)) {
  if (v.lit) console.log(`[${k}] lw=${v.lw} lit=${JSON.stringify(v.lit)} liqArr=${JSON.stringify(v.liq)} region=[${v.region.rx},${v.region.rxEnd}) base=${JSON.stringify(v.baseR)}`);
  else console.log(`[${k}] ${JSON.stringify(v).slice(0, 300)}`);
}
console.log('[probe] done →', OUT);
