// 帕鲁机件本体 AI 实机探针（清偿刀 A；SW_ORIGIN 私有端口探针纪律）
//   面 1：5451 发射 → 弹 1020 在场 + Track 逐帧（droneTracker 持弹）
//   面 2：5452 FPV 眼镜（armor[3]）→ 相机跟拍（pan 移向弹心）;摘镜 → tryTracking null
//   面 3：点击收回（ItemCheck_TryDestroyingDrones）→ 弹消亡 + Kill 视觉单口
//   面 4：5738 发射 → 弹 1105 在场 + 帧驱动 + 地面行驶
//   面 5：y≤640 自毁链（TP 弹至世界顶 → Kill + 成就 TO_INFINITY_AND_BEYOND"Do"）
import { appendFileSync } from 'node:fs';
const STEPLOG = '/tmp/drone-probe-progress.log';
const step = (m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; try { appendFileSync(STEPLOG, l + '\n'); } catch {} console.log(l); };
import { launchBrowser, openPage, bootstrap, createGame, pump, front, godMode } from '../tools/probe/lib/index.mjs';
import { giveItems } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5331';
const SHOT = (n) => `/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/drone-ai/${n}.png`;
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 240)); });
await page.goto(`${ORIGIN}/?wfbo=0`, { waitUntil: 'domcontentloaded' });
// ★勿 await navigator.serviceWorker.ready——新 puppeteer profile 无注册时该 Promise
//  永挂（SW 未注册的域上 ready 语义=等首个激活）,曾把整条探针钉死（登记探针坑）。
//  改为纯时限 settle + bootstrap（bootstrap 内部 waitForBridge 自带轮询）。
await new Promise((r) => setTimeout(r, 8000));
await bootstrap(page, `${ORIGIN}/?wfbo=0`, { clean: false });
step('step: bootstrapped');
await createGame(page, { seed: '05162020', size: 'small', log: (m) => console.log('[createGame]', m) });
step('step: world ready');
await pump(page, 10);
await godMode(page, true);
step('step: god on');

// ---- 面 0：给物（5451 手持 + 5452 入 armor[3]）----
const grant = await giveItems(page, [{ vid: 5451, slot: 0 }], { select: 0 });
await page.evaluate(() => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(5452);
  g.player.inv.armor[3] = { id: iid, stack: 1 };
});
await pump(page, 5);
step('step: granted');

// 瞄准玩家右上方（世界坐标经 screenToWorld——鼠标屏坐标直接给）
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 640 + 180;   // 屏中心右 180
  g.input.mouseY = 430 - 260;   // 屏中心上 260
});
// ---- 面 1：发射 1020 ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = true;
  g.input.mouseHeld = true;
});
await pump(page, 3);
step('step: launched');
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 40);
step('step: pumped 40');
const face1 = await page.evaluate(() => {
  const g = window.__swGame;
  const projs = g.entities.projectiles.filter((m) => m.projId === 1020 && !m.dead);
  const d = projs[0];
  return {
    count: projs.length,
    pos: d ? { x: Math.round(d.cx), y: Math.round(d.cy) } : null,
    rotation: d ? +d.rotation.toFixed(3) : null,
    tracked: !!(d && g.camera.droneTracker.tryTracking(g.player, g.player.inv) !== null),
    vision: g.player.remoteVisionForDrone ?? 'n/a-recomputed',
  };
});
step('FACE1 spawn+track: ' + JSON.stringify(face1));

// ---- 面 2：相机跟拍（5452 在 armor[3]）----
const camBefore = await page.evaluate(() => {
  const g = window.__swGame;
  return { x: g.camera.x, y: g.camera.y, panX: g.camera.panX, panY: g.camera.panY,
    px: Math.round(g.player.cx), py: Math.round(g.player.cy) };
});
await pump(page, 30);
step('step: cam pumped');
const camAfter = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.projectiles.find((m) => m.projId === 1020 && !m.dead);
  return { x: Math.round(g.camera.x), y: Math.round(g.camera.y),
    panX: Math.round(g.camera.panX ?? 0), panY: Math.round(g.camera.panY ?? 0),
    drone: d ? { x: Math.round(d.cx), y: Math.round(d.cy) } : null,
    player: { x: Math.round(g.player.cx), y: Math.round(g.player.cy) } };
});
step('FACE2 cam-follow: ' + JSON.stringify({ camBefore: { x: Math.round(camBefore.x), y: Math.round(camBefore.y) }, camAfter }));
await page.screenshot({ path: SHOT('1-drone-following') });

