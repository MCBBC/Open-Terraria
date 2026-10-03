// ★BJ457（2026-10-03）液体中跑动碰撞出尘定谳——用户实报「蜂蜜里跑动出绿色叶状尘,
// 截图=角色着火在蜂蜜/木平台处,绿色叶子粒子在脚下草块区域四散」。
//
// ── 定谳：结论 A（原版同相,销案）──
//
// 原版触发面（Terarria1457 亲读锚）:
//   1. Collision.HitTiles（Collision.cs:3076,弹幕撞块 KillTile(fail:true,effectOnly:true)
//      :3116）全仓 grep=仅 Projectile.cs 调用——Player.cs/NPC.cs 【零调用】。
//      原版玩家跑动/落地/游泳蹭墙不触发 tile 碰撞尘。本仓 hitTilesFx 同样只挂弹幕域
//      （Game.ts 弹幕消亡面 + WeaponProj/Dart/Arrow），玩家域零挂接（本测试锁）。
//   2. 原版玩家液体移动粒子=出入液溅花（水 50×dustWater/蜜 20×152/岩浆 20×35,
//      Player.cs:27959-28153 翻转拍一次性）+水中呼吸泡 dust 34（:23469 门
//      lavaWet||honeyWet——蜂蜜里不出泡）。无「液体中持续移动尘」。本仓 1:1。
//   3. 原版行走/落地地面扬尘 Player.MakeFloorDust（FloorVisuals :23899 尾
//      `if (!wet && !mount.Cart)` :23931——【湿态(含蜂蜜)不出尘】）:允许集
//      type∈{0 泥土,147 圣土,25 黑檀石,53 沙,189,雪冰族 123/57/112/116/193/195/
//      196/197/199,229 蜂蜜块,234,371,460,666,712,717,718,719,19 平台 frameY/18==49
//      棕榈}——【草块 2 不在集】（跑过草块零尘）。Falling 20 粒/行走 1 粒×|vx|/3 掷。
//      本仓 makeFloorDust（SW-FX40 批）同表同门。
//   4. 原版「绿叶尘四散」真身=挥武器跑动 MowTheLawn 链（Player.cs:20447,调用点
//      :20324）:门 miscCounter%2/vY==0/grappling/itemAnimation≥1——【无液体门】
//      （蜜里挥武器跑动照发）:①挥动白雾 dust 31;②CutTiles 割草丛→KillTile 破坏
//      →草丛 3/73 每格 10 粒 dust 3(GrassBlades 绿叶);③MowGrassTile(:20503)踩草
//      变泥 2→477/109→492+GetTileDustAmount(fail:true) 3 粒×MakeTileDust
//      （WorldGen.cs:68885 草 Next(2)?2:0——dust 2=Grass 绿叶/dust 0=Dirt 棕 50/50）。
//      CanKillTile（WorldGen.cs:62693-62821）【无液体门】——格被蜜浸不拒杀。
//      本仓 mowTheLawnTick/mowCutTiles/mowGrassTile 同相（Game.ts:22619+）。
// 实机探针（scripts/_bj457-*.mjs,5201 私有实例）三轮:
//   A 蜂蜜池跑动 4s=0 尘 / D 蜜中静止=0 / B 干地草块+草丛跑动=0（残 1 粒传送落地尘）
//   / C-clean 干平台跑动 3s=0（9 粒 dust0 全在传送落定拍=泥土落地 20 连发×⅓ 掷,原版
//   MakeFloorDust Falling 同相）/ E mowCutTiles 割 5 草丛=50 粒全 dust3 / F hitTilesFx
//   打草块=18 粒{0,2} / H mowGrassTile 踩草变泥=3 粒{2:2,0:1} 50/50——与原版逐点同相。
// 用户实报解释:截图绿叶尘=MowTheLawn 链（挥武器/自动挥舞跑动,蜜里照发=原版本相）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTileDustAmount, makeTileDust, makeTileDustCtx, TILE_DUST_NONE, type DustSpawn } from '../src/world/TileDust';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { canKillTileMowingAt, mowedSheetOf } from '../src/core/Game';

const S = (sheet: number): number => {
  const id = TILE_INTERNAL_BY_SHEET.get(sheet);
  if (id === undefined) throw new Error(`TILE_INTERNAL_BY_SHEET 缺 sheet ${sheet}`);
  return id;
};

