// ★F6 分布形对抗收尾形锚闸门（2026-09-01 红队 findings → 蓝队修复回归）。
// 原版真值 = Terarria1458/Terraria.GameContent.Drawing/ParticleOrchestrator.cs、
//   Terarria1457/Terraria/Utils.cs（RotatedByRandom/NextVector2Circular）、Dust.cs:260（CloneDust）。
// 判别式（红队仲裁口径）：
//   ① circ 线性盘：支撑集 P(|R|>max)=0、E[R]=max/2（盒均匀版 E=2/3·max 可分辨）；
//   ② RotatedByRandom 三角分布：P(|ja|<half/2)=0.75（三角 CDF）、E|ja|=half/3、
//     支撑 |ja|≤half（均匀版 P=0.5/E=half/2 可分辨）；maxRadians=τ 时卷绕方向均匀；
//   ③ blackLightningSmall 速度 y/x 系数比=0.5（new Vector2(1f,0.5f)×0.2f）；
//   ④ paladinsHammer 径向方向方差≈0（速度严格沿 (dust−盒心) 归一向）+ 单标量幅
//     E[speed]=9.5/2（逐分量独掷版对角向 E≈5.14 可分辨）。
import { describe, expect, it } from 'vitest';
import {
  blackLightningSmallFx, classyCaneFx, harpyCharmFamilyFx, inScreenDungeonSpawnFx,
  itemTransferFx, moonLordWhipHitFx, paladinsHammerShockwaveFx, silverBulletSparkleFx,
  stardustPunchFx,
} from '../src/fx/orchestraFx';

