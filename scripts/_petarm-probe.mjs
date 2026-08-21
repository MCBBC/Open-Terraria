// 抚摸宠物复合手臂渲染探针（复审 P3 ①）：
//  玩家站定 → 四态采样（无抚摸 / 抚摸 phase0=ThreeQuarters / phase1=Full /
//  小宠 phase0=0.2 档），页面内单 evaluate 完成采样+差分（免大数组跨 CDP）。
//  断言：①手臂盒（朝向侧 x+14..+42、y−37..−10 世界px）抚摸态出现旋转臂像素
//  ②phase 切换改变臂形（Full ≠ ThreeQuarters）③小宠档角度不同（0.2 ≠ 0.3）
//  ④控制盒（脚下地面带）无差异（除手臂外画面静止）。暂停态采样（miscCounter 冻结）。
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
const origin = process.env.SW_ORIGIN || 'http://localhost:5199';
await p.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const pl = g.player;
  // ?play=small 无角色档——注入默认外观激活纸娃娃路径（vui 懒加载自愈）
  {
    const appMod = await import('/src/player/Appearance.ts');
    pl.appearance = appMod.defaultAppearance('probe');
    await new Promise(r => setTimeout(r, 2500));
  }
  // 出生点平台本就平整（世界生成保证）——原地站定，勿瞬移（瞬移区 lighting/
  // 区块烘焙在探针时窗内不就绪 → 采样带渲染纯黑）
  pl.vx = 0; pl.vy = 0;
  pl.onGround = true; pl.facing = 1;
  g.paused = true;                       // 冻结模拟（miscCounter/尘/相机全停）
  g.camera.x = pl.cx; g.camera.y = pl.cy;
  const res = { ok: true, spot: { cx: pl.cx, bottom: pl.y + pl.h } };

  // 采样：玩家帧 ±余量（世界→屏）
  const cv = g.renderer.canvas;
  const ctx = cv.getContext('2d');
  const cam = g.camera;
  const SW = 100, SH = 92;               // 采样盒尺寸（屏 px，玩家帧 ~50×70×zoom）
  const grab = () => {
    const [x, y] = cam.worldToScreen(pl.cx - 40, pl.y + pl.h - 68);
    const sx = Math.max(0, Math.min(cv.width - SW, Math.floor(x)));
    const sy = Math.max(0, Math.min(cv.height - SH, Math.floor(y)));
    return { sx, sy, d: ctx.getImageData(sx, sy, SW, SH).data };
  };
  const setState = (petting, phase, isSmall) => {
    if (petting) {
      pl.petting.isPetting = true;
      pl.petting.isPetSmall = isSmall;
      pl.petting.offsetX = -36;          // 宠物在右（facing=+1 面向宠物）
      pl.petting.validTarget = () => true;
      pl.miscCounter = phase === 0 ? 0 : 7;
    } else {
      pl.petting.isPetting = false;
    }
  };
  const wait2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await wait2();
  setState(false, 0, false); await wait2();
  const S0 = grab();
  {
    let sum = 0; const uniq = new Set();
    for (let i = 0; i < S0.d.length; i += 4) {
      sum += S0.d[i] + S0.d[i + 1] + S0.d[i + 2];
      uniq.add((S0.d[i] << 16) | (S0.d[i + 1] << 8) | S0.d[i + 2]);
    }
    res.fingerprint = { sum, colors: uniq.size, camX: cam.x, camY: cam.y,
      plx: pl.x, ply: pl.y, zoom: cam.zoom };
  }

  setState(true, 0, false); await wait2();
  const S1 = grab();
  setState(true, 1, false); await wait2();
  const S2 = grab();
  setState(true, 0, true); await wait2();
  const S3 = grab();
  setState(false, 0, false); await wait2();
  const S4 = grab();                     // 回到 idle（可逆性 + 静止性验证）

  // 世界盒 → 采样内坐标：采样原点反解（worldToScreen 逆）
  const zoom = cam.zoom;
  const orgWx = cam.x + (S0.sx - cv.width / 2) / zoom;
  const orgWy = cam.y + (S0.sy - cv.height / 2) / zoom;
  const box = (wx0, wy0, wx1, wy1) => ({
    x0: Math.max(0, Math.floor((wx0 - orgWx) * zoom)),
    y0: Math.max(0, Math.floor((wy0 - orgWy) * zoom)),
    x1: Math.min(SW, Math.ceil((wx1 - orgWx) * zoom)),
    y1: Math.min(SH, Math.ceil((wy1 - orgWy) * zoom)),
  });
  const countDiff = (a, b, r) => {
    let n = 0;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const i = (y * SW + x) * 4;
      if (Math.abs(a[i] - b[i]) > 30 || Math.abs(a[i + 1] - b[i + 1]) > 30
        || Math.abs(a[i + 2] - b[i + 2]) > 30) n++;
    }
    return n;
  };
  const cx = pl.cx, bottom = pl.y + pl.h;
  // 旋转臂落点（帧锚 = cx−22.5[facing 1 的 2.5 后移]，格内 (23..35,22..35) 旋转
  // −108° 绕 (26,30) → 世界 x+0.5..+17、y−30..−17）：取臂外伸带（躯干右缘以右）
  const armBox = box(cx + 6, bottom - 32, cx + 19, bottom - 14);
  const ctrlBox = box(cx - 30, bottom + 2, cx + 30, bottom + 10);   // 脚下控制带
  res.arm = {
    tqVsIdle: countDiff(S0.d, S1.d, armBox),
    fullVsIdle: countDiff(S0.d, S2.d, armBox),
    fullVsTq: countDiff(S1.d, S2.d, armBox),
    smallVsBig: countDiff(S1.d, S3.d, armBox),
  };
  res.ctrl = { tqVsIdle: countDiff(S0.d, S1.d, ctrlBox), fullVsIdle: countDiff(S0.d, S2.d, ctrlBox) };
  res.idleBack = countDiff(S0.d, S4.d, armBox);       // 回 idle 应还原
  res.boxes = { arm: armBox, ctrl: ctrlBox };
  return res;
});
console.log(JSON.stringify(out));
const okArm = out.arm && out.arm.tqVsIdle >= 20 && out.arm.fullVsIdle >= 20 && out.arm.fullVsTq >= 6;
const okSmall = out.arm && out.arm.smallVsBig >= 8;
const okCtrl = out.ctrl && out.ctrl.tqVsIdle <= 12 && out.ctrl.fullVsIdle <= 12;
const okRevert = out.idleBack !== undefined && out.idleBack <= 4;
console.log('VERDICT:', okArm && okSmall && okCtrl && okRevert ? 'PASS' : 'FAIL',
  { okArm, okSmall, okCtrl, okRevert });
await b.close();
process.exit(okArm && okSmall && okCtrl && okRevert ? 0 : 2);
