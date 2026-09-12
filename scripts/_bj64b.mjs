// ★SW-BJ64b 实机探针：彩虹巨石 1047 视觉四面（帧账/切片/光照/旋转）直读对拍。
// 用户实报："光效不对 + 滚动动画帧贴图不对，像多帧完整彩虹巨石贴图在滚动"。
// 直读面：①drawImage 源矩形（95×380 壳表调用逐条——整图直绘变异体 sw=95 即红）；
//  ②lighting.addLight 灯账（拖尾逐点 hsl 彩虹光 + CastLightOpen 透光域）；③frame 逐拍账。
// 跑法: node tools/probe.mjs run scripts/_bj64b.mjs --vite=auto
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const OUT = process.env.SW_PROBE_OUT || '/tmp/bj64b';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { drawCalls: [], lightCalls: [], frames: [], shotNote: '' };
  // ── 钩子①：drawImage 源矩形直读（5-arg/9-arg 双载,记录失败不影响原画=中立性）──
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  let recording = false;
  proto.drawImage = function (img, ...rest) {
    try {
      if (recording && img && img.width) {
        const w = img.width, h = img.height;
        const call = rest.length >= 8
          ? { sx: rest[0], sy: rest[1], sw: rest[2], sh: rest[3], dw: rest[6], dh: rest[7] }
          : { sx: 0, sy: 0, sw: w, sh: h, dw: rest[2] ?? w, dh: rest[3] ?? h };
        if (w === 95 && h === 380) out.drawCalls.push({ tex: 'P1047', ...call });
        else if (w === 14 && h === 32) out.drawCalls.push({ tex: 'P250', ...call });
        else if (w === 68 && h === 384) out.drawCalls.push({ tex: 'X55', ...call });
      }
    } catch { /* 钩子中立 */ }
    return origDraw.apply(this, [img, ...rest]);
  };
  // ── 钩子②：灯账（RollingBoulder → game.addLightAt → lighting.addLight）──
  const origLight = g.lighting.addLight.bind(g.lighting);
  g.lighting.addLight = (x, y, r, g2, b) => {
    if (recording) out.lightCalls.push({ x, y, r, g: g2, b });
    return origLight(x, y, r, g2, b);
  };
  // ── 场景：sheet 711 → proj 1047（dmg 100）,玩家右侧地表上空起滚 ──
  const { RollingBoulder } = await import('/src/entities/RollingBoulder.ts');
  const p = g.player;
  const gx = Math.floor((p.cx + 128) / 16);
  let gy = Math.floor(p.cy / 16);
  for (let k = 0; k < 200; k++) { if (g.world.store.isSolid(gx, gy + k)) { gy += k; break; } }
  const b = new RollingBoulder(gx * 16 - 64, gy * 16 - 120, 711);
  b.vx = 3; b.vy = 0;
  b.tileCollide = false;                       // 纯积分（避开地形彩票,旋转链照走）
  g.entities.add(b, 'projectiles');
  // ── 逐拍：帧账 + 灯账 ──
  recording = true;
  for (let t = 1; t <= 8; t++) {
    const before = out.lightCalls.length;
    g.fixedUpdate(1 / 60);
    out.frames.push({ t, frame: b.frame, lights: out.lightCalls.length - before });
  }
  // ── 渲染帧：drawImage 直读（页有活 rAF 环,clear→render→读账须同任务同步段内
  //  完成,防活环 tick/render 插入污染账目;位图未就绪才让位等待重试）──
  for (let i = 0; i < 10; i++) {
    out.drawCalls.length = 0;
    g.render();
    out.state = { frame: b.frame, projId: b.projId, cx: b.cx, cy: b.cy, rotation: b.rotation };
    if (out.drawCalls.some((c) => c.tex === 'P1047' && c.sh === 19)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // ── 物证：滚动态本体区截图（相机中心系换算,sx=sx/z+cam.x 逆变换 Game.ts:5309）──
  const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  if (cv && b) {
    const z = g.camera?.zoom ?? 1;
    const px = Math.round((b.cx - g.camera.x) * z + cv.width / 2) - 64;
    const py = Math.round((b.cy - g.camera.y) * z + cv.height / 2) - 64;
    const sc = document.createElement('canvas');
    sc.width = 128; sc.height = 128;
    sc.getContext('2d').drawImage(cv, px, py, 128, 128, 0, 0, 128, 128);
    out.shotBoulder128 = sc.toDataURL('image/png');
    out.shotNote = `cam(${Math.round(g.camera.x)},${Math.round(g.camera.y)}) z=${z} px=${px} py=${py} cv=${cv.width}x${cv.height}`;
  }
  out.state = { frame: b.frame, projId: b.projId, cx: b.cx, cy: b.cy, rotation: b.rotation };
  recording = false;
  return out;
});
await browser.close();
if (res.shotBoulder128) {
  writeFileSync(`${OUT}/boulder128.png`, Buffer.from(res.shotBoulder128.split(',')[1], 'base64'));
  delete res.shotBoulder128;
}
console.log(JSON.stringify(res, null, 1));
if (errs.length) { console.log('PAGE_ERRORS:', errs.slice(0, 5)); process.exit(1); }
if (res.shotNote) console.log('SHOT:', res.shotNote, '->', `${OUT}/boulder128.png`);

