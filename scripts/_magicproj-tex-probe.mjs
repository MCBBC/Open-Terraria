// 一次性探针（G9 MagicProj 贴图化 E2E）：
//  ① 数据链：projFrameCount(837)=3、projSprite(837) 26×90、projFrameImg(837,n)=26×30 切片
//  ② 离屏直绘：projId=837 走贴图（多色大 blob、中心非透明）；projId=0 仍画 4px 圆点
//  ③（可选，--live）真画布：实体桶内 MagicProj(837) 渲染无 fallback 紫点、projId=0 出绿点
// ③ 依赖进图（?play=small）；并行会话热改 Game.ts 期间游戏循环可能崩，默认跳过、
//   加 --live 才尝试，崩则记 SKIP 不算失败。
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_magicproj-tex-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WANT_LIVE = process.argv.includes('--live');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?magicprobtex=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const A = [];
const ok = (name, pass, extra) => { A.push({ name, pass: !!pass }); console.log((pass ? '  ✓ ' : '  ✗ FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const skip = (name, why) => { console.log('  - SKIP ' + name + '（' + why + '）'); };

// ---- ① 数据链（真表 + 真切片，不需进图）----
const data = await page.evaluate(async () => {
  const arrow = await import('/src/entities/Arrow.ts');
  const img = arrow.projSprite(837);
  await new Promise((r) => {
    if (img?.complete) return r();
    const t = setTimeout(r, 4000);
    img?.addEventListener('load', () => { clearTimeout(t); r(); }, { once: true });
    img?.addEventListener('error', () => { clearTimeout(t); r(); }, { once: true });
  });
  const f0 = arrow.projFrameImg(837, 0);
  const f2 = arrow.projFrameImg(837, 2);
  return {
    frames: arrow.projFrameCount(837),
    loaded: !!(img && img.complete && img.naturalWidth > 0),
    nat: img ? [img.naturalWidth, img.naturalHeight] : null,
    rotRight: [...arrow.PROJ_ROT_RIGHT],
    slice0: f0 ? [f0.width, f0.height] : null,
    slice2: f2 ? [f2.width, f2.height] : null,
  };
});
ok('837 贴图就绪（Projectile_837.png 26×90）', data.loaded && data.nat?.[0] === 26 && data.nat?.[1] === 90, data.nat);
ok('837 帧行数 = 3（vanilla-projframes.json）', data.frames === 3, data.frames);
ok('837 帧切片 26×30（竖向行切片，projFrameImg）', data.slice0?.[0] === 26 && data.slice0?.[1] === 30 && data.slice2?.[0] === 26 && data.slice2?.[1] === 30, { slice0: data.slice0, slice2: data.slice2 });
ok('PROJ_ROT_RIGHT 含 837（朝右族）', data.rotRight.includes(837), data.rotRight);

// ---- ② 离屏直绘（确定性，不依赖相机/背景/游戏循环）----
const off = await page.evaluate(async () => {
  const { MagicProj } = await import('/src/entities/MagicProj.ts');
  const stat = (canvas) => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0; const colors = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8) { n++; colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
    }
    return { n, colors: colors.size, w: canvas.width, h: canvas.height };
  };
  const drawAt = async (projId, vx) => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const p = new MagicProj(24, 24, vx, 0, 10, 600, '#A040FF', projId);
    for (let i = 0; i < 2; i++) { p.draw({ canvas: c }, {}); await new Promise((r) => setTimeout(r, 30)); }
    return stat(c);
  };
  return {
    tex: await drawAt(837, 6),
    texLeft: await drawAt(837, -6),
    dot: await drawAt(0, 6),
    scale: (() => { const p = new MagicProj(0, 0, 6, 0, 10, 600, '#A040FF', 20); return { w: p.w, h: p.h, s: p.drawScale }; })(),
  };
});
ok('projId=837 离屏直绘：贴图大 blob（>150 非透明 px、≥3 色）', off.tex.n > 150 && off.tex.colors >= 3, off.tex);
ok('projId=837 向左飞行同样出贴图（镜像分支不落兜底）', off.texLeft.n > 150 && off.texLeft.colors >= 3, off.texLeft);
// 圆点 = r4 实心圆 + canvas 抗锯齿边缘混色（~60px/3 色）；判据 = 远小于贴图 blob
ok('projId=0 离屏直绘：仅 4px 圆点（抗锯齿小 blob，远小于贴图）', off.dot.n > 0 && off.dot.n < 120 && off.dot.n * 3 < off.tex.n, off.dot);
ok('projId=20 SetDefaults 采纳：4×4 判定盒、scale 0.65', off.scale.w === 4 && off.scale.h === 4 && Math.abs(off.scale.s - 0.65) < 1e-6, off.scale);

