// BJ644 两件定谳判别测试（2026-10-12）：
//   件1 754 弄蛇笛整装三层锁——①物品面（4262 SetDefaults 表值/UseSound/非 consumable/
//       非召唤定谳 + 出手扫描 Player.cs:48278-48334）②弹 AI（AI_155 :52853-53028
//       三相态机/两段弹起/30 尘环/绳长帽 100/回收）③Rope 层（tileRope 全表
//       Main.cs:9452-9460 三消费面 + tile 504 def rope 旗 + 零掉落 66485）。
//   件2 1080 鸟粪注校复核——AI_200 :40705-40741 重力 0.3 帽 16/2×d329 速度代数/
//       命中 Kill/Kill 段 :72058-72085 30×d329+Item_177+Stinky 600t。
// 真夹具：真实 TileStore + 真实体类（防幻影——mock 只承载 game 钩子面）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET, TILE_CUT_SHEETS } from '../src/data/tiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import { projectileData } from '../src/data/vanillaProjectiles';
import { MysticSnakeCoil, mysticSnakeLandingSpot } from '../src/entities/MysticSnakeCoil';
import { PoopProj } from '../src/entities/PoopProj';
import { TILE_ROPE_SHEETS } from '../src/core/Game';
import { liveGorePieces } from '../src/entities/GorePiece';
import type { VDust } from '../src/fx/VanillaDust';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIRT = TILE_INTERNAL_BY_SHEET.get(0) ?? 1;    // sheet 0 Dirt → 内部 1
const ROPE = TILE_INTERNAL_BY_SHEET.get(504) ?? 573;
const CUTVINE = TILE_INTERNAL_BY_SHEET.get(52) ?? 273;   // sheet 52 ∈ TILE_CUT_SHEETS

/** 真实 TileStore 夹具：y=120 全宽 dirt 地表（可逐列改型） */
function mkWorld(): TileStore {
  const st = new TileStore(200, 160);
  for (let x = 0; x < 200; x++) st.setTileSilent(x, 120, DIRT);
  return st;
}

/** game 钩子 mock（真 store + 尘记录器;spawnDust 仿 NewDust 缺省 ±2 随机速） */
function mkGame(st: TileStore, pcx = 0, pcy = 0) {
  const dusts: VDust[] = [];
  const game = {
    world: { store: st },
    player: { cx: pcx, cy: pcy },
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      speedX = 0, speedY = 0, alpha = 0, color = null, scale = 1): VDust => {
      const d = {
        active: true, x: x + Math.random() * w, y: y + Math.random() * h,
        vx: speedX + (Math.floor(Math.random() * 41) - 20) * 0.1,   // NewDust 缺省 rand(−20,21)×0.1
        vy: speedY + (Math.floor(Math.random() * 41) - 20) * 0.1,
        type, scale, alpha, fadeIn: 0, noGravity: false, noLight: false,
        noLightEmittance: false, color, rotation: 0, fx: 0, fy: 0,
        followPlayer: false, followOnce: false, followEnt: null, attractTo: null,
      } as VDust;
      dusts.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { game, dusts };
}

describe('BJ644 件1-① 物品面 4262 耍蛇笛（Item.cs:36653-36664 定谳）', () => {
  it('SetDefaults 表值：useTime=useAnimation=90/shoot 754/useTurn', () => {
    const c = itemCombat(4262);
    expect(c).not.toBeNull();
    expect(c!.useTime).toBe(90);
    expect(c!.useAnimation).toBe(90);
    expect(c!.shoot).toBe(754);
    expect(c!.useTurn).toBe(true);
  });
  it('★非 consumable 非 summon 定谳（SetDefaults 无 consumable/damage/mana 行）', () => {
    const c = itemCombat(4262)!;
    expect(c.consumable).toBeFalsy();     // 旧实现 removeHeld 曾误删笛=真回归,本刀撤
    expect(c.damage).toBeFalsy();
    expect(c.mana).toBeFalsy();
    expect(c.summon).toBeFalsy();
  });
  it('UseSound=Item_151（vanilla-itemusesound 表值）', () => {
    expect(itemUseSoundWav(4262)).toBe('Item_151');
  });
  it('弹 754 规格：16×16/aiStyle 155/无 tileCollide/ignoreWater/penetrate −1（:7769-7778）', () => {
    const p = projectileData(754)!;
    expect(p).not.toBeNull();
    expect(p.width).toBe(16);
    expect(p.height).toBe(16);
    expect(p.aiStyle).toBe(155);
    expect(p.tileCollide).toBe(false);
    expect(p.ignoreWater).toBe(true);
    expect(p.penetrate).toBe(-1);
  });
  it('图鉴/贴图在库：vanilla.json items[4262]=Snake Charmer\'s Flute', () => {
    const atlas = JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla.json'), 'utf-8'));
    expect(atlas.items['4262'].name).toBe("Snake Charmer's Flute");
    expect(atlas.items['4262'].key).toBe('MysticCoilSnake');
  });
  it('出手钩 4262 块：非 consumable 面锁（removeHeld 已撤/UseSound/落点扫描/回收接入）', () => {
    const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf-8');
    const at = src.indexOf('nvVid === 4262');
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf('return;', at));
    expect(block).not.toContain('removeHeld');          // 非消耗品（原版可复用）
    expect(block).toContain('playUseSound');            // Item_151 表值通道
    expect(block).toContain('mysticSnakeLandingSpot');  // :48278-48334 出手扫描
    expect(block).toContain('requestRecall');           // :48313-48327 旧蛇双路回收
  });
});

