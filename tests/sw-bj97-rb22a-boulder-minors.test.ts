// ★SW-BJ97/RB22a（2026-09-16）RollingBoulder minor 清偿两债守卫（全部 1457 锚 1:1;
// 1458 同域核对:Kill 头闸 :71764-66/SetDefaults timeLeft 同行/子更新环 :17306——
// 行号详见 RollingBoulder.ts 文头 RB22a 债账块）：
//   债1 rbKill 头幂等闸   P.cs:71763-71765 `if (!active) return;`（Kill 本体 :71752）
//                         ——同拍多 Kill 支齐发第二发空转=原版唯一防双发面。可达面：
//                         1048 静止杀（:19370-72,本仓 rb1048Bounce 尾无 return）与
//                         >20 弹杀（:19374-76）同拍齐发 → 无闸家族死亡面双发
//                         （尘 322×60 + Item_16×2）;1013 :19183-90、1054 :19294-300
//                         同构双 Kill 门（caller dead 早退/1054 不在拍龄钟=现不可达,
//                         结构 1:1 照抄原版=闸保护面）
//   债2 json timeLeft 承接 ctor 读 vanilla-projectiles.json timeLeft 列（Arrow.ts
//                         life 先例）：1054=300/:1846、1055=900/:1850、1047=3600/
//                         :9927;1021 `timeLeft *= 3`=:1871（=缺省 3600×3=10800,json
//                         不载算术覆写→特支）;1002=2/:9535 —— ★BJ102（2026-09-16）
//                         债①归一后 carve-out 退役：格侧 tntBarrelBlast 已改 Spawn-only
//                         （0 爆炸面）,承接 2 + AI_016 Kill 闸（:48031-35）=原版弹体
//                         单面（t+0 首 AI 拍即爆）,双自伤面不复存在（详 sw-bj102 套件）
// 变异证红（开发期逐组实测,每债至少一线;★BJ102 重锚后 M3 旧义退役）：
//   M1 摘 rbKill 头闸（`if (this.dead) return;`）→ K1/K2/K3/K4 全红（尘/声计数翻倍）
//   M2 boulderTimeLeft 恒返 3600 → L1/L2/L3 红（承接回退）
//   M3 旧义（摘 carve-out）退役=BJ102 落刀本体;新义回退（1002 特支烘回 3600）→ L1 红
//   M4 1021 特支值改 5400（把子更新 ÷2 烘进初值）→ L1 红（字段值 1:1 线）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RollingBoulder, boulderTimeLeft } from '../src/entities/RollingBoulder';
import { TILE_DEFS } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

// ================= 弹域夹具（sw-bj93 同构） =================

function fakeStore(w = 64, h = 64, placed?: Map<number, number>) {
  const cells = placed ?? new Map<number, number>();
  const liquidArr = new Float32Array(w * h);            // ★债② wave2：地形面注液闭包量
  const liquidTypeArr = new Float32Array(w * h);
  return {
    w, h,
    type: new Uint8Array(w * h),
    flags: new Uint8Array(w * h),
    slope: new Uint8Array(w * h),
    half: new Uint8Array(w * h),
    liquid: liquidArr,
    liquidType: liquidTypeArr,
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    isSolid: (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const id = cells.get(y * w + x);
      return !!id && !!TILE_DEFS[id]?.solid && !TILE_DEFS[id]?.platform;
    },
    isPlatform: () => false,
    isActive: (x: number, y: number) => cells.has(y * w + x),
    hasTile: (x: number, y: number) => cells.has(y * w + x),
    isActuated: () => false,
    get: (x: number, y: number) => cells.get(y * w + x) ?? 0,
    // ★SW-BJ93 债② wave2（2026-09-16）fixture 补齐：1054 蛛网铺置 setTile、
    //  1048 金字塔 setTile、Kill 地形面 canHit/solidTileAt 的 wire 位——真
    //  TileStore 原语最小镜像,旧桩缺 → TypeError 假红。
    setTile: (x: number, y: number, type: number) => { cells.set(y * w + x, type); },
    setLiquid: (x: number, y: number, amount: number, lt: number) => {
      liquidArr[y * w + x] = amount;
      liquidTypeArr[y * w + x] = lt;
    },
    wire: new Uint8Array(w * h),
  };
}
type Store = ReturnType<typeof fakeStore>;