/** 种子化 rng（mulberry32,与 tests/spectre-stellar-procs.test.ts 同惯用法） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PartRec = { x: number; y: number; color: string; vx?: number; vy?: number; ax?: number; ay?: number } & Record<string, unknown>;
type DustRec = { type: number; x: number; y: number; vx?: number; vy?: number } & Record<string, unknown>;

interface Harness {
  particles: PartRec[];
  dusts: DustRec[];
  world: { store: { inBounds: (x: number, y: number) => boolean; isSolid: (x: number, y: number) => boolean } };
}
type HookFn = (...a: never[]) => unknown;
type H = Harness & {
  spawnParticles: (x: number, y: number, color: string, count: number,
    speed?: number, opts?: Record<string, unknown>) => void;
  spawnDust: (x: number, y: number, w: number, hh: number, type: number,
    vx?: number, vy?: number, alpha?: number, color?: unknown, scale?: number,
    noGravity?: boolean, perfect?: boolean) => DustRec;
  playSfxWav: () => void;
  playSfxFiles: () => void;
} & Record<string, HookFn>;

function mkH(): H {
  const h: Harness = { particles: [], dusts: [], world: { store: { inBounds: () => false, isSolid: () => false } } };
  return Object.assign(h, {
    spawnParticles: (x: number, y: number, color: string, _count: number,
      _speed?: number, opts: Record<string, unknown> = {}): void => {
      void _count; void _speed;
      h.particles.push({ x, y, color, ...opts } as PartRec);
    },
    spawnDust: (x: number, y: number, _w: number, _hh: number, type: number,
      vx = 0, vy = 0): DustRec => {
      void _w; void _hh;
      const rec = { type, x, y, vx, vy } as DustRec;
      h.dusts.push(rec);
      return rec;
    },
    playSfxWav: (): void => undefined,
    playSfxFiles: (): void => undefined,
  }) as unknown as H;
}
const asG = (h: H): Parameters<typeof itemTransferFx>[0] => h as unknown as Parameters<typeof itemTransferFx>[0];

describe('★F6 形锚① itemTransfer bit0 初速（NextVector2Square,Utils.cs:1286-88）', () => {
  // ★F-14（2026-09-02 对抗批）：原版 :2697=NextVector2Square(-1,1) 逐轴均匀 ×24——
  //  旧 circ(24,24) 线性盘近似退役（支撑集=方形、E[R]=24·E[√(U²+V²)]=24×0.76520≈18.36）
  it('支撑集=方形（|vx|,|vy|≤24）且 E[R]≈18.36（旧 circ 盘 E=12 判红）', () => {
    const N = 100000;
    const rng = mulberry32(20260901);
    let sum = 0;
    let overflow = 0;
    for (let i = 0; i < N; i++) {
      const h = mkH();
      itemTransferFx(asG(h), 0, 0, 10, 10, 1, 0b0001, rng);
      const p = h.particles[0];
      const r = Math.hypot(Number(p.vx), Number(p.vy));
      sum += r;
      if (Math.abs(Number(p.vx)) > 24 + 1e-9 || Math.abs(Number(p.vy)) > 24 + 1e-9) overflow++;
    }
    expect(overflow).toBe(0);                       // 逐轴支撑闭合（方形）
    expect(sum / N).toBeGreaterThan(18.26);         // E[R]≈18.36（SE≈0.022）
    expect(sum / N).toBeLessThan(18.46);
  });

  it('掷数契约：恒 3 掷=原版（:2695 TTL 死掷 1+:2697 Square×2,★F-14）', () => {
    let calls = 0;
    const crng = (): number => { calls++; return 0.5; };
    itemTransferFx(asG(mkH()), 0, 0, 10, 10, 1, 0b0001, crng);
    expect(calls).toBe(3);                          // ★F-14：原版=3（曾 circ 位2+速2=4、逐分量双调用=8）
    calls = 0;
    silverBulletSparkleFx(asG(mkH()), 0, 0, 3, -2, crng);
    // ★⑥掷序清偿（2026-09-02）：补 :3280/:3283 两死掷 → 5=死掷2+scale1+位 circ2（曾 3）
    expect(calls).toBe(5);
  });
});

describe('★F6 形锚② RotatedByRandom 三角分布（Utils.cs:1785-87）', () => {
  // harpyCharmFamilyFx 内环 ja=(rng−rng)×0.3141592741012573（:551）,move=(1,0) →
  // 观测方向=ja 本尊（支撑 0.628<2π 不卷绕）
  const HALF = 0.3141592741012573;
  it('峰在 0：P(|ja|<half/2)≈0.75（三角 CDF）、E|ja|≈half/3、支撑 |ja|≤half', () => {
    const calls = 34000;                            // 3 粒/呼 → ≈1.02e5 样本
    const rng = mulberry32(20260902);
    let below = 0, absSum = 0, n = 0, over = 0;
    for (let i = 0; i < calls; i++) {
      const h = mkH();
      harpyCharmFamilyFx(asG(h), 6166, 0, 0, 1, 0, rng);
      for (const p of h.particles) {
        if (p.color !== 'rgba(255,236,200,0.85)') continue;   // 内环粒
        const a = Math.atan2(Number(p.vy), Number(p.vx));
        n++; absSum += Math.abs(a);
        if (Math.abs(a) < HALF / 2) below++;
        if (Math.abs(a) > HALF + 1e-9) over++;
      }
    }
    expect(n).toBeGreaterThan(100000);
    expect(over).toBe(0);                           // 支撑集闭合（均匀版会越 half）
    expect(below / n).toBeGreaterThan(0.74);        // 三角 CDF=0.75（SE≈0.0014）
    expect(below / n).toBeLessThan(0.76);
    expect(absSum / n).toBeGreaterThan(HALF / 3 - 0.002);   // E|D|=1/3（均匀=1/2）
    expect(absSum / n).toBeLessThan(HALF / 3 + 0.002);
  });

  it('C1 外抛 maxRadians=τ 本尊：卷绕方向均匀（P(|θ|<π/2)≈0.5,E cos/sin≈0）——旧 ×π 半幅 P≈0.375 判红', () => {
    const calls = 34000;                            // 4 粒/呼
    const rng = mulberry32(20260903);
    let inHalf = 0, cs = 0, sn = 0, n = 0;
    for (let i = 0; i < calls; i++) {
      const h = mkH();
      harpyCharmFamilyFx(asG(h), 6166, 0, 0, 1, 0, rng);
      for (const p of h.particles) {
        if (p.color !== 'rgba(255,255,255,0.75)') continue;   // 外抛粒
        const a = Math.atan2(Number(p.vy), Number(p.vx));
        n++; cs += Math.cos(a); sn += Math.sin(a);
        if (Math.abs(a) < Math.PI / 2) inHalf++;
      }
    }
    expect(n).toBeGreaterThan(100000);
    expect(inHalf / n).toBeGreaterThan(0.49);       // 均匀=0.5
    expect(inHalf / n).toBeLessThan(0.51);
    expect(Math.abs(cs / n)).toBeLessThan(0.01);
    expect(Math.abs(sn / n)).toBeLessThan(0.01);
  });
});

describe('★F6 形锚③ blackLightningSmall 速度 y/x 系数比=0.5（:3542）', () => {
  it('确定性序列：jitter 钉 0.2 → vy/vx=0.5·tan(0.2)（旧 0.25 系数判红）+ 位偏移单掷共享 py=y', () => {
    // ★⑥掷序清偿（2026-09-02）序列重锚：原文头两掷=相位(:3515,曾漏)+groups(:3516)，
    //   circ 后补 :3528 弃色式 Lerp 死双掷（2 掷）→ 9 掷=相位/groups/jitter/spd/off×2/死×2/tint
    const seq = [0, 0, 0.9, 0.5, 0.5, 0.5, 0.99, 0.99, 0.99];
    let k = 0;
    const rng = (): number => seq[Math.min(k++, seq.length - 1)];
    const h = mkH();
    blackLightningSmallFx(asG(h), 500, 700, 0, 0, rng);
    expect(h.particles.length).toBe(1);
    const p = h.particles[0];
    // 位偏移=单 circ(12) 共享 xy：a=π,r=0.5 → off=(-6,0)×0.7（y 分量恰 0=共享证）
    expect(Math.abs(p.x - (500 - 4.2))).toBeLessThan(1e-9);
    expect(Math.abs(p.y - 700)).toBeLessThan(1e-9);
    const vx = Number(p.vx), vy = Number(p.vy);
    expect(vx).toBeCloseTo(Math.cos(0.2) * 2.1 * 0.2, 12);   // kx=1×0.2
    expect(vy).toBeCloseTo(Math.sin(0.2) * 2.1 * 0.1, 12);   // ky=0.5×0.2=0.1
    expect(vy / vx).toBeCloseTo(0.5 * Math.tan(0.2), 12);
  });
});

describe('★F6 形锚④ paladinsHammer 径向方向方差≈0 + 单标量幅（:828-832）', () => {
  it('每粒速度严格沿 (dust−盒心) 归一向（叉积≈0）且 E[speed]=9.5/2（对角向,逐分量独掷版≈5.14 判红）', () => {
    const calls = 4000;
    const rng = mulberry32(20260904);
    const cc = 120;                                 // x=y=100,w=h=40 → 盒心 (120,120)
    let k = 0;
    let sum = 0, n = 0, over = 0;
    const h = mkH();
    h.spawnDust = (x: number, y: number, _w: number, _hh: number, type: number): DustRec => {
      void _w; void _hh;
      k++;
      const o = 5 * ((k % 13) + 1) + 3;             // 全部钉在对角线上（避开 o=20 的盒心死向）
      const rec = { type, x: x + o, y: y + o, vx: 0, vy: 0 } as DustRec;
      h.dusts.push(rec);
      return rec;
    };
    for (let i = 0; i < calls; i++) {
      const before = h.dusts.length;
      paladinsHammerShockwaveFx(asG(h), 100, 100, 40, 40, rng);
      for (let j = before; j < h.dusts.length; j++) {
        const d = h.dusts[j];
        if (d.type !== 57 && d.type !== 43) continue;         // 块尘段被 inBounds=false 屏蔽
        const dx = d.x - cc, dy = d.y - cc;
        const cross = Number(d.vx) * dy - Number(d.vy) * dx;  // 切向分量
        expect(Math.abs(cross)).toBeLessThan(1e-9);
        const spd2 = Math.hypot(Number(d.vx), Number(d.vy));
        sum += spd2; n++;
        if (spd2 > 9.5 + 1e-9) over++;
      }
    }
    expect(n).toBeGreaterThan(100000);
    expect(over).toBe(0);                           // 幅=9.5×U[0,1) 支撑闭合
    expect(sum / n).toBeGreaterThan(4.75 - 0.03);   // 单标量幅 E=4.75
    expect(sum / n).toBeLessThan(4.75 + 0.03);
  });
});

describe('★F6 收尾批结构锚（M3/M4/M5/M6 站）', () => {
  it('M4③ stardustPunch：振幅 0.1·scale（E≈0.06、支撑 [0.04,0.08]）+全函数 24 掷=原版', () => {
    const N = 20000;
    const rng = mulberry32(20260905);
    let sum = 0, n = 0, out = 0;
    for (let i = 0; i < N; i++) {
      const h = mkH();
      stardustPunchFx(asG(h), 0, 0, 0, 0, rng);
      for (const p of h.particles) {
        const amp = Math.hypot(Number(p.vx), Number(p.vy));   // move=0 → 速度=dir×0.1·scale
        n++; sum += amp;
        if (amp < 0.04 - 1e-9 || amp > 0.08 + 1e-9) out++;
      }
    }
    expect(n).toBe(2 * N);                          // 彩+白双层同速
    expect(out).toBe(0);
    expect(sum / n).toBeGreaterThan(0.058);         // E=0.1×E[scale]=0.06（旧 0.08 系数→0.048）
    expect(sum / n).toBeLessThan(0.062);
    let calls = 0;
    stardustPunchFx(asG(mkH()), 0, 0, 1, 0, () => { calls++; return 0.5; });
    expect(calls).toBe(24);                         // sparkle 8 + d267 8×2（旧 32）
  });

  it('M5 inScreenDungeon：出生位=矩形带单侧采样 + position−=velocity×5 + |v|≤2', () => {
    const N = 2000;
    const rng = mulberry32(20260906);
    const x = 1000, y = 2000, w = 40, h = 60;
    for (let i = 0; i < N; i++) {
      const hh = mkH();
      inScreenDungeonSpawnFx(asG(hh), x, y, w, h, 1, null, rng);
      for (const p of hh.particles) {
        const vx = Number(p.vx), vy = Number(p.vy);
        expect(Math.hypot(vx, vy)).toBeLessThanOrEqual(2 + 1e-9);   // circ(2,2) 盘
        const bx = p.x + vx * 5, by = p.y + vy * 5;                 // 回拖还原出生位
        expect(bx).toBeGreaterThanOrEqual(x - 0.5 * w - 16 - 1e-9);
        expect(bx).toBeLessThan(x + 0.5 * w - 16 + 1e-9);           // mv.x×U[0,1)
        expect(by).toBeGreaterThanOrEqual(y - h - 16 + 0.5 * h - 1e-9);
        expect(by).toBeLessThan(y - h - 16 + h + 1e-9);             // mv.y×(0.5+0.5·U)
      }
    }
    let calls = 0;
    const crng = (): number => { calls++; return 0.5; };
    inScreenDungeonSpawnFx(asG(mkH()), 0, 0, 40, 60, 1, null, crng);
    expect(calls).toBe(1 + 5 * 3);                  // n=Next(2,5)=3,每粒 位2+速circ2+gore型死掷1（★F-7 :891 Next(61,64)）
  });

  it('M6② classyCane：位=整数栅 Next(20)−10、速=Next(−10,11)×0.4（旧连续 ±6/±4 判红）', () => {
    const N = 2000;
    const rng = mulberry32(20260907);
    for (let i = 0; i < N; i++) {
      const h = mkH();
      classyCaneFx(asG(h), 300, 400, rng);
      if (h.particles.length === 0) continue;       // Next(0,2)=0 档
      const p = h.particles[0];
      const ox = p.x - 300, oy = p.y - 400;
      expect(Number.isInteger(ox)).toBe(true);
      expect(Number.isInteger(oy)).toBe(true);
      expect(ox).toBeGreaterThanOrEqual(-10);
      expect(ox).toBeLessThanOrEqual(9);
      const vx = Number(p.vx);
      expect(Math.abs(vx / 0.4 - Math.round(vx / 0.4))).toBeLessThan(1e-9);   // 21 档谱
      expect(Math.abs(vx)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('M1 moonLordWhip 成对尘镜像：成对方向角和 cos≈−1（旧 side 乘 sin 项形 ≈+1 判红）', () => {
    const N = 20000;
    const rng = mulberry32(20260908);
    let sum = 0, n = 0;
    for (let i = 0; i < N; i++) {
      const h = mkH();
      moonLordWhipHitFx(asG(h), 0, 0, 4, 0, rng);   // 臂=(4,0) → ±粒方向 = ja 与 ja+π
      const ds = h.dusts.filter((d) => d.type === 229);
      expect(ds.length).toBe(4);                    // 2 k 拍 × ± 对
      for (let j = 0; j < ds.length; j += 2) {
        const t0 = Math.atan2(Number(ds[j].vy), Number(ds[j].vx));
        const t1 = Math.atan2(Number(ds[j + 1].vy), Number(ds[j + 1].vx));
        sum += Math.cos(t0 + t1);                   // = cos(ja1+ja2±π) = −cos(ja1+ja2)
        n++;
        expect(Math.hypot(Number(ds[j].vx), Number(ds[j].vy))).toBeLessThanOrEqual(4 + 1e-9);
      }
    }
    expect(n).toBe(2 * N);
    expect(sum / n).toBeLessThan(-0.95);            // 镜像负向量（ja 独立零均值对称）
  });
});