// ── 判读（与原版公式直算对拍）──
function hslToRgb(h, s, l) {
  const f = (c, t1, t2) => {
    if (c < 0) c += 1; if (c > 1) c -= 1;
    if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
    if (2 * c < 1) return t2;
    if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
    return t1;
  };
  if (s === 0) return [l, l, l];
  const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const t1 = 2 * l - t2;
  return [f(h + 1 / 3, t1, t2), f(h, t1, t2), f(h - 1 / 3, t1, t2)];
}
let fail = 0;
const chk = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!ok) fail++; };

// ① 帧账：frame(t) = floor(t/2)%100（P.cs:26414-26418）
const frames = res.frames ?? [];
chk('① 帧账 frame(t)=floor(t/2)%100（P.cs:26414-26418）',
  frames.length === 8 && frames.every((f) => f.frame === Math.floor(f.t / 2) % 100),
  JSON.stringify(frames));

// ② 切片：源矩形 = (19*(f/20), 19*(f%20), 19,19) 绘 38×38（f=渲染时帧）
const body = (res.drawCalls ?? []).filter((c) => c.tex === 'P1047');
const fr = res.state?.frame ?? 0;
chk('② 本体切片 sw=sh=19（整图直绘变异体 sw=95 红）',
  body.length > 0 && body.every((c) => c.sw === 19 && c.sh === 19),
  JSON.stringify(body.slice(0, 2)));
chk('② 本体源位 = (19*(f/20),19*(f%20)) f=' + fr,
  body.length > 0 && body.every((c) => c.sx === 19 * Math.floor(fr / 20) && c.sy === 19 * (fr % 20)),
  `expect sx=${19 * Math.floor(fr / 20)} sy=${19 * (fr % 20)} got ${JSON.stringify(body.map((c) => [c.sx, c.sy]))}`);
chk('② 本体绘制 38×38（vector82×2,Main.cs:33208）',
  body.length > 0 && body.every((c) => c.dw === 38 && c.dh === 38),
  JSON.stringify(body.map((c) => [c.dw, c.dh])));

// ③ 拖尾面：250 微光带 + Extra_55 星屑（Main.cs:33351-33385,num351=1 必画）
chk('③ 250 拖尾 + Extra_55 星屑在场',
  (res.drawCalls ?? []).some((c) => c.tex === 'P250') && (res.drawCalls ?? []).some((c) => c.tex === 'X55'),
  JSON.stringify([...new Set((res.drawCalls ?? []).map((c) => c.tex))]));

// ④ 光照：灯色落 hsl(hue,1,0.6)×1.4 基色环（±0.02,l=0.5 色度漂移/恒白变异体即红）；
//    灯位 = 弹旧位中心格（tile 坐标,±12 格内）——"光挂在原点/他处"变异体即红
const lights = res.lightCalls ?? [];
chk('④ 拖尾灯非空（空场 CastLightOpen 透光）', lights.length > 0, `n=${lights.length}`);
const bt = { x: Math.floor((res.state?.cx ?? 0) / 16), y: Math.floor((res.state?.cy ?? 0) / 16) };
chk('④ 灯位贴弹体拖尾（tile ±12 格）',
  lights.every((L) => Math.abs(L.x - bt.x) <= 12 && Math.abs(L.y - bt.y) <= 12),
  `boulderTile=(${bt.x},${bt.y}) first=${JSON.stringify(lights[0])}`);
let lightOk = lights.length > 0;
for (const L of lights.slice(0, 8)) {
  // 比色向不比绝对幅：灯幅 = 基色×1.4×(1−i/10)（尾衰减）→ 按 RGB 向量方向对环
  const mag = Math.hypot(L.r, L.g, L.b) || 1;
  let best = Infinity;
  for (let k = 0; k < 300; k++) {
    const [er, eg, eb] = hslToRgb(k / 300, 1, 0.6);
    const em = Math.hypot(er, eg, eb);
    const s = mag / em;
    const d = Math.hypot(er * s - L.r, eg * s - L.g, eb * s - L.b);
    if (d < best) best = d;
  }
  if (best > 0.02) { lightOk = false; console.log('  off-ring light:', JSON.stringify(L), 'bestΔ=', best.toFixed(4)); break; }
}
chk('④ 灯色方向 ∈ hsl(hue,1,0.6) 基色环（×1.4×尾衰减幅）', lightOk);

process.exit(fail ? 1 : 0);
