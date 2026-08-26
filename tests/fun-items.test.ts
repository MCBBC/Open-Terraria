// §4 乐器 + §5 趣味道具测试（2026-08-13 实装缺口清单 §4/§5）：
//   ① 纯函数层 src/items/FunItems.ts（竖琴音高 / 鼓槌 10 档 / 泡泡棒 gore 掷骰）
//   ② GorePiece 气泡族 411-430（NewGore 尾段族扩散 + Update 上浮/爆裂 AI）
//   ③ 数据锚（useStyle/useTime/createTile/consumable——Item.cs SetDefaults 终态）
//   ④ 注册完备（FUN_USE_VIDS 四件 + 5464 放置链 tile 回填）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  MUSIC_NOTES, instrumentNotePitch, instrumentUseSound, drumSoundFile, bubbleWandGoreRoll,
  guitarChordFile, guitarBadLuckDetune,
} from '../src/items/FunItems';
import {
  GorePiece, resetGorePool, liveGorePieces,
} from '../src/entities/GorePiece';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemCombat } from '../src/data/vanillaItemCombat';

/** 确定性 LCG（种子化随机源——掷骰分布断言用） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// ① 纯函数层
// ---------------------------------------------------------------------------
describe('① 竖琴音符音高（Player.cs:45908-45928）', () => {
  it('零距离 = 最低音 -1（num6=0 → ×2−1 = −1，量化 Round(−6)/6）', () => {
    expect(instrumentNotePitch(0, 800)).toBe(-1);
  });
  it('满半屏 = 最高音 +1（钳上界后 ×2−1 = +1）', () => {
    expect(instrumentNotePitch(400, 800)).toBe(1);
    expect(instrumentNotePitch(9999, 800)).toBe(1);   // :45914-45916 上界钳
  });
  it('中点 = 0（半屏距离的一半 → num6=0.5 → ×2−1 = 0）', () => {
    expect(instrumentNotePitch(200, 800)).toBe(0);
  });
  it('量化步进 1/6（Player.musicNotes=6，Player.cs:3044）', () => {
    const seen = new Set<number>();
    for (let d = 0; d <= 400; d += 4) seen.add(instrumentNotePitch(d, 800));
    for (const v of seen) expect(Math.abs(v * MUSIC_NOTES % 1)).toBe(0);
    expect(seen.size).toBe(MUSIC_NOTES * 2 + 1);   // −1..1 共 13 档
  });
  it('UseSound：508 竖琴 Item26 / 507 铃 Item35（:45929-45933）', () => {
    expect(instrumentUseSound(508)).toBe('Item_26');
    expect(instrumentUseSound(507)).toBe('Item_35');
  });
});

describe('① 鼓槌音色档（Player.PlayDrums :47108-47157 + LegacySoundPlayer.cs:1238-1239 映射）', () => {
  it('10 档 1/10 步进阈值递减、兜底 Item146（档序按原版音型 59/58/53/57/62/61/54/56/55/60 → +86）', () => {
    expect(drumSoundFile(0)).toBe('Item_146');       // :47148-47150 else 兜底 = 音型 60
    expect(drumSoundFile(0.05)).toBe('Item_146');
    expect(drumSoundFile(0.15)).toBe('Item_141');    // 音型 55 → 139+55-53
    expect(drumSoundFile(0.25)).toBe('Item_142');    // 音型 56
    expect(drumSoundFile(0.35)).toBe('Item_140');    // 音型 54
    expect(drumSoundFile(0.45)).toBe('Item_147');    // 音型 61
    expect(drumSoundFile(0.55)).toBe('Item_148');    // 音型 62
    expect(drumSoundFile(0.65)).toBe('Item_143');    // 音型 57
    expect(drumSoundFile(0.75)).toBe('Item_139');    // 音型 53
    expect(drumSoundFile(0.85)).toBe('Item_144');    // 音型 58
    expect(drumSoundFile(0.95)).toBe('Item_145');    // 音型 59，> 9×0.1 最高档
    expect(drumSoundFile(1)).toBe('Item_145');
  });
});

describe('① 吉他六档和弦（Player.PlayGuitarChord :47073-47106 + LSP.cs:1215-1220 映射）', () => {
  it('6 档 1/6 步进阈值递减、兜底 Item136（档序非单调：49/48/47/51/52/50 → 133+type-47）', () => {
    // >5/6→49(Item_135) >4/6→48(Item_134) >3/6→47(Item_133)
    // >2/6→51(Item_137) >1/6→52(Item_138) else→50(Item_136)——照抄原版非单调序
    expect(guitarChordFile(0)).toBe('Item_136');     // :47101-47103 else 兜底 = 音型 50
    expect(guitarChordFile(0.1)).toBe('Item_136');   // ≤1/6 不过首档 → 兜底
    expect(guitarChordFile(0.2)).toBe('Item_138');   // >2/6 不成立、>1/6 成立 = 音型 52
    expect(guitarChordFile(0.34)).toBe('Item_137');  // >2/6 ≈0.333 = 音型 51
    expect(guitarChordFile(0.5)).toBe('Item_137');   // =3/6 边界取等不算 → 落 >2/6 档（非单调序）
    expect(guitarChordFile(0.6)).toBe('Item_133');   // ∈(3/6,4/6] = 音型 47
    expect(guitarChordFile(0.67)).toBe('Item_134');  // >4/6 ≈0.667 = 音型 48
    expect(guitarChordFile(0.84)).toBe('Item_135');  // >5/6 ≈0.833 = 音型 49
    expect(guitarChordFile(1)).toBe('Item_135');     // 钳上界后最高档
  });
  it('坏运跑调（:47077-47080 RollOnlyBadLuckExtreme）：luck≥0 恒 0；luck<0 触发 ∈ [-0.5,0.5]', () => {
    expect(guitarBadLuckDetune(0, lcg(3))).toBe(0);
    expect(guitarBadLuckDetune(0.4, lcg(3))).toBe(0);      // 正运不触发（Luck.cs:53-58）
    const alwaysZero = () => 0;                             // NextFloat()=0 < −luck 必过门
    expect(guitarBadLuckDetune(-0.5, alwaysZero)).toBe(-0.5);   // Next(101)=0 → -50×0.01
    const one = () => 1;                                    // NextFloat()=1 ≥ −luck 不过门
    expect(guitarBadLuckDetune(-0.9, one)).toBe(0);
    const lucky = lcg(99);                                  // 种子化分布：触发值域钳 ±0.5
    for (let i = 0; i < 200; i++) {
      const d = guitarBadLuckDetune(-0.9, lucky);
      expect(d).toBeGreaterThanOrEqual(-0.5);
      expect(d).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('① 泡泡棒 gore 档位掷骰（Player.cs:44437-44456）', () => {
  it('scale ∈ [0.51, 1.00]（Next(51,101)×0.01）', () => {
    const rnd = lcg(7);
    for (let i = 0; i < 400; i++) {
      const r = bubbleWandGoreRoll(rnd);
      if (r) expect(r.scale).toBeGreaterThanOrEqual(0.51), expect(r.scale).toBeLessThanOrEqual(1.0);
    }
  });
  it('档位链只产出 411-415 五档', () => {
    const rnd = lcg(99);
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const r = bubbleWandGoreRoll(rnd);
      if (r) seen.add(r.goreType);
    }
    for (const t of seen) expect(t).toBeGreaterThanOrEqual(411), expect(t).toBeLessThanOrEqual(415);
    // 大档（1/500、1/250、1/80）在 4000 次内应当至少出现——链首中即取
    expect(seen.size).toBe(5);
  });
  it('五档全落空返回 null（≈43.6%——外层 1/3 门之外的第二重掷骰）', () => {
    const rnd = lcg(1234);
    let nulls = 0;
    for (let i = 0; i < 5000; i++) if (bubbleWandGoreRoll(rnd) === null) nulls++;
    expect(nulls).toBeGreaterThan(1500);
    expect(nulls).toBeLessThan(3000);
  });
});

// ---------------------------------------------------------------------------
// ② GorePiece 气泡族 411-430
// ---------------------------------------------------------------------------
const W = 40, H = 40, FLOOR = 21;
function makeWorld(): World {
  const w = new World(W, H, 7, 'bubble-test');
  for (let x = 0; x < W; x++) w.store.setTile(x, FLOOR, 1);
  return w;
}
/** 高世界（上浮行程测试专用——初速瞬态 −2..−6 会烧掉百余 px，小世界顶部越界误杀） */
function makeTallWorld(): World {
  const w = new World(W, 200, 7, 'bubble-tall');
  for (let x = 0; x < W; x++) w.store.setTile(x, 150, 1);
  return w;
}
/** GameHooks 最小 mock（world + player + spawnDust 计数） */
function makeGame(w: World, playerOver: Partial<{ x: number; y: number; w: number; h: number; dead: boolean }> = {}) {
  const dusts: Array<{ type: number; alpha: number; scale: number; noGravity: boolean }> = [];
  return {
    world: w,
    player: { x: -999, y: -999, w: 20, h: 42, dead: false, ...playerOver },
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number,
      _sx: number, _sy: number, alpha: number,
      _c: unknown, scale: number, noGravity: boolean) => {
      void x; void y; void bw; void bh;
      dusts.push({ type, alpha, scale, noGravity });
    },
    dusts,
  } as unknown as Parameters<GorePiece['fixedUpdate']>[1] & { dusts: typeof dusts };
}