function fakeGame(store: Store) {
  const dusts: Array<{ type: number; w: number; h: number; vy: number; noGravity: boolean; scale: number }> = [];
  const particles: Array<{ x: number; y: number; color: string; count: number }> = [];
  const sfx: Array<{ name: string }> = [];
  const playerHits: number[] = [];
  const player = { dead: true, x: 99999, y: 99999, w: 20, h: 42, cx: 100009, cy: 100020, vx: 0, vy: 0, facing: 1 };
  const g = {
    world: { store, w: store.w, h: store.h },
    player,
    candidatePlayers: () => [player],
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
    projectiles: () => [],
    spawnParticles: (x: number, y: number, color: string, count: number) => {
      particles.push({ x, y, color, count });
    },
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      vx = 0, vy = 0, _alpha = 0, _color = null, scale = 1) => {
      const dust = { x, y, w, h, type, vx, vy, alpha: 0, scale, fadeIn: 0, noGravity: false, color: null };
      dusts.push(dust);
      return dust;
    },
    playSfx: (name: string) => { sfx.push({ name }); },
    playSfxWav: (name: string) => { sfx.push({ name }); },
    playSfxFile: (name: string) => { sfx.push({ name }); },
    cutTile: () => {},
    spawnDrop: () => null,
    spawnFriendlyProj: () => {},
    damagePlayer: (dmg: number) => { playerHits.push(dmg); return dmg; },
    addLightAt: () => {},
    dusts, particles, sfx, playerHits,
  };
  return g as unknown as GameHooks & {
    dusts: typeof dusts; particles: typeof particles; sfx: typeof sfx; playerHits: typeof playerHits;
  };
}

const mkBoulder = (sheet: number): RollingBoulder => new RollingBoulder(104, 104, sheet);

/** 私有面直调（sw-bj93 internals 同款 cast 约定） */
const internals = (b: RollingBoulder) =>
  b as unknown as {
    rbKill: (g: GameHooks) => void;
    rb1013Bounce: (lvx: number, lvy: number, g: GameHooks) => void;
    rb1054Bounce: (lvx: number, lvy: number, g: GameHooks) => void;
    rb1048Bounce: (lvx: number, lvy: number, g: GameHooks) => void;
    localAI0: number; localAI1: number;
  };

beforeEach(() => { vi.restoreAllMocks(); });

// ================= 债1：rbKill 头幂等闸（P.cs:71763-71765 !active 门） =================
describe('SW-BJ97/RB22a 债1 rbKill 头幂等闸（同拍多 Kill 支齐发第二发空转）', () => {
  it('K1 1048 可达双杀（:1050 静止杀+:1051 >20 弹杀同拍）→ 家族死亡面单发（尘 322×30+Item_16×1）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);                          // 1048
    const iv = internals(b);
    iv.localAI0 = 60;                                  // :19370 门 localAI0>50（拍龄钟 :26365）
    iv.localAI1 = 21;                                  // :19374 门 localAI1>20（7 硬弹×3 :19353）
    b.vx = 0; b.vy = 0;
    // 低速碰撞（lastV=0.3 → 双系数 0.1 :19309-19331 → 弹后 |v|=0.0424<0.1 :19370）
    iv.rb1048Bounce(0.3, 0.3, game);
    expect(b.dead).toBe(true);
    // ★SW-BJ93 债② wave2 重锚（2026-09-16）：地形面（:76478-76489）落刀后,1048 的
    //  rbKill 追加金字塔逐格 3×2 尘 322（16×16 盒×12 格）——幂等闸判据按死亡尘面
    //  原盒 31×31 过滤（无闸双发=60 的变异判别力不变）。
    expect(game.dusts.filter((d) => d.type === 322 && d.w === 31).length).toBe(30);   // 无闸=60（M1 红）
    expect(game.sfx.filter((s) => s.name === 'Item_16').length).toBe(1);    // 无闸=2（M1 红）
  });

  it('K2 1013 静止杀（:19183-90 静止+>20 两连 Kill 结构）→ 后到 Kill 面空转（尘 243×30+dig×1）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(664);                          // 1013
    const iv = internals(b);
    iv.localAI0 = 51;                                  // :19183 门 localAI0>50
    b.vx = 0; b.vy = 0;
    iv.rb1013Bounce(0.3, 0.3, game);                   // 静止杀支（本仓带 return=vanilla 两连 Kill 首发）
    expect(b.dead).toBe(true);
    // 同拍第二 Kill 面（vanilla :19187-90 >20 门 / :17307 life 门——原版靠 !active 闸空转;
    // 本仓 :911 无 return+:667 同构隐患由本闸收口）
    iv.rbKill(game);
    expect(game.dusts.filter((d) => d.type === 243).length).toBe(30);       // 无闸=60（M1 红）
    expect(game.sfx.filter((s) => s.name === 'dig').length).toBe(1);        // 无闸=2（M1 红）
  });

  it('K3 1054 结构双门（:19294-96 静止+:19298-300 >1 弹杀）→ 1054 面 20 尘单发（无闸=40）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(714);                          // 1054
    const iv = internals(b);
    iv.localAI1 = 2;                                   // :19298 门 localAI1>1（X 门 :19285 ++）
    iv.localAI0 = 60;                                  // 1054 不在钟（:26365 仅 1013/1048）→ 实况 :998 恒假;置 60=假想推进
    b.vx = 0; b.vy = 0;
    iv.rb1054Bounce(0.3, 0.3, game);                   // 弹后 |v|=0.0424<0.1 → :998+:999 双门同拍
    expect(b.dead).toBe(true);
    expect(game.dusts.filter((d) => d.type === 30).length).toBe(20);        // 1054 专属尘臂 ×1（无闸=40,M1 红）
    expect(game.dusts.every((d) => d.type !== 30 || d.vy === -1)).toBe(true);
    expect(game.sfx.filter((s) => s.name === 'NPC_Hit_29').length).toBe(1); // 无闸=2（M1 红）
  });

  it('K4 单口直证（99 rbKill×2）→ 缺省尘 1×30+dig×1（闸对任意型二发空转）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(138);                          // 99
    const iv = internals(b);
    iv.rbKill(game);
    iv.rbKill(game);
    expect(game.dusts.filter((d) => d.type === 1).length).toBe(30);         // 无闸=60（M1 红）
    expect(game.sfx.filter((s) => s.name === 'dig').length).toBe(1);
    expect(b.dead).toBe(true);
  });
});

