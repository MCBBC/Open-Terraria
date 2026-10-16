// ★BJ687（2026-10-16 用户实报「血红法杖召唤出来的蝙蝠效果不对,移植版=当前效果」
//  +截图 130 原版对拍 +「蝙蝠没有接触伤害是正常的吗」）三面判别锁。
//  病灶定谳（反编译 Terarria1457 亲读 + 探针 scripts/_bj687-sanguine-bats.mjs 物证）：
//   ①绯红残影链整链不渲染：原版 UpdateTrails（mode 2,Projectile.cs:17237-17246 每
//    update 无条件跑一次,位于 AI 后）在本仓由 fixedUpdate 尾 recordGhostTrail 承载,
//    但 755 在分发位早退（batOfLightBody … return）且体内【零 record 调用】——mode≥0
//    全集普查：533（twinsStep/deadlySpherePhase ✓）/864（smolstarAI ✓）/946
//    （terraprismaBody ✓）,唯 755 与 833-835（tigerBody）漏接 → ghostRing 恒
//    undefined → drawProjGhosts 的 at(i) 恒 null → Main.cs:31188 Crimson 残影 +
//    833 族速度染残影整链不渲染（探针:修前弧中程 crimsonPx=42/19×59,修后 460/63×73）。
//   ②四向红晕层序反：原版 :31440-31450（Crimson A=120,4 向 ±2px）画在【本体前】
//    （属链首块,本体走链尾通用绘制）;旧仓叠本体后=红纱洗白本体。
//   ③本体缺 75% 增白：GetAlpha 专支（Projectile.cs:80790 `Lerp(newColor,White,0.75)`）
//    =抵消自体 Crimson CastLight（:52441）对自身像素染红——旧世界层乘光把本体压成
//    暗红团（探针实测本体最亮 L=45 RGB(102,13,60) vs 原版截图 130 本体 L≈248 近白）。
//    修=755 整支（残影+红晕+本体）改道 queueProjFullbright（270/45/BJ682 630 判例）,
//    本体 tint=Lerp(lightAt,White,0.75) 16 级量化烘焙。
//  ④接触伤害疑问:探针实测【有】（4 蝙蝠 600t 内 9 次命中,hp 20000→19667;BJ684
//    ai156Strike 链工作正常,10×10 盒=SetDefaults :7781-7782 原版同款小盒）——非 bug。
//  ★变异自证锚:M1 摘分发位 recordGhostTrail → §1 恰红;M2 红晕挪本体后/摘全亮队列
//  → §3 源锚恰红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');
const VAN = join(GAME, '..', 'Terarria1457', 'Terraria');          // Main.cs / Projectile.cs
const VAN_ID = join(GAME, '..', 'Terarria1457', 'Terraria.ID');    // ProjectileID.cs

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; boss?: boolean;
  vx?: number; vy?: number;
  hurt: (d: number, kb?: number, kDir?: number, g?: GameHooks, pen?: number, crit?: boolean) => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy,
    hp: 100000, maxHp: 100000,
    hurt: (d: number) => { e.hp -= d; return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 120, 7, 'bj687');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
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
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, player };
}