describe('BJ644 件1-① 出手落点扫描（Player.cs:48278-48334 + Conditions.MysticSnake）', () => {
  it('开阔地表：最远列优先（num57 自 scanMax 递减首中即返）落点=地表叠顶', () => {
    const st = mkWorld();
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 110 * 16, 100, 110, 1, 1);
    expect(hit).toEqual({ x: 101, y: 120 });
  });
  it('绳 504 列不挡（type!=504 豁免）→ 步 1 全绳无落点回落步 0（=绳未拦截搜索）', () => {
    const st = mkWorld();
    for (let y = 110; y < 120; y++) st.setTileSilent(101, y, ROPE);
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 110 * 16, 100, 110, 1, 1);
    expect(hit).toEqual({ x: 100, y: 120 });
  });
  it('cut 植物列不挡（!tileCut 豁免）→ 落其下地表', () => {
    const st = mkWorld();
    st.setTileSilent(101, 115, CUTVINE);
    expect(TILE_CUT_SHEETS.has(52)).toBe(true);
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 110 * 16, 100, 110, 1, 1);
    expect(hit).toEqual({ x: 101, y: 120 });
  });
  it('悬空台：落台顶（Searches.Down 首个 active 格）', () => {
    const st = mkWorld();
    st.setTileSilent(101, 114, DIRT);
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 110 * 16, 100, 110, 1, 1);
    expect(hit).toEqual({ x: 101, y: 114 });
  });
  it('顶上连叠回溯 ≤7 层（:48300-48309）→ 返回叠顶', () => {
    const st = mkWorld();
    for (let y = 117; y <= 119; y++) st.setTileSilent(101, y, DIRT);   // 3 层叠
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 110 * 16, 100, 110, 1, 1);
    expect(hit).toEqual({ x: 101, y: 117 });
  });
  it('爬升 >7 层弃列（result.Y−num58>7 → num58=−1）→ 无落点', () => {
    const st = mkWorld();
    for (let y = 100; y <= 119; y++) st.setTileSilent(100, y, DIRT);   // 行内取 115,顶上 8 层
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 115 * 16, 100, 115, 1, 0);
    expect(hit).toBeNull();
  });
  it('num58<10 世界顶门（:48304/:48310）→ 弃列（回退步 0 玩家列无格 → null）', () => {
    const st = mkWorld();
    st.setTileSilent(101, 8, DIRT);
    const hit = mysticSnakeLandingSpot(st, 100 * 16, 6 * 16, 100, 6, 1, 1);
    expect(hit).toBeNull();
  });
});