/** 种子 LCG（[0,1) 流,genRand/Main.rand 骰注入） */
function mkRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mkSpawnRecorder() {
  const recs: Array<{ type: number; x: number; y: number }> = [];
  const spawn: DustSpawn = (x, y, w, h, type, sx, sy, alpha, color, scale) => {
    recs.push({ type, x, y });
    void w; void h; void sx; void sy; void alpha; void color; void scale;
    return { noGravity: false, noLight: false, noLightEmittance: false, fadeIn: 0, scale, vx: sx, vy: sy };
  };
  return { recs, spawn };
}

function mkStore(w = 40, h = 80): TileStore {
  return new TileStore(w, h);
}

function place(st: TileStore, x: number, y: number, sheet: number, frameX = 0, frameY = 0): void {
  st.setTile(x, y, S(sheet), frameX, frameY);
}

/** 跑 makeTileDust n 次返回尘 id 序列 */
function runDust(st: TileStore, x: number, y: number, n: number, rand: () => number) {
  const { recs, spawn } = mkSpawnRecorder();
  const ctx = makeTileDustCtx(st, { rand, disco: () => [200, 100, 50] });
  let noDust = 0;
  for (let k = 0; k < n; k++) {
    if (makeTileDust(st, x, y, ctx, spawn) === TILE_DUST_NONE) noDust++;
  }
  return { recs, noDust };
}

