// ★BJ648 住房旗帜 hover 名条迁层——清晨暗区「框带字」判别探针(BJ647 副案真凶收口)。
// 世界源 = 用户实况档(十周年纪念种子(2).wld, BJ647 v18 同款 witch_doctor 房)。
// 场景:清晨(太阳未升/刚升,旗区无直照)格光低档——旧实现名条画世界层被
// compositeLight 乘光=白字灭黑框存;迁层后名条合成后直绘=框字同现。
// 输出:/tmp/bj648-morning-label.png(全帧) + /tmp/bj648-morning-label-crop.png(名条 3× 放大)。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=300000 scripts/_bj648-banner-label-morning.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, waitForGame, ledger, nextFrame, freezeClock, clockSet } from '../tools/probe/lib/index.mjs';
import { saveCanvasShot } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);   // waitForBridge 就绪即回(标题菜单态;世界由 importWld 建)

// ---- 导入用户实况世界(十周年纪念种子) ----
const b64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor' && n.home));
  }).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 2500);

// ---- 旗几何(houseBannerGeom 同式;v18 钉锚防走位)。★选深屋 NPC:巫医房=地表
//      薄壳房(v1 探针实拍:午夜旗区光恒 253=天光/玩家光源漏光),暗档判别失真;
//      深屋(home.y > groundLevel+60)无天光,清火把后必暗。 ----
const geom = await page.evaluate(async () => {
  const g = window.__swGame;
  const { findBannerAnchorY } = await import('/src/world/Housing.ts');
  const gl = g.world.groundLevel ?? g.world.level?.ground ?? 300;
  const homes = (g.entities.npcs ?? []).filter((n) => !n.dead && !n.bound && n.home && n.npcKey !== 'old_man');
  const deep = homes.filter((n) => n.home.y > gl + 60);
  const pick = (deep.length ? deep : homes)[0];
  const n = pick;
  if (!n) return null;
  const cy = findBannerAnchorY(g.world.store, n.home.x, n.home.y);
  if (cy === null) return { err: `no-anchor ${n.npcKey} home=${JSON.stringify(n.home)}` };
  const onPlatform = false;
  window.__bj648npc = n.npcKey;
  window.__bj648pin = setInterval(() => {
    const n2 = (window.__swGame.entities.npcs ?? []).find((x) => x.npcKey === window.__bj648npc);
    if (n2) { n2.vx = 0; n2.vy = 0; }
  }, 150);
  return { key: n.npcKey, name: n.givenName, bx: n.home.x * 16 + 8, by: (cy + 1) * 16 + (onPlatform ? 10 : 18), w: 34, h: 46, home: n.home, cy, gl, deepN: deep.length };
});
L.chk('旗几何', !!geom && !geom.err, JSON.stringify(geom));
if (!geom || geom.err) { L.print(); process.exit(L.exitCode()); }

// ---- 清旗区火把(v18 习语扩窗:home.x±8, cy-3..cy+12 tile 4 → setTileSilent 0;
//      火把室内光会让暗档判别失真——v1 探针 lightAt 恒 [253,240,202] 暖白=火把光色) ----
const torchCt = await page.evaluate((g0) => {
  const g = window.__swGame;
  const st = g.world.store;
  let n = 0;
  for (let y = g0.cy - 3; y <= g0.cy + 12; y++) for (let x = g0.home.x - 8; x <= g0.home.x + 8; x++) {
    const i = st.idx(x, y);
    if (st.type[i] === 4) { st.setTileSilent(x, y, 0); n++; }
  }
  return n;
}, geom);
await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 900);
L.chk('清旗区火把', true, `cleared=${torchCt}`);

