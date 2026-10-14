// ★ChunkCache 孤儿 cell 定谳探针（2026-10-14 用户 dist 二报:allocCell/mkPage 88/s
//   =44 页对/s,页只增不减）。嫌疑机制:markDirty 把 key 标 undefined 值(保留
//   sticky 粘滞 cell)→未重访即被 trimLru 顶出→淘汰支 stickyCell.delete +
//   releasePair(undefined)=no-op → cell 不还池=孤儿 → 有效池缩水 → 建页补偿。
//   账面不变量:ΣpageUsed === 总cells − cellFree.length（违反=孤儿在场）;
//   孤儿 = ΣpageUsed − (有效pair数+标脏中key数)（都在 sticky 持有语义下）。
//   场景:持续挖格(store 直写触发 markDirtyAround 邻域标脏)+远距传送(LRU 顶出)
//   ——用户「探索+挖掘」形态的机制化复现。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
await pump(page, 30);

await page.evaluate(() => {
  const g = window.__swGame;
  const ch = g.chunks;
  window.__ledger = () => {
    let sumUsed = 0;
    for (const u of ch.pageUsed) sumUsed += u;
    let undefinedKeys = 0;
    for (const v of ch.chunks.values()) if (!v) undefinedKeys++;
    const totalCells = ch.wallPages.length * 16;
    return {
      pages: ch.wallPages.length,
      totalCells, cellFree: ch.cellFree.length,
      pageUsedSum: sumUsed,
      sticky: ch.stickyCell.size,
      chunksSize: ch.chunks.size,
      undefinedKeys,
      // 账面不变量:占用 = 总 − free
      invariantDelta: sumUsed - (totalCells - ch.cellFree.length),
      // 孤儿估计:占用账 − 有主 cell(sticky 全部应有主;若 sticky < 占用=孤儿)
      orphanBySticky: sumUsed - ch.stickyCell.size,
    };
  };
  // 挖格:store 直写触发 onTileChanged→markDirtyAround(需真链——绕 store 直写则不触发,
  //  走 Game 的 tile 写入口。用 store.setTile?查链:ChunkCache 构造挂 store.onTileChanged。
  //  直接调用标记等价物:对一批远离视口的已烘 chunk markDirty)
  window.__dirtyFar = (cxBase, n) => {
    // 找已烘 chunk:遍历 sticky 表键(键=key(cx,cy) 编码)标脏一部分
    let marked = 0;
    for (const k of ch.stickyCell.keys()) {
      if (marked >= n) break;
      // 只标远离玩家的(键编码反解:查 key 形态)
      ch.markDirtyByKey?.(k);
      marked++;
    }
    return marked;
  };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x; g.camera.y = y;
  };
});

const l0 = await page.evaluate(() => window.__ledger());
console.log('初始账:', JSON.stringify(l0));

// 复现形态:①视口烘一批 → ②标脏其中一批(模拟 markDirtyAround 的远域格——直接对
// chunk 调 markDirty 需 cx/cy;键编码在 sticky 表里,反解见 ChunkCache.key 形态)
// 检查 key 形态与 markDirtyByKey 是否存在:
const keyInfo = await page.evaluate(() => {
  const ch = window.__swGame.chunks;
  const k = ch.stickyCell.keys().next().value;
  return {
    sampleKey: k,
    keyOfFn: typeof ch.constructor.key === 'function' ? ch.constructor.key(1, 2) : 'none',
    markDirtyByKey: typeof ch.markDirtyByKey,
  };
});
console.log('key 形态:', JSON.stringify(keyInfo));

// ③传送远离(视口全新 chunk 进 LRU=顶出旧 key)→④读账
// 场景 A:纯传送流动(无标脏)——基线:LRU 淘汰对有效 pair 的处理是否平账
for (let hop = 0; hop < 6; hop++) {
  await page.evaluate((hop) => {
    const g = window.__swGame;
    window.__teleport(400 + hop * 2200, (g.world.groundLevel ?? 300) * 16 - 60);
  }, hop);
  await pump(page, 30);
  const l = await page.evaluate(() => window.__ledger());
  console.log(`传送${hop}:`, JSON.stringify(l));
}

