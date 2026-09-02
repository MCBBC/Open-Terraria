// 红队 δB 五项 parameter 级清偿回归（2026-09-01）：每修正一条特征参数断言,rng 注入。
// 原版真值 = Terarria1458/Terraria.GameContent.Drawing/ParticleOrchestrator.cs
// （1457 同锚行——TerraBlade :2715-2797/:13015、Excalibur :2798-2860、TrueExcalibur
//   :2970-3084、ArcLightning :1245-1321、Keybrand :3816-3913、RainbowBoulder4 :1435-1503）。
//   B1 TerraBlade MovementVector=弹体速度（Projectile.cs:13015）
//   B2 Excalibur 尺度按臂奇偶 (i%2==0?2:4)*(1.1|0.7)+奇臂 ×1.5
//   B2b TrueExcalibur 红粉前置双带 Velocity 缺省零（静止）
//   B6  ArcSurge 锚寿命 num2=16|雷暴档 ×3、端点=num2+Next(4,9)、invoker 槽锚门
//   B9  Keybrand 第二带 Extra[98] 白化橙渐变 3 片（num2=3 循环）
//   B10 RainbowBoulder4/PetBounce 彩带共线反向流 (sin,-cos)/(-sin,+cos)+白镜像盒内随机
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  terraBladeFx, excaliburFx, trueExcaliburFx, arcSurgeFx, keybrandFx, rainbowBoulderFx,
} from '../src/fx/orchestraFx';

type PartRec = {
  x: number; y: number; color: string;
  vx?: number; vy?: number; life?: number; lifeExact?: number; size?: number;
};
type DustRec = { type: number; scale: number };
type DustLike = Record<string, unknown>;
type GameHooksLite = Parameters<typeof terraBladeFx>[0];

interface Harness {
  particles: PartRec[];
  dusts: DustRec[];
  net?: unknown;
  player?: unknown;
}
type HookFn = (...a: never[]) => unknown;
type H = Harness & {
  spawnParticles: (x: number, y: number, color: string, count: number,
    speed?: number, opts?: Record<string, unknown>) => void;
  spawnDust: (x: number, y: number, w: number, hh: number, type: number,
    vx?: number, vy?: number, alpha?: number, color?: unknown, scale?: number,
    noGravity?: boolean, perfect?: boolean) => DustLike;
} & Record<string, HookFn>;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkH(): H {
  const h: Harness = { particles: [], dusts: [] };
  const self = Object.assign(h, {
    // fx 只消费 hook 通道;粒子参数全落 opts 快照供断言
    spawnParticles: (x: number, y: number, color: string, _count: number,
      _speed?: number, opts: Record<string, unknown> = {}): void => {
      void _speed;
      h.particles.push({ x, y, color, ...opts });
    },
    spawnDust: (_x: number, _y: number, _w: number, _hh: number, type: number,
      _vx?: number, _vy?: number, _alpha?: number, _color?: unknown, scale?: number,
      _noGravity?: boolean, _perfect?: boolean): DustLike => {
      void _alpha; void _color; void _noGravity; void _perfect;
      const rec: DustLike = { type, scale: scale ?? 1 };
      h.dusts.push(rec as DustRec);
      return rec;
    },
    playSfxWav: (): void => undefined,
    playSfxFiles: (): void => undefined,
    addLightAt: (): void => undefined,
  });
  return self as unknown as H;
}
function asG(harness: H): GameHooksLite {
  return harness as unknown as GameHooksLite;
}
/** net/player 面（arcSurgeFx invoker 槽解析用） */
function attachNet(h: H, cfg: {
  mySlot?: number; mePos?: { x: number; y: number; w: number; h: number } | null;
  remote?: Map<number, { x: number; y: number }>;
}): void {
  h.net = { mySlot: cfg.mySlot ?? 0, players: cfg.remote ?? new Map() };
  h.player = cfg.mePos ?? null;
}