// ---- 清晨暗档锚:tod 自 0.21(5:02)向下扫至 0.16(3:50 夜),取样行 =
//      houseBannerLightRow(cy)(=Renderer 旗布同款:实心天花板下一行空气,cy 行
//      本身是实心天花板,直读恒满光=BJ648 探针 v1 伪影)。<150 即清晨无直照。----
// houseBannerLightRow(Housing.ts:150)=anchorY+1,内联(探针侧 node 直 import ts 相对链不可达)
const bannerRow = geom.cy + 1;
let morning = null;
for (let tod = 0.21; tod >= 0.16; tod -= 0.005) {
  // ★clockSet(不冻结)——freezeClock 会把 clock.tick 换 no-op,昼夜平滑因子随 tick
  //  一并冻死在导入时刻(白天)→ lightAt 恒 [253,240,202](BJ648 探针 v2 伪影,
  //  BJ325「渲染昼夜与世界钟两口径」同族)。clockSet 后 tick 继续,昼夜因子秒级
  //  收敛到新钟面;钟面漂移率≈0.0007/s,2.5s 窗内可忽略。
  await clockSet(page, tod);
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 2500);   // 昼夜平滑因子惯性收敛
  await nextFrame(page); await nextFrame(page);
  const probe = await page.evaluate((g0) => {
    const g = window.__swGame;
    const lt = g.renderer.lighting?.lightAt(g0.home.x, g0.row) ?? null;
    const ltc = g.renderer.lighting?.lightAt(g0.home.x, g0.cy) ?? null;   // 对照:实心行
    return { lt, ltc, tod: g0.tod };
  }, { home: geom.home, row: bannerRow, cy: geom.cy, tod });
  L.chk(`暗档扫描 tod=${tod.toFixed(4)} row=${bannerRow}`, true, `air=${JSON.stringify(probe.lt)} solidRow=${JSON.stringify(probe.ltc)}`);
  if (probe.lt && probe.lt[0] < 150 && probe.lt[1] < 150 && probe.lt[2] < 150) {
    await freezeClock(page, { tod });   // 命中暗档→定格拍摄窗(钟面+昼夜因子同停)
    morning = probe;
    break;
  }
}
L.chk('清晨暗档成立(lightAt<150 三通道)', !!morning, JSON.stringify(morning));
if (!morning) { L.print(); process.exit(L.exitCode()); }

// ---- 相机钉旗(zoom 1.24=v18 用户视野档)。玩家站 NPC 处(相机跟随目标=钉位,
//      收敛不撕;热栏首排已清=玩家无手持光源,旗区不被抬亮) ----
await page.evaluate((r) => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === r.key);
  if (n) { g.player.x = n.x; g.player.y = n.y - 40; }
  g.player.vx = 0; g.player.vy = 0;
  try {
    const inv = g.player.inventory;
    for (let i = 0; i < 10 && i < inv.length; i++) inv[i] = null;   // 手持光源面清空
  } catch { /* 探针环境尽力清 */ }
  g.camera.zoom = 1.24; g.camera.zoomTarget = 1.24;
  g.camera.x = r.bx; g.camera.y = r.by;
}, geom);
await nextFrame(page);
for (let i = 0; i < 20; i++) {
  const stable = await page.evaluate(() => {
    const c = window.__swGame.camera;
    const px = window.__bj648cam ?? null;
    window.__bj648cam = { x: c.x, y: c.y };
    return px && Math.abs(px.x - c.x) < 0.05 && Math.abs(px.y - c.y) < 0.05;
  });
  await nextFrame(page);
  if (stable && i > 2) break;
}

// ---- 帧 A:不悬停(鼠标角落)——名条区基线快照 ----
await page.mouse.move(2, 2);
await nextFrame(page); await nextFrame(page);
await page.evaluate(() => { window.__bj648snapA = (() => {
  const cv = window.__swGame.renderer.canvas;
  const oc = document.createElement('canvas');
  oc.width = cv.width; oc.height = cv.height;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  octx.drawImage(cv, 0, 0);
  return octx.getImageData(0, 0, cv.width, cv.height);
})(); });
await saveCanvasShot(page, '/tmp/bj648-morning-nohover.png');