describe('BJ457 ① 尘源判定——绿色叶状尘=草族 KillTile 尘（WorldGen.cs:68885/:69125/:69217）', () => {
  it('草块 2/477 敲击档 3 粒=50/50 掷 dust 2(Grass 绿叶)/dust 0(Dirt 棕)——踩草变泥/碰撞尘形态', () => {
    expect(getTileDustAmount(true, 2, 0)).toBe(3);
    expect(getTileDustAmount(true, 477, 0)).toBe(3);
    const rand = mkRng(20261003);
    const st = mkStore();
    place(st, 10, 10, 2);
    const r = runDust(st, 10, 10, 64, rand);
    expect(r.noDust).toBe(0);
    expect(r.recs.length).toBe(64);
    const ids = new Set(r.recs.map((d) => d.type));
    expect(ids.has(2)).toBe(true);
    expect(ids.has(0)).toBe(true);
    for (const d of r.recs) expect([2, 0]).toContain(d.type);
    const n2 = r.recs.filter((d) => d.type === 2).length;
    expect(n2).toBeGreaterThan(12);
    expect(64 - n2).toBeGreaterThan(12);
  });
  it('草丛 3/73 破坏档 10 粒全 dust 3(GrassBlades 绿叶)——割草四散形态', () => {
    expect(getTileDustAmount(false, 3, 0)).toBe(10);
    for (const sh of [3, 73]) {
      const rand = mkRng(7);
      const st = mkStore();
      place(st, 10, 10, sh);
      const r = runDust(st, 10, 10, 10, rand);
      expect(r.recs.map((d) => d.type)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    }
  });
  it('蜂蜜块 225→dust 147(t_Honey 橙滴);泥土 0→dust 0——非绿叶源排他', () => {
    const rand = mkRng(11);
    const st = mkStore();
    place(st, 10, 10, 225);
    let r = runDust(st, 10, 10, 3, rand);
    expect(r.recs.map((d) => d.type)).toEqual([147, 147, 147]);
    const st2 = mkStore();
    place(st2, 10, 10, 0);
    r = runDust(st2, 10, 10, 3, rand);
    expect(r.recs.map((d) => d.type)).toEqual([0, 0, 0]);
  });
});

describe('BJ457 ② 挥武器跑动 MowTheLawn 链=绿叶尘真身（原版无液体门,蜜里照发）', () => {
  it('CanKillTile(MowingTheGrass) 对草块恒过且【无液体门】(:62693-62706)——蜜浸草块照变泥', () => {
    const st = mkStore();
    place(st, 10, 10, 2);
    expect(canKillTileMowingAt(st, 10, 10)).toBe(true);
    st.setLiquid(10, 10, 255, 3);   // 蜂蜜满浸
    expect(canKillTileMowingAt(st, 10, 10)).toBe(true);
    st.setLiquid(10, 10, 255, 1);   // 水
    expect(canKillTileMowingAt(st, 10, 10)).toBe(true);
    st.setLiquid(10, 10, 255, 2);   // 岩浆
    expect(canKillTileMowingAt(st, 10, 10)).toBe(true);
  });
  it('mowedSheetOf:2→477/109→492/其余 0（Player.cs:20522-20532 switch）', () => {
    expect(mowedSheetOf(2)).toBe(477);
    expect(mowedSheetOf(109)).toBe(492);
    expect(mowedSheetOf(477)).toBe(0);
    expect(mowedSheetOf(0)).toBe(0);
  });
});

describe('BJ457 ③ 挂接面锁——玩家域零 HitTiles 挂接（原版 Player.cs/NPC.cs 零调用同相）', () => {
  const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

  it('Player.ts 不含 hitTilesFx/HitTiles 挂接——跑动/落地/游泳不出 tile 碰撞尘', () => {
    const playerSrc = SRC('../src/entities/Player.ts');
    expect(playerSrc.includes('hitTilesFx')).toBe(false);
    expect(playerSrc.includes('Collision.HitTiles')).toBe(false);
  });
  it('hitTilesFx 挂接只存在于弹幕域文件（Game 弹幕消亡面/WeaponProj/Dart/Arrow）', () => {
    expect(SRC('../src/entities/WeaponProj.ts').includes('hitTilesFx')).toBe(true);
    expect(SRC('../src/entities/Dart.ts').includes('hitTilesFx')).toBe(true);
    expect(SRC('../src/entities/Arrow.ts').includes('hitTilesFx')).toBe(true);
    const gameSrc = SRC('../src/core/Game.ts');
    expect(gameSrc.includes('hitTilesFx(')).toBe(true);
  });
});

describe('BJ457 ④ 行走/落地扬尘 MakeFloorDust 1:1 锚（原版 FloorVisuals :23899）', () => {
  const playerSrc = readFileSync(fileURLToPath(new URL('../src/entities/Player.ts', import.meta.url)), 'utf8');

  it('湿门在位:MakeFloorDust 调用位 !wetVanillaFx（原版 :23931 `!wet && !mount.Cart`,蜜中不出）', () => {
    expect(playerSrc.includes('!wetVanillaFx && !cartFx) this.makeFloorDust')).toBe(true);
    expect(playerSrc.includes('inWater || this.inLava || this.inHoney || this.inShimmer')).toBe(true);
  });
  it('允许集同原版(:24011-24013):草块 2 不在集（跑过草块零尘）/蜜块 229 在集', () => {
    const inBig = '(type === 147 || type === 25 || type === 53 || type === 189) || flag2';
    expect(playerSrc.includes(inBig)).toBe(true);
    const m = playerSrc.match(/const smalls = \[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const smalls = (m![1] || '').split(',').map((s) => parseInt(s.trim(), 10));
    expect(smalls).toContain(0);
    expect(smalls).toContain(229);
    expect(smalls).not.toContain(2);
  });
});

describe('BJ457 ⑤ mowTheLawnTick 门面=原版 MowTheLawn(:20447)逐条同相——无液体门', () => {
  const gameSrc = readFileSync(fileURLToPath(new URL('../src/core/Game.ts', import.meta.url)), 'utf8');

  it('门=miscCounter%2/vy/grappling/mount,无 wet/inHoney 门（蜜里挥武器跑动照发=原版本相）', () => {
    const i = gameSrc.indexOf('private mowTheLawnTick(): void');
    expect(i).toBeGreaterThan(0);
    const body = gameSrc.slice(i, i + 1400);
    expect(body.includes('p.miscCounter % 2 !== 0')).toBe(true);
    expect(body.includes('p.vy !== 0')).toBe(true);
    expect(body.includes('p.grappling[0])')).toBe(true);
    expect(body.includes('wet')).toBe(false);
    expect(body.includes('inHoney')).toBe(false);
    expect(body.includes('this.mowCutTiles(')).toBe(true);
    expect(body.includes('this.mowGrassTile(')).toBe(true);
    expect(body.includes('0, 0, 31,')).toBe(true);
  });
});