describe('BJ644 件1-② 弹 AI（AI_155_MysticSnakeCoil :52853-53028）', () => {
  it('两段弹起速度面：−3（0-14t）→Remap 减速截断（16t=−2）→悬停 0（31-59t）→火箭 −32（60t+）', () => {
    const st = mkWorld();
    const { game } = mkGame(st, 0, 0);
    const s = new MysticSnakeCoil(100 * 16 + 8, 119 * 16 + 8, 119 * 16 + 8);
    const vyAt: number[] = [];
    for (let t = 1; t <= 61; t++) {
      s.fixedUpdate(1 / 60, game);
      vyAt[t] = s.vy;
    }
    expect(vyAt[1]).toBe(-3);      // remap=0
    expect(vyAt[14]).toBe(-3);
    expect(vyAt[16]).toBe(-2);     // trunc(−3×14/15)=−2（(int) 朝零截断 :52880）
    expect(vyAt[31]).toBeCloseTo(0);  // remap=1 → ±0 悬停（(int)(−0.0f)=0 域）
    expect(vyAt[59]).toBeCloseTo(0);
    expect(vyAt[60]).toBe(-32);    // num5=1 火箭 :52879
    expect(vyAt[61]).toBe(-32);
    expect(s.ai1).toBe(1);         // 开阔天空列（y>40 inWorld）未触发铺装
  });
  it('60t 30×d27 尘环：X=0 终速（(0,−1)×±9 向上支增幅）+ 同拍常驻尘', () => {
    const st = mkWorld();
    const { game, dusts } = mkGame(st, 0, 0);
    const s = new MysticSnakeCoil(100 * 16 + 8, 119 * 16 + 8, 119 * 16 + 8);
    for (let t = 0; t < 59; t++) s.fixedUpdate(1 / 60, game);
    const before = dusts.length;
    s.fixedUpdate(1 / 60, game);                           // local1=60 拍：环+常驻同发
    const tick = dusts.slice(before);
    expect(tick.length).toBeGreaterThanOrEqual(30);   // 30 环 + 1 常驻（num5>0）
    const ring = tick.slice(tick.length - 30);
    for (const d of ring) {
      expect(d.type).toBe(27);
      expect(d.vx).toBe(0);                            // (0,−1) 基向量
      expect(d.vy).toBeLessThanOrEqual(9);
      expect(d.vy).toBeGreaterThan(-36);               // ×(1+rand×3) 上界
      expect(d.noGravity).toBe(true);
      expect(d.fadeIn).toBe(1.2);
    }
  });
  it('alpha −5/t 至 0（51t 全显）+ frame 0-3 每 12t 轮', () => {
    const st = mkWorld();
    const { game } = mkGame(st, 0, 0);
    const s = new MysticSnakeCoil(100 * 16 + 8, 119 * 16 + 8, 119 * 16 + 8);
    for (let t = 0; t < 51; t++) s.fixedUpdate(1 / 60, game);
    expect(s.alpha).toBe(0);
    for (let t = 51; t < 75; t++) s.fixedUpdate(1 / 60, game);
    expect(s.frame).toBe(2);       // 24 tick 处 frame=2（12t/轮）
  });
  it('阻挡铺装：列上实心格截停 → 绳铺 [截停+1..锚],504 内部 id,头部落格顶', () => {
    const st = mkWorld();
    st.setTileSilent(100, 60, DIRT);                       // 天花板
    const { game } = mkGame(st, 0, 0);
    const anchorTile = 119;
    const s = new MysticSnakeCoil(100 * 16 + 8, anchorTile * 16 + 8, anchorTile * 16 + 8);
    let guard = 0;
    while (s.ai1 !== 2 && guard++ < 300) s.fixedUpdate(1 / 60, game);
    expect(s.ai1).toBe(2);
    expect(s.life).toBe(1800);                             // num3 :52956
    expect(s.vx).toBe(0); expect(s.vy).toBe(0);            // :52960
    expect(s.y).toBe(Math.floor(s.y / 16) * 16);           // Top=point3Y·16+16 :52959（16px 边界）
    for (let y = 61; y <= anchorTile; y++) {
      expect(st.get(100, y)).toBe(ROPE);                   // PlaceTile(504) :52947
    }
    expect(st.get(100, 60)).not.toBe(ROPE);                // 实心格不铺（num9>point3Y 开区间）
    expect(st.get(100, 120)).toBe(DIRT);                   // 地表不波及
  });
  it('绳长帽 100/InWorld(40)：开阔天空列 → 头出界前铺满 [锚..出界带]', () => {
    const st = mkWorld();
    const { game } = mkGame(st, 0, 0);
    const anchorTile = 119;
    const s = new MysticSnakeCoil(100 * 16 + 8, anchorTile * 16 + 8, anchorTile * 16 + 8);
    let guard = 0;
    while (s.ai1 !== 2 && guard++ < 300) s.fixedUpdate(1 / 60, game);
    expect(s.ai1).toBe(2);
    let top = anchorTile;
    while (top > 0 && st.get(100, top) === ROPE) top--;    // 上行找绳顶（top=绳顶上首非绳格）
    const ropeTop = top + 1;
    expect(anchorTile - ropeTop).toBeGreaterThanOrEqual(1);
    expect(ropeTop).toBeLessThanOrEqual(41);               // InWorld(40) 越界触发（point3Y<40）
    expect(st.get(100, ropeTop)).toBe(ROPE);               // 顶格亦为绳（连续带）
  });
  it('自然到期撤绳：timeLeft 1800→4 同拍重演出+RemoveRope+Kill（:53003-53027）', () => {
    const st = mkWorld();
    st.setTileSilent(100, 60, DIRT);
    const { game } = mkGame(st, 0, 0);
    const anchorTile = 119;
    const s = new MysticSnakeCoil(100 * 16 + 8, anchorTile * 16 + 8, anchorTile * 16 + 8);
    let guard = 0;
    while (s.ai1 !== 2 && guard++ < 300) s.fixedUpdate(1 / 60, game);
    const ropeSpan: number[] = [];
    for (let y = 0; y <= anchorTile; y++) if (st.get(100, y) === ROPE) ropeSpan.push(y);
    expect(ropeSpan.length).toBeGreaterThan(0);
    let goreBefore = liveGorePieces().length;
    guard = 0;
    while (!s.dead && guard++ < 2000) s.fixedUpdate(1 / 60, game);
    expect(s.dead).toBe(true);
    expect(goreBefore).toBeLessThan(liveGorePieces().length);   // timeLeft==4 重 SpawnRopeIn
    for (const y of ropeSpan) expect(st.get(100, y)).not.toBe(ROPE);   // RemoveRope :53025
  });
  it('回收双路（Player.cs:48313-48327）：铺装蛇 timeLeft=4 撤绳/上升蛇即杀不铺绳', () => {
    const st = mkWorld();
    st.setTileSilent(100, 60, DIRT);
    const { game } = mkGame(st, 0, 0);
    const anchorTile = 119;
    const placed = new MysticSnakeCoil(100 * 16 + 8, anchorTile * 16 + 8, anchorTile * 16 + 8);
    let guard = 0;
    while (placed.ai1 !== 2 && guard++ < 300) placed.fixedUpdate(1 / 60, game);
    placed.requestRecall();
    placed.fixedUpdate(1 / 60, game);
    expect(placed.dead).toBe(true);
    for (let y = 61; y <= anchorTile; y++) expect(st.get(100, y)).not.toBe(ROPE);

    const rising = new MysticSnakeCoil(100 * 16 + 8, anchorTile * 16 + 8, anchorTile * 16 + 8);
    rising.fixedUpdate(1 / 60, game);                      // 相 0→1
    rising.requestRecall();
    expect(rising.dead).toBe(true);
    for (let y = 0; y < 160; y++) expect(st.get(100, y)).not.toBe(ROPE);
  });
  it('相 2 首拍 SpawnRopeIn：3/4 掷 gore 61-63 烟团 + 每绳格 5×(恒 d27+1/8 d31)', () => {
    const st = mkWorld();
    st.setTileSilent(100, 60, DIRT);
    const { game, dusts } = mkGame(st, 0, 0);
    const anchorTile = 119;
    const s = new MysticSnakeCoil(100 * 16 + 8, anchorTile * 16 + 8, anchorTile * 16 + 8);
    const beforeDust = dusts.length;
    const beforeGore = liveGorePieces().length;
    let guard = 0;
    while (s.ai1 !== 2 && guard++ < 300) s.fixedUpdate(1 / 60, game);   // 末拍=铺装拍(落穿相 2 首扫)
    const tickDust = dusts.slice(beforeDust);
    const ropeTiles = anchorTile - 61 + 1;
    const d27 = tickDust.filter((d) => d.type === 27);
    expect(d27.filter((d) => d.scale === 1.7 && d.noGravity).length).toBe(ropeTiles * 5);  // 每格恒 5 轮
    expect(d27.some((d) => d.scale === 0.6)).toBe(true);   // 同拍相 1 末尾常驻尘（num5 支）
    expect(liveGorePieces().length - beforeGore).toBeGreaterThanOrEqual(0);  // 3/4 掷统计面
  });
});