// ================= 债2：json timeLeft 承接（ctor → boulderTimeLeft 单源） =================
describe('SW-BJ97/RB22a 债2 json timeLeft 承接（1054=300/1055=900/1021=10800;★1002=2 经 BJ102 归一承接）', () => {
  it('L1 终值表：1054=300(:1846)/1055=900(:1850)/1047=3600(:9927)/99=缺省 3600(:789)/1002=2(:9535 列,BJ102)/1021=10800(:1871 *=3)', () => {
    expect(mkBoulder(714).life).toBe(300);             // 1054（M2 红=3600）
    expect(mkBoulder(715).life).toBe(900);             // 1055（M2 红=3600）
    expect(mkBoulder(711).life).toBe(3600);            // 1047 显式行,同值锚
    expect(mkBoulder(138).life).toBe(3600);            // 99 无覆写 → 缺省同位
    expect(mkBoulder(654).life).toBe(2);               // 1002 json 列承接（★BJ102 归一,M3 旧钉=3600 退役）
    expect(boulderTimeLeft(1021)).toBe(10800);         // P.cs:1871 `timeLeft *= 3`（M2/M4 红）
  });

  it('L2 1055 唯一常规死门=timeLeft：第 899 拍存活、第 900 拍 Kill（:17307-11 逐拍语义 1:1;原版 900t=15s）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(715);                          // 1055 荧光石球（撞墙不碎无追踪面=无前置死门）
    for (let t = 0; t < 899; t++) b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);                        // M2 红：life=3600 时 899 拍后照常存活,900 拍不 kill
    b.fixedUpdate(1 / 60, game);                       // 第 900 拍 life 0 → timeLeft<=0 Kill
    expect(b.dead).toBe(true);
    expect(game.sfx.some((s) => s.name === 'NPC_Killed_6')).toBe(true);     // Kill 家族声面随死门发放
    expect(game.dusts.filter((d) => d.type === 192).length).toBe(50);       // 1055 专属尘臂（:76453-66）
  });

  it('L3 1054 timeLeft 死门=第 300 拍（:1846 终值×每拍 −1=原版 300t=5s 同相）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(714);
    for (let t = 0; t < 299; t++) b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);                        // M2 红
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);
    expect(game.dusts.filter((d) => d.type === 30).length).toBe(20);        // 死门经 rbKill 单口=家族面在场
  });

  it('L4（★BJ102 归一重锚）1002 引信=首 AI 拍 Kill（:48031-35 timeLeft≤3）：t+0 dead、零接触结算、二次更新零追加', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(654);                          // 1002 TNTBarrel（timeLeft=2 弹体单面引信）
    b.fixedUpdate(1 / 60, game);                       // t+0：AI_016 Kill 闸 → rbKill1002Face
    expect(b.dead).toBe(true);                         // 承接 2 后首拍即 Kill（旧 M3 钉「第 2 拍不 Kill」退役——
                                                       //  格侧爆炸面已摘,双自伤面不复存在,详 sw-bj102 套件）
    b.fixedUpdate(1 / 60, game);                       // t+1：!active 闸空转
    expect(game.playerHits.length).toBe(0);            // 单测 mock 无 explodeAt 钩 → 面 no-op（bj102 套件钉参）
  });
});

// ================= 结构锁（源文本锚,防静默回退） =================
describe('SW-BJ97/RB22a 结构锁', () => {
  const rb = () => readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');

  it('S1 rbKill 头闸先于 dead 置位（P.cs:71763 门位序:gate → active 写 → 专属爆段）', () => {
    const src = rb();
    const kill = src.slice(src.indexOf('private rbKill('), src.indexOf('private rbKillFamilyFace'));
    const gate = kill.indexOf('if (this.dead) return;');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(kill.indexOf('this.dead = true;'));
  });

  it('S2 boulderTimeLeft 单源：ctor 消费+1021 特支+json 直读（★BJ102：1002 carve-out 行退役,终值归 json 列）', () => {
    const src = rb();
    expect(src).toContain('this.life = boulderTimeLeft(this.projId);');
    const fn = src.slice(src.indexOf('export function boulderTimeLeft'), src.indexOf('/** Utils.Remap 前向档'));
    expect(fn.indexOf('1021')).toBeGreaterThan(-1);
    expect(fn).toContain('10800');
    expect(fn).not.toContain('return 3600;                  // 独不承接');   // carve-out 行不得复辟
    expect(fn).toContain("projectileData(projId)?.timeLeft");
    expect(fn.indexOf('1021')).toBeLessThan(fn.indexOf('projectileData')); // 特支先于 json 直读
  });
});
