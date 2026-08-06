// 天空渲染：昼夜渐变、太阳/月亮、星星、云
import type { Clock } from '../world/World';
import { shade, mix } from '../assets/Palette';

// 天空关键色 [时刻, 顶色, 底色]（时刻 0-1）
const SKY_KEYS: Array<[number, string, string]> = [
  [0.0, '#050A1E', '#0E1630'],   // 午夜
  [0.22, '#050A1E', '#1A2440'],  // 黎明前
  [0.27, '#3A4A8A', '#E89A5A'],  // 日出
  [0.35, '#4A8AD4', '#A8D4F0'],  // 上午
  [0.5, '#4A90E0', '#B8DCF5'],   // 正午
  [0.65, '#4A8AD4', '#A8D0E8'],  // 下午
  [0.73, '#4A5A9A', '#E88A5A'],  // 日落
  [0.78, '#101838', '#2A2448'],  // 黄昏后
  [0.85, '#050A1E', '#0E1630'],  // 夜
  [1.0, '#050A1E', '#0E1630'],
];

function lerpColor(a: string, b: string, t: number): string {
  return mix(a, b, t);
}

/** 像素太阳贴图：24×24，硬边日盘 + 环形暗纹 + 8 条块状射线 */
function makeSunSprite(): HTMLCanvasElement {
  const S = 24, R = 8;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  // 射线（块状）
  ctx.fillStyle = '#FFD05A';
  const rays = [[12, 0], [12, 23], [0, 12], [23, 12], [4, 4], [19, 4], [4, 19], [19, 19]];
  for (const [rx, ry] of rays) ctx.fillRect(rx - 1, ry - 1, 3, 3);
  // 日盘
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - 11.5, dy = y - 11.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R + 0.5) continue;
      let col = '#FFF3C4'; // 内核
      if (d > R - 1.5) col = '#FFC94A'; // 外环
      else if (d > R - 3) col = '#FFE084';
      // 太阳黑子暗纹（十字分布）
      if (d < R - 3 && ((x === 9 || x === 14) && y >= 9 && y <= 14)) col = '#F8D878';
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** 筋斗云风格像素贴图：下排大卷云 + 上排小卷云叠落，平底，端头收小 */
function makeCloudSprite(variant: number): HTMLCanvasElement {
  const W = 64, H = 26;
  const baseY = 23;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const rng = (n: number) => {
    let h = (n + variant * 7919 + 13) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const solid = new Uint8Array(W * H);
  // 半圆卷（平底半圆：上半圆 + 底切平）
  const roll = (cx: number, r: number, topY: number) => {
    for (let y = -r; y <= 0; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const px = cx + x, py = topY + y;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        solid[py * W + px] = 1;
      }
    }
    // 卷底切平到 baseY
    for (let x = -r; x <= r; x++) {
      for (let py = topY; py <= baseY; py++) {
        const px = cx + x;
        if (px < 0 || px >= W || py >= H) continue;
        solid[py * W + px] = 1;
      }
    }
  };
  // 布局随变体：卷数 / 尺寸 / 中心偏移 / 是否双层
  const nBottom = 4 + (variant % 3);          // 4-6 个底卷
  const rBase = 5 + Math.floor(rng(7) * 3);   // 5-7
  const centerBias = Math.floor(rng(11) * 5) - 2;
  const twoTier = variant % 2 === 0;
  const margin = 8;
  const span = W - margin * 2;
  const lobes: Array<[number, number]> = [];  // [cx, r]
  for (let i = 0; i < nBottom; i++) {
    const f = nBottom === 1 ? 0.5 : i / (nBottom - 1);
    // 中间大、两端小的钟形尺寸 + 中心偏移 + 抖动
    const bell = 1 - Math.pow(Math.abs(f - 0.5) * 2, 1.6) * 0.55;
    const r = Math.max(3, Math.round(rBase * bell + (rng(i) - 0.5)));
    const cx = Math.round(margin + f * span + centerBias + (rng(i + 30) - 0.5) * 3);
    lobes.push([cx, r]);
    roll(cx, r, baseY - r);
  }
  // 上排小卷：嵌在底卷间隙上方
  if (twoTier) {
    for (let i = 0; i < lobes.length - 1; i++) {
      const [cx1, r1] = lobes[i];
      const [cx2] = lobes[i + 1];
      const gapX = Math.round((cx1 + cx2) / 2);
      const r = Math.max(2, Math.min(r1 - 1, 3 + Math.floor(rng(i + 60) * 3)));
      roll(gapX, r, baseY - r1 - r + 2);
    }
    // 中央大卷上再叠一个小卷（筋斗云的"云头"）
    const mid = lobes[Math.floor(lobes.length / 2)];
    roll(mid[0] + (rng(90) > 0.5 ? 2 : -2), 3, baseY - mid[1] - 4);
  }
  // 行填充后处理：每行最左到最右实心填满（卷间隙闭合，消除横向断层）
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < W; x++) {
      if (solid[y * W + x]) { if (lo < 0) lo = x; hi = x; }
    }
    if (lo < 0) continue;
    for (let x = lo; x <= hi; x++) solid[y * W + x] = 1;
  }
  // 按轮廓上色：顶缘高光 / 底缘阴影 / 主体
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!solid[y * W + x]) continue;
      const above = y > 0 && solid[(y - 1) * W + x];
      const below = y < H - 1 && solid[(y + 1) * W + x];
      const left = x > 0 && solid[y * W + x - 1];
      let col: [number, number, number];
      if (!above) col = [255, 255, 255];
      else if (!below) col = [176, 190, 208];
      else if (!left) col = [248, 250, 253];
      else col = [238, 242, 249];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class SkyRenderer {
  private stars: Array<{ x: number; y: number; s: number }> = [];
  private clouds: Array<{ x: number; y: number; w: number; sp: number; layer: number; variant: number }> = [];

  constructor() {
    for (let i = 0; i < 120; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() < 0.2 ? 2 : 1 });
    }
    for (let i = 0; i < 12; i++) {
      // 三层视差：远(小/慢/淡) 中 近(大/快/实)
      const layer = i % 3;
      const wBase = [0.05, 0.09, 0.14][layer];
      this.clouds.push({
        x: Math.random(), y: 0.04 + Math.random() * 0.32,
        w: wBase + Math.random() * wBase * 0.7,
        sp: [0.0012, 0.0025, 0.0045][layer] * (0.7 + Math.random() * 0.6),
        layer,
        variant: Math.floor(Math.random() * 6),
      });
    }
    this.sunSprite = makeSunSprite();
    this.cloudSprites = [0, 1, 2, 3, 4, 5].map((i) => makeCloudSprite(i));
  }

  sunSprite: HTMLCanvasElement;
  cloudSprites: HTMLCanvasElement[];

  skyColors(t: number): [string, string] {
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      const [t0, a0, b0] = SKY_KEYS[i];
      const [t1, a1, b1] = SKY_KEYS[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        return [lerpColor(a0, a1, f), lerpColor(b0, b1, f)];
      }
    }
    return [SKY_KEYS[0][1], SKY_KEYS[0][2]];
  }

  draw(ctx: CanvasRenderingContext2D, clock: Clock, viewW: number, viewH: number, camX: number) {
    const t = clock.timeOfDay;
    const [top, bottom] = this.skyColors(t);
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    const isNight = t < 0.27 || t > 0.78;
    // 星星
    if (isNight) {
      const fade = Math.min(1, Math.max(0, (t < 0.5 ? (0.27 - t) / 0.05 : (t - 0.78) / 0.05)));
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = '#E8ECFF';
      for (const s of this.stars) {
        const sx = ((s.x * viewW * 2 - camX * 0.1) % (viewW * 2) + viewW * 2) % (viewW * 2);
        if (sx > viewW) continue;
        ctx.fillRect(sx, s.y * viewH, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }

    // 太阳/月亮沿圆弧
    const dayT = (t - 0.25) / 0.5;   // 0..1 白天
    const nightT = t >= 0.75 ? (t - 0.75) / 0.5 : (t + 0.25) / 0.5; // 0..1 夜
    if (dayT >= 0 && dayT <= 1) {
      const sx = viewW * (0.1 + dayT * 0.8);
      const sy = viewH * (0.75 - Math.sin(dayT * Math.PI) * 0.55);
      // 柔和光晕（背景层）
      const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 80);
      glow.addColorStop(0, 'rgba(255,240,180,0.45)');
      glow.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, 80, 0, Math.PI * 2); ctx.fill();
      // 像素太阳贴图（3 倍放大、无平滑）
      const S = this.sunSprite;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(sx, sy);
      ctx.rotate(Math.sin(t * 0.4) * 0.03);
      ctx.drawImage(S, -S.width * 1.5, -S.height * 1.5, S.width * 3, S.height * 3);
      ctx.restore();
    }
    if (isNight) {
      const sx = viewW * (0.1 + nightT * 0.8);
      const sy = viewH * (0.7 - Math.sin(nightT * Math.PI) * 0.5);
      const mg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 60);
      mg.addColorStop(0, 'rgba(200,210,255,0.25)');
      mg.addColorStop(1, 'rgba(200,210,255,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ECECF4';
      ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
      // 环形山阴影（偏一侧的暗斑，制造立体感）
      ctx.fillStyle = 'rgba(180,185,205,0.7)';
      ctx.beginPath(); ctx.arc(sx + 6, sy + 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#E4E4EC';
      ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#D5D5E0';
      ctx.beginPath(); ctx.arc(sx - 3, sy + 5, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + 4, sy - 5, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // 云：三层视差（远→近），像素贴图
    for (const layer of [0, 1, 2]) {
      this.drawCloudLayer(ctx, viewW, viewH, isNight, layer);
    }

    // 远山最后绘制（最前层）：太阳和云在山后，不会出现在山前
    this.drawMountains(ctx, viewW, viewH, camX);
  }

  // ---- 远山（青绿远岫，多倍频脊线）----
  private mountainLayers: Array<{ pts: number[]; top: string; body: string; parallax: number; baseYF: number; ampF: number }> = [];

  private buildMountains() {
    const W = 1600;
    // 双倍频值噪声脊线。控制点按周期取样（首尾同值）→ 图案无缝平铺，
    // 消除接缝处的垂直悬崖（"被一刀砍"的根源）；pow 收尖山峰、压平谷底
    const SEGS1 = 8, SEGS2 = 40;
    const mk = (seed: number, amp: number, oct2: number): number[] => {
      let h = seed >>> 0;
      const rnd = () => {
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        h ^= h >>> 13;
        return ((h >>> 0) % 1000) / 1000;
      };
      const ctrl1: number[] = [], ctrl2: number[] = [];
      for (let i = 0; i < SEGS1; i++) ctrl1.push(rnd());
      for (let i = 0; i < SEGS2; i++) ctrl2.push(rnd());
      const pts: number[] = [];
      for (let x = 0; x <= W; x++) {
        const f1 = (x / W) * SEGS1;
        const i0 = Math.floor(f1), s1 = f1 - i0;
        const sm1 = s1 * s1 * (3 - 2 * s1);
        const v1 = ctrl1[i0 % SEGS1] * (1 - sm1) + ctrl1[(i0 + 1) % SEGS1] * sm1;
        const f2 = (x / W) * SEGS2;
        const j0 = Math.floor(f2), s2 = f2 - j0;
        const sm2 = s2 * s2 * (3 - 2 * s2);
        const v2 = ctrl2[j0 % SEGS2] * (1 - sm2) + ctrl2[(j0 + 1) % SEGS2] * sm2;
        const v = v1 * 0.75 + v2 * oct2 * 0.25;
        pts.push(Math.pow(v, 1.25) * amp + amp * 0.2);
      }
      return pts;
    };
    // 远→近：青绿渐深（远山如黛）
    this.mountainLayers = [
      { pts: mk(12345, 1.0, 0.5), top: '#A8C4B4', body: '#94B29E', parallax: 0.1, baseYF: 0.62, ampF: 0.26 },
      { pts: mk(54321, 0.8, 0.7), top: '#7FA88C', body: '#6E9276', parallax: 0.18, baseYF: 0.7, ampF: 0.2 },
      { pts: mk(98765, 0.62, 0.9), top: '#5E8A68', body: '#50745A', parallax: 0.28, baseYF: 0.78, ampF: 0.15 },
    ];
  }

  private drawMountains(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number) {
    if (!this.mountainLayers.length) this.buildMountains();
    const W = 1600;
    const reps = Math.ceil(viewW / W) + 2;
    for (const layer of this.mountainLayers) {
      const baseY = viewH * layer.baseYF;
      const off = ((-camX * layer.parallax) % W + W) % W;
      // 山体（垂直渐变：山顶亮 → 山脚深）
      for (let rep = -1; rep <= reps; rep++) {
        const x0 = off + rep * W;
        const ridgeTop = baseY - layer.ampF * viewH;
        const grad = ctx.createLinearGradient(0, ridgeTop, 0, baseY + 30);
        grad.addColorStop(0, layer.top);
        grad.addColorStop(1, layer.body);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0, baseY + 30);
        const step = 4;
        for (let i = 0; i <= W; i += step) {
          ctx.lineTo(x0 + i, baseY - layer.pts[i] * layer.ampF * viewH);
        }
        ctx.lineTo(x0 + W, baseY + 30);
        ctx.closePath();
        ctx.fill();
      }
      // 山脊受光描边（左上亮）
      ctx.strokeStyle = layer.top;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55;
      for (let rep = -1; rep <= reps; rep++) {
        const x0 = off + rep * W;
        ctx.beginPath();
        const step = 4;
        for (let i = 0; i <= W; i += step) {
          const y = baseY - layer.pts[i] * layer.ampF * viewH;
          if (i === 0) ctx.moveTo(x0 + i, y);
          else ctx.lineTo(x0 + i, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 山脚雾带（大气透视）
    const fog = ctx.createLinearGradient(0, viewH * 0.6, 0, viewH * 0.82);
    fog.addColorStop(0, 'rgba(200,216,214,0)');
    fog.addColorStop(1, 'rgba(200,216,214,0.45)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, viewH * 0.6, viewW, viewH * 0.22);
  }

  private drawCloudLayer(
    ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    isNight: boolean, layer: number,
  ) {
    const layerAlpha = [0.4, 0.65, 0.95][layer];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const c of this.clouds) {
      if (c.layer !== layer) continue;
      c.x += c.sp / 60;
      if (c.x > 1.2) c.x = -c.w - 0.05;
      const spr = this.cloudSprites[c.variant % this.cloudSprites.length];
      const cw = c.w * viewW;
      const scale = cw / spr.width;
      ctx.globalAlpha = (isNight ? 0.1 + layer * 0.03 : layerAlpha);
      ctx.drawImage(spr, c.x * viewW, c.y * viewH, cw, spr.height * scale);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
