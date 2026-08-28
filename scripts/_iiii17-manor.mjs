// IIIII17 探针①：abandoned manors（biggerAbandonedHouses）——全管线生成 + 大宅几何统计。
// 用法:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs scripts/_iiii17-manor.mjs
// 断言依据 = vanilla 源码静态期望（x86 无本域 rig）：
//   HouseUtils.cs:59-84 CreateRooms_BigAbandonedHouses → 房数 = 7 - Next(4) ∈ [4,7]
//   （errorWorld 臂休眠）;逐层尺寸 宽 Next(15,31)→[15,30]/高 Next(8,13)→[8,12];
//   相邻层共行链（新层 bottom 行 = 下一层 top 行,y+=3 均匀平移后保持）;
//   WorldGen.cs:17180-17191 y 探点下界钳制（lo+GetMax*10,普通=+70）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0' });
const out = await page.evaluate(async () => {
  // ★懒 memo 门（HellFortPass.hfIs1457）：必须在 import WorldGen 之前置位。
  self.process = { env: { SW_MB_1457: '1' } };
  const housesAll = [];
  const tries = [];
  self.__swHouseRooms = (ox, oy, s) => {
    housesAll.push({ ox, oy, rooms: s.split(';').map((t) => t.split(',').map(Number)) });
  };
  self.__swHouseEv = (phase, x, y) => { if (phase === 'try') tries.push([phase, x, y]); };

  const mod = await import('/src/world/gen/WorldGen.ts');
  const run = async (seed) => {
    housesAll.length = 0; tries.length = 0;
    const t0 = Date.now();
    const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 'probe' });
    return {
      seed,
      ms: Date.now() - t0,
      houses: JSON.parse(JSON.stringify(housesAll)),
      tryMinY: Math.min(...tries.map((t) => t[2])),
      tryMaxY: Math.max(...tries.map((t) => t[2])),
      chests: w.chests.length,
    };
  };
  const manor = await run('abandonedmanors');
  const ctrl = await run('sw-manor-ctl17');
  const stats = (r) => {
    const ns = r.houses.map((h) => h.rooms.length);
    const ws = r.houses.flatMap((h) => h.rooms.map((rm) => rm[2]));
    const hs = r.houses.flatMap((h) => h.rooms.map((rm) => rm[3]));
    return { nHouses: r.houses.length, nRooms: ns, widthMin: Math.min(...ws), widthMax: Math.max(...ws), heightMin: Math.min(...hs), heightMax: Math.max(...hs) };
  };
  // 共行链校验（相邻层 bottom 行 = 下层 top 行）
  const chainBreaks = (r) => {
    let breaks = 0;
    for (const h of r.houses) {
      const rooms = [...h.rooms].sort((a, b) => a[1] - b[1]);   // 升序 y=上房在前
      for (let k = 0; k + 1 < rooms.length; k++) {
        const upper = rooms[k], lower = rooms[k + 1];
        if (upper[1] + upper[3] - 1 !== lower[1]) breaks++;      // 顶房末行 ≠ 底房首行
      }
    }
    return breaks;
  };
  return { manor, ctrl, manorStats: stats(manor), ctrlStats: stats(ctrl), manorChainBreaks: chainBreaks(manor), ctrlChainBreaks: chainBreaks(ctrl) };
});
const fail = (cond, msg) => { if (!cond) errs.push('ASSERT: ' + msg); };
const M = out.manorStats, C = out.ctrlStats;
fail(M.nHouses > 0 && C.nHouses > 0, `两种子都应放置出小屋(拿到 manor=${M.nHouses} ctrl=${C.nHouses})`);
for (const h of out.manor.houses) {
  fail(h.rooms.length >= 4 && h.rooms.length <= 7, `manor 房数∈[4,7](${JSON.stringify(h.rooms.map((r) => r.length))})`);
}
fail(M.widthMin >= 15 && M.widthMax <= 30, `manor 房宽∈[15,30](got ${M.widthMin}..${M.widthMax})`);
fail(M.heightMin >= 8 && M.heightMax <= 12, `manor 房高∈[8,12](got ${M.heightMin}..${M.heightMax})`);
fail(out.manorChainBreaks === 0, `manor 共行链断裂=${out.manorChainBreaks}(期望 0)`);
for (const n of C.nRooms) fail(n >= 1 && n <= 3, `对照屋房数∈[1..3](got ${n})`);
fail(C.nRooms.every((n) => n <= 3), `对照世界不得出现 4+ 层塔屋(${C.nRooms.join(',')})`);
console.log(JSON.stringify({
  manor: { ...M, tryYRange: [out.manor.tryMinY, out.manor.tryMaxY], chests: out.manor.chests, ms: out.manor.ms },
  control: { ...C, tryYRange: [out.ctrl.tryMinY, out.ctrl.tryMaxY], ms: out.ctrl.ms },
  manorChainBreaks: out.manorChainBreaks, ctrlChainBreaks: out.ctrlChainBreaks,
}, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
await browser.close();
process.exit(errs.length ? 1 : 0);
