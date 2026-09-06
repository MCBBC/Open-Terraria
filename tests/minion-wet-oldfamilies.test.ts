// MinionProj 旧受段族湿段接入回归（2026-09-07 蓝队 K 移交批——R3 八型后续）。
//  域：317（乌鸦 aiStyle 54）/390-392（蜘蛛 AI_026 flag7）/393-395（海盗 AI_067 flag）/
//  758（吸血蛙 flag2）/833-835（沙漠虎 flag3）/917（雪花 aiStyle 177）/1036（雾网蛛
//  flag7 仓内 whip 分支近似）。逐 id SetDefaults 复核（P.cs :4101/:4744/:4757/:7816/
//  :8084-8125/:8703/:9769）均无 ignoreWater 行 = 受段。
//  · 湿段=tick 头共享体（溅花/四旗/wetCount）——本批溅花面抽验蛙 758。
//  · 湿阻尼=各族位移位乘 projWaterDragFactor（HandleMovement :17721-17764 湿支只对
//    tileCollide=true 宿主跑）：蛙/虎(ai067WalkChase)/蜘蛛步行 ×0.5;乌鸦 attack 态
//    （aiStyle 54 :29042 tileCollide=true）×0.5、归位态（:29079 false）不阻尼;
//    1036（SetDefaults 无 tileCollide 行=缺省 true）×0.5、917（:8708 显式 false）
//    不阻尼。
//  · 湿旗消费=维护字段 this.wet（互不双轨：台账批⑥ probe 消费位在蛙/虎/海盗三族
//    退役）——蛙湿身跳 ×2（:51616-51617,共享核）验维护字段链路。
//  ★盒尺寸注：本类构造器未注册本批 id 的 SetDefaults 真盒（317=28×28/390-392=30×30/
//  393-395 与 758=20×30/833=26×20/834-835=20×30/917=30×30/1036=18×10）→ 落 16×16
//  缺省=数据面缺口（本批登记移交,非本刀面）;测试几何按 16×16 布。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj } from '../src/entities/MinionProj';
import { projectileData } from '../src/data/vanillaProjectiles';

const LIQ = 255;
/** 水带：列 [30..40] 行 [60..70] 满格水 → px [480,656]×[960,1136];可选地板 row 71 */
function mkWorld(floor: boolean): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  if (floor) for (let x = 28; x <= 42; x++) w.store.setTile(x, 71, 1);
  for (let x = 30; x <= 40; x++) {
    for (let y = 60; y <= 70; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = 0;
    }
  }
  return w;
}

interface Harness { g: GameHooks; w: World; player: Player; dust: Array<{ w: number; h: number }>; sfx: string[] }

