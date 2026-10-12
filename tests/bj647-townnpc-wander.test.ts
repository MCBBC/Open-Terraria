// ★BJ647 城镇 NPC 走位瞬移（用户实报「巫医 Kogi-ghi / 海盗 David 走到右侧瞬移到
// 左侧重新走路」+ debug-report 十周年纪念种子 18-05/18-11 两份物证 + 探针
// _bj647-repro.mjs 真机实录）。
//
// 【物证链】行为日志 30t 采样：witch_doctor x∈{62858,62859,62862,62866,62868}、
// pirate x∈{62938..62954} 的 150t 严格周期锯齿（dir 恒 +1、vx 峰 0.91、wm 1→0）。
// 真机逐拍复现（_bj647-repro.mjs，t=438-441）：
//   t=438 行走中 tryRandomChairSit（cs:55922-85 rand(300)==0）掷中 → forceSit 钉位
//        cx=62954 = 3934*16+8+2*1（sittingAnchor 精确解,坐 900+rand(10800)）
//   t=439 x −16px（unembedPass topEmbedded 2t 快速支横推,盒缘嵌右侧墙 3935 列）
//   t=440 起身臂特征 wT=90=60+rand(60)、tl=43=30+rand(60)（坐探针格被推到
//        3933 列=桌 → canSitAt 失败 → sitTimer=0,cs:54691-97 同相）
//   t=441 夜间回家臂重掷 walkT=325=REST_LEG_BASE+rand(200)（cs:54056-91 同相）
//   → 走回椅列 → 再坐再推 = 150t 循环。
//
// 【定谳】原版全文无 unembed 等价机制（RB29/FX34b 判例）：坐锚
// Bottom=(x*16+8+2*dir, y*16(+16)) 无净空门（cs:53285-86/:55972-75）——贴墙椅
// （frameX 档朝墙侧 +2px）钉位后盒缘合法嵌墙 1-4px；原版 vx=0 坐姿无位移=无碰撞
// 响应=嵌墙稳定坐,Bottom−2px 探针恒椅格 → 坐满 900+rand(10800) 或天亮/被打扰。
// 本仓 unembedPass（纯自愈兜底）把该合法锚位误判 worldgen 坏形嵌入 → 横推打断。
// 【落刀】unembedPass 对坐姿态体整段让位（与 wet/hoik/unwedgeDrift 让位判例同构）。
// 【撞名规避】Body.sitPose 独立字段——Player.sitting（Player.ts:2196,每拍
// moveAndCollide(this)）语义为坐姿交互态,不得触发本让位面。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const CHAIR = TILE_BY_KEY['chair']!;   // sheet 15
const DIRT = TILE_BY_KEY['dirt']!;
const FLOOR = 100;                     // 地面行（实心）
const SPOT_X = 110;                    // 椅列
const ANCHOR_RIGHT = SPOT_X * 16 + 10; // frameX=18 → dir=+1 → Bottom.X=x*16+8+2*1

function makeGame(world: World) {
  return {
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, luckState: { usedGalaxyPearl: false } },
      enemies: () => [],
      npcs: () => [],
      critters: () => [],
      spawnTownShot: () => {},
      spawnParticles: () => {},
      spawnBurst: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
      addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: () => {} },
    } as never,
  };
}

/** 地面 + 朝右椅（frameX=18）+ 椅右侧全高实心墙（贴墙椅=用户房间实测布局：
 *  .wld 椅列 3929/3934,右邻 3930/3935 列实心 '#'） */
function makeWorldWithWall(opts: { wall?: boolean } = {}) {
  const world = new World(200, 200, 100, 'bj647');
  const st = world.store;
  for (let x = 20; x <= 180; x++) st.setTileSilent(x, FLOOR, DIRT);
  st.setTileSilent(SPOT_X, FLOOR - 2, CHAIR, 18, 0);
  st.setTileSilent(SPOT_X, FLOOR - 1, CHAIR, 18, 18);
  if (opts.wall !== false) {
    for (let y = 94; y <= FLOOR - 1; y++) st.setTileSilent(SPOT_X + 1, y, DIRT);
  }
  world.clock.timeOfDay = 0;   // 午夜 → 夜（sitFlag 窗）
  return world;
}

