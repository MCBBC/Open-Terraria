// 荷兰飞盗船 491/492 动画对拍锁(2026-09-28)。
// 锚:Main.cs:24997-25053(type==491 独占 draw)+ NPC.cs:39246-39356(aiStyle 93)+
// NPC.cs:71941-71943(FindFrame case 492: frame.Y = num*ai[2] = 瞄准八角帧)。
//
// ★处方翻案两则(先定谳再动刀,反编译=唯一标杆):
//  ① 处方"炮管 4t/帧循环 9 帧(FindFrame case 75 :74909)、与 ai[2] 瞄准解耦"=
//    aiStyle/type 混淆:FindFrame switch 的是 type(NPC.cs:67469),case 75=仙女
//    (NPCID.Pixie=75),case 93=巨蝠(GiantBat=93)。炮管真实机制=FindFrame case 492
//    `frame.Y = num*(int)ai[2]`(:71941),ai[2] 由炮 AI 八向探测写(:36095-36124)
//    ——帧与 ai[2] 瞄准【耦合】,渲染读 ai[2] 即原版 1:1。炮 AI 探测基向量须为
//    UnitY.RotatedBy(-kπ/4)(k=0=正下);旧码用 (cos,sin)×(−kπ/4)=UnitX 基=偏 2 八向。
//  ② 处方"船体旋转 0.025→0.1(FindFrame case 93 后跑覆盖)"同源混淆:FindFrame 对
//    type 491 无 case(67469-78170 无 491 标签,亦无 default),AI 写 rotation=
//    vx*0.025(NPC.cs:39339)即终值;0.1 行属 harpy/bat 族走行面(:75643)。故旋转
//    断言锁 0.025(幅度上限断言=防 0.1 回归)。
//  六贴图:Frame(1,N) 纵切(源 y=f*帧高),origin 语义=Size×(0.5,1) 旗底中 /
//  Size×(0.5,0)(+0,10) 桨/炮 顶中下移 10 / 其余帆顶中——dst 顶左=vector−origin。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Renderer } from '../src/render/Renderer';
import { dd2LocalAI, dutchmanCannonAI } from '../src/entities/bossAI_dd2';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

// ============ 渲染路径原型直调:六贴图源矩形/锚点(记录型 ctx,moonlord 同范式) ============
interface Op { op: string; a: number[]; img?: string }
function recCtx() {
  const ops: Op[] = [];
  const ctx = {
    save() { ops.push({ op: 'save', a: [] }); },
    restore() { ops.push({ op: 'restore', a: [] }); },
    translate(x: number, y: number) { ops.push({ op: 'translate', a: [x, y] }); },
    rotate(r: number) { ops.push({ op: 'rotate', a: [r] }); },
    scale(x: number, y: number) { ops.push({ op: 'scale', a: [x, y] }); },
    drawImage(img: { w: number; h: number; tag: string }, ...r: number[]) {
      ops.push({ op: 'drawImage', a: r, img: img.tag });
    },
    globalAlpha: 1,
  };
  return { ctx, ops };
}
// 真实尺寸(实测 public/sprites/vanilla/*.png;Frame(1,N) 纵切帧高=高/N)
const SIZES: Record<string, [number, number]> = {
  NPC_491: [590, 534], NPC_492: [48, 432],
  Extra_40: [56, 176], Extra_41: [60, 704], Extra_42: [72, 640],
  Extra_43: [48, 360], Extra_44: [52, 448], Extra_45: [142, 608],
};
const fakeImg = (tag: string) => {
  const [w, h] = SIZES[tag];
  return { width: w, height: h, w, h, tag };
};
function fakeAtlas() {
  return {
    ensureVImage: (p: string) => fakeImg(p.replace('vanilla/', '').replace('.png', '')),
  };
}
function drawAt(phase: number, ai2s: number[] = [0, 2, 5, 8], facing: -1 | 1 = -1) {
  const ship = Enemy.fromVanilla(491, 100 * TILE, 90 * TILE)!;
  ship.facing = facing;                   // facing=vanilla spriteDirection:-1(vx>0 等价态)→ 不翻面
  ship.visAngle = 0.1;
  dd2LocalAI(ship)[3] = phase;            // localAI[3] 0..63 循环
  const cannons = ai2s.map((ai2, i) => {
    const c = Enemy.fromVanilla(492, 100 * TILE, 90 * TILE)!;
    c.id = 900 + i; c.ai2 = ai2; c.dead = false;
    return c;
  });
  ship.ai0 = cannons[0].id; ship.ai1 = cannons[1].id;
  ship.ai2 = cannons[2].id; ship.ai3 = cannons[3].id;
  const { ctx, ops } = recCtx();
  const fake = { atlas: fakeAtlas(), ctx } as unknown as Renderer;
  (Renderer.prototype as unknown as {
    drawDutchman: (e: Enemy, entities: unknown[]) => void;
  }).drawDutchman.call(fake, ship, [ship, ...cannons]);
  return ops;
}
const draws = (ops: Op[], tag: string) => ops.filter((o) => o.op === 'drawImage' && o.img === tag);

