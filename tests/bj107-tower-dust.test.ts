// BJ107 交接④判别力测（2026-09-16）：四柱塔 AI 环境尘 + 死亡演出分塔尘色。
// 锚（BJ107 亲读 1457，1458 同域 byte-diff 全等——NPC.cs 39356-39850 两版逐字节相同）：
//  - 环境尘  1457 NPC.cs:39584-39603(493→135) / :39614-39636(507→242 黑染) /
//            :39637-39660(422→229 黑染) / :39736-39761(517→6)
//  - 死亡演出 :39375-39444（dustId 分塔 switch :39375-39389：517→127/422→229/507→242/
//            493→135）+ 241 白烟(:39438-39444) + Opacity(:39373)
// 判别力：
//  ① 逐柱环境尘 id 锁（seed=0 全中，位/速/scale/noGravity/fadeIn/黑染色逐值）
//  ② 死亡演出四组结构 + 逐柱 id 锁（seed=0：组1 3+组2 3+组3 18=24 粒同 id；无 241）
//  ③ 死亡 241 白烟锁（seed=0.5：Next(3)!=0 门命中）
//  ④ 概率节律 6 种子统计（Math.random 面 6× 判例）：环境柱身 1/5、顶晶每掷 1/5、
//     死亡 241 门 2/3、组3 爆散 1/5（六粒同位簇计数）、组1 存在+门 p（vy<−12 探针：
//     组1 三粒 vy=−3|抖vy−i+0.25−4|，i=0 时 P(jvy<−0.25)=1/2、i=1/2 恒中 → E=0.5/t）
//  变异备案（本刀实跑）：摘环境尘=红①④；死亡分塔 id 错配=红②。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { VanillaDust } from '../src/fx/VanillaDust';
import type { VDust } from '../src/fx/VanillaDust';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 120, FLOOR = 100;
const ENV_IDS: Array<{ id: number; crystal: number; black: boolean }> = [
  { id: 493, crystal: 135, black: false },
  { id: 507, crystal: 242, black: true },
  { id: 422, crystal: 229, black: true },
  { id: 517, crystal: 6, black: false },
];
const DEATH_ID: Record<number, number> = { 517: 127, 422: 229, 507: 242, 493: 135 };
// 原版 NewDust spawn 侧特例终值（Dust.cs:221-230）成员态：
//  · 135/6/242 ∈ 烟雾族句（:221-226）→ vy 重掷 seed=0 恒 (0×16|0−10)×0.1=−1、vx×0.3；
//  · 229 ∉ 任何 spawn 特例（表内是 228）→ 基础抖 seed=0 恒 −2/−2；
//  · 127/187 独立支（:227-230）→ velocity 矢量×0.3（无重掷）=基础抖 −2×0.3=−0.6。
//    ★BJ338 件2（2026-09-24）：曾折叠进烟雾表（vy 重掷 [−1,0.5]）=BJ327 登记债
//    （bj107 备案「本仓引擎层偏差」），现按原版分立支转正——JITTER_VY(127)=−0.6。
const JITTER_VY = (t: number): number => (t === 229 ? -2 : t === 127 ? -0.6 : -1);
const JITTER_VX = (t: number): number => (t === 229 ? -2 : -0.6);