/** 坐稳助手：夜晚从椅列左邻站位驱动至 sitting（站定同格门/行走掷双路径全通） */
function sitDown(world: World, startX = SPOT_X * 16 - 10) {
  const npc = new TownNPC('guide', startX, FLOOR * 16);
  npc.home = { x: SPOT_X, y: FLOOR - 1 };
  const { game } = makeGame(world);
  for (let t = 0; t < 400 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
  return { npc, game };
}

describe('BJ647 城镇 NPC 坐姿瞬移循环（贴墙椅）', () => {
  it('修复锁：贴墙椅坐下后长坐不横推（原版嵌墙坐姿=稳定坐,unembed 让位）', () => {
    const world = makeWorldWithWall();
    const { npc, game } = sitDown(world);
    expect(npc.sitting).toBe(true);
    expect(npc.cx).toBe(ANCHOR_RIGHT);            // forceSit 锚（:53285-86）
    expect(npc.y + npc.h).toBe(FLOOR * 16);
    // 坐姿 700t（> topEmbedded 2t 延迟门 × 多周期）：
    // 修复前 = unembed 横推 −16px → 探针失败起身 → 回家臂重走（瞬移循环）
    // 修复后 = 让位长坐,位置/坐姿恒定
    const dbg = (globalThis as Record<string, unknown>).__swPhysDbg as Record<string, number> | undefined;
    const h0 = dbg?.unembedH ?? 0;
    for (let t = 0; t < 700; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    expect(npc.cx).toBe(ANCHOR_RIGHT);            // 无 ±16px 横推瞬移
    expect(npc.y + npc.h).toBe(FLOOR * 16);
    expect((dbg?.unembedH ?? 0) - h0).toBe(0);    // 坐姿态零横推
  });

  it('循环断环锁：坐姿中断次数=0（修复前每 150t 一次起身-重走-再坐）', () => {
    const world = makeWorldWithWall();
    const { npc, game } = sitDown(world);
    expect(npc.sitting).toBe(true);
    let breaks = 0;
    let wasSitting = true;
    const xs = new Set<number>();
    for (let t = 0; t < 700; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (wasSitting && !npc.sitting) breaks++;
      wasSitting = npc.sitting;
      if (npc.sitting) xs.add(npc.cx);
    }
    expect(breaks).toBe(0);                        // 坐姿不中断=循环断
    expect([...xs]).toEqual([ANCHOR_RIGHT]);       // 坐姿中位置唯一=无瞬移
  });

  it('对照：无墙椅同链长坐（几何不受让位面影响）', () => {
    const world = makeWorldWithWall({ wall: false });
    const { npc, game } = sitDown(world);
    expect(npc.sitting).toBe(true);
    expect(npc.cx).toBe(ANCHOR_RIGHT);
    for (let t = 0; t < 700; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    expect(npc.cx).toBe(ANCHOR_RIGHT);
  });

  it('BJ647-C 贴墙站位锁：椅锚贴墙态横推一次后稳定（无弹跳循环）', () => {
    // 用户实录（behavior-log 2026-10-12T01-35）巫医 x 恒锁椅面锚 62874、y 4396..4443
    // 振荡——定谳=探针 pin 拉扯伪影（pin 写 y=4380/物理落地 4456,采样面落两界间）,
    // 非 unembed 病（头顶 276 行 t124 实心→clear=0 垂直支不触发）。本锁钉物理层
    // 真行为：贴墙站位被横推一次离墙后即稳定,无持续振荡。
    const world = makeWorldWithWall();
    const body: Body = {
      x: ANCHOR_RIGHT - 10, y: (FLOOR - 2.5) * 16, w: 20, h: 40,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    };
    const ys: number[] = [];
    for (let t = 0; t < 400; t++) {
      body.vy = 0.3;
      moveAndCollide(body, world, 0, body.vy);
      ys.push(body.y);
    }
    // 稳态：末 100 拍 y 全等（无振荡）
    const tail = ys.slice(-100);
    expect(new Set(tail.map((v) => +v.toFixed(3))).size).toBe(1);
  });

  it('BJ647-C 救援面回归：深嵌墙体落地后被推离墙位（横推/抬升任一形态）', () => {
    const world = makeWorldWithWall();
    const body: Body = {
      x: SPOT_X * 16, y: (FLOOR - 4) * 16 + 8, w: 20, h: 40,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    };
    // 带重力：悬空段交还原版物理（1468 悬空刷角门）,落地贴地后进入救援判据
    for (let t = 0; t < 60; t++) {
      body.vy = 0.3;
      moveAndCollide(body, world, 0, body.vy);
    }
    // 救援后=不再嵌顶行墙（x 被横推离墙列或 y 被抬出墙格行）
    const topRow = Math.floor(body.y / 16);
    const st = world.store;
    let stillEmbedded = false;
    for (let tx = Math.floor(body.x / 16); tx <= Math.floor((body.x + body.w - 0.01) / 16); tx++) {
      if (st.isSolid(tx, topRow) && !st.isPlatform(tx, topRow)) { stillEmbedded = true; break; }
    }
    expect(stillEmbedded).toBe(false);
  });

  it('让位面收窄：sitPose 未置的体（Player.sitting 撞名面/普通嵌入体）照常横推', () => {
    // 直驱 moveAndCollide：无 sitPose 的嵌墙体 topEmbedded 2t 后仍横推（unembedH+1）
    // （topEmbedded 快速支姿态=中心格净+顶行压墙+有支撑;centerSolid 15t 慢门拍数不够）
    const world = makeWorldWithWall();
    const st = world.store;
    const body: Body = {
      x: SPOT_X * 16, y: (FLOOR - 2.5) * 16, w: 20, h: 40,
      vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
      // 盒[1760,1780)×[1560,1600)：贴地 onGround、中心列 110（椅,非 solid）、
      // 顶行 97 列 111 压墙 → topEmbedded 快速支（实拍 _tmp-bj647dbg t=1 横推 -16px）
    };
    const g0 = globalThis as Record<string, unknown>;
    if (!g0.__swPhysDbg) g0.__swPhysDbg = {} as Record<string, number>;
    const dbg = g0.__swPhysDbg as Record<string, number>;
    const h0 = dbg.unembedH ?? 0;
    for (let t = 0; t < 4; t++) {
      body.vy = 0.3;
      moveAndCollide(body, world, 0, body.vy);
    }
    expect(dbg.unembedH - h0).toBeGreaterThan(0);   // 让位面不误伤普通嵌入
    void st;
  });
});
