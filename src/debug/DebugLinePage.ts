// 双水线标注页(2026-08-19,debug-line.html 专用;不进主构建链)。
// 用途:还原用户报告现场(种子 12345 / 玩家(383,260) / 夜晚 timeOfDay 0.90206 /
// zoom 0.99,对应 debug-report-畏缩的床),叠加标注层让用户点出:
//   左键        = 红标:有问题的格子
//   Shift+左键  = 蓝标:第二条水线的位置(像素精度,画横线)
//   Alt+左键    = 绿标:正确水线参照位置(像素精度,画横线)
//   右键        = 撤销上一个标注
// 面板"复制标注 JSON"→ 粘贴回会话即可拿到世界坐标。
// 标注存 localStorage(key debugLineMarks),刷新不丢;玩家/时钟每帧钉回现场。
import '../main'; // 复用 index.html 的正常启动链(菜单→__swFlow/__swGame)

interface Flow { newWorld(seed: string, w: number, h: number): Promise<void>; }
interface MiniGame {
  player: { x: number; y: number; debugGod?: boolean };
  world: { clock?: { timeOfDay: number } };
  camera: { x: number; y: number; zoom: number; zoomTarget?: number };
  renderer: { canvas: HTMLCanvasElement };
}

const SCENE = {
  seed: '12345', w: 4200, h: 1200,
  px: 383, py: 260,            // 玩家 tile(报告现场)
  timeOfDay: 0.90206,          // 报告世界时钟(夜晚)
  zoom: 0.99,
};
const LS_KEY = 'debugLineMarks';

interface Mark { tx: number; ty: number; wx: number; wy: number; }
interface Marks { red: Mark[]; blue: Mark[]; green: Mark[]; }
const marks: Marks = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || '') as Partial<Marks>;
    return { red: v.red ?? [], blue: v.blue ?? [], green: v.green ?? [] };
  } catch { return { red: [], blue: [], green: [] }; }
})();
(window as unknown as { __debugLineMarks: typeof marks }).__debugLineMarks = marks;

const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(marks)); } catch { /* 隐身模式忽略 */ } };

function waitFor<T>(get: () => T | undefined, ms = 300000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const v = get();
      if (v) { resolve(v); return; }
      if (performance.now() - t0 > ms) { reject(new Error('等待超时')); return; }
      setTimeout(tick, 200);
    };
    tick();
  });
}

// ---- 面板 ----
const panel = document.createElement('div');
panel.style.cssText = [
  'position:fixed', 'left:10px', 'top:10px', 'z-index:10000',
  'background:rgba(12,14,20,.88)', 'color:#dfe6f2', 'padding:10px 12px',
  'border-radius:8px', 'font:12px/1.6 "Segoe UI","PingFang SC",sans-serif',
  'max-width:420px', 'pointer-events:auto', 'border:1px solid #2c3a55',
].join(';');
document.body.appendChild(panel);
const statusEl = document.createElement('div');
statusEl.style.cssText = 'font-weight:600;margin-bottom:6px';
const cursorEl = document.createElement('div');
cursorEl.style.cssText = 'color:#9fb4d8;margin-bottom:6px;white-space:pre';
const btnRow = document.createElement('div');
btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
panel.append(statusEl, cursorEl, btnRow);
const listEl = document.createElement('div');
listEl.style.cssText = 'margin-top:6px;max-height:180px;overflow:auto;white-space:pre;color:#8fa3c7';
panel.appendChild(listEl);

const mkBtn = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'background:#1d2740;color:#dfe6f2;border:1px solid #3c5a80;'
    + 'border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px';
  b.onmouseenter = () => { b.style.background = '#2a3a60'; };
  b.onmouseleave = () => { b.style.background = '#1d2740'; };
  b.onclick = fn;
  btnRow.appendChild(b);
  return b;
};

function renderList(): void {
  const fmt = (m: Mark) => `(${m.tx},${m.ty})`;
  listEl.textContent = '';
  const seg = (title: string, arr: Mark[], color: string) => {
    if (!arr.length) return;
    const d = document.createElement('div');
    d.textContent = `${title} ${arr.length}: ` + arr.map(fmt).join(' ');
    d.style.color = color;
    listEl.appendChild(d);
  };
  seg('红·问题格', marks.red, '#ff7b72');
  seg('蓝·第二条线', marks.blue, '#6cb6ff');
  seg('绿·正确线', marks.green, '#56d364');
}

