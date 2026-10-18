// 清偿刀 P3 实机探针 v3（2026-09-30;SW_ORIGIN 私有端口纪律 5430）——四件实机验证：
//   面 A（P3-F3/F4）1020 尾迹 fade 序+四通道曲线：★合成环夹具（直线上 20 槽、间距
//         6px、rot=0、机身在屏 (480,300)）+【同 evaluate 内 d.draw() 手动直绘】——
//         确定性无竞态（v1 教训：translate→evaluate 往返间数十 tick 竞态=全零长段
//         整带跳过空采;v2 教训：实飞路径机身贴图遮挡近端段+背景逐段漂移）。
//         判读：段 i fade=Remap(20−i,0,20,1,0)=i/20（机身端 i=19 最亮 0.95→尾端 0.05）,
//         绿带 Σ(g−b)（阈 15）在 i=10..17（避开本体遮挡 x≥wx+27 与阈下段）单调递增
//         向机身;红染白带 Σ(r−g) 同式。旧码 remap(i) 变异面=近端最暗（判据反向）。
//   面 B（P3-F7）染料 facing 契约：渐变染 1031（ArmorColoredGradient）vx=−1/+1 两拍
//         手动直绘逐段带色对拍——vanilla 渐变 pass 字节码不声明 uDirection
//         （fxPixelShader.json 仅 ArmorDev 声明,原版染料表零 ArmorDev 条目）⇒
//         左右输出本就同相=原版 parity;facing 透传=契约面（单测锁）。
//   面 C（P3-F1）爱心门普通世界面：spawn 245（石巨人）canDisplayBuffs=true（SetDefaults
//         :8519 复位/字段缺省;getGoodAdjustments 只在 FTW）→ lovestruckT=60 →
//         60t 内 gore 331 计数>0（旧 vid 硬拒误杀面=C1 翻案实证）。
//   面 D（P3-F1）FTW 世界面：quitToMenu（旧 Game destroy 含 bindScaleStatsWorld(null)
//         :8207——v2 教训：在局直开新世界=旧实例延迟 destroy 解绑新世界绑定）→
//         createGame('fortheworthy') → getGoodAdjustments（:18040-18052 ⊂ Main.
//         getGoodWorld 门 :17875-17878）→ 245 canDisplayBuffs=false → 零 331。
import { REPO_ROOT } from './_pathlib.mjs';
import { appendFileSync } from 'node:fs';
const STEPLOG = '/tmp/p3-drone-heart-progress.log';
const step = (m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; try { appendFileSync(STEPLOG, l + '\n'); } catch {} console.log(l); };
import { launchBrowser, openPage, bootstrap, createGame, pump, godMode, screenshot } from '../tools/probe/lib/index.mjs';
import { giveItems, spawnEnemy, clearEnemies } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5430';
const OUT = (n) => `${REPO_ROOT}/docs/evidence/p3-drone-heart/${n}`;
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 240)); });
await page.goto(`${ORIGIN}/?wfbo=0`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 8000));
await bootstrap(page, `${ORIGIN}/?wfbo=0`, { clean: false });
step('step: bootstrapped');
await createGame(page, { seed: 'p3normal', size: 'small', log: (m) => console.log('[createGame]', m) });
step('step: world ready (normal)');
await pump(page, 10);
await godMode(page, true);