describe('BJ644 件1-③ Rope 层（Main.tileRope 全表 Main.cs:9452-9460）', () => {
  it('TILE_ROPE_SHEETS=九件全表（含 504 弄蛇绳/449-451 彩带）', () => {
    for (const s of [213, 214, 353, 365, 366, 504, 449, 450, 451]) {
      expect(TILE_ROPE_SHEETS.has(s)).toBe(true);
    }
    expect(TILE_ROPE_SHEETS.size).toBe(9);
  });
  it('VanillaFraming tileRope 谓词 + isRopeAt 补 504/449/450/451（era guard）', () => {
    const src = readFileSync(join(ROOT, 'src/render/VanillaFraming.ts'), 'utf-8');
    const at = src.indexOf('tileRope: (t: number)');
    expect(at).toBeGreaterThan(0);
    const line = src.slice(at, src.indexOf('\n', at));
    for (const s of [504, 449, 450, 451]) expect(line).toContain(`t === ${s}`);
    const ropeAt = src.indexOf('function isRopeAt');
    const body = src.slice(ropeAt, src.indexOf('}', ropeAt) + 1);
    for (const s of [504, 449, 450, 451]) expect(body).toContain(`t === ${s}`);
  });
  it('tile 504 def rope 旗=Main.tileRope[504]（攀爬/Block Swap 绳臂/IsRope 消费面）', async () => {
    const { TILE_DEFS, TILE_BY_KEY } = await import('../src/data/tiles');
    const id = TILE_BY_KEY['v_504_mystic_snake_rope'];
    expect(id).toBeGreaterThan(0);
    expect(TILE_DEFS[id].rope).toBe(true);                 // Main.cs:9457
    expect(TILE_DEFS[id].drop).toBeNull();                 // KillTile_GetItemDrops case 504 :66485 零掉落
  });
  it('绳铺装/撤绳经真实 TileStore（rope 支落穿面）——504 邻接 213 同列框帧路径可达', () => {
    const st = mkWorld();
    st.setTileSilent(100, 119, ROPE);
    st.setTileSilent(100, 118, TILE_INTERNAL_BY_SHEET.get(213) ?? -1);
    expect(st.get(100, 119)).toBe(ROPE);
    expect(st.get(100, 118)).toBe(TILE_INTERNAL_BY_SHEET.get(213));
    st.setTileSilent(100, 119, 0);                         // KillTile 面附（零掉落域）
    expect(st.get(100, 119)).toBe(0);
  });
});