// ---- 覆盖层 canvas ----
const ov = document.createElement('canvas');
ov.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:auto;cursor:crosshair';
document.body.appendChild(ov);
const octx = ov.getContext('2d')!;

let g: MiniGame | null = null;
let bright = false;
// 实时光标(悬停预览:十字 + 将标注的 tile 框,偏移当场可见)
let curX = -1, curY = -1;

// 坐标换算走游戏权威路径(Input.ts:59 同款):canvas 本地坐标 + Camera 自带
// screenToWorld/worldToScreen(viewW/punch/缩放语义全由游戏自己保证)——
// 旧手搓公式用 rect.width/2 假设 canvas 恰为视口大小,窗口缩放后即偏移。
function camApi(): { s2w: (sx: number, sy: number) => [number, number]; w2s: (wx: number, wy: number) => [number, number] } | null {
  if (!g) return null;
  const cam = g.camera as unknown as {
    screenToWorld(sx: number, sy: number): [number, number];
    worldToScreen(wx: number, wy: number): [number, number];
  };
  if (typeof cam.screenToWorld !== 'function' || typeof cam.worldToScreen !== 'function') return null;
  const r = g.renderer.canvas.getBoundingClientRect();
  return {
    s2w: (sx, sy) => cam.screenToWorld(sx - r.left, sy - r.top),
    w2s: (wx, wy) => {
      const [lx, ly] = cam.worldToScreen(wx, wy);
      return [lx + r.left, ly + r.top];
    },
  };
}
function worldToScreen(wx: number, wy: number): [number, number] {
  const api = camApi();
  if (api) return api.w2s(wx, wy);
  if (!g) return [-9999, -9999];
  const r = g.renderer.canvas.getBoundingClientRect();
  return [r.left + r.width / 2 + (wx - g.camera.x) * g.camera.zoom,
    r.top + r.height / 2 + (wy - g.camera.y) * g.camera.zoom];
}
function screenToWorld(sx: number, sy: number): [number, number] {
  const api = camApi();
  if (api) return api.s2w(sx, sy);
  if (!g) return [0, 0];
  const r = g.renderer.canvas.getBoundingClientRect();
  return [g.camera.x + (sx - r.left - r.width / 2) / g.camera.zoom,
    g.camera.y + (sy - r.top - r.height / 2) / g.camera.zoom];
}

ov.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const all = [...marks.red, ...marks.blue, ...marks.green];
  const last = all[all.length - 1];
  if (!last) return;
  for (const k of ['red', 'blue', 'green'] as const) {
    const i = marks[k].indexOf(last);
    if (i >= 0) marks[k].splice(i, 1);
  }
  save(); renderList();
});
ov.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !g) return;
  const [wx, wy] = screenToWorld(e.clientX, e.clientY);
  const m: Mark = { tx: Math.floor(wx / 16), ty: Math.floor(wy / 16), wx: Math.round(wx), wy: Math.round(wy) };
  if (e.shiftKey) marks.blue.push(m);
  else if (e.altKey) marks.green.push(m);
  else marks.red.push(m);
  save(); renderList();
});
ov.addEventListener('pointermove', (e) => {
  curX = e.clientX; curY = e.clientY;
  if (!g) return;
  const [wx, wy] = screenToWorld(e.clientX, e.clientY);
  cursorEl.textContent = `光标 tile (${Math.floor(wx / 16)}, ${Math.floor(wy / 16)})  px(${Math.round(wx)},${Math.round(wy)})`;
});

