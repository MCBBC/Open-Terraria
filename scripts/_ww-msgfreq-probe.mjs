// ★MSG-FREQ WaveWorker 消息面降频——活机对拍探针（2026-10-04）。
// 双臂 A/B（同一 build,?wwquiet=0 逃生门=旧行为基线臂）：
//   臂1 静水·跳发（缺省）  : 干岸静置 → 预期 posted/fields 停摆,quietSkips≈窗帧数,
//                            心跳每 600 帧一发且回执零跨度（bytes/delta==4 →
//                            跳发窗=场不动点逐位冻结的活机实证）,progress 递增
//                            （环境噪声动画不冻结）,falls=0（watchdog 不误杀）
//   臂2 静水·基线(?wwquiet=0): 同场景逐帧发 → posted==窗帧数,quietSkips=0
//   臂3 活跃（缺省）        : 落水行走振荡 → 注入每帧 → posted==帧数=照常,
//                            quietSkips 不增（脏标/注入出窗）
// 网格位判据:两臂静置末端 nonNeutral==0（量化能量汇 → 恒收敛精确中性=跨臂逐位同）
//   + 臂1 静默窗内网格 checksum 逐帧不变（冻结）。
// 截图落盘 /tmp/probe-out/ww-msgfreq/*.png（人工目检）。
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, waitForBridge } from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({ headed: process.env.SW_HEADED === '1' });   // SW_HEADED=1:有头合成（GL 面 headless 读回黑帧=呈现伪影,目检臂专用）