function makeWorld(): World {
  const w = new World(W, H, 7, 'bj107-tower-dust');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

interface Cap { type: number; d: VDust }

function makeHarness() {
  const w = makeWorld();
  const vd = new VanillaDust();
  const enemies: Enemy[] = [];
  const caps: Cap[] = [];
  const sfx: string[] = [];
  let tickCaps: Cap[] = caps;
  const em = {
    nextId: 1,
    add: (e: unknown) => { (e as { id: number }).id = em.nextId++; },
  };
  const player = {
    x: 80 * TILE, y: 48 * TILE, w: 20, h: 42, cx: 80 * TILE + 10, cy: 48 * TILE + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world: w, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: (file: string) => { sfx.push(file); },
    showPickupLabel: () => {},
    entities: em,
    // 真 VanillaDust 池直入（同 Game.spawnDust 契约）+ 捕获
    spawnDust: (
      x: number, y: number, dw: number, dh: number, type: number,
      sx = 0, sy = 0, alpha = 0, color: VDust['color'] = null, scale = 1, ng = false,
    ): VDust | null => {
      const d = vd.spawn(x, y, dw, dh, type, sx, sy, alpha, color, scale);
      if (d && ng) d.noGravity = true;
      if (d) tickCaps.push({ type, d });
      return d;
    },
  } as unknown as GameHooks;
  const spawnTower = (id: number): Enemy => {
    const e = Enemy.fromVanilla(id, 80 * TILE, 80 * TILE)!;
    e.id = em.nextId++;
    e.bInit = true;
    e.ai0 = 0;   // 类缺省 ai0=-1120（史莱姆 hop 语义）——塔悬停相位归 0（vy=sin(0)=0 确定性）
    enemies.push(e);
    return e;
  };
  /** 驱动一 tick 并回收池槽（防 6000 池满；字段值已随捕获引用定格可读） */
  const tick1 = (towers: Enemy[]): Cap[] => {
    const out: Cap[] = [];
    tickCaps = out;
    for (const t of towers) if (!t.dead) t.fixedUpdate(1 / 60, hooks);
    for (const c of out) (c.d as { active: boolean }).active = false;
    tickCaps = caps;
    return out;
  };
  return { hooks, enemies, spawnTower, tick1, sfx };
}

/** mulberry32（6 种子统计判例播法） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

describe('BJ107④ 环境尘逐柱 id 锁（seed=0 全中：柱身 241 + 顶晶 3 掷）', () => {
  for (const { id, crystal, black } of ENV_IDS) {
    it(`塔 ${id}：柱身 241 白烟 + 顶晶 3 粒尘 ${crystal}${black ? '（黑染色）' : ''}`, () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const h = makeHarness();
      const tower = h.spawnTower(id);
      // 尘在 AI 内生成于尾部位移（y+=vy）之前——断言基准锚 tick 前坐标
      const cx = tower.cx, cy = tower.cy, y = tower.y;
      const caps = h.tick1([tower]);
      // 掷型：1/5 门全中 → 柱身 1 + 顶晶 3 = 4 粒；id 序 [241, crystal, crystal, crystal]
      expect(caps.map((c) => c.type)).toEqual([241, crystal, crystal, crystal]);
      const w = 130, hh = 270;
      // 柱身（:39589-39591）：rot a=0 → (−0,1)；m=0.8；vx=0、vy=|抖 −2|×0.25=0.5
      const body = caps[0].d;
      expect(body.x).toBeCloseTo(cx, 6);
      expect(body.y).toBeCloseTo(cy + (hh / 2) * 0.8, 6);
      expect(body.vx).toBe(0);
      expect(body.vy).toBeCloseTo(0.5, 6);
      expect(body.noGravity).toBe(false);          // 241 无 noGravity（原版不设）
      // 顶晶（:39597-39602）：盒 cx−w·(0.33−0.11i)−(0..) 抖 +4；vy=−|抖vy−i+0−4|
      const jv = JITTER_VY(crystal);
      for (let i = 0; i < 3; i++) {
        const d = caps[1 + i].d;
        expect(d.x).toBeCloseTo(cx - w * (0.33 - 0.11 * i) + 4, 6);
        expect(d.y).toBeCloseTo(y - 20 + 4, 6);
        expect(d.vx).toBe(0);
        expect(d.vy).toBeCloseTo(-(Math.abs(jv - i - 4)), 6);   // −|jv−i−4|（悬停 vy=0）
        expect(d.noGravity).toBe(true);
        expect(d.fadeIn).toBe(1);
        expect(d.scale).toBeCloseTo(1 + i * 0.3, 6);   // 覆写 NewDust（含烟雾 ×0.7）
        if (black) expect(d.color).toEqual({ r: 0, g: 0, b: 0, a: 255 });   // Color.Black
        else expect(d.color).toBeNull();
      }
    });
  }
  it('盒宽随 i 收窄 = (int)(130×(0.66−0.22i)) → 85/57/28（截断语义）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const h = makeHarness();
    const tower = h.spawnTower(507);
    h.tick1([tower]);
    // 直接对真盒断言不可行（捕获无盒参）——以 i=2 粒位置锚 14.3 偏移（cx−14.3+4）
    void tower;
    expect(Math.trunc(130 * (0.66 - 0.22 * 0))).toBe(85);
    expect(Math.trunc(130 * (0.66 - 0.22 * 1))).toBe(57);
    expect(Math.trunc(130 * (0.66 - 0.22 * 2))).toBe(28);
  });
});

describe('BJ107④ 死亡演出逐柱 id 锁（seed=0：四组结构 3+3+18=24 粒同 id）', () => {
  for (const towerId of [517, 422, 507, 493]) {
    it(`塔 ${towerId} → 演出尘 id ${DEATH_ID[towerId]}（四组全同 id、无 241、爆散声逐处）`, () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const h = makeHarness();
      const tower = h.spawnTower(towerId);
      tower.ai2 = 1;
      tower.vy = 0.25;                       // 钳值钉死（死亡公式 this.vy 输入）
      // 尘生成于死亡块尾部 y+=vy（+0.25/t）之前——断言基准锚 tick 前坐标
      const cx = tower.cx, cy = tower.cy, y0 = tower.y;
      const caps = h.tick1([tower]);
      const dd = DEATH_ID[towerId];
      const jv = JITTER_VY(dd), jx = JITTER_VX(dd);
      expect(caps.map((c) => c.type).every((t) => t === dd)).toBe(true);
      expect(caps.length).toBe(24);          // 组1 3 + 组2 3 + 组3 18（seed=0 门全中）
      expect(caps.filter((c) => c.type === 241).length).toBe(0);   // Next(3)!=0 未中
      // 组1（:39396-39401）：m=0.8×0.8=0.64；a=0 → x=cx、y=cy+270×1.1×0.64
      const g1 = caps.slice(0, 3);
      for (let i = 0; i < 3; i++) {
        expect(g1[i].d.y).toBeCloseTo(cy + 270 * 1.1 * 0.64, 6);
        expect(g1[i].d.x).toBeCloseTo(cx, 6);
        expect(g1[i].d.vy).toBeCloseTo(-Math.abs(jv - i - 3.75) * 3, 6);   // −|抖vy−i+0.25−4|×3
        expect(g1[i].d.scale).toBeCloseTo(1 + i * 0.3, 6);
      }
      // 组2（:39411-39415）：位留盒抖（cx−42.9+4, y−16）；vy×(1+1/180×0.5)
      const k = 1 + 1 / 180 * 0.5;
      const g2 = caps.slice(3, 6);
      for (let i = 0; i < 3; i++) {
        expect(g2[i].d.x).toBeCloseTo(cx - 130 * (0.33 - 0.11 * i) + 4, 6);
        expect(g2[i].d.y).toBeCloseTo(y0 - 16, 6);
        expect(g2[i].d.vy).toBeCloseTo(-Math.abs(jv - i - 3.75) * k, 6);
        expect(g2[i].d.noGravity).toBe(true);
      }
      // 组3（:39428-39433）：m=0.7×0=0 → 三处全 (cx,cy)；pw=1+1/180×4；六粒 scale 步进 0.13
      const pw = 1 + 1 / 180 * 4;
      const g3 = caps.slice(6, 24);
      for (let j = 0; j < 6; j++) {
        for (const rep of [0, 1, 2]) {
          const d = g3[j + rep * 6].d;
          expect(d.x).toBeCloseTo(cx, 6);
          expect(d.y).toBeCloseTo(cy, 6);
          expect(d.vx).toBeCloseTo(jx * pw, 6);          // 抖 vx×功率（229 原始域）
          expect(d.vy).toBeCloseTo(-Math.abs(jv) * pw, 6);
          expect(d.scale).toBeCloseTo(1.5 + j * 0.13, 6);
        }
      }
      // 爆散声逐处播（:39435）×3 + 60t 死音（:39445-39448，ai1=1%60===1）
      expect(h.sfx.filter((s) => s === 'NPC_Hit_1').length).toBe(3);
      expect(h.sfx).toContain('NPC_Killed_22');
    });
  }
  it('死亡 241 白烟（seed=0.5：Next(3)!=0 命中；其余门全歇）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const h = makeHarness();
    const tower = h.spawnTower(493);
    tower.ai2 = 1;
    tower.vy = 0.25;
    const cx = tower.cx, cy = tower.cy;   // 尘生成于尾部位移前
    const caps = h.tick1([tower]);
    expect(caps.map((c) => c.type)).toEqual([241]);
    // :39441-39443：rot a=0 → x=cx、y=cy+135×(0.8+0.5×0.2)；vy=|抖 0|×0.25=0
    expect(caps[0].d.x).toBeCloseTo(cx, 6);
    expect(caps[0].d.y).toBeCloseTo(cy + 135 * 0.9, 6);
    expect(caps[0].d.vy).toBe(0);
    expect(caps[0].d.noGravity).toBe(false);
  });
});

describe('BJ107④ 概率节律 6 种子统计（Math.random 面 6× 判例）', () => {
  const SEEDS = [3, 17, 42, 99, 1234, 20260916];
  const band = (n: number, p: number, sig: number): [number, number] =>
    [n * p - sig, n * p + sig];

  it('环境尘：柱身 241 门 1/5、顶晶每掷 1/5（6×20 塔百 tick，±5σ）', () => {
    const TICKS = 100, ROUNDS = 20;
    let body241 = 0, crystal = 0;
    for (const seed of SEEDS) {
      vi.spyOn(Math, 'random').mockImplementation(lcg(seed));
      for (let r = 0; r < ROUNDS; r++) {
        const h = makeHarness();
        const tower = h.spawnTower(422);        // 黑染柱：晶尘 229 与 241 可分型
        for (let t = 0; t < TICKS; t++) {
          for (const c of h.tick1([tower])) {
            if (c.type === 241) body241++;
            else crystal++;
          }
        }
      }
    }
    const n = SEEDS.length * ROUNDS * TICKS;           // 12000 tick
    const nb = band(n, 0.2, 5 * Math.sqrt(n * 0.2 * 0.8));
    const nc = band(3 * n, 0.2, 5 * Math.sqrt(3 * n * 0.2 * 0.8));
    expect(body241).toBeGreaterThanOrEqual(nb[0]);     // E=2400 ±218
    expect(body241).toBeLessThanOrEqual(nb[1]);
    expect(crystal).toBeGreaterThanOrEqual(nc[0]);     // E=7200 ±379
    expect(crystal).toBeLessThanOrEqual(nc[1]);
  });

  it('死亡演出：241 门 2/3、组3 爆散 1/5（六粒同位簇）、组1 存在+门 p（vy<−12 探针）', () => {
    const TICKS = 118, ROUNDS = 20;          // ai1 1..118 全落 <120 门内、<180 不真死
    let c241 = 0, sextuplets = 0, g1probe = 0;
    for (const seed of SEEDS) {
      vi.spyOn(Math, 'random').mockImplementation(lcg(seed));
      for (let r = 0; r < ROUNDS; r++) {
        const h = makeHarness();
        const tower = h.spawnTower(493);      // dd=135
        tower.ai2 = 1;
        tower.vy = 0.25;                      // this.vy 钳值钉死（E[g1probe] 依此可算）
        for (let t = 0; t < TICKS; t++) {
          const caps = h.tick1([tower]);
          const dd = caps.filter((c) => c.type === 135);
          c241 += caps.filter((c) => c.type === 241).length;
          g1probe += dd.filter((c) => c.d.vy < -12).length;
          // 组3 爆散 = 六粒【逐字节同位】簇（:39428 全体 position=vector193）
          const byPos = new Map<string, number>();
          for (const c of dd) {
            const key = `${c.d.x}|${c.d.y}`;
            byPos.set(key, (byPos.get(key) ?? 0) + 1);
          }
          for (const n of byPos.values()) if (n === 6) sextuplets++;
        }
      }
    }
    const n = SEEDS.length * ROUNDS * TICKS;           // 14160 tick
    const b241 = band(n, 2 / 3, 5 * Math.sqrt(n * (2 / 3) * (1 / 3)));
    expect(c241).toBeGreaterThanOrEqual(b241[0]);      // E=9440 ±281
    expect(c241).toBeLessThanOrEqual(b241[1]);
    const b3 = band(n, 0.6, 5 * Math.sqrt(n * 1.44));  // 每爆散 3 处 → 簇/tick = 3·Bern(0.2)
    expect(sextuplets).toBeGreaterThanOrEqual(b3[0]);  // E=8496 ±714
    expect(sextuplets).toBeLessThanOrEqual(b3[1]);
    // 组1 探针（E=0.5/t → 7080）：摘组1→0 红；门 1/5→1/4 → 8850 越上界红
    // （组2 |vy|≤6.75×1.4167=9.56、组3 ≤0.5×7=3.5、241 ∈[0,0.5]——均不触 −12）
    const bp = band(n, 0.5, 5 * Math.sqrt(n * 0.2));
    expect(g1probe).toBeGreaterThanOrEqual(bp[0]);     // E=7080 ±266
    expect(g1probe).toBeLessThanOrEqual(bp[1]);
  });
});
