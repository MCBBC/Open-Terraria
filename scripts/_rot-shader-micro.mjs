// ★rot 微测（2026-09-25 用户实报「全武器/弹幕旋转失效」判别刃）：
//   quadSprite(uRot) 的内容旋转 vs 2D ctx.rotate 内容旋转——同一 CTM/精灵下
//   GL 与 2D 逐像素对拍。非对称四象限精灵（TL红/TR绿/BL蓝/BR黄+对角黑钉）
//   =内容旋转/镜像/180° 反射全可判。node 无 GL——本探针是 rot 语义唯一判别面。
// 运行:SW_ORIGIN=http://localhost:5220 node tools/run-diag.mjs scripts/_rot-shader-micro.mjs
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`${ORIGIN}/?bgl=1&t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');
  const layer = new GLSpriteLayer();
  if (layer.unavailable) return { err: 'layer unavailable' };

  // ---- 非对称精灵 32×48:四象限异色+黑角钉 ----
  const SW_ = 32, SH = 48;
  const sp = document.createElement('canvas');
  sp.width = SW_; sp.height = SH;
  const sc = sp.getContext('2d', { willReadFrequently: true });
  sc.fillStyle = 'rgb(255,0,0)'; sc.fillRect(0, 0, 16, 24);        // TL 红
  sc.fillStyle = 'rgb(0,255,0)'; sc.fillRect(16, 0, 16, 24);       // TR 绿
  sc.fillStyle = 'rgb(0,0,255)'; sc.fillRect(0, 24, 16, 24);       // BL 蓝
  sc.fillStyle = 'rgb(255,255,0)'; sc.fillRect(16, 24, 16, 24);    // BR 黄
  sc.fillStyle = 'rgb(0,0,0)'; sc.fillRect(2, 2, 3, 3);            // TL 黑钉(180°反射判别)

  const e = layer.texFromImage('__rotmicro', sp, false, true);
  if (!e) return { err: 'texFromImage failed' };

  // ★执行器 decode 等价式（GLShimExecutor.decode 逐式照抄;CTM 从 2D ctx 读真值）
  const fround = Math.fround;
  function decode(m, dx, dy, dw, dh) {
    const { a, b, c, d, e: ee, f } = m;
    if (b === 0 && c === 0) {
      const x0 = fround(a * dx) + ee, x1 = fround(a * (dx + dw)) + ee;
      const y0 = fround(d * dy) + f, y1 = fround(d * (dy + dh)) + f;
      return { dx: Math.min(x0, x1), dy: Math.min(y0, y1), dw: Math.abs(x1 - x0), dh: Math.abs(y1 - y0), rot: 0, flipX: a < 0, flipY: d < 0 };
    }
    const lu = Math.hypot(a, b), lv = Math.hypot(c, d);
    if (lu === 0 || lv === 0) return null;
    const dot = a * c + b * d;
    if (Math.abs(dot) > 1e-4 * lu * lv) return null;
    const det = a * d - b * c;
    const cx = fround(fround(a * dx) + fround(c * dy)) + ee;
    const cy = fround(fround(b * dx) + fround(d * dy)) + f;
    const cx2 = fround(fround(a * (dx + dw)) + fround(c * (dy + dh))) + ee;
    const cy2 = fround(fround(b * (dx + dw)) + fround(d * (dy + dh))) + f;
    return {
      dx: fround((cx + cx2) / 2) - dw * lu / 2,
      dy: fround((cy + cy2) / 2) - dh * lv / 2,
      dw: dw * lu, dh: dh * lv,
      rot: Math.atan2(b, a), flipX: false, flipY: det < 0,
    };
  }

  const W = 256, H = 256;
  const cases = [
    // [名, 2D 参照变换序列, drawImage dst(offx,offy)]
    ['S1 纯旋转45° 居中', (x) => { x.translate(128, 128); x.rotate(Math.PI / 4); }, -16, -24],
    ['S2 镜像旋转 R2-F1 (S(-1,1)·R(π-0.6))', (x) => { x.translate(128, 128); x.scale(-1, 1); x.rotate(Math.PI - 0.6); }, -16, -24],
    ['S3 持枪档 facing=1 aim=-1.0 非居中dst', (x) => { x.translate(200, 128); x.rotate(-1.0); }, -2, -24],
    ['S4 持枪档 facing=-1 aim=-1.0', (x) => { x.translate(200, 128); x.scale(-1, 1); x.rotate(-1.0); }, -2, -24],
    ['S5 纯旋转-90°(火箭上天) 居中', (x) => { x.translate(128, 128); x.rotate(-Math.PI / 2); }, -16, -24],
    ['S6 小角度 0.15rad', (x) => { x.translate(128, 128); x.rotate(0.15); }, -16, -24],
  ];

  const results = [];
  for (const [name, setup, ox, oy] of cases) {
    // ---- 2D 参照 ----
    const cv2 = document.createElement('canvas');
    cv2.width = W; cv2.height = H;
    const x2 = cv2.getContext('2d', { willReadFrequently: true });
    x2.imageSmoothingEnabled = false;
    setup(x2);
    x2.drawImage(sp, 0, 0, SW_, SH, ox, oy, SW_, SH);
    const d2 = x2.getImageData(0, 0, W, H).data;

    // ---- GL 路径:同 CTM → decode → quadSprite ----
    // ★DOMMatrix a..f 是原型访问器——spread 拿不到,须逐字段读（首跑踩坑:spread
    //   空对象→decode NaN→quadSprite 全画布垃圾,判别面失效）
    const t6 = x2.getTransform();
    const m = { a: t6.a, b: t6.b, c: t6.c, d: t6.d, e: t6.e, f: t6.f };
    const g = decode(m, ox, oy, SW_, SH);
    if (!g) { results.push({ name, err: 'decode null' }); continue; }
    layer.resize(W, H);
    layer.begin('__rotFbo');
    if (layer.unavailable) return { err: 'begin failed: ' + name };
    layer.quadSprite(e, 0, 0, SW_, SH, g.dx, g.dy, g.dw, g.dh,
      { rot: g.rot, flipX: g.flipX, flipY: g.flipY, smooth: false });
    layer.end();
    const glCv = document.createElement('canvas');
    glCv.width = W; glCv.height = H;
    const gx = glCv.getContext('2d', { willReadFrequently: true });
    gx.drawImage(layer.canvas, 0, 0);
    const gd = gx.getImageData(0, 0, W, H).data;

    // ---- 判别器（相位不敏感）:黑钉质心距离 + 象限色锚 ----
    // 硬边精灵在旋转重采样下 Skia/GL 采样相位不同 ⇒ 逐像素对比恒大面积翻转
    // （判别力为零）;内容旋转是否正确用【黑钉质心】判:旧病（内容不转）钉距
    // ≈|R·d−d|≈10-24px,正确实现 ≲1px（亚像素采样差）。
    const pin = (d) => {
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 128 && d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) { sx += x; sy += y; n++; }
      }
      return n ? { x: sx / n, y: sy / n, n } : null;
    };
    const pRef = pin(d2), pGl = pin(gd);
    const pinDist = (pRef && pGl) ? Math.hypot(pRef.x - pGl.x, pRef.y - pGl.y) : -1;
    // 象限色锚:精灵内四象限中心点在 CTM 下的映射位（2D 侧同式）——采 GL 与 ref 该处颜色类
    const tm = x2.getTransform();
    const anchors = [[8, 12], [24, 12], [8, 36], [24, 36]].map(([ax, ay]) => {
      const wx = tm.a * (ax + ox) + tm.c * (ay + oy) + tm.e;
      const wy = tm.b * (ax + ox) + tm.d * (ay + oy) + tm.f;
      const xi = Math.round(wx), yi = Math.round(wy);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
      const i = (yi * W + xi) * 4;
      const cls = (d) => d[i] > 180 && d[i + 1] < 80 ? 'R' : d[i + 1] > 180 && d[i] < 80 ? 'G'
        : d[i + 2] > 180 && d[i] < 80 ? 'B' : d[i] > 180 && d[i + 1] > 180 && d[i + 2] < 80 ? 'Y' : '?';
      return { ref: cls(d2), gl: cls(gd) };
    });
    const anchorOk = anchors.filter((a) => a !== null).every((a) => a.ref === a.gl);
    // 信息面:逐像素差（旋转重采样相位噪声,不作判据）
    let n = 0;
    for (let i = 0; i < d2.length; i += 4) {
      if (d2[i + 3] <= 0 && gd[i + 3] <= 0) continue;
      const dd = Math.max(Math.abs(d2[i] - gd[i]), Math.abs(d2[i + 1] - gd[i + 1]), Math.abs(d2[i + 2] - gd[i + 2]));
      if (dd > 32) n++;
    }
    results.push({
      name, geo: { dx: +g.dx.toFixed(2), dy: +g.dy.toFixed(2), dw: +g.dw.toFixed(2), dh: +g.dh.toFixed(2), rot: +g.rot.toFixed(4), flipY: g.flipY, flipX: g.flipX },
      pinDist: +pinDist.toFixed(2), pinRef: pRef && { x: +pRef.x.toFixed(1), y: +pRef.y.toFixed(1), n: pRef.n }, pinGl: pGl && { x: +pGl.x.toFixed(1), y: +pGl.y.toFixed(1), n: pGl.n },
      anchorOk, anchors, mismatchInfo: n,
    });
  }
  return results;
});

console.log(JSON.stringify(out, null, 2));
const bad = Array.isArray(out) && out.some((r) => !r.anchorOk || r.pinDist > 2.0);
console.log(bad ? 'VERDICT: RED —— 内容旋转与 2D 不等(钉质心>2px 或象限色锚错)' : 'VERDICT: GREEN');
await browser.close();
