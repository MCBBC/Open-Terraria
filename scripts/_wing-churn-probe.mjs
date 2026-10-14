// ★wingTexSource canvas 出生回潮定谳（2026-10-14 用户 dist 实报 83/s 连窗）:
//   机制假设=键搅动(bucket 200ms×翼扑帧序 sy×v0Light)驱动 miss→分配,而池供应
//   只在 LRU 淘汰(2s 修剪门+cap24/尺寸)→供不应求=稳态出生率≈miss 率。
//   实测:装备翼(4978)+星尘染料(3529)飞行 12s,逐秒读 {calls,hits,miss,births,
//   cacheSize,poolStock} + miss 样本键维度 → 验证分配≈miss ∧ 池枯竭。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
await pump(page, 30);

await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const flow = window.__swFlow;
  // 装备:翼 4978 + 星尘染料 3529（armor[3]/dye[3]=首配饰槽+对位染料槽）
  const wings = flow.itemByVid(4978), dye = flow.itemByVid(3529);
  r.constructor;   // noop
  g.player.inv.armor[3] = { id: wings, stack: 1 };
  g.player.inv.dye[3] = { id: dye, stack: 1 };
  // 插桩:wingTexSource 包装（calls/hits/miss+键维度样本）+ createElement 出生计
  const proto = Object.getPrototypeOf(r);
  const origWTS = proto.wingTexSource;
  window.__wts = { calls: 0, hits: 0, miss: 0, births: 0, samples: [], dims: new Map() };
  proto.wingTexSource = function (img, sx, sy, sw, sh, dyeArg, tint, v0Light) {
    const w = window.__wts;
    w.calls++;
    const bucket = Math.floor(performance.now() / 200);
    const lit = !!(dyeArg && v0Light !== undefined);
    const key = `${dyeArg ? dyeArg.vid : 't'}|${tint ? tint.join(',') : ''}|${sx},${sy},${sw}x${sh}|${bucket}${lit ? '|' + v0Light.map((v) => Math.round(v * 255)).join('.') : ''}`;
    const hit = this.wingBakeCache.has(key);
    if (hit) w.hits++; else {
      w.miss++;
      if (w.samples.length < 24) w.samples.push({
        dye: dyeArg?.vid, tint: tint ? tint.join(',') : null, rect: `${sx},${sy},${sw}x${sh}`,
        bucket, lit, v0: lit ? v0Light.map((v) => Math.round(v * 255)) : null,
      });
    }
    const dk = `${dyeArg ? dyeArg.vid : 'tint'}:${sw}x${sh}:${lit ? 'lit' : ''}`;
    w.dims.set(dk, (w.dims.get(dk) || 0) + 1);
    return origWTS.call(this, img, sx, sy, sw, sh, dyeArg, tint, v0Light);
  };
  const origCE = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    const el = origCE(tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') {
      const st = new Error().stack || '';
      if (st.includes('wingTexSource')) window.__wts.births++;
    }
    return el;
  };
  // 飞行输入:按住 Space（翼扑触发面）
  g.input.keys.add('Space');
  // 起跳离地（飞行前提:空中才扑翼）
  g.player.vy = -8;
  window.__read = () => {
    const w = window.__wts;
    const r2 = window.__swGame.renderer;
    const pool = {};
    for (const [k, arr] of r2.wingBakeFree) pool[k] = arr.length;
    return {
      calls: w.calls, hits: w.hits, miss: w.miss, births: w.births,
      cacheSize: r2.wingBakeCache.size, pool,
      airborne: !window.__swGame.player.onGround,
      frame: window.__swGame.player.wingFrame ?? '?',
    };
  };
  window.__samples = () => ({ samples: window.__wts.samples, dims: [...window.__wts.dims.entries()] });
});

console.log('飞行采样 12s（每秒一行）…');
let prev = null;
const rows = [];
for (let i = 0; i < 12; i++) {
  await new Promise((r2) => setTimeout(r2, 1000));
  const s = await page.evaluate(() => window.__read());
  const d = prev ? {
    calls: s.calls - prev.calls, hits: s.hits - prev.hits, miss: s.miss - prev.miss,
    births: s.births - prev.births,
  } : { calls: 0, hits: 0, miss: 0, births: 0 };
  console.log(`t${i}: Δcalls=${d.calls} hits=${d.hits} miss=${d.miss} births=${d.births} | cache=${s.cacheSize} pool=${JSON.stringify(s.pool)} air=${s.airborne}`);
  rows.push({ i, d, s });
  prev = s;
}
const fin = await page.evaluate(() => window.__samples());
console.log('miss 样本键（前 24）:', JSON.stringify(fin.samples, null, 1).slice(0, 1800));
console.log('维度分布:', JSON.stringify(fin.dims));
await browser.close();
// ★回归闸（2026-10-14 evict-on-insert 刀的机械断言）:暖机（cache 到 48 上限）后
//   连续 ≥3 秒 births=0（供应率锁死 miss 率=稳态零分配;旧病=修剪窗不同相 5/s 流出）。
const warmIdx = rows.findIndex((r) => r.s.cacheSize >= 48);
let ok = false, detail = 'cache 未达 48（场景未暖机——检查装备/染料注入）';
if (warmIdx >= 0 && warmIdx + 3 <= rows.length) {
  const tail = rows.slice(warmIdx + 1);
  const zeroRun = tail.filter((r) => r.d.births === 0).length;
  ok = tail.length >= 3 && zeroRun === tail.length;
  detail = `暖机@t${warmIdx};尾部 ${tail.length}s 内零分配 ${zeroRun}s`;
}
console.log(ok ? 'GATE PASS（稳态零分配）' : `GATE FAIL（${detail}）`);
process.exitCode = ok ? 0 : 1;
console.log('DONE');
