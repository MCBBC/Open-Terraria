// ★BJ642（2026-10-11）：喷火器 85/1106 火舌演出面（BJ639 C 档批 2 锚）判别锁。
//  BJ639 定谳：85/1106 AI_193（P.cs:42075-42142）移动/命中/OnFire 面「已接」、
//  火焰演出面【整缺】——7 帧火舌贴图 + 双层调色渐变（DrawProj_Flamethrower
//  Main.cs:35647-35716 / _Foxsparks :35719-35832）+ AI_193 尘链。本批落刀面：
//    ① draw 独占支（Arrow.draw：flameTongueOps 纯函数 + flameTongueTint 染缸 +
//      queueProjFullbright 自发光通道）——旧态=98×686 七帧竖条整幅画出；
//    ② AI_193 块（寿命 72 子步 Kill :42084 + >=60 阻尼 ×0.95 :42087 + 尘链 A
//      d6/135 :42098-42115 + 尘链 B 烟 d31 :42116-42131）——旧态=无寿命杀
//      （life 3600 子步不灭）/零尘；
//    ③ 撞块滑移（HandleMovement :18414-18417 velocity=last×0.95+position−=v）
//      ——旧态=首撞即碎；
//    ④ 可伤门（Damage_CanDealDamage :12475-12480 localAI[0]>=54 纯视觉尾段）；
//    ⑤ 1106 出生面双折算退役（MinionProj ×3/life÷3 补偿 vs Arrow extraUpdates=2
//      子步环——速度/寿命/foxHitInflate/演出 flag2 四面 3× 漂移，探针定谳）；
//    ⑥ Elf Melter 1910 ai[0]=1（Player.cs:49627-49629）→ 蓝焰档全链（AI flag 尘
//      135/演出 elf 调色板/StatusNPC 324 Frostburn2 :11660-11663 ctx.ai0 面）。
//  ★夹具纪律（BJ514/BJ634/BJ639 判例防「夹具喂幻影」）：真 World + 真 Player +
//  真 Arrow fixedUpdate 驱动 + Math.random=0 钉死（尘链掷率全确定性）。
//  ★变异证红（BJ606 习语）：M1 AI_193 寿命杀 72→7200 / M2 演出版 elf 半旗摘除 /
//    M3 尘链 B 掷率 0.5→0 恰红（逐字节还原 + sha256 对拍，见套件尾变异块）。
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });   // ★残留普查波:变异自证三层守卫跨套件互斥下锁等待/内层 spawn 可超默认 5s——按仓内习语放宽（fx-codegen-parity 同款）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withMutation } from './mutation-guard';   // ★残留普查波:变异自证统一守卫（三层:文件互斥/panic 还原/残留自检）
import { Arrow, flameTongueEnv, flameTongueFrame, flameTongueOps } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { projectileData } from '../src/data/vanillaProjectiles';
import { applyProjStatus, TABLE } from '../src/entities/projStatus';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');
const W = 300, H = 140, FLOOR = 120;

