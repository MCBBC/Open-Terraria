// ★BJ465（2026-10-03）蜂蜜中跑动出绿叶尘——BJ457 销案翻案重查定谳（用户二次自述:
//   「没有挥动武器,单纯在缓慢液体里跑步就出尘」「干地草地跑动不会触发」）。
//
// ── 定谳：维持 BJ457 销案（本仓移动域同原版零持续粒子）＋探针盲区证实＋物源改判 ──
//
// BJ457 盲区（亲读 scripts/_bj457-honey-grass-dust.mjs）:
//   · 其场1蜂蜜池底=蜂蜜块 225、池内无草丛/植被;其草块+草丛场在干地——用户实况
//     「蜂蜜池+草块底+草丛在场」组合从未被测试。
//   · 其 wrap 只记 vanillaDust.spawn,本仓自定义粒子口 game.spawnParticles 未记录。
// BJ465 补测（scripts/_bj465-*.mjs,5202 私有实例;四探针）:
//   主矩阵 A1 浅蜜+草块+草丛跑动 / A2 深蜜 / D 静止 / B 干地 / W 水 / F 着火 / G 扰动
//   ——vanillaDust+spawnParticles 双口 wrap,场内（实验场 tile 域）草族尘全档=0。
//   mini 坐标直方图:静止 3.5s 场内=0 场外=10;跑动 4s 场内=0 场外=30（背景源）。
//   真蜂巢实况:传送天然蜜池,跑动/静止/着火三档场内草族尘=0（仅固定点 t43 金尘,
//   TintableDustLighted 染铜/金,orchestraFx 编排,非绿非玩家域）。
// 物源改判：世界背景演化域 KillTile 循环——香蒲 519 frameY==0 死亡尘=dust 3 绿叶
//   （原版 MakeTileDust :69082-69107 逐档 1:1:0→3/18→40/36→47/54→125/72→17/90→26;
//   CheckCatTail cs:59231 水列维护+1/4 条件掷+GrowCatTail 1/8 生长=原版自带水边
//   「生长-死亡」循环,原版 KillTile 默认参带尘=原版同款现象）;185 小堆同域。
//   产率实测 6s 8 粒全图散布（水生植物带）。
// 原版移动域基准（本轮亲读复核,行号为准）:
//   · 调用点外层门 Player.cs:20322-20325 `if (HeldItem.type == 4049 && whoAmI ==
//     Main.myPlayer) MowTheLawn();`——仅持割草机;函数内门 :20448-20451
//     miscCounter%2/vY/grappling/itemAnimation<1。本仓调用点 Game.ts:34141-34144
//     `swing.t>0 && vid===4049`+函数内同链（本测试锁）。
//   · WetCollision（Collision.cs:1575-1652）=居中小盒探针（center ± min(10,W)/2 ×
//     H/2,:1592-1597 vector/num/num2）——wet 置位（Player.cs:28060）居中语义:
//     浅蜜涉水（脚沾身干）wet=false→MakeFloorDust 湿门不拦=原版本相（BJ93 判例同源）。
//     本仓 inHoney=居中盒 liquidCollision（Player.ts:4678）+湿门调用位桶位并集
//     （Player.ts:7297）同构。
//   · MakeFloorDust 允许集（:24011-24013）不含草块 2——用户「脚下草块区域」跑动
//     （干/浅/深蜜）行走地板尘零,原版本仓同（BJ457 锚复核成立）。
//   · 着火 OnFire 粒子=渲染层火/自定义编排（本仓 Player.ts:4879 橙黄 #FF9A3C/#FFD24A
//     0.8/tick）,非草族尘;熄火面无绿叶形（原版 DelBuff 静默）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTileDustAmount, makeTileDust, makeTileDustCtx, TILE_DUST_NONE, type DustSpawn } from '../src/world/TileDust';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

const S = (sheet: number): number => {
  const id = TILE_INTERNAL_BY_SHEET.get(sheet);
  if (id === undefined) throw new Error(`TILE_INTERNAL_BY_SHEET 缺 sheet ${sheet}`);
  return id;
};

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