let seq = 0;
const minion = (player: Player, hooks: GameHooks, projId: number): MinionProj => {
  const m = new MinionProj(player.cx - 5, player.cy - 5, projId, 6, 0, false, 0, false, () => player);
  m.id = ++seq;
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const RING = (m: MinionProj) => (m as unknown as {
  ghostRing?: { filled: number; cap: number; mode: number; px: Float64Array; py: Float64Array } | null;
}).ghostRing;
const BAT = (m: MinionProj) => m as unknown as { bA0: number; bA1: number; bHit: Map<number, number> };

afterEach(() => { vi.restoreAllMocks(); });

// ============================================================
// §1 记录面（病灶①:755/833-835 分发位补 recordGhostTrail——M1 摘除恰红）
// ============================================================
describe('§1 早退分发族残影记录（UpdateTrails :17237-17246 每 update 无条件）', () => {
  it('755 攻击弧中 ring 填充且槽位互异（旧=恒 undefined,M1 摘 record 恰红）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const en = mkEnemy(1, 60 * 16 + 200, 90 * 16 - 40);
    const { hooks, player } = makeHooks([en]);
    const b = minion(player, hooks, 755);
    for (let t = 0; t < 10; t++) b.fixedUpdate(1 / 60, hooks);
    expect(RING(b)).not.toBeUndefined();          // ★主判别:旧 ghostRing 恒 undefined
    expect(RING(b)!.filled).toBeGreaterThanOrEqual(5);
    // 强推弧段（bA0=30 中程）后槽位沿弧互异
    const bb = BAT(b);
    bb.bA0 = 30; bb.bA1 = en.id; bb.bHit.clear();
    for (let t = 0; t < 12; t++) b.fixedUpdate(1 / 60, hooks);
    const r = RING(b)!;
    expect(r.filled).toBe(r.cap);                 // 满 10 槽
    const pos = Array.from({ length: 6 }, (_, i) => `${Math.round(r.px[i])},${Math.round(r.py[i])}`);
    expect(new Set(pos).size).toBeGreaterThan(3); // 弧上互异（旧恒单点/空）
  });

  it('833 沙漠虎 ring 填充（连坐族,同分发位补 record）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { hooks, player } = makeHooks();
    const t = minion(player, hooks, 833);
    for (let i = 0; i < 12; i++) t.fixedUpdate(1 / 60, hooks);
    expect(RING(t)).not.toBeUndefined();
    expect(RING(t)!.mode).toBe(2);                // TrailingMode[833]=2（ProjectileID.cs:385）
    expect(RING(t)!.filled).toBeGreaterThanOrEqual(5);
  });

  it('946 泰拉棱镜走自有 tHist 环（VertexStrip 消费,不入通用 ghostRing——原版 :30609 通用表无 946）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { hooks, player } = makeHooks();
    const m = minion(player, hooks, 946);
    for (let i = 0; i < 12; i++) m.fixedUpdate(1 / 60, hooks);
    const tHist = (m as unknown as { tHist: number[] }).tHist;
    expect(tHist.length).toBeGreaterThanOrEqual(30);   // 自有环在录（12t×3 元素）
    expect(RING(m)).toBeUndefined();                   // 通用 ghostRing 不建（946 残影=VertexStrip 专绘）
  });

  it('源码锚:分发位 755/833-835 两行都带 recordGhostTrail（M1 位）', () => {
    const src = readFileSync(join(GAME, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('this.tigerBody(game, p, dmg0); this.recordGhostTrail(); return;');
    expect(src).toContain('this.batOfLightBody(game, p, dmg0); this.recordGhostTrail(); return;');
    // 反编译锚:两型 TrailingMode=2（残影记录式在册）
    const van = readFileSync(join(VAN_ID, 'ProjectileID.cs'), 'utf8');
    const tm = van.slice(van.indexOf('public static int[] TrailingMode'), van.indexOf('public static int[] TrailCacheLength'));
    expect(tm).toContain('755, 2');
    expect(tm).toContain('833, 2');
  });
});

// ============================================================
// §2 接触伤害疑问复验（非 bug:ai156Strike 链工作,10×10 盒原版同款）
// ============================================================
describe('§2 755 体触伤害（用户疑问面:实测有伤=原版语义）', () => {
  it('弧冲接触敌怪扣血（bHitTick→ai156Strike,10×10 盒）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const en = mkEnemy(1, 60 * 16 + 100, 90 * 16 - 20);
    const { hooks, player } = makeHooks([en]);
    const b = minion(player, hooks, 755);
    const bb = BAT(b);
    // 减速段（bA0=60 → 减速分支同走 bHitTick 且 vel=0 位移≈0）:蝙蝠盒直叠敌盒必命中
    b.x = en.cx - b.w / 2; b.y = en.cy - b.h / 2;
    bb.bA0 = 60; bb.bA1 = en.id; bb.bHit.clear();
    const hp0 = en.hp;
    for (let t = 0; t < 3; t++) b.fixedUpdate(1 / 60, hooks);
    expect(en.hp).toBeLessThan(hp0);              // 接触伤害成立（无伤=回归恰红）
  });
});