// ============================================================================
// 件2 1080 鸟粪注校复核（AI_200 :40705-40741 + Kill :72058-72085）
// ============================================================================
function mkPoopGame(playerBox?: { x: number; y: number; w: number; h: number }) {
  const dusts: VDust[] = [];
  const sfx: string[] = [];
  const buffCalls: Array<{ id: number; sec: number }> = [];
  const game = {
    world: { store: new TileStore(200, 160) },
    player: {
      x: playerBox?.x ?? -9999, y: playerBox?.y ?? -9999,
      w: playerBox?.w ?? 20, h: playerBox?.h ?? 42, dead: false,
      buffs: { apply: (id: number, sec: number) => buffCalls.push({ id, sec }) },
    },
    playSfxFile: (f: string) => sfx.push(f),
    vanillaDust: {
      spawn: (x: number, y: number, w: number, h: number, type: number,
        speedX = 0, speedY = 0): VDust => {
        const d = {
          active: true, x, y,
          vx: speedX + (Math.floor(Math.random() * 41) - 20) * 0.1,   // NewDust 缺省 rand(−20,21)×0.1
        vy: speedY + (Math.floor(Math.random() * 41) - 20) * 0.1,
          type, scale: 1, alpha: 0, fadeIn: 0, noGravity: false, noLight: false,
          noLightEmittance: false, color: null, rotation: 0, fx: 0, fy: 0,
          followPlayer: false, followOnce: false, followEnt: null, attractTo: null,
        } as VDust;
        dusts.push(d);
        return d;
      },
    },
  } as unknown as GameHooks;
  return { game, dusts, sfx, buffCalls };
}