describe('② 气泡族贴图尺寸（BUBBLE_TEX——TEX 提取面缺该族）', () => {
  it('411-430 四族 × 五档 10/20/32/48/64', () => {
    for (const base of [411, 416, 421, 426]) {
      for (let i = 0; i < 5; i++) {
        const g = new GorePiece(base + i, 0, 0, 1);
        expect(g.texW).toBe([10, 20, 32, 48, 64][i]);
        expect(g.texH).toBe([10, 20, 32, 48, 64][i]);
      }
    }
  });
});

describe('② NewGore 尾段族扩散（Gore.cs:1427-1435）', () => {
  it('type += rand(4)*5：411 档只落入 {411,416,421,426}（尺寸档不变）', () => {
    resetGorePool();
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const g = GorePiece.newGore(411, 100, 100, 0, 0, 1);
      expect(g).not.toBeNull();
      seen.add(g!.goreId);
      expect(g!.texW).toBe(10);        // 扩散后仍是 10px 档
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([411, 416, 421, 426]);
    resetGorePool();
  });
  it('timeLeft = rand(300,1200)（goreTime/2 .. goreTime*2）', () => {
    resetGorePool();
    for (let i = 0; i < 50; i++) {
      const g = GorePiece.newGore(413, 100, 100, 0, 0, 1);
      expect(g!.timeLeft).toBeGreaterThanOrEqual(300);
      expect(g!.timeLeft).toBeLessThan(1201);
    }
    resetGorePool();
  });
});

