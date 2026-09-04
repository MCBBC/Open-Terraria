// 弹幕通用湿段接入二批回归（2026-09-04 溅花缺口清偿波）：MagicProj / BookProj /
// MinionProj.TigerPounce(818) / meleeOnHitProjs.JavelinStickerProj(971/975) 四类接
// projectileWetSection 共享体（Projectile.cs:16903-17113 1:1）。
//  · 非豁免 id：入水溅花 10 粒 + Splash_1（共享体 wetSplashStepShared 面,水档尘 33）
//  · 豁免 id（SetDefaults/AI_113 ignoreWater=true）：段门恒闭零行为
//  · 湿旗跃迁 / wetCount 出水冷却窗 / !wet 三清（lavaWet 粘滞）
//  · 阻尼：直积分宿主 x += vx×档（速度场不减,HandleMovement :17721-17764 +
//    UpdatePosition :20557-20562）;豁免/曲线宿主不适用（各类字段块头已锚 P.cs 行号）
import { describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { MagicProj } from '../src/entities/MagicProj';
import { BookProj } from '../src/entities/BookProj';
import { TigerPounce } from '../src/entities/MinionProj';
import { JavelinStickerProj } from '../src/entities/meleeOnHitProjs';
import type { GameHooks } from '../src/entities/types';

const LIQ = 255;

interface DustCall { type: number; x: number; y: number; w: number; h: number }

function makeGame(store: TileStore) {
  const dusts: DustCall[] = [];
  const sfx: string[] = [];
  const game = {
    world: { store } as never,
    player: { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0, dead: false, cx: 0, cy: 0 },
    enemies: () => [],
    critters: () => [],
    entities: { projectiles: [] },
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
    showPickupLabel: () => {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number) => {
      dusts.push({ x, y, w, h, type });
      return {} as never;
    },
    playSfxWav: (name: string) => { sfx.push(name); },
  } as unknown as GameHooks;
  return { game, dusts, sfx };
}

/** 水=格(10,20)=px[160,176)×[320,336);蜂蜜=格(20,20)=px[320,336)×[320,336);
 *  岩浆=格(30,20)=px[480,496)×[320,336)。liquidType=原版 LiquidID +1 编码
 *  （TileStore.LIQUID_TYPE:WATER=1/LAVA=2/HONEY=3/SHIMMER=4——禁裸写 0） */
function liquidStore(): TileStore {
  // 仓高 120:Wet/LavaCollision 扫描窗带 `min(st.h-40)` 狱底钳（Collision.cs:1595-1598
  //  同构）——60 高仓的 20 行恰被钳掉,液带永远扫不到（proj-wet-cache F2② 同坑）
  const st = new TileStore(60, 120);
  st.liquid[st.idx(10, 20)] = LIQ; st.liquidType[st.idx(10, 20)] = 1;
  st.liquid[st.idx(20, 20)] = LIQ; st.liquidType[st.idx(20, 20)] = 3;
  st.liquid[st.idx(30, 20)] = LIQ; st.liquidType[st.idx(30, 20)] = 2;
  return st;
}
const DRY_Y = 200;          // 干位（197-212 探针带,远离三液带）
const WATER = { x: 160, y: 324 };   // 16×16 盒全入水（探针 [163,173)×[328,336)）
const HONEY = { x: 320, y: 324 };
const LAVA = { x: 480, y: 324 };

// =====================================================================
// MagicProj（现役 id 集={0}兜底;构造器可携任意 magic id——27 水涛非豁免 /
// 150 豁免族抽验,豁免分流=PROJ_IGNORE_WATER 逐 id 自动承载）
// =====================================================================
describe('MagicProj 通用湿段（P.cs:16903-17113 共享体接入）', () => {
  it('27 水涛非豁免（P.cs:1097-1107 无 ignoreWater 行）：入水溅花 10 粒+Splash_1+湿旗跃迁', () => {
    const st = liquidStore();
    const { game, dusts, sfx } = makeGame(st);
    const p = new MagicProj(WATER.x, DRY_Y, 0, 0, 10, 300, '#4060FF', 27);
    p.fixedUpdate(1 / 60, game);                        // 干位首拍=出生预置（:10886-10892 等价）
    expect(p.presetDone).toBe(true);
    expect(p.wet).toBe(false);
    expect(dusts.length).toBe(0);
    (p as { y: number }).y = WATER.y;                   // 移入水（次拍 AI 后湿段测位=原版同位）
    p.fixedUpdate(1 / 60, game);
    expect(p.wet).toBe(true);
    expect(dusts.length).toBe(10);                      // wetSplashStepShared 弹面 10 粒
    expect(dusts.every((d) => d.type === 33)).toBe(true);   // dustWaterFor 缺省水 33
    expect(sfx).toEqual(['Splash_1']);
  });

  it('入水拍阻尼 ×0.5 只进位移（速度场不减）,干态档=1 恒等', () => {
    const st = liquidStore();
    const { game } = makeGame(st);
    const p = new MagicProj(WATER.x, DRY_Y, 4, 0, 10, 300, '#4060FF', 27);
    p.fixedUpdate(1 / 60, game);                        // 干位:drag=1 → x += 4
    expect(p.x).toBe(WATER.x + 4);
    expect(p.vx).toBe(4);
    (p as { x: number; y: number }).x = WATER.x;
    (p as { y: number }).y = WATER.y;
    p.fixedUpdate(1 / 60, game);                        // 入水拍:wet 段先行 → 同拍阻尼生效
    expect(p.x).toBe(WATER.x + 2);                      // 4×0.5
    expect(p.vx).toBe(4);                               // 速度场不被水阻改写
  });

  it('出水溅花+ wetCount=10 冷却窗（窗内再入水不重溅）+ !wet 三清（岩浆粘滞）', () => {
    const st = liquidStore();
    const { game, dusts, sfx } = makeGame(st);
    const p = new MagicProj(LAVA.x, LAVA.y, 0, 0, 10, 300, '#4060FF', 27);
    p.fixedUpdate(1 / 60, game);                        // 出生在岩浆:预置 wet+lavaWet,预置不溅
    expect(p.wet).toBe(true);
    expect(p.lavaWet).toBe(true);
    expect(dusts.length).toBe(0);
    (p as { y: number }).y = DRY_Y;                     // 出浆:溅【岩浆】花（粘滞旗档 :16988）
    p.fixedUpdate(1 / 60, game);
    expect(p.wet).toBe(false);
    expect(p.wetCount).toBe(9);                         // :16984 置 10 → 同子步尾 :17109-17112 −1 = 9（1:1 位序）
    expect(dusts.length).toBe(10);
    expect(dusts.every((d) => d.type === 35)).toBe(true);   // 岩浆粘滞出水溅岩浆花
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(p.lavaWet).toBe(false);                      // !wet 三清（:17103-17108）
    (p as { y: number }).y = WATER.y;                   // 窗内（wetCount=9）再入水
    p.fixedUpdate(1 / 60, game);
    expect(p.wet).toBe(true);
    expect(dusts.length).toBe(10);                      // 冷却窗内不重溅（:16949 wetCount==0 门）
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
  });

  it('150 豁免族（P.cs:2398-2409 ignoreWater=true）：湿段整段门恒闭零行为', () => {
    const st = liquidStore();
    const { game, dusts, sfx } = makeGame(st);
    const p = new MagicProj(WATER.x, WATER.y, 0, 0, 10, 300, '#A040FF', 150);
    p.fixedUpdate(1 / 60, game);
    p.fixedUpdate(1 / 60, game);
    expect(p.presetDone).toBe(true);
    expect(p.wet).toBe(false);
    expect(p.lavaWet).toBe(false);
    expect(p.honeyWet).toBe(false);
    expect(p.shimmerWet).toBe(false);
    expect(dusts.length).toBe(0);
    expect(sfx.length).toBe(0);
  });
});

// =====================================================================
// BookProj 1092（P.cs:10188-10196 无 ignoreWater 行 → 非豁免受段;hostile 弹同吃
// :16903 通段;aiStyle 18 ∉ UpdatePosition 早退表 → 阻尼适用）
// =====================================================================
describe('BookProj 1092 通用湿段', () => {
  it('入水溅花 10 粒（水档 33）+ 湿旗跃迁;出生拍 269 尘不混入溅花计数', () => {
    const st = liquidStore();
    const { game, dusts, sfx } = makeGame(st);
    const b = new BookProj(WATER.x, DRY_Y, 13, null);
    b.fixedUpdate(1 / 60, game);                        // 出生态:6×269 尘 + 干位预置
    expect(b.wet).toBe(false);
    expect(dusts.filter((d) => d.type === 33).length).toBe(0);
    (b as { y: number }).y = WATER.y;
    b.fixedUpdate(1 / 60, game);
    expect(b.wet).toBe(true);
    expect(dusts.filter((d) => d.type === 33).length).toBe(10);
    expect(sfx).toEqual(['Splash_1']);
  });

  it('水中阻尼 ×0.5 只进位移（AI 尾 vy 与位移行分离,速度场不减）', () => {
    const st = liquidStore();
    const { game } = makeGame(st);
    const b = new BookProj(WATER.x, DRY_Y, 13, null);
    b.fixedUpdate(1 / 60, game);                        // 出生 vy=-3;干位 drag=1
    expect(b.y).toBe(DRY_Y - 3);
    const vyAfterBirth = b.vy;
    (b as { y: number }).y = WATER.y;
    const yBefore = b.y;
    b.fixedUpdate(1 / 60, game);                        // 悬停拍:AI 尾 vy×0.95 后湿段+阻尼位移
    expect(b.vy).toBe(vyAfterBirth * 0.95);             // 速度场不被水阻改写
    expect(b.y).toBeCloseTo(yBefore + vyAfterBirth * 0.95 * 0.5, 10);   // ×0.5 只进位移
  });
});

// =====================================================================
// TigerPounce 818（P.cs:8007-8016 ignoreWater=true :8013 → 豁免;UpdatePosition
// 早退表 :20551-20553 含 type 818 → 位移=AI 曲线插值,阻尼不适用）
// =====================================================================
describe('TigerPounce 818 通用湿段（豁免 id 零行为）', () => {
  it('水上/水中恒无溅花无湿旗（段门恒闭）,本体 AI 不受影响', () => {
    const st = liquidStore();
    const { game, dusts, sfx } = makeGame(st);
    const t = new TigerPounce(168, 328, 6, -2, 10, () => null, 0, 60);   // 中心=(168,328) 盒含水带
    t.fixedUpdate(1 / 60, game);
    t.fixedUpdate(1 / 60, game);
    expect((t as unknown as { presetDone: boolean }).presetDone).toBe(true);
    expect((t as unknown as { wet: boolean }).wet).toBe(false);
    expect((t as unknown as { lavaWet: boolean }).lavaWet).toBe(false);
    expect(dusts.length).toBe(0);
    expect(sfx.length).toBe(0);
    expect(t.dead).toBe(false);                         // 扑击曲线照常推进（a0=4/60×2 <1）
  });
});

// =====================================================================
// JavelinStickerProj 971/975（SetDefaults P.cs:9199-9209/:9289-9298 无 ignoreWater
// 行,但 AI_113 钉扎态 ai0==1 置 ignoreWater=true（P.cs:41397-41399）;出生 ai0=1f
// （Player.cs:44518/:44535）→ 恒豁免零行为;钉扎 tileCollide=false → 阻尼不适用）
// =====================================================================
describe('JavelinStickerProj 971/975 通用湿段（AI_113 钉扎豁免零行为）', () => {
  it.each([971, 975])('%i：水中恒无溅花无湿旗（豁免由 ai0 门承载）,钉扎消亡链不变', (id) => {
    const st = liquidStore();
    const { game, dusts, sfx } = makeGame(st);
    const j = new JavelinStickerProj(id, 168, 332, 3, -2, -1);   // 盒=(160,324) 全入水
    j.fixedUpdate(1 / 60, game);                        // 湿段在 tick 头先行,后走钉扎目标失效杀
    expect((j as unknown as { presetDone: boolean }).presetDone).toBe(true);
    expect((j as unknown as { wet: boolean }).wet).toBe(false);
    expect((j as unknown as { honeyWet: boolean }).honeyWet).toBe(false);
    expect(dusts.length).toBe(0);
    expect(sfx.length).toBe(0);
    expect(j.dead).toBe(true);                          // 目标失效即杀（AI_113 :41489 支,既有面）
  });
});
