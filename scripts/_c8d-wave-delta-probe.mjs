// ★C8-D 波场脏区增量回传——流量账探针（worker 模式实机测量）。
// 测量面 = wwWorkerStats() 新增 bytes/fmt/resyncs 计数（主线程收达侧累计）。
// 两场景分段记账（读差值,排除菜单/世界生成期流量）：
//   A 静水:传送至水域后静置 ~2.6s → 预期 delta 零跨度为主,avg ≈ 数十 B/帧
//   B 海浪:最长水域中点 + 键盘左右振荡 6 腿 ~3.3s → 预期 delta 有跨度且偶发
//     busy 帧全量回退,avg 仍 << 旧全量 8B/格基线（baseline = 8·gW·gH/帧）
// 判据:fmt.f32=0（量化不变式未破坏）、resyncs=0（无丢帧重锚）、
//   avgBytes < 25%·baseline（C8-D 收益下限;实测静水应 <1%）。非混沌口径:
//   位等价由 tests/ww-delta-field.test.ts 锁,本探针只管流量账+协议健康。
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, waitForBridge } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});

// 预热导航（会话首臂承担 SW 注册+资产管线首次灌库）
{
  const page = await openPage(browser, {});
  await page.goto(`${ORIGIN}/?pbust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page, { timeout: 300_000 }).catch(() => {});
  await page.close();
}

const page = await openPage(browser, {});
const warns = [];
page.on('console', (m) => {
  const t = m.text?.() ?? '';
  if (/WaveWaves|waveworker/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 200));
});
page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 200)));
await page.goto(`${ORIGIN}/?pbust=${Date.now()}`, { waitUntil: 'domcontentloaded' });   // worker 模式=缺省开（?waveworker=0 才关）
const boot = await bootstrap(page, ORIGIN);
if (!boot.ok) { console.log('bootstrap FAIL:', boot.why); process.exit(1); }
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
if (!gen.ok) { console.log('createGame FAIL:', gen.why); process.exit(1); }

// 扫最长可游横向水域（run≥12,格本体与头顶非实心）
const spot = await page.evaluate(() => {
  const g = window.__swGame; const w = g.world; const st = w.store;
  const py0 = Math.floor(g.player.y / 16);
  const tyLo = Math.max(1, py0 - 60), tyHi = Math.min(w.h - 2, py0 + 220);
  let best = null;
  for (let ty = tyLo; ty <= tyHi; ty++) {
    let run = 0;
    for (let tx = 1; tx < w.w - 1; tx++) {
      if (st.liquid[st.idx(tx, ty)] > 0 && !st.isSolid(tx, ty) && !st.isSolid(tx, ty - 1)) { run++; continue; }
      if (run >= 12 && (!best || run > best.run)) best = { run, tx: tx - ((run / 2) | 0), ty };
      run = 0;
    }
    if (run >= 12 && (!best || run > best.run)) best = { run, tx: (w.w - 1) - ((run / 2) | 0), ty };
  }
  return best;
});
if (!spot) { console.log('无可游水域(run<12)'); process.exit(1); }
const moved = await teleport(page, spot.tx * 16, spot.ty * 16 - 8);
if (!moved) { console.log('teleport FAIL'); process.exit(1); }

const readStats = () => page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => {
  const s = m.wwWorkerStats();
  const R = m.waterWaves.readGridR();
  let nonNeutral = 0;
  for (let i = 0; i < R.length; i++) if (Math.abs(R[i] - 0.5) > 0.002) nonNeutral++;
  return { ...s, gW: m.waterWaves.gridW(), gH: m.waterWaves.gridH(), nonNeutral };
}));

// ---- 场景 A:静水静置 ~2.6s ----
const settle = async () => { const until = Date.now() + 2600; while (Date.now() < until) await nextFrame(page); };
await settle();
const A0 = await readStats();
await settle();
const A1 = await readStats();

// ---- 场景 B:海浪振荡 6 腿 ~3.3s ----
const B0 = await readStats();
for (let leg = 0; leg < 6; leg++) {
  const key = leg % 2 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  const until = Date.now() + 550;
  while (Date.now() < until) await nextFrame(page);
  await page.keyboard.up(key);
}
const B1 = await readStats();

await browser.close();

const seg = (a, b) => {
  const fields = b.fields - a.fields, bytes = b.bytes - a.bytes;
  const n = a.gW * a.gH;
  const baseline = fields * n * 8;   // 旧面:每帧 f32 全量 8B/格
  return {
    fields, bytes, avgPerField: fields ? +(bytes / fields).toFixed(1) : 0,
    baselinePerField: n * 8, ratio: baseline ? +(bytes / baseline * 100).toFixed(2) + '%' : 'n/a',
    fmt: { full: b.fmt.full - a.fmt.full, delta: b.fmt.delta - a.fmt.delta, f32: b.fmt.f32 - a.fmt.f32 },
    resyncs: b.resyncs - a.resyncs, nonNeutral: b.nonNeutral, n,
  };
};
const SA = seg(A0, A1), SB = seg(B0, B1);
console.log('--- 静水场景 A（应零跨度 delta 为主） ---');
console.log(JSON.stringify(SA));
console.log('--- 海浪场景 B（活跃 delta + busy 帧全量回退） ---');
console.log(JSON.stringify(SB));
console.log('--- 判读 ---');
const bad = [];
if (SA.fmt.f32 || SB.fmt.f32) bad.push('f32 逃生被触发=量化不变式破坏');
if (SA.resyncs || SB.resyncs) bad.push('resync 请求发生=丢帧/失配');
if (SA.avgPerField >= SA.baselinePerField * 0.25) bad.push(`静水收益不足: ${SA.avgPerField}B/帧 vs 基线 ${SA.baselinePerField}B`);
if (SB.avgPerField >= SB.baselinePerField * 0.25) bad.push(`海浪收益不足: ${SB.avgPerField}B/帧 vs 基线 ${SB.baselinePerField}B`);
if (SA.fields < 60 || SB.fields < 60) bad.push('采样帧过少:' + SA.fields + '/' + SB.fields);
if (bad.length) { console.log('FAIL:', bad.join(' | ')); process.exit(1); }
console.log(`PASS: 静水 ${SA.avgPerField}B/帧（基线 ${SA.baselinePerField}B → ${(SA.avgPerField / SA.baselinePerField * 100).toFixed(2)}%）; ` +
  `海浪 ${SB.avgPerField}B/帧（基线 ${SB.baselinePerField}B → ${(SB.avgPerField / SB.baselinePerField * 100).toFixed(2)}%）; ` +
  `full/delta = ${SA.fmt.full + SB.fmt.full}/${SA.fmt.delta + SB.fmt.delta}; f32=0; resyncs=0`);
console.log('warns:', warns.length ? warns.slice(0, 8) : '无');
process.exit(0);