// ============================================================
// §3 全亮分支（病灶②③:层序翻正+本体 75% 增白——M2 挪层/摘队列恰红）
// ============================================================
describe('§3 755 全亮队列分支（queueProjFullbright 三件套,源锚+回退）', () => {
  it('源码锚:残影→红晕(本体前)→本体(Lerp 0.75 量化)三段入队（M2 位）', () => {
    const src = readFileSync(join(GAME, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    const i = src.indexOf('if (this.projId === 755 && img) {');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('// 无队列 → 落通用路径'));
    // 全亮队列 + 三件套全在内
    expect(block).toContain('queueProjFullbright');
    expect(block).toContain('drawProjGhosts');            // ① 残影（纯 Crimson）
    expect(block).toContain("'rgb(220,20,60)'");          // ② 红晕 Crimson
    expect(block).toContain('0.75 + 0.25 * q16');         // ③ 本体 Lerp(light,White,0.75)
    // 层序:红晕段在 ③ 本体段之前（源序=画序）
    const iHalo = block.indexOf('halo755');
    const iBody = block.indexOf('let src755');
    expect(iHalo).toBeGreaterThan(-1);
    expect(iBody).toBeGreaterThan(iHalo);                 // 红晕先于本体（旧=后恰红）
  });

  it('反编译锚:红晕本体前层序 + GetAlpha 0.75 增白 + 残影 Crimson 硬编码', () => {
    const vanMain = readFileSync(join(VAN, 'Main.cs'), 'utf8');
    // 红晕块（:31440-31450）在链首块内,先于链尾通用本体绘制
    const iGlow = vanMain.indexOf('if (proj.type == 755)\n\t\t\t{\n\t\t\t\tMicrosoft.Xna.Framework.Color color44');
    expect(iGlow).toBeGreaterThan(-1);
    expect(vanMain.slice(iGlow, iGlow + 400)).toContain('color44.A = 120');
    const vanP = readFileSync(join(VAN, 'Projectile.cs'), 'utf8');
    // GetAlpha 755 专支 0.75 白化
    const g = vanP.indexOf('if (type == 346 || type == 347 || type == 325 || type == 755)');
    expect(g).toBeGreaterThan(-1);
    expect(vanP.slice(g, g + 160)).toContain('Color.Lerp(newColor, Color.White, 0.75f)');
    // 残影色 = AI_156_GetColor()=Crimson（硬编码替换光照色）
    const c = vanP.indexOf('public Color AI_156_GetColor()');
    expect(vanP.slice(c, c + 320)).toContain('Color.Crimson');
  });

  it('回退面:无队列环境 draw 走通用路径不炸（mock ctx,贴图缺省金色方块兜底）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { hooks, player } = makeHooks();
    const b = minion(player, hooks, 755);
    for (let i = 0; i < 3; i++) b.fixedUpdate(1 / 60, hooks);
    const ops: string[] = [];
    const ctx = {
      save: () => ops.push('save'), restore: () => ops.push('restore'),
      translate: () => ops.push('translate'), rotate: () => ops.push('rotate'),
      scale: () => ops.push('scale'),
      fillRect: () => ops.push('fillRect'), strokeRect: () => ops.push('strokeRect'),
      drawImage: () => ops.push('drawImage'),
      set fillStyle(_v: unknown) { ops.push('fillStyle'); },
      set strokeStyle(_v: unknown) { ops.push('strokeStyle'); },
      set globalAlpha(_v: number) { ops.push('alpha'); },
      set globalCompositeOperation(_v: string) { ops.push('gco'); },
      set imageSmoothingEnabled(_v: boolean) { ops.push('ise'), void _v; },
      getTransform: () => new DOMMatrix(),
    } as unknown as CanvasRenderingContext2D;
    const r = { ctx } as unknown as import('../src/render/Renderer').Renderer;
    expect(() => b.draw(r)).not.toThrow();
    expect(ops).toContain('fillRect');            // 无贴图→金方块兜底（回退路径活）
  });
});
