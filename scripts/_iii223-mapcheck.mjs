// ★IIIII223 探针②（F-2/F-3 地图色三路径清偿验收）：普通种子世界,测试区手工置格
// （零掷流耦合——setTileSilent/setWallSilent 直写,不泵 fixedUpdate）：
//   F-2 玻璃族墙 wallLookup=0 落穿（21 玻璃/88 染色/318 回声+漆面无效;对照墙 1 石墙照画;
//        负断言：WALL_DEFS[].mapColor 旧兜底色不得再现）
//   F-3 GetTileType 残余臂（Terraria.Map/MapHelper.cs:1949-1964）：
//        ① 51/697 蛛网 (x+y)%2 棋盘半隐 ② 19 平台 frameY==864 底柱格
//        ③ 184 长苔 frameX/22==10 → 627 苔色九档 option=(x+y)%9（漆照吃）
//   三路径同格对拍：预览 mapColor24 ↔ 游戏内增量 colorFor ↔ 全量重建 fillBand(p32 直读)。
//   期望值从 vanilla-mapcolors.json 原始表独立重导（不经本仓 wrapper）。
// 运行：SW_ORIGIN=http://localhost:5279 node tools/run-diag.mjs --timeout=900000 scripts/_iii223-mapcheck.mjs
// 产物：/tmp/iii223-out/map-report.json + map-fillband-region.png + map-preview-region.png
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5279';
const OUT = '/tmp/iii223-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });

await page.evaluate((cfg) => { void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {}); },
  { seed: '22114455', size: 0, name: 'iii223m', difficulty: 0, evil: 0 });
const t1 = Date.now();
while (Date.now() - t1 < 300000) {
  const st = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (st) break;
  await new Promise((r) => setTimeout(r, 500));
}
await page.waitForFunction(() => !!globalThis.__swGame?.renderer?.minimap, { timeout: 120000 });

