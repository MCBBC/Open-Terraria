// 弹幕染料四通道实机探针（清偿刀 N 2026-09-30;SW_ORIGIN 私有端口纪律 5401）
//   面 A：1020 无人机 cPet——无染基线（绿带 177,255,32）→ miscDyes[0]=红染 1007
//         （白带过染料 pass+本体逐贴图染;DrawContinuousTrail Main.cs:28300-28303）
//   面 B：1105 遥控车 cPet（switch 覆写 :22457-22464）
//   面 C：光宠 cLight——miscDyes[1]=蓝染 1015 + 影球光宠（miscEquips[1]）
//   面 D：钩爪 cGrapple——miscDyes[4]=粉染 1017 + 藤蔓钩（aiStyle 7 → projHook 派生）
//   面 E：cMinion fail-open 负证——宝宝史莱姆 266（minion=true）在 CritterShampoo(4762)
//         不在库（Item_4762.png 缓存面缺）时不受 miscDyes[0] 染=通道隔离正确性
// 像素判别：世界→屏幕（cam.worldToScreen）→ 画布读回均值;染前/染后均值差+PNG 落盘。
import { REPO_ROOT } from './_pathlib.mjs';
import { appendFileSync } from 'node:fs';
const STEPLOG = '/tmp/projdye-n-progress.log';
const step = (m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; try { appendFileSync(STEPLOG, l + '\n'); } catch {} console.log(l); };
import { launchBrowser, openPage, bootstrap, createGame, pump, front, godMode, screenshot, worldToScreen } from '../tools/probe/lib/index.mjs';
import { giveItems } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5401';
const OUT = (n) => `${REPO_ROOT}/docs/evidence/proj-dye/${n}`;
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 240)); });
await page.goto(`${ORIGIN}/?wfbo=0`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 8000));
await bootstrap(page, `${ORIGIN}/?wfbo=0`, { clean: false });
step('step: bootstrapped');
await createGame(page, { seed: '05162020', size: 'small', log: (m) => console.log('[createGame]', m) });
step('step: world ready');
await pump(page, 10);
await godMode(page, true);

// ---- 夹具：召唤/装备物入包 ----
const grant = await giveItems(page, [
  { vid: 5451, slot: 0 },   // 吉姆无人机
  { vid: 5738, slot: 1 },   // 遥控车
  { vid: 1309, slot: 2 },   // 史莱姆法杖（SlimeStaff=1309;1300=步枪镜）
  { vid: 185, slot: 3 },    // 藤蔓钩（Ivy Whip=185;158 非钩）
  { vid: 3856, slot: 4 },   // 魔法灯笼（光宠,repo light 表成员）
], { select: 0 });
step(`step: granted ${JSON.stringify(grant).slice(0, 200)}`);

// 染料直插 miscDyes（清偿刀 N 消费面直读 miscDyes 槽）;光宠物直插 miscEquips[1]
const iid = await page.evaluate((vids) => {
  const flow = window.__swFlow;
  const out = {};
  for (const v of vids) out[v] = flow.itemByVid(v);
  return out;
}, [1007, 1015, 1017, 3856, 1309]);
step(`step: itemByVid ${JSON.stringify(iid)}`);

await page.evaluate((ids) => {
  const g = window.__swGame;
  const inv = g.player.inv;
  inv.miscDyes[0] = null;      // 基线：全空
  inv.miscDyes[1] = null;
  inv.miscDyes[4] = null;
  inv.miscEquips[1] = null;
  void ids;
}, iid);
await pump(page, 3);

// ---- 像素采样器（跟随实体中心 24×24 均值）----
const sampleAround = (kind, projId) => page.evaluate((kind, projId) => {
  const g = window.__swGame;
  const list = g.entities.projectiles || [];
  const t = list.find((p) => p.projId === projId && !p.dead);
  if (!t) return { ok: false, why: `no-${kind}` };
  const [sx, sy] = g.camera.worldToScreen(t.cx, t.cy);
  const cv = g.renderer.canvas;
  const R = 12;
  if (sx < R || sy < R || sx + R > cv.width || sy + R > cv.height) return { ok: false, why: 'offscreen' };
  const tmp = document.createElement('canvas');
  tmp.width = R * 2; tmp.height = R * 2;
  const cx = tmp.getContext('2d', { willReadFrequently: true });
  cx.drawImage(cv, sx - R, sy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
  const d = cx.getImageData(0, 0, R * 2, R * 2).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 10) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  }
  return { ok: n > 24, n, mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null,
    at: [Math.round(sx), Math.round(sy)] };
}, kind, projId);