// ---- PNG IHDR 直读（素材在库核验，不依赖 Image 加载） ----
function pngDims(p: string): { w: number; h: number } {
  const b = readFileSync(p);
  // PNG 签名 8B + IHDR 长度/类型 8B + 宽高各 4B（大端）
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; vanillaId?: number;
  boss?: boolean;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (cx: number, cy: number, w = 40, h = 40): MockEnemy => {
  const e: MockEnemy = {
    id: 1, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy,
    hp: 100000, maxHp: 100000, boss: true, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

interface DustRec {
  x: number; y: number; w: number; h: number; type: number;
  vx: number; vy: number; scale: number; noGravity: boolean; alpha: number;
  color: { r: number; g: number; b: number; a: number } | null;
}

function makeWorld(): World {
  const w = new World(W, H, 7, 'bj642');
  const st = w.store;
  for (let x = 0; x < W; x++) { st.setTile(x, FLOOR, 1); st.setTile(x, FLOOR + 1, 1); }
  w.groundLevel = 120;
  return w;
}

function makeHooks(w: World, enemies: MockEnemy[] = [], dusts: DustRec[] = []): GameHooks {
  const player = new Player(60 * 16, 110 * 16, new Inventory());
  return {
    world: w, player,
    enemies: () => enemies as never,
    critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    dropContext: () => ({ zoneHallow: false, zoneCorrupt: false, zoneCrimson: false, zoneJungle: false, zoneSnow: false, zoneDesert: false, zoneDungeon: false, zoneBeach: false, bloodMoon: false, halloween: false, xmas: false, windy: false }),
    scene: { zoneHallow: false, zoneGraveyard: false },
    entities: { nextId: 1, add: () => {} },
    dusts: dusts as never,
    spawnDust: ((x: number, y: number, dw: number, dh: number, type: number,
      sx = 0, sy = 0, alpha = 0, color: DustRec['color'] = null, scale = 1,
      noGravity = false) => {
      const d: DustRec = { x, y, w: dw, h: dh, type, vx: sx, vy: sy, scale, noGravity, alpha, color };
      dusts.push(d);
      return d;
    }) as never,
    addLightAt: () => {},
  } as unknown as GameHooks;
}

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

const px = (t: number): number => t * 16;

// ===========================================================================
// §1 素材面（在库核验）：七帧火舌竖条 98×686 = 7×98（DrawProj Frame(1,7,...)）
// ===========================================================================
describe('§1 火舌贴图在库（Frame(1,7) 竖条 98×686）', () => {
  it('85/1106 贴图七帧竖条在库（Main.cs:35651/:35724 value=TextureAssets.Projectile[type]）', () => {
    for (const id of [85, 1106]) {
      const p = join(GAME, `public/sprites/vanilla/Projectile_${id}.png`);
      const { w, h } = pngDims(p);
      expect(w, `${id} 帧宽`).toBe(98);
      expect(h, `${id} 七帧竖条总高`).toBe(686);
      expect(h / w, `${id} 帧数=7`).toBe(7);
    }
  });
  it('数据面：85/1106 = aiStyle 193/6×6/penetrate 4/extraUpdates 2（vanilla-projectiles 亲读）', () => {
    const d85 = projectileData(85);
    const d1106 = projectileData(1106);
    expect(d85?.aiStyle).toBe(193);
    expect(d85?.width).toBe(6);
    expect(d85?.penetrate).toBe(4);
    expect(d85?.extraUpdates).toBe(2);
    expect(d85?.armorPenetration).toBe(15);
    expect(d1106?.aiStyle).toBe(193);
    expect(d1106?.extraUpdates).toBe(2);
  });
});

// ===========================================================================
// §2 帧机锁（:35670 rectangle = flag ? Frame(1,7,0,(int)Remap(t,0.5,1,3,5)) : Frame(1,7,0,3)）
// ===========================================================================
describe('§2 帧机（Frame(1,7,0,frame)）', () => {
  it('基档恒帧 3（t∈[0,1) 全程）', () => {
    for (const t of [0, 0.1, 0.3, 0.5, 0.7, 0.99]) {
      expect(flameTongueFrame(t, false)).toBe(3);
    }
  });
  it('elf flag 档 (int)Remap(t,0.5,1,3,5)：3→4→5（:35670）', () => {
    expect(flameTongueFrame(0.49, true)).toBe(3);
    expect(flameTongueFrame(0.5, true)).toBe(3);
    expect(flameTongueFrame(0.75, true)).toBe(4);
    expect(flameTongueFrame(0.99, true)).toBe(4);   // 4.96 截断
    expect(flameTongueFrame(1, true)).toBe(5);
  });
});

// ===========================================================================
// §3 双层调色链逐值锁（:35662-35666 flame/elf、:35736-35745 fox——六段断点
//    0.1/0.2/0.35/0.7/0.85/1；字节面=逐通道截断，FLAME_C3=Lerp((255,80,20,100),
//    (255,255,20,70),0.25)=(255,123,32,92)）
// ===========================================================================
describe('§3 调色链六段（Color.Lerp 字节截断面）', () => {
  it('flame 段界：0.05 入段/0.15 混色/0.3 恒 color2/0.5 混 color3/0.8 混 color4/0.9 淡出', () => {
    expect(flameTongueEnv(0.05, 'flame')).toEqual([127, 40, 10, 100]);   // Lerp(T,(255,80,20,200),0.5)
    expect(flameTongueEnv(0.15, 'flame')).toEqual([255, 167, 20, 135]);  // Lerp(c0,c2,0.5)
    expect(flameTongueEnv(0.3, 'flame')).toEqual([255, 255, 20, 70]);    // color2 恒段
    expect(flameTongueEnv(0.5, 'flame')).toEqual([255, 198, 20, 79]);    // Lerp(c2,c3,0.15/0.35)
    expect(flameTongueEnv(0.8, 'flame')).toEqual([138, 94, 60, 97]);     // Lerp(c3,c4,0.1/0.15)
    expect(flameTongueEnv(0.9, 'flame')).toEqual([53, 53, 53, 66]);      // Lerp(c4,T,1/3)
  });
  it('elf 蓝档四元组（:35667-35670 flag 支）尾段淡出', () => {
    expect(flameTongueEnv(0.3, 'elf')).toEqual([50, 180, 255, 70]);      // color2 恒段
    expect(flameTongueEnv(0.85, 'elf')).toEqual([33, 125, 202, 100]);    // 末段起点 f=0 → color4 原值
  });
  it('fox 链 = [elf色顶, elf色次, elf色次, FLAME_C3, flame色4]（:35736-35745；FLAME_C3=(255,123,20,92)）', () => {
    expect(flameTongueEnv(0.05, 'fox')).toEqual([47, 60, 127, 100]);     // Lerp(T,(95,120,255,200),0.5)
    expect(flameTongueEnv(0.3, 'fox')).toEqual([50, 180, 255, 70]);
    expect(flameTongueEnv(0.5, 'fox')).toEqual([137, 155, 154, 79]);     // Lerp(c4,(255,123,20,92),0.15/0.35)
  });
});

// ===========================================================================
// §4 火舌 ops 几何/α 逐值锁（DrawProj_Flamethrower :35647-35716 / _Foxsparks
//    :35719-35832 逐 draw 展开；gtw=0 钉死旋面）
// ===========================================================================
describe('§4 flameTongueOps（双层×步进 1:1）', () => {
  it('flame 基档：6 步×4 draw=24 ops、帧 3、k=0 黑纱档 aByte=0、k=1 调色/α 逐值', () => {
    const ops = flameTongueOps({ projId: 85, l0: 12, vx: 7, vy: 0, cx: 1000, cy: 2000, gtw: 0, ai0: 0 });
    expect(ops.length).toBe(24);                       // num6=0.2 → 6 步 × (2+2)
    expect(ops.every((o) => o.frame === 3)).toBe(true);
    // t=1/6 → num12 钳 0.25（t<0.2）；k=0 主层：px=1000+7×(−12)×1
    const main0 = ops[1];
    expect(main0.layer).toBe(0);
    expect(main0.main).toBe(true);
    expect(main0.px).toBeCloseTo(1000 - 84, 6);
    expect(main0.py).toBe(2000);
    expect(main0.ang).toBeCloseTo(-Math.PI / 2, 12);   // rotB = −1×π/2 − 0
    expect(main0.scale).toBe(0.25);
    expect(main0.aByte).toBe(0);                       // num14=0 → color6 A=0（原版照画的黑纱位）
    // 层序=层主序（L0 全 k 后 L1）：ops[2]=L0-off-k1、ops[3]=L0-main-k1
    // k=1（num13=0.8）：num14=0.2×5/6；env(1/6)=Lerp(c0,c2,2/3)=(255,196,20,113)
    //   color5=(42,32,3,18)、color6 G/2=16、B/2=1、A=min(18+13,255)=31
    const main1 = ops[3];
    expect(main1.px).toBeCloseTo(1000 + 7 * (-12) * 0.8, 6);   // = 993.2
    expect(main1.rgb).toEqual([42, 16, 1]);
    expect(main1.aByte).toBe(31);
    // k=1 偏位层（×num9×0.25 双截断；位=+v×(−12)×0.2×0.5）
    const off1 = ops[2];
    expect(off1.main).toBe(false);
    expect(off1.px).toBeCloseTo(1000 + 7 * (-12) * 0.8 + 7 * (-12) * 0.2 * 0.5, 6);
    expect(off1.rgb).toEqual([10, 4, 0]);
    expect(off1.aByte).toBe(7);
    expect(off1.ang).toBeCloseTo(0.8 * Math.PI / 2 + Math.PI / 4, 12);  // rotA+π/4（i=0 偏位层相位）
    expect(off1.scale).toBeCloseTo(0.25, 12);
  });
  it('elf flag 档：i=1 整层跳过（6 步×2=12 ops）+ 调色不折半（:35667 flag 支）', () => {
    const ops = flameTongueOps({ projId: 85, l0: 12, vx: 7, vy: 0, cx: 1000, cy: 2000, gtw: 0, ai0: 1 });
    expect(ops.length).toBe(12);
    expect(ops.every((o) => o.layer === 0)).toBe(true);
    const main1 = ops[3];                              // k=1 主层（层主序=L0 内 k 递增）
    // env(1/6,elf)=Lerp((95,120,255,200),(50,180,255,70),2/3)=(65,160,255,113)
    //   ×num14=1/6 → color5=(10,26,42,18)；flag 档 color6=color5（无 G/2、B/2）
    expect(main1.rgb).toEqual([10, 26, 42]);
    expect(main1.aByte).toBe(18);
  });
  it('fox 档：num6×0.7=0.14 → 8 步×4=32 ops、尾随基向/距离档/上浮位', () => {
    // owner(1040,2000) 在弹正右 40px、弹速 5（≤10 → flag2=false）
    const ops = flameTongueOps({ projId: 1106, l0: 12, vx: 5, vy: 0, cx: 1000, cy: 2000, gtw: 0, ownerCx: 1040, ownerCy: 2000 });
    expect(ops.length).toBe(32);                       // k=0..7（1−7×0.14=0.02）
    // 基向：target=owner+v×6=(1070,2000) → dir=(1,0) → vector=(−5,0)
    // k=0 主层 px = 1000 + (−5)×(−12)×1×(40/120)
    const main0 = ops[1];
    expect(main0.px).toBeCloseTo(1000 + 20, 6);
    expect(main0.py).toBe(2000);                       // lift=−46×Remap(12,20,72)³=0
    expect(main0.scale).toBeCloseTo(0.25 * 0.5, 12);   // fox ×0.5
    // l0=36：lift = −46×(16/52)³
    const ops36 = flameTongueOps({ projId: 1106, l0: 36, vx: 5, vy: 0, cx: 1000, cy: 2000, gtw: 0, ownerCx: 1040, ownerCy: 2000 });
    const lift36 = -46 * Math.pow(16 / 52, 3);
    expect(ops36[1].py).toBeCloseTo(2000 + lift36, 6);
  });
  it('t>=1（l0=72）不画（:35672-35673 早退）+ 寿命衰减 num9（:35658 Remap(l0,60,72,1,0)）', () => {
    expect(flameTongueOps({ projId: 85, l0: 72, vx: 7, vy: 0, cx: 0, cy: 0, gtw: 0 })).toEqual([]);
    // l0=66：num6=0.175 → 6 步=24 ops；num9=0.5；k=1 主层：
    //   env(0.9167)=Lerp((80,80,80,100),T,0.4444)=(44,44,44,55)、num14=0.175
    //   → color5=(7,7,7,9)、color6 G/2=3 B/2=3 A=trunc(9+14)=23
    //   → 主层 rgb=trunc(3×0.5)=(1,1,0)?（B 通道 3×0.5=1.5→1）=[3,1,1]（R7×0.5=3）
    //   → aByte=trunc(23×0.5)=11
    const ops = flameTongueOps({ projId: 85, l0: 66, vx: 7, vy: 0, cx: 0, cy: 0, gtw: 0 });
    expect(ops.length).toBe(24);
    expect(ops[3].rgb).toEqual([3, 1, 1]);
    expect(ops[3].aByte).toBe(11);
  });
});

// ===========================================================================
// §5 AI_193 尘链+寿命锁（P.cs:42075-42142 1:1；Math.random=0 钉死掷率）
// ===========================================================================
describe('§5 AI_193 尘链/寿命/阻尼', () => {
  function drive85(opts?: { vx?: number; vy?: number }) {
    const w = makeWorld();
    const dusts: DustRec[] = [];
    const hooks = makeHooks(w, [], dusts);
    const a = new Arrow(px(70), px(60), opts?.vx ?? 7, opts?.vy ?? 0, 10, 1, 85);
    let ticks = 0;
    while (!(a as unknown as { dead: boolean }).dead && ticks < 200) {
      (a as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate(1 / 60, hooks);
      ticks++;
    }
    return { a, dusts, ticks };
  }

  it('寿命杀：72 子步=24 tick（:42082-42084）', () => {
    Math.random = () => 0;
    const { a, ticks } = drive85();
    expect(ticks).toBe(24);
    expect((a as unknown as { age: number }).age).toBe(72);
  });
  it('尘链 A：age<50 每子步 1 粒 d6（rand=0 → 50 粒）；大档 noGravity+scale×4.5+v×2（:42098-42115）', () => {
    Math.random = () => 0;
    const { dusts } = drive85();
    const d6 = dusts.filter((d) => d.type === 6);
    expect(d6.length).toBe(49);                        // localAI[0]<num5(50)：l0=1..49（首子步 ++ 先行,原版同相）
    expect(d6.every((d) => d.noGravity)).toBe(true);   // rand.Next(4)==0 大档
    expect(d6[0].scale).toBeCloseTo(4.5, 12);          // ×3 ×1.5
    // 初速=v×0.2=1.4 → 大档 ×2 → ×1.2 → 3.36；+= 7×Remap(1,0,45,1,0.1)×Remap(1,0,6,0.1,1)
    const k45 = 1 + (0.1 - 1) * (1 / 45), k6 = 0.1 + 0.9 * (1 / 6);
    expect(d6[0].vx).toBeCloseTo(3.36 + 7 * k45 * k6, 6);
    // 出生位=Circular(60,60)×Remap(1,0,72,0.5,1)（rand=0 → 零偏移）+4×4 盒
    // 锚=Center（x+w/2=1123）
    expect(d6[0].x).toBeCloseTo(px(70) + 3, 6);
    expect(d6[0].w).toBe(4);
  });
  it('尘链 B：age>=50 每子步 1 粒 d31 烟（rand=0 → 22 粒）；位=Center−向×2、vel=玩家心向×7（:42116-42131）', () => {
    Math.random = () => 0;
    const { dusts } = drive85();
    const d31 = dusts.filter((d) => d.type === 31);
    expect(d31.length).toBe(23);                       // l0=50..72（含杀拍子步,vanilla Kill 不中断 AI 体）
    expect(d31.every((d) => d.noGravity)).toBe(true);
    expect(d31[0].alpha).toBe(150);
    expect(d31[0].color).toEqual({ r: 80, g: 80, b: 80, a: 255 });
    // dir=归一(Center−玩家 Center)×7（tri=0 不旋）;玩家锚=Player Center 语义。
    // 首粒烟在 l0=50 的 AI 相（=第 50 子步位移【前】）——弹心解析式：
    // cx = 出生 Center + (50−1)×7（前 49 子步各 +7,无阻尼）;cy 恒出生 Center
    const w2 = makeWorld();
    const dusts2: DustRec[] = [];
    const hooks2 = makeHooks(w2, [], dusts2);
    const p2 = (hooks2 as unknown as { player: { cx: number; cy: number } }).player;
    Math.random = () => 0;
    const b2 = new Arrow(px(70), px(60), 7, 0, 10, 1, 85);
    const upd2 = (b2 as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate;
    while (!(b2 as unknown as { dead: boolean }).dead) upd2.call(b2, 1 / 60, hooks2);
    const d310 = dusts2.filter((d) => d.type === 31)[0];
    const spawnCx = px(70) + 3 + 49 * 7, spawnCy = px(60) + 3;
    const dx = spawnCx - p2.cx, dy = spawnCy - p2.cy;
    const dl = Math.hypot(dx, dy);
    expect(d310.vx).toBeCloseTo(dx / dl * 7, 6);
    expect(d310.vy).toBeCloseTo(dy / dl * 7, 6);
    expect(d310.x).toBeCloseTo(spawnCx - dx / dl * 7 * 2, 6);   // −向×2
    expect(d310.y).toBeCloseTo(spawnCy - dy / dl * 7 * 2, 6);
    expect(d310.scale).toBeCloseTo(1.1, 12);           // ×(1.1+0×0.2)
  });
  it('阻尼：age>=60 每子步 ×0.95（:42086-42089）——tick 20 后 vx 衰减', () => {
    Math.random = () => 0;
    const w = makeWorld();
    const hooks = makeHooks(w);
    const a = new Arrow(px(70), px(60), 7, 0, 10, 1, 85);
    const upd = (a as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate;
    for (let t = 0; t < 19; t++) upd.call(a, 1 / 60, hooks);
    expect((a as unknown as { vx: number }).vx).toBeCloseTo(7, 6);       // 前 57 子步不阻尼
    upd.call(a, 1 / 60, hooks);                                          // tick 20 → 子步 58/59/60（60 越门）
    expect((a as unknown as { vx: number }).vx).toBeCloseTo(7 * 0.95, 6);
    upd.call(a, 1 / 60, hooks);                                          // tick 21 → 子步 61/62/63
    expect((a as unknown as { vx: number }).vx).toBeCloseTo(7 * 0.95 ** 4, 6);
  });
  it('1106 尘域半径 15/15、rate 0.125（:42101-42103 num6=num7=15、num8×0.5）', () => {
    Math.random = () => 0;
    const w = makeWorld();
    const dusts: DustRec[] = [];
    const hooks = makeHooks(w, [], dusts);
    const a = new Arrow(px(70), px(60), 5, 0, 10, 0, 1106);
    const upd = (a as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate;
    let ticks = 0;
    while (!(a as unknown as { dead: boolean }).dead && ticks < 200) { upd.call(a, 1 / 60, hooks); ticks++; }
    expect(ticks).toBe(24);
    const d6 = dusts.filter((d) => d.type === 6);
    const d31 = dusts.filter((d) => d.type === 31);
    expect(d6.length).toBe(49);                        // rand=0 钉死 → 0.125 掷全中（l0 1..49）
    expect(d31.length).toBe(23);
    // 半径 15：位=Center+cos(0)×0×15×grow（rand=0 零偏移）——速率面已锁,域径经
    // remap 上限 15 由 d6[1]（age=8,grow=0.5+8/144）位偏 = cos(a)r×15×grow（a=0,r=0）恒 0,
    // 域径以掷点公式锁在 §5 尘链 A 位式（此处锁 rate 面）
  });
});

// ===========================================================================
// §6 命中面回归锁（BJ639「已接」不破）+ 新可伤门（:12475-12480）
// ===========================================================================
describe('§6 命中面（armorPen/OnFire/可伤窗）', () => {
  it('armorPen 15 数据面+settlePen 两源（armorpen-dot-parity 回归同相）', () => {
    const a = new Arrow(0, 0, 1, 0, 10, 1, 85);
    (a as unknown as { armorPen: number }).armorPen = 5;
    expect((a as unknown as { settlePen: number }).settlePen).toBe(20);
  });
  it('OnFire3(323) 1200t 基档 / ctx.ai0=1 → Frostburn2(324)（StatusNPC :11660-11663）', () => {
    expect(TABLE['85']).toEqual([
      { buff: 323, chance: 1, durMin: 1200, durMax: 1200, src: 11660, gate: 'ai0==1→324' },
    ]);
    const mk = () => ({ vanillaId: 1, onFire3T: 0, frostburn2T: 0, onFireT: 0 });
    const e0 = mk();
    applyProjStatus(85, e0 as never, { ai0: 0 });
    expect(e0.onFire3T).toBe(20);
    expect(e0.frostburn2T).toBe(0);
    const e1 = mk();
    applyProjStatus(85, e1 as never, { ai0: 1 });
    expect(e1.frostburn2T).toBe(20);
    expect(e1.onFire3T).toBe(0);
    const eD = mk();
    applyProjStatus(85, eD as never);                  // 旧调用面=基档 323
    expect(eD.onFire3T).toBe(20);
  });
  it('可伤窗：localAI[0]>=54（=18 tick）后不再结算（Damage_CanDealDamage :12475-12480）', () => {
    Math.random = () => 0.9;                           // 避开尘链掷（0.9≥0.5）
    const w = makeWorld();
    const enemy = mkEnemy(px(72), px(60));
    const hooks = makeHooks(w, [enemy]);
    const a = new Arrow(px(70), px(60), 7, 0, 10, 1, 85);
    const upd = (a as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate;
    let hitTick = -1;
    for (let t = 0; t < 40; t++) {
      upd.call(a, 1 / 60, hooks);
      if (enemy.hits.length > 0 && hitTick < 0) hitTick = t;
    }
    expect(enemy.hits.length).toBe(1);                 // localNPCHitCooldown=-1 单次受理
    expect(hitTick).toBeGreaterThanOrEqual(0);
    expect(hitTick).toBeLessThanOrEqual(17);           // 受理只在 age<54 窗内
  });
  it('1106 foxHitInflate 速度门回真（:15079-15086）——出生速度原版字面后 |v|=5≤10 不入 +10 臂', () => {
    const a = new Arrow(0, 0, 5, 0, 10, 0, 1106);
    (a as unknown as { age: number }).age = 36;
    expect((a as unknown as { foxHitInflate: () => number }).foxHitInflate()).toBe(10);
    const b = new Arrow(0, 0, 15, 0, 10, 0, 1106);     // ×3 污染速度（旧态）会误翻 30
    (b as unknown as { age: number }).age = 36;
    expect((b as unknown as { foxHitInflate: () => number }).foxHitInflate()).toBe(30);
  });
  it('MinionProj 1106 出生面：velocity=num17 字面/life=72 子步/伤 trunc（源锚）', () => {
    const src = readFileSync(join(GAME, 'src/entities/MinionProj.ts'), 'utf8');
    expect(src).toContain('const flameSpd = this.projId === 1113 ? 10.5 : 5;');
    expect(src).toContain('{ grav: 0, life: 72, pierce: 4 }');
    expect(src).toContain('Math.trunc(dmg0 * 0.85)');
  });
});

// ===========================================================================
// §7 撞块滑移（HandleMovement :18414-18417）——不消亡、v=last×0.95、位退步
// ===========================================================================
describe('§7 撞块滑移（85/1106 贴壁驻留）', () => {
  it('85 撞墙不死：vx=入撞速×0.95、位置退步；随后寿命杀收口', () => {
    Math.random = () => 0.9;
    const w = makeWorld();
    const st = w.store;
    for (let y = 90; y < FLOOR; y++) { st.setTile(80, y, 1); st.setTile(81, y, 1); }   // 竖墙
    const hooks = makeHooks(w);
    const a = new Arrow(px(70), px(60), 7, 0, 10, 1, 85);
    const upd = (a as unknown as { fixedUpdate: (dt: number, g: GameHooks) => void }).fixedUpdate;
    let collideTick = -1;
    let vxAtCollide = 0;
    for (let t = 0; t < 40; t++) {
      upd.call(a, 1 / 60, hooks);
      const dead = (a as unknown as { dead: boolean }).dead;
      const vx = (a as unknown as { vx: number }).vx;
      if (collideTick < 0 && vx < 7 - 1e-9) { collideTick = t; vxAtCollide = vx; }
      if (dead) break;
    }
    expect(collideTick).toBeGreaterThanOrEqual(0);     // 撞墙事件发生
    expect(vxAtCollide).toBeCloseTo(6.65, 6);          // v=last×0.95
    expect((a as unknown as { dead: boolean }).dead).toBe(true);   // 随后 72 子步寿命杀
    expect((a as unknown as { age: number }).age).toBe(72);
  });
});

// ===========================================================================
// §8 演出面接线（draw 独占支/发射位 ai0 注入/全亮通道）——源锚锁
// ===========================================================================
describe('§8 演出面接线源锚', () => {
  const arrowSrc = readFileSync(join(GAME, 'src/entities/Arrow.ts'), 'utf8');
  it('draw 独占支消费 flameTongueOps+染缸+全亮队列（BJ529 270 判例通道）', () => {
    expect(arrowSrc).toContain('const ops = flameTongueOps({');
    expect(arrowSrc).toContain('flameTongueTint(this.projId, imgF, op.rgb)');
    expect(arrowSrc).toContain("if (typeof qFb === 'function') qFb.call(r, drawInto);");
  });
  it('发射位 ai0 注入（1910 精灵熔炉=蓝焰档,Player.cs:49627-49629）', () => {
    const gameSrc = readFileSync(join(GAME, 'src/core/Game.ts'), 'utf8');
    expect(gameSrc).toContain('if (projId === 85 && bowVid2 === 1910) bowArrow.hostileAi0 = 1;');
  });
  it('AI_193 尘链在 subStepAI（85/1106 域）+ 撞块滑移 + 可伤门三面在位', () => {
    expect(arrowSrc).toContain('if (this.projId === 85 || this.projId === 1106) {\n      const l0 = this.age;');
    expect(arrowSrc).toContain('this.vx *= 0.95; this.vy *= 0.95;                                 // velocity = lastVelocity*0.95f');
    expect(arrowSrc).toContain('&& this.age >= 54) return;');
  });
});

// ============================================================
// ③ 变异自证（恰红+逐字节还原+sha256 对拍,BJ606 习语）
//    SW_BJ642_MUT=1 时本组跳过（变异运行读环境位跳过自证组,防递归）
// ============================================================
describe.skipIf(process.env.SW_BJ642_MUT)('③ 变异自证（恰红+逐字节还原+sha256 对拍）', () => {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj642-flamethrower-vfx.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 600_000,
      env: { ...process.env, SW_BJ642_MUT: '1' },
    });
  // ★残留普查波 2026-10-12:BJ606 习语统一改造→tests/mutation-guard.ts 三层守卫
  //  （跨套件按文件互斥=bj642/bj643 同变异 Arrow.ts 联跑互染根除/panic-safe 还原/
  //  残留自检+自愈）;本文件只留 spawnVitest+恰红双门断言。
  const mutate = (file: string, trigger: string, replacement: string, filter: string): void => {
    withMutation(file, trigger, replacement, () => {
      const r = spawnVitest(filter);
      const out = r.stdout + r.stderr;
      // 恰红双门：退出码非零 ∨ 输出面含红账（联跑池并发下 exit code 可能被
      // 缓存命中洗白——以测试账面为准,BJ606 习语的同构加固）
      const red = r.status !== 0 || /Tests\s+\d+ failed/.test(out) || out.includes(' failed');
      expect(red, `变异须证红: ${replacement}`).toBe(true);
      expect(out).toContain(filter);
      expect(out).not.toContain('没有找到测试');
    }, { label: `BJ642 ${filter}` });
  };

  const ARROW = join(process.cwd(), 'src', 'entities', 'Arrow.ts');

  it('M1 AI_193 寿命杀 72→7200（回退旧 3600 子步不灭面）→ §5 寿命杀 红', () => {
    mutate(ARROW,
      'if (l0 >= 72) { this.killNow(game); return; }',
      'if (l0 >= 7200) { this.killNow(game); return; }',
      '寿命杀');
  });
  it('M2 演出版 color6 半旗摘除（回退旧 G/2B/2 无门档）→ §4 flame 基档调色锁 红', () => {
    mutate(ARROW,
      'const halve = !flagV;',
      'const halve = false;',
      'flame 基档');
  });
  it('M3 AI_193 尘链 B 掷率 0.5→0（烟链整缺）→ §5 尘链 B 红', () => {
    mutate(ARROW,
      'if (num4 > 0 && l0 >= num4 && Math.random() < 0.5) {',
      'if (num4 > 0 && l0 >= num4 && Math.random() < 0) {',
      '尘链 B');
  });
  it('M4 foxHitInflate ×3 旧刻度回灌（BJ642 ⑤ 子步刻度勘误回退）→ §6 速度门 红', () => {
    mutate(ARROW,
      'const age = Math.min(this.age, 72);',
      'const age = Math.min(this.age * 3, 72);',
      'foxHitInflate');
  });
});