const report = await page.evaluate(async (bust) => {
  const { mapColor24 } = await import(`/src/render/MapColors.ts?t=${bust}`);
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
  const DOC = (await import(`/src/data/vanilla-mapcolors.json?import`)).default;   // 静态数据,免 bust
  const g = globalThis.__swGame;
  const world = g.world, st = world.store, mm = g.renderer.minimap;
  const bySheet = (sheet) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  const idWeb = bySheet(51), idWebFake = bySheet(697), idPlat = bySheet(19), idMoss = bySheet(184);
  const bgCtx = { groundLevel: world.groundLevel, rockLevel: world.rockLevel, underworld: world.lavaLine > 0 ? world.lavaLine : undefined, remix: !!world.seedFlags?.remix };
  // 独立期望：JSON 原表直读 + 天空渐变重导（MapHelper CalcSkyGradient :2067）
  const skyLerp = (y) => {
    const t = Math.max(0, Math.min(1, world.groundLevel > 0 ? y / world.groundLevel : 0));
    const { from, to } = DOC.sky;
    return [Math.round(from[0] + (to[0] - from[0]) * t), Math.round(from[1] + (to[1] - from[1]) * t), Math.round(from[2] + (to[2] - from[2]) * t)];
  };
  const pack = (c) => (c[0] << 16) | (c[1] << 8) | c[2];
  const rgbOf = (v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const P5 = [0, 255, 0];   // 漆 5（WorldGen.paintColor :44317）
  const paintMul = (base) => {  // MapColor :1855-1857 max 通道 × (byte) 截断
    const n = Math.max(base[0], base[1], base[2]) / 255;
    return [Math.trunc(P5[0] * n), Math.trunc(P5[1] * n), Math.trunc(P5[2] * n)];
  };

  // ── 测试区布置（地表上空 y 行,先整格清零防撞）──
  const bx = Math.floor(world.w / 2) - 4, by = 30;
  const cells = [];
  const add = (dx, dy, kind, expect, wallId = 0) => cells.push({ x: bx + dx, y: by + dy, kind, expect, wallId });
  // F-2 墙族（tile/liquid 全空）
  st.setTileSilent(bx + 0, by, 0); st.setWallSilent(bx + 0, by, 21); st.paintWall[st.idx(bx + 0, by)] = 5;   // 玻璃墙+漆
  st.setTileSilent(bx + 1, by, 0); st.setWallSilent(bx + 1, by, 88);                                          // 紫染色玻璃
  st.setTileSilent(bx + 2, by, 0); st.setWallSilent(bx + 2, by, 318);                                         // 回声墙
  st.setTileSilent(bx + 3, by, 0); st.setWallSilent(bx + 3, by, 1);                                           // 对照：石墙
  add(0, 0, 'wall21painted', { bg: true, notDef: '#365962' }, 21);
  add(1, 0, 'wall88', { bg: true }, 88);
  add(2, 0, 'wall318', { bg: true }, 318);
  add(3, 0, 'wall1control', { rgb: DOC.walls['1'][0] }, 1);
  // F-3① 蛛网（同格清墙）
  for (let dx = 0; dx < 4; dx++) st.setWallSilent(bx + dx, by + 1, 0);
  if (idWeb > 0) { st.setTileSilent(bx + 0, by + 1, idWeb); st.setTileSilent(bx + 1, by + 1, idWeb); }
  if (idWebFake > 0) { st.setTileSilent(bx + 2, by + 1, idWebFake); st.setTileSilent(bx + 3, by + 1, idWebFake); }
  // ★期望按绝对 (x+y)%2 判（首跑按 dx 标注曾自差一 parity=伪红探针 bug）
  const webExp = (dx, rgb) => ((bx + dx + by + 1) % 2 === 0) ? { bg: true } : { rgb };
  if (idWeb > 0) { add(0, 1, 'webParity0', webExp(0, DOC.tiles['51'][0])); add(1, 1, 'webParity1', webExp(1, DOC.tiles['51'][0])); }
  if (idWebFake > 0) { add(2, 1, 'webFakeParity0', webExp(2, DOC.tiles['697'][0])); add(3, 1, 'webFakeParity1', webExp(3, DOC.tiles['697'][0])); }
  // F-3② 平台
  st.setTileSilent(bx + 0, by + 2, idPlat, 0, 864);   // 底柱格
  st.setTileSilent(bx + 1, by + 2, idPlat, 0, 0);     // 平台面
  add(0, 2, 'plat864', { bg: true, notRgb: [0, 0, 0] });
  add(1, 2, 'platFace', { rgb: DOC.tiles['19'][0] });
  // F-3③ 长苔 → 627 九档
  st.setTileSilent(bx + 0, by + 3, idMoss, 220, 0);            // (x+y) 偶 → option 0
  st.setTileSilent(bx + 1, by + 3, idMoss, 220, 0);            // option 1
  st.setTileSilent(bx + 2, by + 3, idMoss, 0, 0);              // 变体 0 → 184 本色
  st.paint[st.idx(bx + 3, by + 3)] = 5; st.setTileSilent(bx + 3, by + 3, idMoss, 220, 0);   // disco 苔+漆 5
  add(0, 3, 'mossVar10opt0', { rgb: DOC.tiles['627'][(bx + 0 + by + 3) % 9] });
  add(1, 3, 'mossVar10opt1', { rgb: DOC.tiles['627'][(bx + 1 + by + 3) % 9] });
  add(2, 3, 'mossVar0', { rgb: DOC.tiles['184'][0] });
  add(3, 3, 'mossVar10Painted', { rgb: paintMul(DOC.tiles['627'][(bx + 3 + by + 3) % 9]) });

  // ── 路径 1：预览 mapColor24；路径 2：增量 colorFor ──
  const hex24 = (v) => '#' + v.toString(16).padStart(6, '0');
  const rows = [];
  for (const c of cells) {
    const exp = c.expect.bg ? skyLerp(c.y) : c.expect.rgb;
    const got24 = mapColor24(st, c.x, c.y, bgCtx);
    const gotCf = mm.colorFor(c.x, c.y);
    const gotCf24 = gotCf ? parseInt(gotCf.slice(1), 16) : -1;
    rows.push({
      kind: c.kind, x: c.x, y: c.y, expect: exp, got24: rgbOf(got24), gotColorFor: rgbOf(gotCf24),
      ok24: pack(rgbOf(got24)) === pack(exp),
      okCf: pack(rgbOf(gotCf24)) === pack(exp),
      notDefOk: !c.expect.notDef || hex24(got24).toUpperCase() !== c.expect.notDef.toUpperCase(),
      notRgbOk: !c.expect.notRgb || pack(rgbOf(got24)) !== pack(c.expect.notRgb),
    });
  }
  // ── 路径 3：全量重建 fillBand（p32 直读,ABGR→RGB）──
  mm.redrawAll();
  const abgr = (i) => mm.p32[st.idx(cells[i].x, cells[i].y)];
  for (let k = 0; k < cells.length; k++) {
    const v = abgr(k);
    const rgb = [(v & 255), (v >>> 8) & 255, (v >>> 16) & 255];
    rows[k].gotFillBand = rgb;
    rows[k].okFb = (rgb[0] << 16 | rgb[1] << 8 | rgb[2]) === pack(rows[k].expect);
  }
  // ── 区域截图（fillBand pix 与预览 mapColor24 各一张,8×6 放大）──
  const shotOf = (rgbAt) => {
    const cv = document.createElement('canvas');
    cv.width = 4 * 8; cv.height = 4 * 8;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(4, 4);
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const c = cells[dy * 4 + dx] ?? cells[0];
      const [r, gg, b] = rgbAt(c);
      const o = (dy * 4 + dx) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const up = document.createElement('canvas'); up.width = 32 * 8; up.height = 32 * 8;
    const uc = up.getContext('2d'); uc.imageSmoothingEnabled = false;
    uc.drawImage(cv, 0, 0, 4, 4, 0, 0, 32 * 8, 32 * 8);
    return up.toDataURL('image/png');
  };
  const shotFill = shotOf((c) => { const v = mm.p32[st.idx(c.x, c.y)]; return [(v & 255), (v >>> 8) & 255, (v >>> 16) & 255]; });
  const shotPrev = shotOf((c) => rgbOf(mapColor24(st, c.x, c.y, bgCtx)));

  const fail = rows.filter((r) => !(r.ok24 && r.okCf && r.okFb && r.notDefOk !== false && r.notRgbOk !== false));
  return {
    world: { w: world.w, h: world.h, groundLevel: world.groundLevel, remix: !!world.seedFlags?.remix },
    cells: rows, failCount: fail.length,
    shotFill, shotPrev,
    ids: { web: idWeb, webFake: idWebFake, plat: idPlat, moss: idMoss },
  };
}, Date.now());

writeFileSync(`${OUT}/map-report.json`, JSON.stringify({ ...report, shotFill: undefined, shotPrev: undefined }, null, 2));
writeFileSync(`${OUT}/map-fillband-region.png`, Buffer.from(report.shotFill.split(',')[1], 'base64'));
writeFileSync(`${OUT}/map-preview-region.png`, Buffer.from(report.shotPrev.split(',')[1], 'base64'));
for (const r of report.cells) {
  const ok = r.ok24 && r.okCf && r.okFb && r.notDefOk !== false && r.notRgbOk !== false;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.kind}  expect=${JSON.stringify(r.expect.rgb ?? r.expect)}  p24=${JSON.stringify(r.got24)} cf=${JSON.stringify(r.gotColorFor)} fb=${JSON.stringify(r.gotFillBand)}`);
}
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 10).join('\n'));
console.log(report.failCount === 0 ? '\nALL PASS' : `\n${report.failCount} FAILED`);
await browser.close();
process.exit(report.failCount === 0 && errs.length === 0 ? 0 : 1);