function runDust(st: TileStore, x: number, y: number, n: number, rand: () => number) {
  const { recs, spawn } = mkSpawnRecorder();
  const ctx = makeTileDustCtx(st, { rand, disco: () => [200, 100, 50] });
  let noDust = 0;
  for (let k = 0; k < n; k++) {
    if (makeTileDust(st, x, y, ctx, spawn) === TILE_DUST_NONE) noDust++;
  }
  return { recs, noDust };
}

const gameSrc = readFileSync(fileURLToPath(new URL('../src/core/Game.ts', import.meta.url)), 'utf8');
const playerSrc = readFileSync(fileURLToPath(new URL('../src/entities/Player.ts', import.meta.url)), 'utf8');
const weaponProjSrc = readFileSync(fileURLToPath(new URL('../src/entities/WeaponProj.ts', import.meta.url)), 'utf8');

describe('BJ465 ① 割草链门链完整（调用点外层门+函数内门,用户「干地跑动零尘」自洽）', () => {
  it('调用点双门=swing.t>0（itemAnimation 在途）∧ vid===4049（Player.cs:20322 HeldItem.type==4049 同构）', () => {
    const i = gameSrc.indexOf('if (this.swing.t > 0 && (ITEM_DEFS[this.swing.item]?.vid ?? -1) === 4049)');
    expect(i).toBeGreaterThanOrEqual(0);
    const ctx = gameSrc.slice(i, i + 200);
    expect(ctx).toContain('mowTheLawnTick()');
  });
  it('函数内门链=miscCounter%2/vy/grappling 早退（Player.cs:20448-20451 逐条）', () => {
    const i = gameSrc.indexOf('private mowTheLawnTick(): void');
    expect(i).toBeGreaterThanOrEqual(0);
    const body = gameSrc.slice(i, i + 700);
    expect(body).toContain('p.miscCounter % 2 !== 0');
    expect(body).toContain('p.vy !== 0');
    expect(body).toContain('p.grappling[0]');
  });
  it('updateLawnMowerUse 逐 tick 面=itemAnimation>0（swing 在途）+mouseHeld+射程（:47373-47379）', () => {
    const i = gameSrc.indexOf('private updateLawnMowerUse(');
    expect(i).toBeGreaterThanOrEqual(0);
    const body = gameSrc.slice(i, i + 1400);
    expect(body).toContain('this.swing && this.swing.t > 0');
    expect(body).toContain('inp.mouseHeld');
    expect(body).toContain('this.inTileRange(');
  });
});