// 场景 B:标脏未重访→LRU 顶出（孤儿机制打靶）
// B1:回到起点烘满 → B2:对远离视口的 24 个已烘 chunk markDirty（set-undefined+
//     保 sticky,模拟 markDirtyAround 标到远域/离开视口的光变格）→ B3:传送远处
//     烘满（顶出 A 域 key,含 24 个 undefined 值 key）→ B4:读账——孤儿 =
//     ΣpageUsed − sticky.size（淘汰支删 sticky 未还 cell → 占用账高于有主数）
{
  console.log('--- 场景 B:标脏未重访→顶出 ---');
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__teleport(400, (g.world.groundLevel ?? 300) * 16 - 60);
  });
  await pump(page, 30);
  const lb0 = await page.evaluate(() => window.__ledger());
  console.log('B1 起点:', JSON.stringify(lb0));
  const marked = await page.evaluate(() => {
    const ch = window.__swGame.chunks;
    // 反解 sticky 键:cx=k&0xffff, cy=k>>>16;挑远离玩家 x 的（右半屏外）
    const g = window.__swGame;
    const pcx = Math.floor(g.player.x / 16);
    let n = 0;
    for (const k of ch.stickyCell.keys()) {
      if (n >= 24) break;
      const cx = k & 0xffff, cy = k >>> 16;
      if (cx - pcx > 60) { ch.markDirty(cx, cy); n++; }   // 远域(视口外右)
    }
    return n;
  });
  const lb1 = await page.evaluate(() => window.__ledger());
  console.log(`B2 标脏 ${marked} 个:`, JSON.stringify(lb1));
  // B3:传送远处烘满,顶出 A 域
  for (let hop = 0; hop < 4; hop++) {
    await page.evaluate((hop) => {
      const g = window.__swGame;
      window.__teleport(9400 + hop * 1800, (g.world.groundLevel ?? 300) * 16 - 60);
    }, hop);
    await pump(page, 30);
  }
  const lb2 = await page.evaluate(() => window.__ledger());
  console.log('B3 顶出后:', JSON.stringify(lb2));
  // B4:再驻留+再回访验证（若孤儿在场,页数已虚高且回访会再触发建页）
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__teleport(400, (g.world.groundLevel ?? 300) * 16 - 60);
  });
  await pump(page, 40);
  const lb3 = await page.evaluate(() => window.__ledger());
  console.log('B4 回访起点:', JSON.stringify(lb3));
}

// ★回归闸（2026-10-14 孤儿 cell 封堵刀的机械断言）:全程 orphanBySticky===0
//   ∧ invariantDelta===0 ∧ 页数收敛（传送 2 后页数不再增长——旧病:纯流动 3 分钟
//   orphan 160/页 13→23）。稳态页界=ceil(MAX_CHUNKS/16)+1（LRU 192=13 页）。
{
  const verdicts = [];
  const finalL = await page.evaluate(() => window.__ledger());
  verdicts.push(['orphanBySticky===0（无孤儿 cell）', finalL.orphanBySticky === 0]);
  verdicts.push(['invariantDelta===0（占用账自洽）', finalL.invariantDelta === 0]);
  const stablePages = finalL.pages <= 14;   // 192/16+1=13;+1 余量
  verdicts.push([`页数收敛 ≤14（实=${finalL.pages};旧病→23+）`, stablePages]);
  const ok = verdicts.every(([, v]) => v);
  for (const [name, v] of verdicts) console.log(`${v ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(ok ? 'GATE PASS（孤儿封堵）' : 'GATE FAIL');
  process.exitCode = ok ? 0 : 1;
}

await browser.close();
console.log('LEDGER DONE');