// ---- ③ 真画布实体循环（可选）----
if (!WANT_LIVE) {
  skip('真画布实体循环', '默认跳过；加 --live 启用（需 ?play=small 进图）');
} else {
  await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&magicprobtex=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 45 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!inGame) {
    skip('真画布实体循环', '游戏未就绪（并行会话热改 Game.ts 可能致崩）: ' + errors.slice(0, 2).join(' | ').slice(0, 120));
  } else {
    const live = await page.evaluate(async () => {
      const g = window.__swGame;
      const { MagicProj } = await import('/src/entities/MagicProj.ts');
      const w = g.world.store;
      const px = g.player.cx, py = g.player.cy;
      let ax = 0, ay = 0;
      outer: for (const dy of [110, 130, 150, 90]) {
        for (const dx of [-90, 90, 0, -140, 140]) {
          const x = px + dx, y = py - dy;
          if (!w.isSolid(Math.floor((x + 13) / 16), Math.floor((y + 13) / 16))
            && !w.isSolid(Math.floor((x + 133) / 16), Math.floor((y + 13) / 16))) { ax = x; ay = y; break outer; }
        }
      }
      const tex = new MagicProj(ax, ay, 0, 0, 10, 3600, '#A040FF', 837);
      const dot = new MagicProj(ax + 120, ay, 0, 0, 10, 3600, '#00FF00');
      g.entities.add(tex, 'projectiles');
      g.entities.add(dot, 'projectiles');
      await new Promise((r) => setTimeout(r, 1200));
      const canvas = g.renderer.canvas;
      const k = canvas.width / g.camera.viewW;
      const sample = (ent, rad) => {
        const [sx, sy] = g.camera.worldToScreen(ent.x + ent.w / 2, ent.y + ent.h / 2);
        const cx = Math.round(sx * k), cy = Math.round(sy * k), R = Math.round(rad * k);
        const d = canvas.getContext('2d').getImageData(Math.max(0, cx - R), Math.max(0, cy - R), R * 2, R * 2).data;
        let purple = 0, green = 0, n = 0; const colors = new Set();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] <= 8) continue;
          n++; colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          if (d[i] === 160 && d[i + 1] === 64 && d[i + 2] === 255) purple++;
          if (d[i] === 0 && d[i + 1] === 255 && d[i + 2] === 0) green++;
        }
        return { n, colors: colors.size, purple, green };
      };
      const alive = g.entities.projectiles.filter((p) => p.constructor.name === 'MagicProj').length;
      return { alive, tex: sample(tex, 26), dot: sample(dot, 12) };
    });
    ok('真画布：两个 MagicProj 存活于弹桶', live.alive === 2, { alive: live.alive });
    ok('真画布：projId=837 渲染贴图（无 fallback 紫点 #A040FF）', live.tex.n > 150 && live.tex.colors >= 3 && live.tex.purple < 10, live.tex);
    ok('真画布：projId=0 仍是绿点兜底（含纯绿像素）', live.dot.green > 3, live.dot);
  }
}

const failed = A.filter((a) => !a.pass);
console.log(failed.length ? `FAIL ${failed.length}/${A.length}` : `ALL PASS ${A.length}/${A.length}`);
await browser.close();
process.exit(failed.length ? 1 : 0);