// ---- 合成环 + 手动直绘 + 逐段采样（★单 evaluate 原子）----
// ring[i].x = wx−6+(19−i)·6（i=19=机身位=最新;i=0=最旧=右端）;rotRing=0;vy=0。
// 段 i 带 rect=6×4 横向,y∈[wy,wy+4],x=midx±10（offset (±10,2) rot=0）;midx=wx+3+(19−i)·6。
// ★v3 教训：d.draw 手动直绘必须自带世界层相机变换（实帧内 ctx 被相机 transform 覆写,
// 裸调=画在世界像素原坐标 34000+ 全出画=空采伪影）——worldToScreen 逆推 setTransform。
const synthDrawSample = (dyeVid) => page.evaluate((dyeVid) => {
  const g = window.__swGame;
  const d = (g.entities.projectiles || []).find((p) => p.projId === 1020 && !p.dead);
  if (!d) return { ok: false, why: 'no-drone' };
  const [wx, wy] = g.camera.screenToWorld(400, 260);
  const ring = [];
  for (let i = 0; i < 20; i++) ring.push({ x: wx - d.w / 2 + (19 - i) * 6, y: wy - d.h / 2 });
  d.posRing = ring;
  d.rotRing = new Array(20).fill(0);
  d.x = wx - d.w / 2; d.y = wy - d.h / 2;
  d.vx = -1; d.vy = 0; d.rotation = 0;
  const cam = g.camera, z = cam.zoom;
  const ctx = g.renderer.ctx;
  ctx.save();
  ctx.setTransform(z, 0, 0, z,
    cam.viewW / 2 - (cam.x - cam.punchX) * z,
    cam.viewH / 2 - (cam.y - cam.punchY) * z);
  d.draw(g.renderer, g.camera);            // 手动直绘（带相机变换）：canvas 本帧即含合成尾迹
  ctx.restore();
  const cv = g.renderer.canvas;
  const rows = [];
  for (let i = 19; i > 0; i--) {           // i=新端索引;fade=i/20（k=20 满环）
    const midx = wx + 3 + (19 - i) * 6;    // 段 i 中心（世界 x）
    const [sx, sy] = g.camera.worldToScreen(midx, wy + 2);
    const half = 4;                        // 8×8 盒罩 6×4 带矩形
    if (sx - half < 0 || sy - half < 0 || sx + half > cv.width || sy + half > cv.height) {
      rows.push({ i, off: true }); continue;
    }
    const tmp = document.createElement('canvas');
    tmp.width = half * 2; tmp.height = half * 2;
    const cx = tmp.getContext('2d', { willReadFrequently: true });
    // 两带位（midx±10, wy+2）合一采样：先画右带再叠左带同盒不重叠——分开两口
    const bandAt = (bx) => {
      const [bx0, by0] = g.camera.worldToScreen(bx, wy + 2);
      cx.clearRect(0, 0, half * 2, half * 2);
      cx.drawImage(cv, bx0 - half, by0 - half, half * 2, half * 2, 0, 0, half * 2, half * 2);
      const dd = cx.getImageData(0, 0, half * 2, half * 2).data;
      let gSum = 0, gCnt = 0, rSum = 0, rCnt = 0;
      for (let k = 0; k < dd.length; k += 4) {
        const r = dd[k], gg2 = dd[k + 1], b2 = dd[k + 2];
        if (gg2 - b2 > 15 && gg2 > 115) { gSum += gg2 - b2; gCnt++; }
        if (r - gg2 > 40 && r > 150) { rSum += r - gg2; rCnt++; }
      }
      return { gSum, gCnt, rSum, rCnt };
    };
    const A = bandAt(midx + 10), B = bandAt(midx - 10);
    rows.push({ i, fade: Math.round((i / 20) * 100) / 100,
      gSum: A.gSum + B.gSum, gCnt: A.gCnt + B.gCnt, rSum: A.rSum + B.rSum, rCnt: A.rCnt + B.rCnt,
      mean: null });
  }
  return { ok: true, dyeVid, rows };
}, dyeVid);

// spawn 无人机（5451 槽 0;屏 (760,330) 开阔天空,远离 y≤640 天花板自毁线）
const grant = await giveItems(page, [
  { vid: 5451, slot: 0 },
  { vid: 1007, slot: 1 },    // 红染（白带档）
  { vid: 1031, slot: 2 },    // 渐变染（F7 parity 面）
], { select: 0 });
step(`step: granted ${JSON.stringify(grant).slice(0, 160)}`);
const iid = await page.evaluate((vids) => {
  const flow = window.__swFlow; const out = {};
  for (const v of vids) out[v] = flow.itemByVid(v);
  return out;
}, [1007, 1031]);
step(`step: dye ids ${JSON.stringify(iid)}`);

await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 760; g.input.mouseY = 330;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 5);