describe('BJ465 ② 玩家移动域草族尘零挂接（绿叶尘唯一族源=KillTile 尾/演化域）', () => {
  it('Player.ts 无 hitTilesFx 调用（弹幕域独占:WeaponProj/Game 弹幕消亡面）', () => {
    expect(playerSrc.includes('hitTilesFx')).toBe(false);
    expect(weaponProjSrc.includes('game.hitTilesFx?.(')).toBe(true);
  });
  it('Player.ts 尘面型谱无草族 2/3——makeFloorDust num3 全表清点（SW-FX40 批,:24150 逐值）', () => {
    // num3 显式赋值表=行走/落地地板尘的完整型域（泥土 0=棕,无 2/3 绿叶）
    const num3s = [0, 53, 36, 14, 122, 51, 108, 4, 5, 153, 243, 37, 32, 16, 322, 326, 327, 328, 76];
    for (const v of num3s) expect(playerSrc).toContain(`num3 = ${v};`);
    // 溅花四发射器=水花型域（非草族）;呼吸泡/壁滑=34/31
    expect(playerSrc).toContain('dustWaterFor(waterStyle)');
    expect(playerSrc).toContain(', 308);');
    expect(playerSrc).toContain(', 152);');
    expect(playerSrc).toContain(', 35);');
    expect(playerSrc).toContain('vd.spawn(px, py, 8, 8, 31)');
  });
  it('makeFloorDust 允许集不含草块 2（原版 :24011-24013 复核;含泥土 0=棕尘非绿叶）', () => {
    const i = playerSrc.indexOf('private makeFloorDust(');
    expect(i).toBeGreaterThanOrEqual(0);
    const end = playerSrc.indexOf('spawnWallSlideDust', i);   // 函数尾界（紧邻下一方法）
    expect(end).toBeGreaterThan(i);
    const body = playerSrc.slice(i, end);
    expect(body).toContain('const smalls = [0, 123, 57, 112, 116, 196, 193, 195, 197, 199, 229, 234, 371, 460, 666, 712, 717, 718, 719]');
    expect(body).toContain('const inBig = (type === 147 || type === 25 || type === 53 || type === 189) || flag2');
    expect(body).toContain('if (!inBig && !smalls.includes(type)) return;');
    // 草块 2 全函数无精确分支（词边界——排除 type===25/229/234 子串误中）
    expect(/\btype === 2\)/.test(body)).toBe(false);
    expect(/\btype === 2 \|\|/.test(body)).toBe(false);
  });
  it('湿门=调用位 wetVanillaFx 桶位并集（居中探针语义,原版 WetCollision cs:1592-1597 小盒判定同构）', () => {
    const i = playerSrc.indexOf('const wetVanillaFx = this.inWater || this.inLava || this.inHoney || this.inShimmer;');
    expect(i).toBeGreaterThanOrEqual(0);
    const ctx = playerSrc.slice(i, i + 400);
    expect(ctx).toContain('!wetVanillaFx && !cartFx) this.makeFloorDust');
    // inHoney=居中盒 liquidCollision（Player.cs:27937 WetCollision(position,w,h) 居中探针同构）
    const j = playerSrc.indexOf('this.inHoney = liquidCollision(');
    expect(j).toBeGreaterThanOrEqual(0);
  });
});

describe('BJ465 ③ 物源改判锚——背景绿叶尘=香蒲 519 frameY0 死亡尘（原版同款循环同款尘型）', () => {
  it('519 香蒲破坏档尘表 1:1（MakeTileDust :69082-69107:0→3/18→40/36→47/54→125/72→17/90→26）', () => {
    expect(getTileDustAmount(false, 519, 0)).toBeGreaterThan(0);
    const cases: Array<[number, number]> = [[0, 3], [18, 40], [36, 47], [54, 125], [72, 17], [90, 26]];
    for (const [fy, expectType] of cases) {
      const rand = mkRng(465 + fy);
      const st = mkStore();
      place(st, 10, 10, 519, 0, fy);
      const r = runDust(st, 10, 10, 1, rand);
      expect(r.noDust).toBe(0);
      expect(r.recs.length).toBeGreaterThanOrEqual(1);
      expect(r.recs[0].type).toBe(expectType);
    }
  });
  it('frameY==0 档=dust 3（GrassBlades 绿叶）——水边「绿叶尘」原版同款真身', () => {
    const rand = mkRng(51903);
    const st = mkStore();
    place(st, 10, 10, 519, 0, 0);
    const r = runDust(st, 10, 10, 8, rand);
    for (const d of r.recs) expect(d.type).toBe(3);
  });
  it('演化域 spawnKillDust 宿主=spawnTileDustAt break 档（WorldEvolution.ts BJ444 注）+LiquidSim killTile 注入=breakTile（掉落+帧刷新）——液体冲毁/演化 kill 位次单源,无「跑动专属」面', () => {
    const woeSrc = readFileSync(fileURLToPath(new URL('../src/world/evolution/WorldEvolution.ts', import.meta.url)), 'utf8');
    expect(woeSrc).toContain('spawnKillDust?: (x: number, y: number) => void;');
    const simSrc = readFileSync(fileURLToPath(new URL('../src/world/liquid/LiquidSim.ts', import.meta.url)), 'utf8');
    expect(simSrc).toContain('killTile: ((x: number, y: number) => void) | null = null;');
    // waterDeath 表=原版 Main.cs:8200-8206/8448/9643/9647 逐值（草丛 3/73 不在=淹水不死,同原版）
    expect(simSrc).toContain('export const WATER_DEATH_SHEETS = new Set([215, 4, 51, 697, 93, 98, 552, 405, 646, 372])');
  });
});