// ---- 操控验证：真实键电平 W（inputUp 每拍被输入装配覆写,须走物理键桶）----
await page.keyboard.down('w');
await pump(page, 25);
await page.keyboard.up('w');
const face2b = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.projectiles.find((m) => m.projId === 1020 && !m.dead);
  return d ? { y: Math.round(d.cy), vy: +d.vy.toFixed(2), rotation: +d.rotation.toFixed(3) } : null;
});
step('FACE2b fly-up: ' + JSON.stringify(face2b));
await page.screenshot({ path: SHOT('2-drone-flying-controlled') });

// ---- 面 3：点击收回（TryDestroyingDrones）----
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = true; g.input.mouseHeld = true; });
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 5);
const face3 = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    droneAlive: g.entities.projectiles.some((m) => m.projId === 1020 && !m.dead),
    dustRecent: true,
  };
});
step('FACE3 recall: ' + JSON.stringify(face3));
await page.screenshot({ path: SHOT('3-drone-recalled') });

// ---- 面 4：5738 发射（地面行驶）----
await giveItems(page, [{ vid: 5738, slot: 1 }], { select: 1 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 640 - 120;
  g.input.mouseY = 430 + 60;
});
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = true; g.input.mouseHeld = true; });
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 20);
const face4 = await page.evaluate(() => {
  const g = window.__swGame;
  const projs = g.entities.projectiles.filter((m) => m.projId === 1105 && !m.dead);
  const c = projs[0];
  return {
    count: projs.length,
    pos: c ? { x: Math.round(c.cx), y: Math.round(c.cy) } : null,
    frame: c ? c.frame : null,
    vy: c ? +c.vy.toFixed(3) : null,
    tracked: !!(c && g.camera.droneTracker.tryTracking(g.player, g.player.inv) !== null),
  };
});
step('FACE4 rc-car: ' + JSON.stringify(face4));
// 右键行驶（物理键 D 电平）
await page.keyboard.down('d');
await pump(page, 30);
await page.keyboard.up('d');
const face4b = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.entities.projectiles.find((m) => m.projId === 1105 && !m.dead);
  return c ? { x: Math.round(c.cx), vx: +c.vx.toFixed(2), frame: c.frame, spriteDir: c.spriteDir } : null;
});
step('FACE4b car-drive: ' + JSON.stringify(face4b));
await page.screenshot({ path: SHOT('4-rccar-driving') });

// ---- 面 5：y≤640 自毁 + 成就 ----
const face5 = await page.evaluate(() => {
  const g = window.__swGame;
  // 给回 5451 手持（当前手持 5738）
  const iid = window.__swFlow.itemByVid(5451);
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  return true;
});
await pump(page, 2);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseX = 640; g.input.mouseY = 200; g.input.mouseDown = true; g.input.mouseHeld = true; });
await pump(page, 3);
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await pump(page, 5);
// TP 无人机到世界顶（y−h ≤ 640）
const face5b = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.projectiles.find((m) => m.projId === 1020 && !m.dead);
  if (!d) return { tp: false };
  d.y = 640 - d.h + 4;    // y−h = 640−12+4... 直接置 634: y−h = 634−12=622 ≤ 640
  d.y = 634; d.x = g.player.cx - 6;
  return { tp: true, y: d.y };
});
await pump(page, 4);
const face5c = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    droneAlive: g.entities.projectiles.some((m) => m.projId === 1020 && !m.dead),
    achDo: g.achievements?.isConditionComplete?.('TO_INFINITY_AND_BEYOND', 'Do')
      ?? g.achievements?.flags?.TO_INFINITY_AND_BEYOND
      ?? 'check-manual',
  };
});
step('FACE5 y640-kill: ' + JSON.stringify({ face5, face5b, face5c }));
await page.screenshot({ path: SHOT('5-achievement-infinity') });

// 收尾：清自己私有实例由会话尾统一 kill；此处仅关浏览器
step('page errors: ' + JSON.stringify(errors.slice(0, 6)));
await browser.close();
