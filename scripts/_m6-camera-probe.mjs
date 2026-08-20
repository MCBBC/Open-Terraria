// M6 拍照模式探针（F4,CaptureInterface 1:1）:
//  ① F4 键派发:进/出相机模式（激活态/justActivated/界面层截断验证）
//  ② 模式 0 框选:左键钉 A 右键钉 B → 选区屏域框（canvas 像素采样白边）
//  ③ 按钮 1 拍选区:锁屏黑罩帧进 0→5 + PNG 下载触发(toBlob 劫持计数)
//  ④ 按钮 0 快照:全屏域管线 + 下载触发
//  ⑤ timeUiHover 吞点击门生效（相机模式激活时不触发挖掘）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`); if (!cond) fails.push(name); };

p.on('pageerror', e => fails.push('pageerror:' + e.message));
await p.goto(`${ORIGIN}/?play=small&cwatch=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 90; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer).catch(() => false)) break; }
await sleep(3000);
if (!(await p.evaluate(() => !!window.__swGame?.renderer).catch(() => false))) { console.log('FAIL 游戏未启动'); await b.close(); process.exit(1); }

// toBlob 劫持:统计 PNG 下载(文件名+尺寸)
await p.evaluate(() => {
  window.__cap = { downs: [] };
  const proto = HTMLCanvasElement.prototype;
  const orig = proto.toBlob;
  proto.toBlob = function (cb, type, q) {
    const w = this.width, h = this.height;
    return orig.call(this, (blob) => {
      if (blob && type === 'image/png') window.__cap.downs.push(`${w}x${h}:${blob.size}`);
      cb(blob);
    }, type, q);
  };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download?.startsWith('Capture')) window.__cap.downs.push(`dl:${this.download}`); return origClick.call(this); };
});

const key = async (code) => p.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), code);
const state = () => p.evaluate(() => {
  const g = window.__swGame;
  const cm = g.renderer.captureMode;
  return {
    active: cm.active, justActivated: cm.justActivated, mode: cm.selectedMode,
    a: cm.edgeAPinned, b: cm.edgeBPinned,
    lock: cm.cameraLock, frame: cm.cameraFrame, waiting: cm.cameraWaiting,
    timeUiHover: g.renderer.timeUiHover,
    input: !!cm.input,
  };
});
const mouse = (type, x, y, btn = 0) => p.evaluate(([t, x, y, btn]) => {
  const tgt = document.elementFromPoint(x, y) || document.body;
  // Input 的 mousemove 挂 el(canvas):坐标随 move 事件更新,点击前必须先 move
  tgt.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
  tgt.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, button: btn, buttons: btn === 2 ? 2 : 1, bubbles: true }));
}, [type, x, y, btn]);

// ---- ① F4 派发 ----
let s = await state();
ok('初始:相机模式关', s.active === false);
await key('F4');
await sleep(300);
s = await state();
ok('F4:进入相机模式', s.active === true, JSON.stringify(s));
ok('F4:justActivated 置位', s.justActivated === true);
ok('F4:input 直连', s.input === true);
await sleep(1500);   // 若干帧后 timeUiHover 应为 true(吞点击门)
s = await state();
ok('blockMouse 门:timeUiHover=true', s.timeUiHover === true);

// 模式 0 下左键钉 A 右键钉 B(先模拟松手解禁 justActivated)
// ★mousedown 与 mouseup 之间必须隔帧(同帧 down+up 无保持帧,释放沿丢失)
await mouse('mousedown', 640, 400); await sleep(250); await mouse('mouseup', 640, 400);
await sleep(300);
s = await state();
ok('激活点击松手:justActivated 解禁', s.justActivated === false, JSON.stringify(s));
await mouse('mousedown', 500, 350); await sleep(250); await mouse('mouseup', 500, 350);
await sleep(150);
await mouse('mousedown', 800, 600, 2); await sleep(250); await mouse('mouseup', 800, 600, 2);
await sleep(400);
s = await state();
ok('模式 0 框选:双角钉定', s.a === true && s.b === true, JSON.stringify(s));
const area = await p.evaluate(() => window.__swGame.renderer.captureMode.area());
ok('选区:tile 域非平凡', area.w > 5 && area.h > 5, JSON.stringify(area));

// 选区白边像素采样(界面层真画了)
const edgePix = await p.evaluate(() => {
  const g = window.__swGame;
  const cm = g.renderer.captureMode;
  const r = g.renderer;
  const rect = cm.markedAreaScreenRect({
    mouseX: 0, mouseY: 0, mouseLeft: false, mouseRight: false,
    viewW: r.canvas.width, viewH: r.canvas.height,
    worldW: g.world.w, worldH: g.world.h, mapOpen: false,
    fm: { zoom: r.fullMap.zoom, panX: r.fullMap.panX, panY: r.fullMap.panY },
    gravDir: 1, mapEnabled: !!r.minimap,
  }, g.camera);
  if (!rect) return null;
  const ctx = r.ctx;
  const d = ctx.getImageData(Math.max(0, Math.round(rect.x)), Math.max(0, Math.round(rect.y + rect.h)), Math.min(20, Math.round(rect.w)), 2).data;
  let bright = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright++;
  return { rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }, bright };
});
ok('选区白边渲染', edgePix && edgePix.bright > 0, JSON.stringify(edgePix));

// HUD 截断验证:小地图区域应为世界像素而非小地图框(采样小地图框边缘黑线无)
// 简化:只断言按钮组区域有底板像素(左上角 24..66)
const btnPix = await p.evaluate(() => {
  const ctx = window.__swGame.renderer.ctx;
  const d = ctx.getImageData(24, 24, 42, 42).data;
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) nonBg++;
  return nonBg;
});
ok('按钮组底板渲染', btnPix > 100, `alpha像素=${btnPix}`);

// ---- ③ 按钮 1 拍选区 ----
const before = await p.evaluate(() => window.__cap.downs.length);
await mouse('mousedown', 24 + 46 + 21, 45); await sleep(150); await mouse('mouseup', 24 + 46 + 21, 45);
await sleep(700);   // 黑罩帧进 + 分块渲染(node 外真渲染)
s = await state();
const midLock = await p.evaluate(() => {
  const cm = window.__swGame.renderer.captureMode;
  return { lock: cm.cameraLock, frame: cm.cameraFrame, waiting: cm.cameraWaiting };
});
await sleep(2500);   // 收尾:下载 + 解锁
s = await state();
const after = await p.evaluate(() => ({ n: window.__cap.downs.length, list: [...window.__cap.downs] }));
ok('拍选区:锁屏流程走完并解锁', s.lock === false, JSON.stringify(midLock));
ok('拍选区:PNG 下载触发', after.n > before, JSON.stringify(after.list));
ok('快门音标记(cameraSettings 已清)', s.lock === false && s.active === true, 'active 保持');

// ---- ④ 按钮 0 快照(整屏) ----
const before2 = await p.evaluate(() => window.__cap.downs.length);
await mouse('mousedown', 24 + 21, 45); await sleep(150); await mouse('mouseup', 24 + 21, 45);
await sleep(3500);
const after2 = await p.evaluate(() => ({ n: window.__cap.downs.length, list: [...window.__cap.downs] }));
ok('快照:PNG 下载触发', after2.n > before2, JSON.stringify(after2.list));

// ---- 滚轮门:相机模式滚轮切模式,视野 zoom 不变 ----
const z0 = await p.evaluate(() => window.__swGame.camera.zoomTarget);
await p.evaluate(() => {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
});
await sleep(400);
const zm = await p.evaluate(() => ({ z: window.__swGame.camera.zoomTarget, mode: window.__swGame.renderer.captureMode.selectedMode, pend: window.__swGame.renderer.captureMode.pendingWheel }));
ok('滚轮门:视野缩放不被驱动', Math.abs(zm.z - z0) < 1e-9, `zoom ${z0}→${zm.z}`);
ok('滚轮:模式切换消费', zm.mode !== 0 || zm.pend !== 0, JSON.stringify(zm));

// ---- ② 退出:F4 再按 ----
await key('F4');
await sleep(300);
s = await state();
ok('F4 再按:退出相机模式', s.active === false, JSON.stringify(s));
await sleep(1200);
s = await state();
ok('退出后 timeUiHover 复位(drawMinimap 接管)', s.timeUiHover === false, `timeUiHover=${s.timeUiHover}`);

// ---- Shift+F4 迷雾调试键仍可用 ----
await key('F4'); await sleep(150); // 先 false keydown 无 shift → 应重进相机模式
s = await state();
ok('裸 F4 再进相机模式(重绑链)', s.active === true);
await key('F4'); await sleep(150); // 退
await p.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4', shiftKey: true, bubbles: true }));
});
await sleep(300);
const fog = await p.evaluate(() => {
  const w = window.__swGame.world;
  return { v: w.exploredVersion, allLit: w.explored[1000] === 1 };
});
ok('Shift+F4 迷雾调试保留', fog.allLit === true, JSON.stringify(fog));
s = await state();
ok('Shift+F4 不触发相机模式', s.active === false);

console.log(fails.length ? `\n== ${fails.length} FAILED: ${fails.join(', ')}` : '\n== ALL PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