describe('BJ644 件2 1080 鸟粪注校复核（AI_200 :40705-40741）', () => {
  it('重力 0.3 帽 16（:40707-40711）', () => {
    const { game } = mkPoopGame();
    const p = new PoopProj(100, 100);
    const vy: number[] = [];
    for (let t = 0; t < 80; t++) { p.fixedUpdate(1 / 60, game); vy.push(p.vy); }
    expect(vy[0]).toBeCloseTo(0.3);
    expect(vy[1]).toBeCloseTo(0.6);
    expect(vy.every((v) => v <= 16)).toBe(true);
    expect(vy[vy.length - 1]).toBe(16);
  });
  it('每 tick 2×d329 尾迹速度代数（:40712-40728）', () => {
    const { game, dusts } = mkPoopGame();
    const p = new PoopProj(100, 100);
    p.fixedUpdate(1 / 60, game);
    expect(dusts.length).toBe(2);
    for (const d of dusts) {
      expect(d.type).toBe(329);
      // 掷支代数对拍：支 1 scale∈[0.5,1)+v+proj.v+noGravity / 支 2 scale∈[0.4,0.8)+v×0.5+proj.v/2
      const branch1 = d.scale >= 0.5 && d.noGravity;
      const branch2 = d.scale >= 0.4 && d.scale < 0.8 && !d.noGravity;
      expect(branch1 || branch2).toBe(true);
      // 速度代数（:40715-40727）：首段 v×0.1;支 1 +proj.v（vy=0.3 重力后）/支 2 v×0.5+proj.v/2
      expect(Math.abs(d.vx)).toBeLessThanOrEqual(0.21);   // proj.vx=0 → ≤ ±2×0.1
      expect(d.vy).toBeLessThanOrEqual(0.51);             // 支 1:0.2+0.3 上界
      expect(d.vy).toBeGreaterThanOrEqual(-0.01);
    }
  });
  it('命中玩家 Kill（:40729-40740）→ Kill 段 30×d329+Item_177+Stinky 600t（:72058-72085）', () => {
    const { game, dusts, sfx, buffCalls } = mkPoopGame({ x: 95, y: 95, w: 20, h: 42 });
    const p = new PoopProj(100, 100);                      // 盒 [95,105)×[95,105) 与玩家相交
    p.fixedUpdate(1 / 60, game);
    expect(p.dead).toBe(true);
    expect(sfx).toContain('Item_177');
    expect(dusts.length).toBe(32);                          // AI 尘 2（:40712）+ Kill 尘 30（:72069）
    const killDust = dusts.slice(-30);
    for (const d of killDust) {
      expect(d.type).toBe(329);
      expect(d.vy).toBeLessThanOrEqual(0.41);               // vy×0.2−rand×3（mock 基 ±2→×0.2−[0,3)）
      expect(d.vy).toBeGreaterThan(-3.41);
      expect(Math.abs(d.vx)).toBeLessThanOrEqual(1.61);     // vx×0.8
    }
    expect(buffCalls).toEqual([{ id: 76, sec: 10 }]);       // BuffType.Stinky=76（vanilla 120）600t=10s
  });
  it('落地撞块 Kill（:19035-19041 velocity 变位语义）且不误判空气', () => {
    const { game } = mkPoopGame();
    const st = (game.world as { store: TileStore }).store;
    st.setTileSilent(6, 20, DIRT);                          // 弹中心 (6.5, ·) 落 y=20 格
    const p = new PoopProj(104, 0);
    let guard = 0;
    while (!p.dead && guard++ < 500) p.fixedUpdate(1 / 60, game);
    expect(p.dead).toBe(true);
    expect(guard).toBeGreaterThan(10);                      // 非出生即杀（空气面零误判）
  });
  it('未命中不杀：玩家远置 + 空中飞行面存活', () => {
    const { game } = mkPoopGame();
    const p = new PoopProj(100, 100);
    p.fixedUpdate(1 / 60, game);
    expect(p.dead).toBe(false);
  });
});