describe('② 气泡 Update AI（Gore.cs:856-931）', () => {
  it('恒 alpha=50 + 上浮（vy 噪声目标 −0.25±2，低通 1/51）+ rotation = vx×0.3', () => {
    resetGorePool();
    const w = makeTallWorld();
    w.weather.windSpeedCurrent = 0;              // 钳风：防横向漂出世界误杀
    const game = makeGame(w);
    const g = GorePiece.newGore(413, 10 * 16, 149 * 16, 0, -1, 1)!;
    const y0 = g.y;
    // 初速瞬态 ~150t 衰减（时间常数 51），均值断言取收敛后窗口
    let sum = 0, n = 0;
    for (let i = 0; i < 160 && !g.dead; i++) { g.fixedUpdate(1, game); if (i >= 120) { sum += g.vy; n++; } }
    expect(g.alpha).toBe(50);
    expect(n).toBe(40);
    expect(sum / n).toBeGreaterThan(-1.6);      // 单帧噪声 ±2，窗口均值收敛向 −0.25
    expect(sum / n).toBeLessThan(1.2);
    expect(g.y).toBeLessThan(y0);               // position += velocity（:1070）净上浮
    expect(Math.abs(g.rotation - g.vx * 0.3)).toBeLessThan(1e-9);
    resetGorePool();
  });
  it('触碰实心块 → 爆（timeLeft=0 → alpha=255 + 爆裂尘 → 死亡）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w);
    // NewGore 尾段会把 y 上移一个贴图高（:1430）——起点取地板行内使 32px 矩形
    // 跨到实心行 FLOOR（y'=y−32 ∈ [FLOOR−2, FLOOR) 行域）
    const g = GorePiece.newGore(413, 5 * 16, FLOOR * 16 + 16, 0, 0, 1)!;
    g.fixedUpdate(1, game);
    expect(g.timeLeft).toBe(0);
    g.fixedUpdate(1, game);                    // timeLeft≤0 → 爆裂支
    expect(g.alpha).toBe(255);
    // 爆裂尘数量 = texW×scale×0.8 = 32×0.8 = 25（:907-908）；
    // type 按 NewGore 尾段扩散后的实际族号（413 → {413,418,423,428}）
    const dustOf = (t: number) => (t >= 426 ? 179 : t >= 421 ? 178 : t >= 416 ? 177 : 176);
    expect(game.dusts.length).toBe(Math.floor(32 * 1 * 0.8));
    expect(game.dusts[0]).toMatchObject({ type: dustOf(g.goreId), alpha: 100, noGravity: true });
    expect(g.dead).toBe(true);
    resetGorePool();
  });
  it('爆裂尘 type 按族：416-420→177 / 421-425→178 / 426-430→179（:908-921）',
    () => {
      resetGorePool();
      const w = makeWorld();
      // 直接构造（绕开 NewGore 尾段的 type += rand(4)*5 扩散）锁定族号；
      // 20px 贴图 y=340 → 矩形跨实心行 FLOOR（336..351）
      for (const [t, dust] of [[417, 177], [422, 178], [427, 179]] as const) {
        const game = makeGame(w);
        const g = new GorePiece(t, 5 * 16, 340, 1);
        g.vx = 0; g.vy = 0;
        g.fixedUpdate(1, game);
        g.fixedUpdate(1, game);
        expect(game.dusts[0]?.type).toBe(dust);
      }
      resetGorePool();
    });
  it('玩家矩形相交 → 爆（:864-880）', () => {
    resetGorePool();
    const w = makeWorld();
    const game = makeGame(w, { x: 10 * 16, y: 10 * 16 - 12 });
    const g = GorePiece.newGore(411, 10 * 16, 10 * 16, 0, 0, 1)!;
    g.fixedUpdate(1, game);
    expect(g.timeLeft).toBe(0);
    resetGorePool();
  });
  it('离玩家/地形远 → 存活，timeLeft 只随机衰减（:894-902）', () => {
    resetGorePool();
    const w = makeTallWorld();
    w.weather.windSpeedCurrent = 0;
    const game = makeGame(w);
    const g = GorePiece.newGore(411, 10 * 16, 149 * 16, 0, 0, 1)!;
    const t0 = g.timeLeft;
    for (let i = 0; i < 30 && !g.dead; i++) g.fixedUpdate(1, game);
    expect(g.dead).toBe(false);
    expect(g.timeLeft).toBeLessThanOrEqual(t0);   // 只减不增
    expect(g.timeLeft).toBeGreaterThan(0);
    resetGorePool();
  });
});