describe('δB 参数级清偿回归（红队五项;rng 注入）', () => {
  it('B1 TerraBlade：base 角=弹速向量角+π/2——moveX/moveY 载荷带速度语义（Projectile.cs:13015）', () => {
    const h = mkH();
    terraBladeFx(asG(h), 500, 400, 1, 0, mulberry32(11));   // 弹速=(1,0) 向右 → base=π/2
    expect(h.particles.length).toBe(10);
    // 第一带臂 0：angle=π/2,v=(0,4),vel=-v×0.2=(0,-0.8);臂 1（奇）：angle=π,v=(-4,0),
    // vel=-v×0.2×2=(1.6,0)——旧 bug 下载荷来自命中点 Y 的 cos/sin,角度面完全走样
    expect(h.particles[0].vx).toBeCloseTo(0);
    expect(h.particles[0].vy).toBeCloseTo(-0.8);
    expect(h.particles[1].vx).toBeCloseTo(1.6);
    expect(h.particles[1].vy).toBeCloseTo(0);
    // 反向弹速：(−1,0) → base=3π/2,臂 0 v=(0,−4) → vel=+0.8（全臂镜像）
    const rb = mkH();
    terraBladeFx(asG(rb), 500, 400, -1, 0, mulberry32(11));
    expect(rb.particles[0].vx).toBeCloseTo(0);
    expect(rb.particles[0].vy).toBeCloseTo(0.8);
    // 结构面：SwingArc 不再出现命中点 Y 冒充角度的调用
    const src = readFileSync('src/entities/SwingArc.ts', 'utf8');
    expect(src.includes('terraBladeFx(g, hx, hy, mvX, mvY)')).toBe(true);
    expect(src.includes('terraBladeFx(g, hx, hy, Math.cos(hy), Math.sin(hy))')).toBe(false);
  });

  it('B2 Excalibur：尺度按臂奇偶 (2|4)×(1.1|0.7) 且奇数臂 ×1.5（:2809/:2833+:2819-2823）', () => {
    const h = mkH();
    excaliburFx(asG(h), 500, 400, mulberry32(23));
    const gold = h.particles.filter((p) => p.color === 'rgba(230,217,102,0.5)');
    const yellow = h.particles.filter((p) => p.color === 'rgba(255,255,51,1)');
    expect(gold.length).toBe(4);
    expect(yellow.length).toBe(4);
    const seq = (arr: PartRec[]): number[] => arr.map((p) => Number(p.size));
    expect(seq(gold)).toEqual([2 * 1.1, 4 * 1.1 * 1.5, 2 * 1.1, 4 * 1.1 * 1.5]);
    expect(seq(yellow)).toEqual([2 * 0.7, 4 * 0.7 * 1.5, 2 * 0.7, 4 * 0.7 * 1.5]);
    // 奇数臂速度增强 ×1.5 保持：金带反向臂 arm0=(−0.8,0)、arm1=(0,−1.2)
    expect(Number(gold[0].vx)).toBeCloseTo(-0.8);
    expect(Number(gold[1].vy)).toBeCloseTo(-1.2);
    const src = readFileSync('src/fx/orchestraFx.ts', 'utf8');
    expect(src.includes('size: (i % 2 === 0 ? 2 : 4) * innerScale * boost')).toBe(true);
    expect(src.includes('(band === 0 ? 2 : 4)')).toBe(false);   // 旧按层定值退役
  });

  it('B2b TrueExcalibur：红粉前置双带静止驻留（Velocity 缺省零,:2974-3007）', () => {
    const h = mkH();
    trueExcaliburFx(asG(h), 500, 400, mulberry32(37));
    expect(h.particles.length).toBe(4 + 8);
    // 前 4 粒=前置双带（life36、尺寸 5×1.1/3×0.7 交替）——曾写 ±v×0.2 幻加速度
    for (let i = 0; i < 4; i++) {
      expect(h.particles[i].life).toBe(36);
      expect(h.particles[i].vx).toBe(0);
      expect(h.particles[i].vy).toBe(0);
    }
    expect(Number(h.particles[0].size)).toBeCloseTo(5.5);   // Scale=(5,.5)*1.1
    expect(Number(h.particles[1].size)).toBeCloseTo(2.1);   // Scale=(3,.5)*0.7
    const src = readFileSync('src/fx/orchestraFx.ts', 'utf8');
    expect(src.includes("fc(1, 0, 0.3, 1), 1, 4, { life: lifeT, vx: 0, vy: 0")).toBe(true);
  });

  it('B6 ArcSurge：锚条寿命 num2=16|雷暴档 48、端点=num2+Next(4,9)、invoker 槽锚门（:1253-1291）', () => {
    // 常规档：锚 16；端点两粒共享同一 num7∈[20,24] 与同一偏移位
    const h = mkH();
    attachNet(h, { mePos: { x: 100, y: 200, w: 20, h: 42 } });
    arcSurgeFx(asG(h), 600, 700, 0, 0, false, mulberry32(41));
    expect(h.particles[0].life).toBe(16);                   // 曾恒 16 但端点只 rand(4..8)
    expect(Number(h.particles[1].life)).toBeGreaterThanOrEqual(20);
    expect(Number(h.particles[1].life)).toBeLessThanOrEqual(24);
    expect(h.particles[2].life).toBe(h.particles[1].life);  // 白镜像同寿（num7 共享）
    expect(h.particles[2].x).toBeCloseTo(Number(h.particles[1].x));   // 共享 vector 偏移位
    expect(h.particles[2].y).toBeCloseTo(Number(h.particles[1].y));
    // 雷暴档（MovementVector.Y==1f）：×3 → 锚 48、端点 ∈[52,56]
    const st = mkH();
    attachNet(st, { mePos: { x: 100, y: 200, w: 20, h: 42 } });
    arcSurgeFx(asG(st), 600, 700, 0, 0, true, mulberry32(41));
    expect(st.particles[0].life).toBe(48);
    expect(Number(st.particles[1].life)).toBeGreaterThanOrEqual(52);
    expect(Number(st.particles[1].life)).toBeLessThanOrEqual(56);
    // invoker 门：可解析远端槽 → 锚点=该玩家盒心;未知槽回退终点坐标
    const rp = mkH();
    attachNet(rp, {
      mePos: { x: 0, y: 0, w: 20, h: 42 },
      remote: new Map([[2, { x: 1000, y: 2000 }]]),
    });
    arcSurgeFx(asG(rp), 600, 700, 2, 0, false, mulberry32(53));
    expect(rp.particles[0].x).toBeCloseTo(1010);            // 1000+w/2
    expect(rp.particles[0].y).toBeCloseTo(2021);            // 2000+h/2
    const fb = mkH();                                       // 槽不可解析（players 空表）
    attachNet(fb, { mePos: { x: 100, y: 200, w: 20, h: 42 }, remote: new Map() });
    arcSurgeFx(asG(fb), 600, 700, 2, 0, false, mulberry32(53));
    expect(fb.particles[0].x).toBeCloseTo(600);             // 回退终点
    expect(fb.particles[0].y).toBeCloseTo(700);
    const src = readFileSync('src/core/Game.ts', 'utf8');
    expect(src.includes('arcSurgeFx(this, s.posX, s.posY, s.invoker, s.uniqueInfo >>> 0, s.moveY === 1)'))
      .toBe(true);
  });

  it('B9 Keybrand：第二带 Extra[98] 白化橙渐变改发 3 片（num2=3 循环,:3855-3881）', () => {
    const h = mkH();
    keybrandFx(asG(h), 300, 300, mulberry32(67));
    expect(h.particles.length).toBe(3 + 3 + 1);             // 第一带 3+第二带 3+第三带 1
    const band2 = h.particles.slice(3, 6);
    for (const p of band2) {
      // ★⑨lifeExact 清偿（2026-09-03）：TTL=num8=30f 定值（:3842→SetTypeInfo :3849）——
      //  spawnParticles 走 lifeExact 档（opts 键随改,原 life 抖动档退役）
      expect(p.lifeExact).toBe(30);                         // num8=30
      expect(Math.hypot(Number(p.vx), Number(p.vy))).toBeCloseTo(0.7);   // velocity=dir(num7)×vector4
      expect(Math.hypot(p.x - 300, p.y - 300))
        .toBeLessThanOrEqual(0.7 * 0.7 * 30 * 0.2 + 4 * 0.7 + 1e-9);     // 位向偏移+抖动包络
      expect(p.x !== 300 || p.y !== 300).toBe(true);        // 无钉死中心位（旧白伴生粒已删）
      // ★F-5（2026-09-02 对抗批）：色掷接线原文 :3843-3845 =Lerp(White,Lerp(Gold,
      //  OrangeRed,t),0.5) A=0（r=255 恒/b=round(127.5)=128/g=235−73t∈[162,235]）——
      //  旧钉死同色 fc(1,.72,.28,0)=rgba(255,184,71,0) 退役:三粒各掷各色
      //  （mulberry32(67) → t=0.3725/0.5313/0.5368 → g=208/196/196）
      expect(p.color).toBe(['rgba(255,208,128,0)', 'rgba(255,196,128,0)',
        'rgba(255,196,128,0)'][band2.indexOf(p)]);
    }
    const src = readFileSync('src/fx/orchestraFx.ts', 'utf8');
    expect(src.includes('for (let k = 0; k < 3; k++)')).toBe(true);
  });

  it('B10 RainbowBoulder4/pet：彩带共线反向流+白镜像盒内随机（P.cs:1478/:1490/:1493）', () => {
    const h = mkH();
    rainbowBoulderFx(asG(h), 4, 100, 100, 5, 0, mulberry32(83));   // moveX=5,moveY=0 → num5=π/2
    expect(h.particles.length).toBe(40);                    // 20 对
    for (let k = 0; k < 40; k += 2) {
      const col = h.particles[k], wht = h.particles[k + 1];
      // (sin num5,−cos num5) vs −(·)：两粒速度互为相反向量,且轴∥弹道方向
      expect(wht.vx).toBeCloseTo(-Number(col.vx), 12);
      expect(wht.vy).toBeCloseTo(-Number(col.vy), 12);
      expect(Math.abs(Number(col.vx) - 1)).toBeLessThan(1e-9);   // sin(π/2)
      expect(Math.abs(Number(col.vy))).toBeLessThan(1e-9);       // −cos(π/2)
      expect(Math.abs(wht.x - 100)).toBeLessThanOrEqual(10 + 1e-9);  // rect 盒内（轴各 ±10）
      expect(Math.abs(wht.y - 100)).toBeLessThanOrEqual(10 + 1e-9);
      expect(wht.x !== 100 || wht.y !== 100).toBe(true);         // 白镜像不再钉死中心
      expect(col.life).toBe(wht.life);                           // num7 两粒共享
    }
    // pet 分味同轴语义：moveY<0（上弹）→ 彩带向上流 (0,-1)
    const pet = mkH();
    rainbowBoulderFx(asG(pet), 'pet', 100, 100, 0, -3, mulberry32(97));
    const petCol = pet.particles.filter((_, i) => i % 2 === 0);
    expect(petCol.every((p) => Math.abs(Number(p.vx)) < 1e-9 && Math.abs(Number(p.vy) + 1) < 1e-9))
      .toBe(true);
    expect(pet.particles.some((p, i) => i % 2 === 1 && (p.x !== 100 || p.y !== 100))).toBe(true);
  });
});