// ===================== 面 A：1020 基线（无染=绿带）=====================
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 640 + 160;
  g.input.mouseY = 430 - 220;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 10);
// 近距往返飞行拉长尾迹（AI_195 输入位=inputLeft/inputRight——持 5451 期间存活;
// 左飞 16t 进左侧开阔天空区拍基线;右飞 16t 回程拍染后——保持屏下半区,避开小地图）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inputLeft = true;
});
await pump(page, 16);
// 证据位夹具：无人机+尾迹环整体平移到屏内固定取样位（屏 (480,300)），尾迹形状保持
await page.evaluate(() => {
  const g = window.__swGame;
  const d = (g.entities.projectiles || []).find((p) => p.projId === 1020 && !p.dead);
  if (!d) return false;
  const [wx, wy] = g.camera.screenToWorld(480, 300);
  const dx = wx - d.cx, dy = wy - d.cy;
  d.x += dx; d.y += dy;
  if (Array.isArray(d.posRing)) d.posRing = d.posRing.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  if (Array.isArray(d.rotRing)) d.rotRing = d.rotRing.slice();
  return true;
});
await pump(page, 1);
const drone0 = await sampleAround('drone', 1020);
step(`step: 1020 baseline ${JSON.stringify(drone0)}`);
await screenshot(page, OUT('a-1020-baseline-green'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
await screenshot(page, OUT('a2-1020-baseline-trail'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ---- 面 A2：装 cPet 红染 → 白带过染 + 本体染（右飞回程,尾迹反相）----
await page.evaluate((id1007) => {
  const g = window.__swGame;
  g.player.inv.miscDyes[0] = { id: id1007, stack: 1 };
  g.player.inputLeft = false;
  g.player.inputRight = true;
}, iid[1007]);
await pump(page, 10);
// 同款证据位夹具（面 A2 同屏位,染前/染后同位对照）
await page.evaluate(() => {
  const g = window.__swGame;
  const d = (g.entities.projectiles || []).find((p) => p.projId === 1020 && !p.dead);
  if (!d) return false;
  const [wx, wy] = g.camera.screenToWorld(480, 300);
  const dx = wx - d.cx, dy = wy - d.cy;
  d.x += dx; d.y += dy;
  if (Array.isArray(d.posRing)) d.posRing = d.posRing.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return true;
});
await pump(page, 1);
const drone1 = await sampleAround('drone', 1020);
step(`step: 1020 cPet-red ${JSON.stringify(drone1)}`);
await screenshot(page, OUT('b-1020-cpet-red-dye'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
await pump(page, 6);
await screenshot(page, OUT('b2-1020-cpet-red-trail'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
// 停输入（后续面无人机可自然回落）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inputRight = false;
});
await pump(page, 5);

// ===================== 面 B：1105 遥控车（switch→cPet）=====================
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.selected = 1;   // 5738 遥控车
  g.input.mouseX = 640 + 120;
  g.input.mouseY = 430 + 40;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 30);
const car1 = await sampleAround('car', 1105);
step(`step: 1105 cPet-red ${JSON.stringify(car1)}`);
await screenshot(page, OUT('c-1105-cpet-red-dye'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ===================== 面 C：光宠 cLight（miscDyes[1]=蓝染）====================
await page.evaluate((id1015, id3610) => {
  const g = window.__swGame;
  g.player.inv.miscDyes[1] = { id: id1015, stack: 1 };
  if (id3610 != null && id3610 >= 0) g.player.inv.miscEquips[1] = { id: id3610, stack: 1 };
}, iid[1015], iid[3856]);
await pump(page, 40);   // 光宠 follower 每帧槽门重生
const light = await page.evaluate(() => {
  const g = window.__swGame;
  const f = g.lightPetFollower;
  if (!f || f.dead) return { ok: false, why: 'no-lightpet' };
  return { ok: true, projId: f.projId, cx: f.cx, cy: f.cy };
});
step(`step: lightPet ${JSON.stringify(light)}`);
if (light.ok) {
  const [lsx, lsy] = await worldToScreen(page, light.cx, light.cy);
  const lightPx = await page.evaluate(([sx, sy]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const R = 14;
    if (sx < R || sy < R || sx + R > cv.width || sy + R > cv.height) return { ok: false, why: 'offscreen' };
    const tmp = document.createElement('canvas');
    tmp.width = R * 2; tmp.height = R * 2;
    const cx = tmp.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, sx - R, sy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
    const d = cx.getImageData(0, 0, R * 2, R * 2).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 10) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    return { ok: n > 24, n, mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null };
  }, [lsx, lsy]);
  step(`step: lightpet pixels ${JSON.stringify(lightPx)}`);
  await screenshot(page, OUT('d-lightpet-clight-blue-dye'), { time: 'night', onDark: 'day', layer: 'canvas', log: step });
}

// ===================== 面 D：钩爪 cGrapple（miscDyes[4]=粉染）====================
await page.evaluate((id1017) => {
  const g = window.__swGame;
  g.player.inv.miscDyes[4] = { id: id1017, stack: 1 };
  g.player.inv.selected = 3;   // 藤蔓钩 185
  g.input.mouseX = 640 + 220;
  g.input.mouseY = 430 - 240;
  g.input.mouseDown = true; g.input.mouseHeld = true;
}, iid[1017]);
await pump(page, 12);   // 链伸出到 latch
const dbgD = await page.evaluate(() => {
  const g = window.__swGame;
  const held = g.player.inv.heldItem ? g.player.inv.heldItem() : null;
  return { selected: g.player.inv.selected, heldVid: held ? (window.__swGame.player.inv.heldItem(), undefined) : undefined,
    useTime: g.player.useTime, drones: (g.entities.projectiles || []).map((p) => p.projId).slice(0, 8),
    grapples: (g.player.grappleProjs || []).length };
});
step(`step: hook debug ${JSON.stringify(dbgD)}`);
const hook = await page.evaluate(() => {
  const g = window.__swGame;
  const hs = g.player.grappleProjs || [];
  const h = hs.find((p) => !p.dead) || hs[0];
  if (!h) {
    const ids = (g.entities.projectiles || []).map((p) => p.projId ?? p.projType).slice(0, 12);
    return { ok: false, why: 'no-hook', projIds: ids };
  }
  return { ok: true, cx: h.cx, cy: h.cy, latched: !!h.latched };
});
step(`step: hook ${JSON.stringify(hook)}`);
if (hook.ok) {
  const [hsx, hsy] = await worldToScreen(page, hook.cx, hook.cy);
  const hookPx = await page.evaluate(([sx, sy]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const R = 12;
    if (sx < R || sy < R || sx + R > cv.width || sy + R > cv.height) return { ok: false, why: 'offscreen' };
    const tmp = document.createElement('canvas');
    tmp.width = R * 2; tmp.height = R * 2;
    const cx = tmp.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, sx - R, sy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
    const d = cx.getImageData(0, 0, R * 2, R * 2).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 10) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    return { ok: n > 24, n, mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null };
  }, [hsx, hsy]);
  step(`step: hook pixels ${JSON.stringify(hookPx)}`);
}
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await screenshot(page, OUT('e-grapple-cgrapple-pink-dye'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ===================== 面 E：266 史莱姆 cMinion fail-open 负证 =====================
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.selected = 2;   // 史莱姆法杖
  g.input.mouseX = 640;
  g.input.mouseY = 430 - 100;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 30);
const slime = await page.evaluate(() => {
  const g = window.__swGame;
  const m = (g.entities.projectiles || []).find((p) => p.projId === 266 && !p.dead);
  if (!m) {
    const ids = (g.entities.projectiles || []).map((p) => p.projId ?? p.projType).slice(0, 12);
    return { ok: false, why: 'no-slime-266', projIds: ids, mana: g.player.mana ?? null };
  }
  return { ok: true, cx: m.cx, cy: m.cy };
});
step(`step: slime 266 ${JSON.stringify(slime)}`);
if (slime.ok) {
  const [ssx, ssy] = await worldToScreen(page, slime.cx, slime.cy);
  const slimePx = await page.evaluate(([sx, sy]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const R = 14;
    if (sx < R || sy < R || sx + R > cv.width || sy + R > cv.height) return { ok: false, why: 'offscreen' };
    const tmp = document.createElement('canvas');
    tmp.width = R * 2; tmp.height = R * 2;
    const cx = tmp.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, sx - R, sy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
    const d = cx.getImageData(0, 0, R * 2, R * 2).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 10) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    return { ok: n > 24, n, mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null };
  }, [ssx, ssy]);
  step(`step: slime pixels（miscDyes[0] 已装红染但 266=minion→cMinion 通道,CritterShampoo 缺库 → 不染=fail-open 负证） ${JSON.stringify(slimePx)}`);
  await screenshot(page, OUT('f-266-cminion-failopen-negative'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
}

step(`step: pageerrors ${JSON.stringify(errors.slice(0, 5))}`);
await browser.close();
step('DONE');