// ---------------------------------------------------------------------------
// ③ 数据锚（Item.cs SetDefaults 终态——行为分支的消费面）
// ---------------------------------------------------------------------------
describe('③ 数据锚（Item.cs SetDefaults）', () => {
  it('508 竖琴：useStyle 5 / useTime 12 / noMelee（Item.cs:7403-7413）', () => {
    expect(itemFuncOfVid(508)?.useStyle).toBe(5);
    expect(itemCombat(508)?.useTime).toBe(12);
    expect(itemCombat(508)?.noMelee).toBe(true);
  });
  it('4673 鼓槌：useStyle 1 / useTime 12（Item.cs:38490-38500）', () => {
    expect(itemFuncOfVid(4673)?.useStyle).toBe(1);
    expect(itemCombat(4673)?.useTime).toBe(12);
  });
  it('856 棍上独角兽：useStyle 16（=PlaySound,ItemUseStyleID.cs:37）/ useTime 10', () => {
    expect(itemFuncOfVid(856)?.useStyle).toBe(16);
    expect(itemCombat(856)?.useTime).toBe(10);
  });
  it('1450 泡泡棒：noMelee / useTime 25（Item.cs:17951-17963）', () => {
    expect(itemCombat(1450)?.noMelee).toBe(true);
    expect(itemCombat(1450)?.useTime).toBe(25);
    expect(itemFuncOfVid(1450)?.useStyle).toBe(1);
  });
  it('5464 Mitey-Titey：consumable=false（Item.cs:43089 显式覆写）——tryPlace 消耗门消费面', () => {
    expect(itemCombat(5464)?.consumable).toBe(false);
  });
  it('1345 彩带：无 UseSound/shoot/createTile——纯合成材料（Item.cs:16620-16629）', () => {
    const f = itemFuncOfVid(1345);
    expect(f?.shoot).toBeUndefined();
    expect(f?.createTile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ④ 注册完备
// ---------------------------------------------------------------------------
describe('④ 物品注册与放置链', () => {
  it('趣味四件 + 彩带均已注册（vanilla.json 自动注册循环）', () => {
    for (const vid of [508, 856, 1345, 1450, 4673, 5464]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vid ${vid} 缺 VANILLA_ITEM_KEY_BY_ID`).toBeTruthy();
      expect(ITEM_BY_KEY[key!], `vid ${vid} 缺 ITEM_DEFS 注册`).toBeDefined();
    }
  });
  it('5464 tile 回填到 v_693_mitey_titey（createTile=693,Item.cs:43086）', () => {
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[5464]!]];
    expect(def.tile).toBe('v_693_mitey_titey');
    expect(TILE_BY_KEY['v_693_mitey_titey']).toBeDefined();
  });
  it('鼓组 tile 486 已注册（4673 站位判定消费面）', () => {
    expect(TILE_BY_KEY['v_486_drum_set']).toBeDefined();
  });
});