describe('drawDutchman 六贴图纵切+锚点(Main.cs:24997-25053,phase=localAI[3]=20 → num132=2)', () => {
  const ops = drawAt(20);

  it('船体整幅 (0,0,590,534)→(-208,-460);OriginFlip(208,460) 不翻面形态', () => {
    expect(draws(ops, 'NPC_491').length).toBe(1);
    expect(draws(ops, 'NPC_491')[0].a).toEqual([-208, -460, 590, 534]);
  });

  it('旗 Extra_40:Frame(1,4) 纵切 56×44,origin Size×(0.5,1) 底中 → dst (74,-428)', () => {
    const d = draws(ops, 'Extra_40');
    expect(d.length).toBe(1);
    // num132=2 → f=2:源 (0, 2*44, 56, 44)——旧码横切 (2*56,0,56,176)=越界红
    expect(d[0].a).toEqual([0, 88, 56, 44, 74, -428, 56, 44]);
  });

  it('桨 Extra_41:Frame(1,8) 纵切 60×88,origin Size×(0.5,0)+(0,10)=(30,10) → dst (-126+34i,30)×5', () => {
    const d = draws(ops, 'Extra_41');
    expect(d.length).toBe(5);
    // num132=2 → f=2:源 (0, 2*88, 60, 88);dst 顶左 = (-96+34i-30, 40-10)
    // (处方曾写 -48=按底中 40-88 误算;原版 Main.cs:25011 origin=(30,10) → +30)
    for (let i = 0; i < 5; i++) {
      expect(d[i].a).toEqual([0, 176, 60, 88, -126 + 34 * i, 30, 60, 88]);
    }
  });

  it('帆1 Extra_42×2:纵切 72×160,顶中 (36,0) → dst (122-106i,-302)', () => {
    const d = draws(ops, 'Extra_42');
    expect(d.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(d[i].a).toEqual([0, 2 * 160, 72, 160, 122 - 106 * i, -302, 72, 160]);
    }
  });

  it('帆2 Extra_43×2:纵切 48×90,顶中 (24,0) → dst (18-178i,-444)', () => {
    const d = draws(ops, 'Extra_43');
    expect(d.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(d[i].a).toEqual([0, 2 * 90, 48, 90, 18 - 178 * i, -444, 48, 90]);
    }
  });

  it('帆3 Extra_44:纵切 52×112,顶中 (26,0) → dst (-160,-302)', () => {
    const d = draws(ops, 'Extra_44');
    expect(d.length).toBe(1);
    expect(d[0].a).toEqual([0, 2 * 112, 52, 112, -160, -302, 52, 112]);
  });

  it('帆4 Extra_45:纵切 142×152,相位差 (2+num132)%4=0 → dst (-131,-330)', () => {
    const d = draws(ops, 'Extra_45');
    expect(d.length).toBe(1);
    expect(d[0].a).toEqual([0, 0, 142, 152, -131, -330, 142, 152]);
  });

  it('炮 NPC_492×4:帧行=炮实体 ai[2](FindFrame case 492 :71941 非 4t 钟)→ dst (-146+68i,-30)', () => {
    const d = draws(ops, 'NPC_492');
    expect(d.length).toBe(4);
    // ai2=[0,2,5,8] → 源 y=ai2*48;origin Size×(0.5,0)+(0,10)=(24,10) → (-122+68i-24, -20-10)
    const rows = [0, 2, 5, 8];
    for (let i = 0; i < 4; i++) {
      expect(d[i].a).toEqual([0, rows[i] * 48, 48, 48, -146 + 68 * i, -30, 48, 48]);
    }
  });

  it('纵切判别哨兵:num132=1..7 全部部件 sx=0(旧横切 sx=f*帧宽≠0 即爆红)', () => {
    for (let phase = 8; phase < 64; phase += 8) {
      const o = drawAt(phase);
      for (const tag of ['Extra_40', 'Extra_41', 'Extra_42', 'Extra_43', 'Extra_44', 'Extra_45']) {
        for (const d of draws(o, tag)) expect(d.a[0]).toBe(0);
      }
    }
  });

  it('64t 相位窗:旗/桨行随 num132 走满 4/8 帧(纵切 sy 相位表)', () => {
    for (let n = 0; n < 8; n++) {
      const o = drawAt(n * 8);
      expect(draws(o, 'Extra_40')[0].a[1]).toBe((n % 4) * 44);
      for (const d of draws(o, 'Extra_41')) expect(d.a[1]).toBe((n % 8) * 88);
      expect(draws(o, 'Extra_45')[0].a[1]).toBe(((2 + n) % 4) * 152);
    }
  });
});