function mkGame(w: World): Harness {
  const dust: Array<{ w: number; h: number }> = [];
  const sfx: string[] = [];
  const pl = new Player(20 * TILE, 30 * TILE, new Inventory());
  pl.facing = 1;
  const g = {
    world: w,
    player: pl,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      void x; void y; void type;
      const d = { vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown };
      dust.push({ w: bw, h: bh });
      return d;
    },
    playSfxWav: (name: string) => { sfx.push(String(name)); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  (g as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
    { projectiles: [], add: () => {} };
  return { g, w, player: pl, dust, sfx };
}

const mkMinion = (h: Harness, projId: number, x: number, y: number): MinionProj =>
  new MinionProj(x, y, projId, 10, 2, false, 0, false, () => h.player);

/** 溅花尘识别：wetSplashStepShared 弹面盒 (w+12, 24)（w=16 → 28×24） */
const splashDust = (h: Harness) => h.dust.filter((e) => e.w === 28 && e.h === 24);

// =====================================================================
// 豁免数据面（SetDefaults ignoreWater 行逐块核对）
// =====================================================================
describe('豁免数据面：旧受段族 13 id 全受段（缺行=不豁免同向）', () => {
  it('317/390-395/758/833-835/917/1036 无 ignoreWater 行;对照 373 射手豁免', () => {
    for (const id of [317, 390, 391, 392, 393, 394, 395, 758, 833, 834, 835, 917, 1036]) {
      expect(projectileData(id)?.ignoreWater ?? false, `id ${id} 应受段`).toBe(false);
    }
    expect(projectileData(373)?.ignoreWater).toBe(true);   // AI_062 射手（:4565 块）
  });
});

// =====================================================================
// 湿段接线（溅花/旗）——蛙 758 抽验（共享体面全体一致）
// =====================================================================
describe('蛙 758 湿段接线（tick 头共享体）', () => {
  it('出生水中=预置不溅;出水拍溅花 ×10 + Splash_1 + wetCount=10→9', () => {
    const h = mkGame(mkWorld(false));
    const m = mkMinion(h, 758, 544, 1024);       // 16×16 盒全入水带
    m.fixedUpdate(1 / 60, h.g);                  // 首拍=出生预置（:10886-10893）
    expect(m.wet).toBe(true);
    expect(splashDust(h).length).toBe(0);        // 预置不溅（原版同）
    m.x = 400; m.y = 1000;                       // 挪干区（x<480）
    m.fixedUpdate(1 / 60, h.g);                  // 出水支 :16977-17102
    expect(m.wet).toBe(false);
    expect(splashDust(h).length).toBe(10);       // wetSplashStepShared 弹面 10 粒
    expect(h.sfx).toEqual(['Splash_1']);
    expect(m.wetCount).toBe(9);                  // :16984 置 10 → 同子步尾 −1 = 9
  });
});

// =====================================================================
// 湿阻尼（各族位移位 ×projWaterDragFactor;速度场不减）
// =====================================================================
describe('湿阻尼位移位（:17721 湿支 ×0.5,velocity 场不减）', () => {
  it('蛙 758 地面段（:51553-51557 moveAndCollide 位）：水拍位移减半', () => {
    const h = mkGame(mkWorld(false));
    const m = mkMinion(h, 758, 544, 1000);
    h.player.x = 692; h.player.y = 1000;         // p.cx=702（右侧 150px,不入归位门）
    const x0 = m.x;
    m.fixedUpdate(1 / 60, h.g);
    expect(m.wet).toBe(true);
    expect(m.vx).toBeCloseTo(0.5, 9);            // 有目标档缺省 0.5/4/4（无目标同档首拍）
    expect(m.x - x0).toBeCloseTo(0.25, 9);       // 0.5 × 湿档 0.5
  });

  it('虎 833（ai067WalkChase :51273 moveAndCollide 位）：水拍位移减半', () => {
    const h = mkGame(mkWorld(false));
    const m = mkMinion(h, 833, 544, 1000);
    h.player.x = 692; h.player.y = 1000;
    const x0 = m.x;
    m.fixedUpdate(1 / 60, h.g);
    expect(m.wet).toBe(true);
    expect(m.vx).toBeCloseTo(0.5, 9);            // 缺省档 0.5/4/4（:51274-51277）
    expect(m.x - x0).toBeCloseTo(0.25, 9);
  });

  it('蜘蛛 390 步行物理（:65244-65247 moveAndCollide 位）：水拍位移减半', () => {
    const h = mkGame(mkWorld(false));
    const m = mkMinion(h, 390, 544, 1000);
    h.player.x = 692; h.player.y = 1000;         // p.cx > cx+10+40 → flag3 行走意图
    const x0 = m.x;
    m.fixedUpdate(1 / 60, h.g);
    expect(m.wet).toBe(true);
    expect(m.vx).toBeCloseTo(0.4, 9);            // flag7 num184=0.2×2（:63133-63135）
    expect(m.x - x0).toBeCloseTo(0.2, 9);
  });

  it('乌鸦 317（aiStyle 54）：attack 态（:29042 tileCollide=true）湿拍 ×0.5;归位态（:29079 false）恒全速', () => {
    const h = mkGame(mkWorld(false));
    const atk = mkMinion(h, 317, 544, 1000);
    h.player.x = 692; h.player.y = 1000;         // dist>100 → spd 12/15 档,>70 有驱动力
    const x0 = atk.x;
    atk.fixedUpdate(1 / 60, h.g);
    expect(atk.wet).toBe(true);
    expect(atk.x - x0).toBeCloseTo(atk.vx * 0.5, 9);   // attack 态吃湿档
    const ret = mkMinion(h, 317, 544, 1000);
    (ret as unknown as { rA0: number }).rA0 = 1;       // 归位态（ai[0]=1 → tileCollide=false）
    const xr = ret.x;
    ret.fixedUpdate(1 / 60, h.g);
    expect(ret.wet).toBe(true);
    expect(ret.x - xr).toBeCloseTo(ret.vx, 9);         // 湿阻尼不适用,velocity 全量位移
  });

  it('whip 族：917（SetDefaults tileCollide=false :8708）不阻尼;1036（缺省 true）×0.5', () => {
    const h = mkGame(mkWorld(false));
    h.player.whipBuffs[312] = 60;
    h.player.whipBuffs[365] = 60;
    h.player.x = 692; h.player.y = 1000;
    const s = mkMinion(h, 917, 544, 1000);
    const xs = s.x;
    s.fixedUpdate(1 / 60, h.g);
    expect(s.wet).toBe(true);
    expect(s.dead).toBe(false);
    expect(s.x - xs).toBeCloseTo(s.vx, 9);             // 恒全速（tileCollide=false）
    const c = mkMinion(h, 1036, 544, 1000);
    const xc = c.x;
    c.fixedUpdate(1 / 60, h.g);
    expect(c.wet).toBe(true);
    expect(c.x - xc).toBeCloseTo(c.vx * 0.5, 9);       // 缺省 tileCollide=true → 湿档
  });
});

// =====================================================================
// 湿旗消费=维护字段（互不双轨）——蛙湿身跳 ×2（AI_067 :51616-51619 共享核）
// =====================================================================
describe('蛙 758 湿身跳 ×2（维护字段 this.wet 消费链）', () => {
  const jumpCase = (wet: boolean): number => {
    const h = mkGame(mkWorld(true));             // row 71 地板（px y 1136）
    if (!wet) {
      for (let x = 30; x <= 40; x++) {
        for (let y = 60; y <= 70; y++) h.w.store.liquid[h.w.store.idx(x, y)] = 0;
      }
    }
    // 蛙站地板顶（盒底=y+16=1136）,玩家正上方 115px（>48 入高出距离表,<300 不归位）
    const m = mkMinion(h, 758, 500, 1120);
    h.player.x = 543; h.player.y = 992;          // p.cx=553 → ax=508=蛙心（dx=0,不触发墙意图）
    m.fixedUpdate(1 / 60, h.g);
    return m.vy;
  };
  it('水中贴地起跳 vy ×2（-9 → -18）;干态 -9（表值原样）', () => {
    expect(jumpCase(true)).toBeCloseTo(-18, 9);
    expect(jumpCase(false)).toBeCloseTo(-9, 9);
  });
});