// ---- 帧 B:真实鼠标悬停旗中心 → 名条现 ----
const ptA = await page.evaluate((r) => {
  const cv = window.__swGame.renderer.canvas;
  const sc = cv.clientWidth / cv.width;
  const [sx, sy] = window.__swGame.camera.worldToScreen(r.bx, r.by);
  return { cssX: Math.round(sx * sc), cssY: Math.round(sy * sc) };
}, geom);
await page.mouse.move(ptA.cssX, ptA.cssY);
await nextFrame(page); await nextFrame(page);

// ---- 名条矩形像素账(屏空间:框顶=旗顶屏-20,框 15px 高;±60px 宽容差带) ----
const acct = await page.evaluate((r) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const oc = document.createElement('canvas');
  oc.width = cv.width; oc.height = cv.height;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  octx.drawImage(cv, 0, 0);
  const img = octx.getImageData(0, 0, cv.width, cv.height).data;
  const sc = cv.clientWidth / cv.width;
  const [topX, topY] = g.camera.worldToScreen(r.bx, r.by - r.h / 2 - 20);
  const x0 = Math.max(0, Math.floor((topX - 60) * sc)), x1 = Math.min(cv.width - 1, Math.ceil((topX + 60) * sc));
  const y0 = Math.max(0, Math.floor((topY - 2) * sc)), y1 = Math.min(cv.height - 1, Math.ceil((topY + 17) * sc));
  let n = 0, bright = 0, dark = 0, changedVsA = 0;
  const A = window.__bj648snapA.data;
  let sr = 0, sg = 0, sb = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * cv.width + x) * 4;
    n++; sr += img[i]; sg += img[i + 1]; sb += img[i + 2];
    if (img[i] > 200 && img[i + 1] > 200 && img[i + 2] > 200) bright++;                 // 白字像素
    if (img[i] + img[i + 1] + img[i + 2] < 130) dark++;                                 // 黑框像素
    const df = Math.abs(A[i] - img[i]) + Math.abs(A[i + 1] - img[i + 1]) + Math.abs(A[i + 2] - img[i + 2]);
    if (df > 36) changedVsA++;
  }
  const mx = g.renderer._mouseX, my = g.renderer._mouseY;
  return { rect: [x0, y0, x1, y1], n, bright, dark, changedVsA,
    avg: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)], mx, my };
}, geom);
L.chk('名条框暗底存在(dark>30)', acct.dark > 30, JSON.stringify({ dark: acct.dark, n: acct.n }));
L.chk('名条白字可见(bright>15)——BJ648 核心判别:清晨暗档下框带字', acct.bright > 15,
  JSON.stringify({ bright: acct.bright, avg: acct.avg, changedVsA: acct.changedVsA, mouse: [acct.mx, acct.my] }));

await saveCanvasShot(page, '/tmp/bj648-morning-label.png');
await page.evaluate((r) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const oc = document.createElement('canvas');
  const sc = cv.clientWidth / cv.width;
  const [topX, topY] = g.camera.worldToScreen(r.bx, r.by - r.h / 2 - 20);
  const w = 130 * sc, h = 40 * sc;
  oc.width = Math.round(w * 3); oc.height = Math.round(h * 3);
  const octx = oc.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(cv, Math.round(topX * sc - w / 2), Math.round(topY * sc - 6), Math.round(w), Math.round(h), 0, 0, oc.width, oc.height);
  window.__bj648crop = oc.toDataURL('image/png');
}, geom);
const crop = await page.evaluate(() => window.__bj648crop);
await import('node:fs').then((fs) => fs.default.writeFileSync('/tmp/bj648-morning-label-crop.png', Buffer.from(crop.split(',')[1], 'base64')));

console.log('BJ648 探针账:', JSON.stringify({ acct, morning, npc: geom.key }, null, 1));
L.print();
process.exit(L.exitCode());
