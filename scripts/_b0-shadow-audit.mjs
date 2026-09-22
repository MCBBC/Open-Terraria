// ★B0 世界层 API 谱普查探针（2026-09-22;渲染改造方案 §三 B0 一段交付件）
//
// 目的：实测世界层（瓦片/实体/液体/尘）绘制路径的 2D API 谱（直映射档 vs 兜底档）,
// 产出 shim 覆盖率报告 = B1+B2 世界层翻面战役立项定谳依据。
// 机制：游戏侧 ?b0shadow=1 → Renderer.beginWorldLayer 把 worldCtxLayer 包装为
//   GLShimCensus Proxy（逐调用分类计数,世界层 span=一个 census 帧）;本探针
//   pump 后读 window.__swGLShim.snapshot() 聚合。
// 场景：出生点地表（land）+ 东移 1200px（ocean-ish,不同 tile/液体混合）。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=420000 scripts/_b0-shadow-audit.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const L = ledger();
const browser = await launchBrowser({});
const out = { origin: ORIGIN, scenes: {} };

async function censusScene(name, setup) {
  const page = await openPage(browser, {});
  try {
    // 旗标进 origin 本体（gotoApp 自身导航结构携带;★openPage 首跳若落无旗 URL,
    //   模块求值期 b0Shadow 静态旗恒假——land 场景实测踩坑）
    await page.goto(`${ORIGIN}/?b0shadow=1`, { waitUntil: 'domcontentloaded' });
    await bootstrap(page, `${ORIGIN}/?b0shadow=1`);
    await createGame(page);
    if (setup) await setup(page);
    await pump(page, 240);   // census 窗
    const snap = await page.evaluate(() => {
      const s = globalThis.__swGLShim?.snapshot?.();
      if (!s) return null;
      const agg = { frames: s.frames.length, direct: {}, fallback: {}, gco: {}, maxStackDepth: 0 };
      let dTotal = 0, fTotal = 0;
      for (const f of s.frames) {
        for (const [k, v] of Object.entries(f.direct)) { agg.direct[k] = (agg.direct[k] || 0) + v; dTotal += v; }
        for (const [k, v] of Object.entries(f.fallback)) { agg.fallback[k] = (agg.fallback[k] || 0) + v; fTotal += v; }
        for (const [k, v] of Object.entries(f.gco)) agg.gco[k] = (agg.gco[k] || 0) + v;
        agg.maxStackDepth = Math.max(agg.maxStackDepth, f.maxStackDepth);
      }
      return {
        ...agg, dTotal, fTotal,
        coverage: dTotal + fTotal ? (100 * dTotal / (dTotal + fTotal)).toFixed(2) + '%' : 'n/a',
        rareSamples: s.rareSamples,
      };
    });
    out.scenes[name] = snap;
    if (snap) {
      console.log(`[${name}] 覆盖率 ${snap.coverage}  direct=${snap.dTotal}  fallback=${snap.fTotal}  栈深峰=${snap.maxStackDepth}`);
      console.log(`  兜底面: ${JSON.stringify(snap.fallback)}`);
      console.log(`  gCO 谱: ${JSON.stringify(snap.gco)}`);
      if (snap.rareSamples.length) console.log(`  稀有面样本: ${snap.rareSamples.join(', ')}`);
    } else {
      const q = await page.evaluate(() => location.search);
      console.log(`[${name}] ⚠ __swGLShim 不在位——location.search=${q}`);
      L.chk('b0shim-missing:' + name, false, q);
    }
  } finally {
    await page.close();
  }
}

await censusScene('land', null);
await censusScene('east', async (page) => {
  await page.evaluate(() => {
    const g = globalThis.__swGame ?? globalThis.__game;
    if (g?.player) { g.player.x += 1200 * 16; g.camX = g.player.x; }   // 相机随迁(粗口径)
  });
});

writeFileSync('/tmp/probe-out/b0-shadow-audit.json', JSON.stringify(out, null, 2));
console.log('报告=/tmp/probe-out/b0-shadow-audit.json');
await browser.close();
L.report();