// ---- 面 A1：绿带档 fade 序（合成环;无染）----
const trailA = await synthDrawSample(0);
step(`step: A1 绿带 fade 序 rows=${JSON.stringify(trailA.rows?.filter((r) => !r.off))}`);
await screenshot(page, OUT('a1-1020-green-trail-fadeorder'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ---- 面 A2：红染白带档（同夹具;F4 曲线=f² 贡献）----
await page.evaluate((id1007) => {
  const g = window.__swGame;
  g.player.inv.miscDyes[0] = { id: id1007, stack: 1 };
}, iid[1007]);
await pump(page, 2);
const trailB = await synthDrawSample(iid[1007]);
step(`step: A2 红染白带 fade 序 rows=${JSON.stringify(trailB.rows?.filter((r) => !r.off))}`);
await screenshot(page, OUT('a2-1020-red-dye-trail-fadeorder'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ---- 面 B：渐变染 1031 vx=−1/+1 parity（F7;同夹具两拍直绘）----
await page.evaluate((id1031) => {
  const g = window.__swGame;
  g.player.inv.miscDyes[0] = { id: id1031, stack: 1 };
}, iid[1031]);
await pump(page, 2);
const faceB = await page.evaluate(() => {
  const g = window.__swGame;
  const d = (g.entities.projectiles || []).find((p) => p.projId === 1020 && !p.dead);
  if (!d) return { ok: false, why: 'no-drone' };
  const [wx, wy] = g.camera.screenToWorld(400, 260);
  const ring = [];
  for (let i = 0; i < 20; i++) ring.push({ x: wx - d.w / 2 + (19 - i) * 6, y: wy - d.h / 2 });
  d.posRing = ring; d.rotRing = new Array(20).fill(0);
  d.x = wx - d.w / 2; d.y = wy - d.h / 2; d.vy = 0; d.rotation = 0;
  const cam = g.camera, z = cam.zoom;
  const ctx = g.renderer.ctx;
  const cv = g.renderer.canvas;
  const half = 4;
  const sampleSeg = (midx, wy2) => {
    const tmp = document.createElement('canvas');
    tmp.width = half * 2; tmp.height = half * 2;
    const cx = tmp.getContext('2d', { willReadFrequently: true });
    let r = 0, gg = 0, b = 0, n = 0;
    for (const bx of [midx + 10, midx - 10]) {
      const [bx0, by0] = g.camera.worldToScreen(bx, wy2 + 2);
      cx.clearRect(0, 0, half * 2, half * 2);
      cx.drawImage(cv, bx0 - half, by0 - half, half * 2, half * 2, 0, 0, half * 2, half * 2);
      const dd = cx.getImageData(0, 0, half * 2, half * 2).data;
      for (let k = 0; k < dd.length; k += 4) { r += dd[k]; gg += dd[k + 1]; b += dd[k + 2]; n++; }
    }
    return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
  };
  const out = {};
  for (const vx of [-1, 1]) {
    d.vx = vx;
    ctx.save();
    ctx.setTransform(z, 0, 0, z,
      cam.viewW / 2 - (cam.x - cam.punchX) * z,
      cam.viewH / 2 - (cam.y - cam.punchY) * z);
    d.draw(g.renderer, g.camera);
    ctx.restore();
    const rows = [];
    for (let i = 19; i >= 10; i--) {
      const midx = wx + 3 + (19 - i) * 6;
      rows.push({ i, fade: Math.round((i / 20) * 100) / 100, mean: sampleSeg(midx, wy) });
    }
    out[`vx${vx}`] = rows;
  }
  return { ok: true, out };
});
step(`step: B 渐变染 parity rows=${JSON.stringify(faceB)}`);
await screenshot(page, OUT('b1-1020-gradient-dye-parity'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
await page.evaluate(() => { const g = window.__swGame; if (g.player) g.player.inputLeft = false; });

// ---- 面 C：爱心门普通世界（245 canDisplayBuffs=true → 照发爱心）----
await clearEnemies(page);
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.miscDyes[0] = null;   // 摘染（后续面无染依赖）
});
await pump(page, 8);
const golemC = await spawnEnemy(page, 245, 0, 0, (e) => {
  e.x = window.__swGame.player.x + 260; e.y = window.__swGame.player.y - 40;
  e.aiStyle = 0;          // 探针夹具：石巨人本体 AI 需全量体节,静置化（门机制与本判无关）
  e.lovestruckT = 60;     // Lovestruck 30s+
});
step(`step: C spawn 245 normal=${JSON.stringify(golemC)}`);
const gateC = await page.evaluate(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies || []).find((en) => en.vanillaId === 245);
  return e ? { found: true, canDisplayBuffs: e.canDisplayBuffs, vanillaId: e.vanillaId } : { found: false };
});
step(`step: C gate field=${JSON.stringify(gateC)}`);
await pump(page, 60);
const heartsC = await page.evaluate(() => {
  const gores = window.__swGore ? window.__swGore() : [];
  return { total: gores.length, hearts: gores.filter((x) => x.goreId === 331).length };
});
step(`step: C normal-world hearts=${JSON.stringify(heartsC)}（>0=C1 翻案实证）`);
await screenshot(page, OUT('c1-golem-245-normal-world-hearts'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ---- 面 D：FTW 世界（quitToMenu 走退出链销毁旧 Game → createGame fortheworthy）----
await clearEnemies(page);
await page.evaluate(() => { const g = window.__swGame; if (g.entities) for (const p of g.entities.projectiles || []) p.dead = true; });
await page.evaluate(() => window.__swFlow.quitToMenu());
const menu = await page.evaluate(() => new Promise((resolve) => {
  const t0 = Date.now();
  const poll = () => {
    if (!window.__swGame) return resolve({ ok: true, ms: Date.now() - t0 });
    if (Date.now() - t0 > 20000) return resolve({ ok: false, why: 'menu-timeout' });
    setTimeout(poll, 300);
  };
  poll();
}));
step(`step: D quitToMenu=${JSON.stringify(menu)}`);
await new Promise((r) => setTimeout(r, 1500));
await createGame(page, { seed: 'fortheworthy', size: 'small', log: (m) => console.log('[createGame-ftw]', m) });
step('step: D FTW world created');
await pump(page, 20);
await godMode(page, true);
const seedD = await page.evaluate(() => {
  const g = window.__swGame;
  return { getGoodWorld: !!g.world?.seedFlags?.getGoodWorld };
});
step(`step: D seedFlags=${JSON.stringify(seedD)}`);
const golemD = await spawnEnemy(page, 245, 0, 0, (e) => {
  e.x = window.__swGame.player.x + 260; e.y = window.__swGame.player.y - 40;
  e.aiStyle = 0;
  e.lovestruckT = 60;
});
step(`step: D spawn 245 ftw=${JSON.stringify(golemD)}`);
const gateD = await page.evaluate(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies || []).find((en) => en.vanillaId === 245);
  return e ? { found: true, canDisplayBuffs: e.canDisplayBuffs, vanillaId: e.vanillaId } : { found: false };
});
step(`step: D gate field=${JSON.stringify(gateD)}（FTW 须 false）`);
await pump(page, 60);
const heartsD = await page.evaluate(() => {
  const gores = window.__swGore ? window.__swGore() : [];
  return { total: gores.length, hearts: gores.filter((x) => x.goreId === 331).length };
});
step(`step: D ftw hearts=${JSON.stringify(heartsD)}（=0=门活）`);
await screenshot(page, OUT('d1-golem-245-ftw-no-hearts'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ---- 判读汇总 ----
// fade 序判读：段带真实像素≥8 的段上取【单带像素强度】key/cnt（消背景噪声）,
// 包络单调判（局部回落 ≤ 前值 25% = 背景抖动容差;硬性反向=尾端强于机身判红）。
const monotoneToBody = (rows, key, cntKey) => {
  const live = (rows || []).filter((r) => !r.off && r[cntKey] >= 8 && r.i >= 8 && r.i <= 19)
    .map((r) => ({ i: r.i, v: r[key] / r[cntKey] }));
  let mono = true;
  for (let k = 1; k < live.length; k++) {
    if (live[k].v < live[k - 1].v * 0.9) mono = false;   // 向机身推进时强度塌 10%+ = 反向
  }
  return { n: live.length, monoToBody: mono,
    nearBody: live.length ? Math.round(live[live.length - 1].v) : null,
    farTail: live.length ? Math.round(live[0].v) : null };
};
let parityMax = null;
if (faceB.ok) {
  parityMax = 0;
  const a = faceB.out['vx-1'], b = faceB.out['vx1'];
  for (let k = 0; k < a.length; k++) {
    for (let c = 0; c < 3; c++) parityMax = Math.max(parityMax, Math.abs(a[k].mean[c] - b[k].mean[c]));
  }
}
const verdict = {
  A1_green_fadeorder: monotoneToBody(trailA.rows, 'gSum', 'gCnt'),
  A2_red_fadeorder: monotoneToBody(trailB.rows, 'rSum', 'rCnt'),
  B_gradient_parity_maxAbsDiff: parityMax,
  C_normal_hearts_gt0: (heartsC.hearts || 0) > 0,
  C_gate_true: gateC.canDisplayBuffs === true,
  D_ftw_seed: seedD.getGoodWorld === true,
  D_gate_false: gateD.canDisplayBuffs === false,
  D_ftw_hearts_eq0: (heartsD.hearts || 0) === 0,
  pageerrors: errors.slice(0, 5),
};
step(`VERDICT ${JSON.stringify(verdict, null, 1)}`);
await browser.close();
step('DONE');