function drawOverlay(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (ov.width !== Math.round(innerWidth * dpr) || ov.height !== Math.round(innerHeight * dpr)) {
    ov.width = Math.round(innerWidth * dpr);
    ov.height = Math.round(innerHeight * dpr);
  }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, innerWidth, innerHeight);
  const z = g ? g.camera.zoom : 1;
  // 红:16×16 tile 框
  octx.lineWidth = 2;
  octx.strokeStyle = '#ff4d4d';
  for (const m of marks.red) {
    const [x, y] = worldToScreen(m.tx * 16, m.ty * 16);
    octx.strokeRect(x, y, 16 * z, 16 * z);
    octx.beginPath();
    octx.moveTo(x, y); octx.lineTo(x + 16 * z, y + 16 * z);
    octx.moveTo(x + 16 * z, y); octx.lineTo(x, y + 16 * z);
    octx.stroke();
  }
  // 蓝/绿:像素精度横线(±70px)+ 圆点
  for (const [arr, color] of [[marks.blue, '#59a6ff'], [marks.green, '#3fdb6e']] as const) {
    octx.strokeStyle = color;
    octx.fillStyle = color;
    for (const m of arr) {
      const [x, y] = worldToScreen(m.wx, m.wy);
      octx.beginPath();
      octx.arc(x, y, 4, 0, Math.PI * 2);
      octx.fill();
      octx.beginPath();
      octx.moveTo(x - 70, y); octx.lineTo(x + 70, y);
      octx.stroke();
    }
  }
  // 悬停预览:十字准线(屏幕坐标,鼠标真实位置)+ 将标注的 tile 白框
  if (curX >= 0) {
    octx.strokeStyle = 'rgba(255,255,255,.55)';
    octx.lineWidth = 1;
    octx.beginPath();
    octx.moveTo(curX - 10, curY); octx.lineTo(curX + 10, curY);
    octx.moveTo(curX, curY - 10); octx.lineTo(curX, curY + 10);
    octx.stroke();
    const [wx, wy] = screenToWorld(curX, curY);
    const [bx, by] = worldToScreen(Math.floor(wx / 16) * 16, Math.floor(wy / 16) * 16);
    octx.strokeStyle = 'rgba(255,255,255,.9)';
    octx.lineWidth = 2;
    octx.strokeRect(bx, by, 16 * z, 16 * z);
  }
}

function pinScene(): void {
  if (!g) return;
  // 玩家钉回现场(防走动/掉落带偏相机);时钟钉回夜晚(标注期间不天亮)
  g.player.x = SCENE.px * 16;
  g.player.y = SCENE.py * 16;
  if (g.world.clock) g.world.clock.timeOfDay = SCENE.timeOfDay;
}

function frame(): void {
  if (g) {
    pinScene();
    drawOverlay();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

mkBtn('撤销(或右键)', () => {
  const all = [...marks.red, ...marks.blue, ...marks.green];
  const last = all[all.length - 1];
  if (!last) return;
  for (const k of ['red', 'blue', 'green'] as const) {
    const i = marks[k].indexOf(last);
    if (i >= 0) marks[k].splice(i, 1);
  }
  save(); renderList();
});
mkBtn('清空全部', () => {
  marks.red.length = 0; marks.blue.length = 0; marks.green.length = 0;
  save(); renderList();
});
mkBtn('复制标注 JSON', async () => {
  const payload = JSON.stringify({ seed: SCENE.seed, scene: SCENE, marks });
  try {
    await navigator.clipboard.writeText(payload);
    statusEl.textContent = '已复制到剪贴板 → 粘贴回会话即可';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = payload;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    statusEl.textContent = '已复制(兼容路径)→ 粘贴回会话即可';
  }
});
const brightBtn = mkBtn('提亮(夜视)', () => {
  bright = !bright;
  if (g) g.renderer.canvas.style.filter = bright ? 'brightness(2.4)' : '';
  brightBtn.textContent = bright ? '还原亮度' : '提亮(夜视)';
});

statusEl.textContent = '正在启动…';
renderList();

(async () => {
  try {
    await import('../data/items').catch(() => {});
    statusEl.textContent = '等待引擎…';
    const flow = await waitFor<Flow & { loadJson: (text: string) => Promise<void> }>(
      () => (window as unknown as { __swFlow?: Flow & { loadJson: (text: string) => Promise<void> } }).__swFlow,
    );
    statusEl.textContent = '载入存档(畏缩的床,seed 12345)…';
    const res = await fetch('/debug-save.sbw.json');
    if (!res.ok) throw new Error(`存档拉取失败 HTTP ${res.status}`);
    await flow.loadJson(await res.text());
    g = await waitFor<MiniGame>(() => (window as unknown as { __swGame?: MiniGame }).__swGame);
    g.player.debugGod = true;
    g.camera.zoom = SCENE.zoom;
    if ('zoomTarget' in g.camera) g.camera.zoomTarget = SCENE.zoom;
    pinScene();
    bright = true;
    g.renderer.canvas.style.filter = 'brightness(2.4)';
    brightBtn.textContent = '还原亮度';
    statusEl.textContent = '现场已还原(自动提亮)。左键=问题格 / Shift+左键=第二条水线 / Alt+左键=正确水线 / 右键=撤销';
  } catch (e) {
    statusEl.textContent = `启动失败:${String(e)}`;
  }
})();