// ============ 翻转极性判别(2026-09-29 朝向定谳):原版未翻态(sd=-1)船首朝 +x ============
// 基准:vanilla NPC_491.png(md5 0bcb71a1f1e2ceb29bfc4482069ad0d1,与 terraria-assets
// 逐字节全等)未翻态骷髅船首在贴图【右】侧(px≈390,斜桅伸至 590),船尾舱在左。
// 原版链:spriteDirection = -sign(vx)(NPC.cs:41012)→ sd==1 才 FlipHorizontally
// (Main.cs:23357-23361)⇒ 翻面 ⟺ 移动向左 ⟺ 船首恒指运动方向(逼进玩家=船首朝玩家)。
// ★旧码 flip=(facing===-1) 把 sd 惯例反读(前刃"FindFrame 覆盖 sign(vx)"前提为伪:
//   FindFrame 对 491 无 case 不覆盖,AI 的 sd 终值直通渲染)→ 船首恒逆运动方向
//   = 船尾恒朝玩家(与移动方向无关的恒错,即用户报修面)。
describe('翻转极性(原版朝向对照):facing=vanilla spriteDirection,翻面 ⟺ facing==1', () => {
  const scales = (ops: Op[]) => ops.filter((o) => o.op === 'scale');

  it('facing=-1(sd=-1,vx>0 等价态,玩家在右)→ 不翻面:无 scale(-1,1),船首(+x 贴图侧)朝玩家', () => {
    const ops = drawAt(20, [0, 2, 5, 8], -1);
    expect(scales(ops).length).toBe(0);
  });

  it('facing=1(sd=1,vx<0 等价态,玩家在左)→ 翻面:rotate 后 scale(-1,1),船首镜像朝 -x=玩家侧', () => {
    const ops = drawAt(20, [0, 2, 5, 8], 1);
    expect(scales(ops).length).toBe(1);
    expect(scales(ops)[0].a).toEqual([-1, 1]);
  });

  it('AI 全链(NPC.cs:41012→Main.cs:23357):玩家在右 vx>0 → facing=-1 且渲染不翻面(船首朝玩家)', () => {
    const h = makeHooks(makeWorld(), { x: 140, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 130, [ship]);
    expect(ship.vx).toBeGreaterThan(5);            // 向右逼进
    expect(ship.facing).toBe(-1);                  // spriteDirection = -sign(vx)
    const { ctx, ops } = recCtx();
    const fake = { atlas: fakeAtlas(), ctx } as unknown as Renderer;
    (Renderer.prototype as unknown as { drawDutchman: (e: Enemy, es: unknown[]) => void })
      .drawDutchman.call(fake, ship, [ship]);
    expect(scales(ops).length).toBe(0);            // 不翻面 → 船首(+x)朝右=朝玩家
  });

  it('AI 全链:玩家在左 vx<0 → facing=1 且渲染翻面 scale(-1,1)(船首镜像朝玩家)', () => {
    const h = makeHooks(makeWorld(), { x: 60, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 130, [ship]);
    expect(ship.vx).toBeLessThan(-5);
    expect(ship.facing).toBe(1);
    const { ctx, ops } = recCtx();
    const fake = { atlas: fakeAtlas(), ctx } as unknown as Renderer;
    (Renderer.prototype as unknown as { drawDutchman: (e: Enemy, es: unknown[]) => void })
      .drawDutchman.call(fake, ship, [ship]);
    expect(scales(ops).length).toBe(1);
    expect(scales(ops)[0].a).toEqual([-1, 1]);
  });
});

// ============ AI 路径:旋转幅度锁 0.025 + 炮 ai[2] 八向基向量 + 船底烟尘 2 次/t ============
const W = 200, H = 140, FLOOR = 110;

function makeWorld(): World {
  const w = new World(W, H, 7, 'dd2-test');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const particles: Array<{ x: number; y: number }> = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: (x: number, y: number) => { particles.push({ x, y }); },
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, particles, em, player };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

describe('AI_093 船体旋转幅度(NPC.cs:39339 rotation = vx*0.025;FindFrame 对 491 无 case 不覆盖)', () => {
  it('巡航极速 vx=6 → visAngle = 0.15(0.1 系数会得 0.6=翻案回归哨兵)', () => {
    const h = makeHooks(makeWorld(), { x: 140, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 130, [ship]);                 // 0.06/t 加速 → ~100t 到 6 速帽
    expect(Math.abs(ship.vx)).toBeGreaterThanOrEqual(5.9);
    expect(ship.visAngle).toBeCloseTo(ship.vx * 0.025, 10);
    expect(Math.abs(ship.visAngle)).toBeLessThan(0.3);   // 0.1 系数=0.6 出界
  });
});

describe('AI_075 炮 492 瞄准帧 ai[2](NPC.cs:36095-36124 八向探测,UnitY.RotatedBy(-kπ/4) 基)', () => {
  it('玩家正下 → vanilla k=0 → ai2=1(sd=-1 不镜像);旧 UnitX 基会写 7', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 3, [ship]);
    const c = h.enemies.find((n) => n.vanillaId === 492)!;
    ship.facing = -1;                     // vx>0 等价态 → sd=-1 → ai2=best+1
    ship.vx = 0; ship.visAngle = 0;
    h.player.cx = ship.cx; h.player.x = ship.cx - 10;
    h.player.cy = ship.cy + 300; h.player.y = h.player.cy - 21;
    c.ai3 = 0;                            // <240 → 走瞄准帧分支
    dutchmanCannonAI(c, h.hooks, h.hooks.player as never);
    expect(c.ai2).toBe(1);
  });

  it('玩家正右 → k=2 → ai2=3;镜像态 sd=1 → ai2=9-3=6(:36116 spriteDirection==1)', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 3, [ship]);
    const c = h.enemies.find((n) => n.vanillaId === 492)!;
    ship.facing = -1; ship.vx = 0; ship.visAngle = 0;
    h.player.cx = ship.cx + 300; h.player.x = h.player.cx - 10;
    h.player.cy = ship.cy; h.player.y = h.player.cy - 21;
    c.ai3 = 0;
    dutchmanCannonAI(c, h.hooks, h.hooks.player as never);
    expect(c.ai2).toBe(3);
    // 镜像:ship 朝左(vx<0 → spriteDirection=1)
    ship.facing = 1;
    c.ai3 = 0;
    dutchmanCannonAI(c, h.hooks, h.hooks.player as never);
    expect(c.ai2).toBe(6);
  });

  it('无 LOS/无玩家 → ai2 归 0(:36122-36124 else 分支)', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    tick(h, 3, [ship]);
    const c = h.enemies.find((n) => n.vanillaId === 492)!;
    c.ai2 = 5;
    dutchmanCannonAI(c, h.hooks, null);
    expect(c.ai2).toBe(0);
  });
});

describe('AI_093 船底烟尘量(NPC.cs:39343-39356:每 t 2 次 × 各 50%;旧码 1 次 × 50%)', () => {
  it('600t 统计:单 t ≤2 次,总量 >400(均值 ≈1/t;旧码 ≈300 不可达)', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 100 });
    const ship = spawn(h, 491, 100, 90);
    const before = h.particles.length;
    let maxPerTick = 0;
    for (let t = 0; t < 600; t++) {
      const b = h.particles.length;
      ship.fixedUpdate(1 / 60, h.hooks);
      maxPerTick = Math.max(maxPerTick, h.particles.length - b);
    }
    const total = h.particles.length - before;
    expect(maxPerTick).toBeLessThanOrEqual(2);
    expect(total).toBeGreaterThan(400);
  });
});