// 预热导航（会话首臂承担 SW 注册+资产管线首次灌库）
{
  const page = await openPage(browser, {});
  await page.goto(`${ORIGIN}/?pbust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page, { timeout: 300_000 }).catch(() => {});
  await page.close();
}

const warns = [];
const mkPage = async (query) => {
  const page = await openPage(browser, {});
  page.on('console', (m) => {
    const t = m.text?.() ?? '';
    if (/WaveWaves|waveworker|msgfreq|wwquiet/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 200));
  });
  page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 200)));
  await page.goto(`${ORIGIN}/?pbust=${Date.now()}${query}`, { waitUntil: 'domcontentloaded' });
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap FAIL: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) throw new Error('createGame FAIL: ' + gen.why);
  return page;
};

const readStats = (page) => page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => {
  const s = m.wwWorkerStats();
  const R = m.waterWaves.readGridR();
  let nonNeutral = 0, sum = 0;
  for (let i = 0; i < R.length; i++) { const b = (R[i] * 256) | 0; sum = (sum + b) | 0; if (R[i] !== 0.5) nonNeutral++; }
  return { ...s, gW: m.waterWaves.gridW(), gH: m.waterWaves.gridH(), nonNeutral, sum,
    progress: m.waterWaves.progress, intensity: m.waterWaves.intensity };
}));

// 干岸立足点:本体/头顶干燥+脚下实心,同排 ±24 格内有可见水域（屏幕内）
const findShore = (page) => page.evaluate(() => {
  const g = window.__swGame; const w = g.world; const st = w.store;
  const py0 = Math.floor(g.player.y / 16);
  let best = null;
  for (let ty = Math.max(2, py0 - 80); ty < Math.min(w.h - 3, py0 + 260); ty++) {
    for (let tx = 4; tx < w.w - 4; tx++) {
      if (st.liquid[st.idx(tx, ty)] > 0 || st.liquid[st.idx(tx, ty - 1)] > 0) continue;
      if (!st.isSolid(tx, ty + 1) || st.isSolid(tx, ty)) continue;
      let wet = 0;
      for (let d = 2; d <= 24 && !wet; d++) {
        if (st.liquid[st.idx(tx - d, ty)] > 0 || st.liquid[st.idx(tx - d, ty - 1)] > 0) wet = d;
        else if (st.liquid[st.idx(tx + d, ty)] > 0 || st.liquid[st.idx(tx + d, ty - 1)] > 0) wet = d;
      }
      if (wet >= 4) {
        const score = Math.abs(tx - w.w / 2) + Math.abs(ty - py0) * 4;
        if (!best || score < best.score) best = { tx, ty, wet, score };
      }
    }
  }
  return best;
});

// 湿实体普查（静默不_engage 时的解释面;entities=分桶对象非平面数组）
const wetCensus = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const ent = g.entities ?? {};
  let wet = 0, total = 0;
  for (const k of Object.keys(ent)) {
    const arr = ent[k];
    if (Array.isArray(arr)) for (const e of arr) { total++; if (e && !e.dead && e.wet) wet++; }
  }
  return { wetEntities: wet, total };
});

const settleMs = async (page, ms) => { const until = Date.now() + ms; while (Date.now() < until) await nextFrame(page); };

// 截图:C10e 呈现拓扑下 presented 面=sw-c10e-glcanvas（GL 世界合成含水体扭曲）,
// 主 2D canvas=HUD 层;drawImage 读回通道（画布普查实证非黑;toDataURL/page.screenshot
// 对 GL 面拿黑帧）。两面各落一张（目检用）。
async function grabFrame(page, base) {
  const data = await page.evaluate(async () => {
    // GL 面无 preserveDrawingBuffer → 双 rAF 回调内【同任务】同步读回（跨任务=已清空拿黑帧）
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const grab = (cv) => {
      const c2 = document.createElement('canvas');
      c2.width = cv.width; c2.height = cv.height;
      c2.getContext('2d').drawImage(cv, 0, 0);
      return c2.toDataURL('image/png');
    };
    return {
      gl: grab(document.getElementById('sw-c10e-glcanvas')),
      main: grab(document.querySelectorAll('canvas')[2]),
    };
  });
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(`${base}-gl.png`, Buffer.from(data.gl.split(',')[1], 'base64'));
  writeFileSync(`${base}-main.png`, Buffer.from(data.main.split(',')[1], 'base64'));
  await page.screenshot({ path: `${base}-comp.png` }).catch(() => {});   // 合成器通道（有头臂目检）
}

/** 静水测量窗:窗前后 stats+progress+网格 checksum;逐帧冻结采样在窗中段 */
async function stillWindow(page, ms) {
  const s0 = await readStats(page);
  const p0 = s0.progress;
  await settleMs(page, ms * 0.4);
  const gMid0 = await readStats(page);
  await settleMs(page, ms * 0.2);
  const gMid1 = await readStats(page);
  await settleMs(page, ms * 0.4);
  const s1 = await readStats(page);
  return { s0, s1, p0, p1: s1.progress, midFrozen: gMid0.sum === gMid1.sum && gMid0.nonNeutral === gMid1.nonNeutral, gMid0, gMid1 };
}

const out = {};
const shotDir = '/tmp/probe-out/ww-msgfreq';

try {
  // ═══ 臂 1:静水·跳发（缺省） ═══
  {
    const page = await mkPage('');
    const spot = await findShore(page);
    if (!spot) throw new Error('无可立足干岸（±24 格内无水域）');
    await teleport(page, spot.tx * 16, spot.ty * 16 - 1);
    await settleMs(page, 3500);          // 初场对齐+落尘衰减
    const W = await stillWindow(page, 12000);   // ≥2×心跳帧距 → 窗内必含 ≥1 心跳
    const census = await wetCensus(page);
    await grabFrame(page, `${shotDir}/arm1-still`);
    out.arm1 = {
      spot, census,
      windowFields: W.s1.fields - W.s0.fields,
      windowPosted: W.s1.posted - W.s0.posted,
      windowQuietSkips: W.s1.quietSkips - W.s0.quietSkips,
      windowFalls: W.s1.falls - W.s0.falls, fallsBy: W.s1.fallsBy,
      windowResyncs: W.s1.resyncs - W.s0.resyncs,
      windowBytes: W.s1.bytes - W.s0.bytes,
      windowDelta: W.s1.fmt.delta - W.s0.fmt.delta,
      windowF32: W.s1.fmt.f32 - W.s0.fmt.f32, windowFull: W.s1.fmt.full - W.s0.fmt.full,
      bytesPerDelta: (W.s1.fmt.delta - W.s0.fmt.delta) ? +((W.s1.bytes - W.s0.bytes) / (W.s1.fmt.delta - W.s0.fmt.delta)).toFixed(2) : null,
      progressAlive: W.s1.progress > W.p0, progressDelta: +(W.s1.progress - W.p0).toFixed(4),
      midFrozen: W.midFrozen, endNonNeutral: W.s1.nonNeutral, endSum: W.s1.sum,
      grid: [W.s1.gW, W.s1.gH],
    };
    await page.close();
  }

  // ═══ 臂 2:静水·基线（?wwquiet=0=旧行为逐帧发） ═══
  {
    const page = await mkPage('&wwquiet=0');
    const spot = await findShore(page);
    if (!spot) throw new Error('臂2 无干岸');
    await teleport(page, spot.tx * 16, spot.ty * 16 - 1);
    await settleMs(page, 3500);
    const W = await stillWindow(page, 12000);
    await grabFrame(page, `${shotDir}/arm2-still`);
    out.arm2 = {
      windowFields: W.s1.fields - W.s0.fields,
      windowPosted: W.s1.posted - W.s0.posted,
      windowQuietSkips: W.s1.quietSkips - W.s0.quietSkips,
      windowFalls: W.s1.falls - W.s0.falls,
      windowDelta: W.s1.fmt.delta - W.s0.fmt.delta,
      endNonNeutral: W.s1.nonNeutral, endSum: W.s1.sum,
      grid: [W.s1.gW, W.s1.gH],
    };
    await page.close();
  }

  // ═══ 臂 3:活跃（缺省;落水行走振荡 → 注入每帧） ═══
  {
    const page = await mkPage('');
    const spot = await findShore(page);
    if (!spot) throw new Error('臂3 无干岸');
    // 落入最近水域中心（wet → 浮力振荡+行走洗掠每帧注入）
    const wet = await page.evaluate((spot) => {
      const g = window.__swGame; const w = g.world; const st = w.store;
      for (let d = 2; d <= 24; d++) {
        for (const s of [-1, 1]) {
          const tx = spot.tx + s * d;
          if (tx > 1 && tx < w.w - 1 && st.liquid[st.idx(tx, spot.ty)] > 0 && !st.isSolid(tx, spot.ty)) {
            return { x: tx * 16, y: spot.ty * 16 - 8 };
          }
        }
      }
      return null;
    }, spot);
    if (!wet) throw new Error('臂3 未找到水域');
    await teleport(page, wet.x, wet.y);
    await settleMs(page, 2500);          // 入水稳定
    const s0 = await readStats(page);
    for (let leg = 0; leg < 6; leg++) {
      const key = leg % 2 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.down(key);
      const until = Date.now() + 550;
      while (Date.now() < until) await nextFrame(page);
      await page.keyboard.up(key);
    }
    const s1 = await readStats(page);
    await grabFrame(page, `${shotDir}/arm3-active`);
    out.arm3 = {
      windowPosted: s1.posted - s0.posted,
      windowFields: s1.fields - s0.fields,
      windowQuietSkips: s1.quietSkips - s0.quietSkips,
      windowFalls: s1.falls - s0.falls,
      windowDelta: s1.fmt.delta - s0.fmt.delta, windowFull: s1.fmt.full - s0.fmt.full,
      windowF32: s1.fmt.f32 - s0.fmt.f32, windowResyncs: s1.resyncs - s0.resyncs,
      nonNeutral: s1.nonNeutral,
    };
    await page.close();
  }
} catch (e) {
  console.log('PROBE ABORT:', String(e?.message ?? e));
  await browser.close().catch(() => {});
  process.exit(1);
}
await browser.close();

// ═══ 判读 ═══
console.log(JSON.stringify(out, null, 1));
const bad = [];
const A = out.arm1, B = out.arm2, C = out.arm3;
if (A.windowQuietSkips < 200) bad.push(`臂1 静默未成窗: quietSkips=${A.windowQuietSkips}（wetEntities=${A.census.wetEntities}?）`);
if (A.windowPosted > 30) bad.push(`臂1 静默窗内仍有发帧: posted=${A.windowPosted}（心跳应≈1-2）`);
if (Math.abs(A.windowPosted - A.windowFields) > 2) bad.push(`臂1 1:1 回执约定破坏: posted=${A.windowPosted} fields=${A.windowFields}`);
if (A.windowFalls !== 0) bad.push(`臂1 看门狗误杀: falls=${A.windowFalls}`);
if (A.windowFull === 0 && A.windowDelta > 0 && A.bytesPerDelta !== null && A.bytesPerDelta > 4) bad.push(`臂1 心跳回执非零跨度: bytes/delta=${A.bytesPerDelta}（>4B=场未冻结）`);
if (!A.progressAlive) bad.push('臂1 progress 未推进=环境噪声动画冻结（语义不变式破）');
if (!A.midFrozen) bad.push('臂1 静默窗中段网格 checksum 变化=场未冻结');
if (A.endNonNeutral !== 0 || B.endNonNeutral !== 0) bad.push(`静置末端未收敛精确中性: 臂1=${A.endNonNeutral} 臂2=${B.endNonNeutral}`);
if (A.grid[0] * A.grid[1] === B.grid[0] * B.grid[1] && A.endSum !== B.endSum) bad.push(`跨臂网格 checksum 不等: ${A.endSum} vs ${B.endSum}（渲染输入逐位异）`);
if (B.windowPosted < 200) bad.push(`臂2 基线未逐帧发: posted=${B.windowPosted}`);
if (B.windowQuietSkips !== 0) bad.push(`臂2 逃生门失效: quietSkips=${B.windowQuietSkips}`);
if (B.windowFalls !== 0) bad.push(`臂2 基线误回落: falls=${B.windowFalls}`);
if (C.windowPosted < 200) bad.push(`臂3 活跃场景发帧不足: posted=${C.windowPosted}`);
if (C.windowQuietSkips !== 0) bad.push(`臂3 活跃场景不应静默: quietSkips=${C.windowQuietSkips}`);
if (Math.abs(C.windowPosted - C.windowFields) > 2) bad.push(`臂3 1:1 回执破坏`);
if (C.windowF32 !== 0 || C.windowResyncs !== 0) bad.push(`臂3 协议异常: f32=${C.windowF32} resyncs=${C.windowResyncs}`);
if (bad.length) { console.log('FAIL:', bad.join(' | ')); process.exit(1); }
console.log(`PASS: 臂1 静默窗 quietSkips=${A.windowQuietSkips}/posted=${A.windowPosted}（心跳 ${A.windowFields} 次,${A.bytesPerDelta}B/回执）progress+${A.progressDelta}; `
  + `臂2 基线 posted=${B.windowPosted}/quietSkips=${B.windowQuietSkips}; 臂3 活跃 posted=${C.windowPosted}/quietSkips=${C.windowQuietSkips}; `
  + `三臂 falls=0; 跨臂网格 checksum 相等(${A.endSum})`);
console.log('warns:', warns.length ? warns.slice(0, 8) : '无');
process.exit(0);
