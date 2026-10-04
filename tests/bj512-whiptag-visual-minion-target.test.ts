// ★BJ512（2026-10-05）：鞭 tag 视觉标记 + 召唤物索敌优先——用户实报两案定谳落刀。
//  原版全链定谳（Terarria1457 亲读）：
//  · tag 载体 = Player.TagEffectStack（1457 TagEffectStack.cs:1-139,非 buff）——
//    鞭命中 Projectile.cs:13635-13638 TryApplyTagToNPC;时长 = TagDuration
//    （缺省 240,WhipTagEffect.cs:17-22;5479 唯一 480）× tagEffectDuration
//    （Player.cs:13072-13073 SilverBracer +2f → ×3）;
//  · 视觉标记 = Main.cs:47250-47284 DrawInterface_1_2_DrawEntityMarkersInWorld：
//    Extra_199（16×72 竖排 4 帧,帧矩形 Frame(1,4,0,frameY,0,-2)=16×16）、
//    frameY=(int)(GTW×10)%4、色 Color.White×0.7 后 A/=2=(178,178,178,89)、
//    画在 minion attack target NPC.Center（原点帧中心）;门 = 玩家存活 ∧
//    HeldItem.summon（DefaultToWhip Item.cs:47822 置 summon=true——鞭族含内）。
//  · 召唤索敌优先 = 鞭命中直写【单槽】MinionAttackTargetNPC
//    （Projectile.cs:14321-14323 `aiStyle==165 → if(targetNPC.active)`）——
//    随从消费 = Minion_FindTargetInRange respectOwnerTarget 支（:49889-49897）
//    等各族第一桶;失效清除 = Player.cs:57682-57685 每 tick（!CanBeChasedBy ∨
//    npc.Hitbox.Distance(player.Center)>3000）。⚠1457 无「tag 扫描式」索敌——
//    优先完全走单槽（SW-FX19 approx-registry L5+④ 同谳）。
//  本批落刀：①视觉标记（Renderer.ts 1_2 层,此前整缺=用户实报①）②命中写槽
//  active 门（:14322,致死命中不写）③失效清除盒距 1:1（旧中心距=偏差）④右键
//  选靶 CanBeChasedBy 门（MinionNPCTargetAim :57592）。
//  ★变异证红：各断言注释给出「旧实现退化值」。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { WhipProj } from '../src/entities/WhipProj';
import { MinionProj } from '../src/entities/MinionProj';
import { Game } from '../src/core/Game';
import {
  whipMarkerFrameIndex, whipMarkerFrameRect, WHIP_MARKER_ALPHA, WHIP_MARKER_TINT_RGB,
} from '../src/render/Renderer';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { ITEM_DEFS } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; vanillaId?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000,
    maxHp: 100000,   // canBeChasedBy 门读 maxHp ?? def.hp（★BJ89 幻影字段定谳）
    hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 120, 7, 'bj512');
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
  return { hooks, store: w.store, player, added };
}

/** 鞭挥至命中的标准流程（sw-fx19 同款）：9 拍起手 → 敌移到曲线第 10 点 → 1 拍命中 */
function whipHit(player: Player, hooks: GameHooks, e: MockEnemy, projId = 841, itemId = 4672): void {
  const w = new WhipProj(player.cx, player.cy, 0, projId, itemId, 50, 4, 30, 4, () => player);
  for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
  const pts = w.pointsAt(20, true);
  e.cx = pts[10].x; e.cy = pts[10].y;
  e.x = pts[10].x - 8; e.y = pts[10].y - 12;
  w.fixedUpdate(1, hooks);
}

// ============================================================
// ① tag 载体钉值（命中打 tag/持续/缩放/叠加/刷新——WhipProj 命中链端到端）
// ============================================================
describe('① tag 载体钉值（TagEffectStack 1:1;鞭命中链 Projectile.cs:13635-13638）', () => {
  it('命中打 tag:时长 240t 递减耗尽（generalWhipMarkDuration=240,WhipTagEffect.cs:17-22）', () => {
    const a = mkEnemy(11, 0, 0);
    const { player, hooks } = makeHooks([a]);
    whipHit(player, hooks, a);
    expect(a.hits.length).toBeGreaterThan(0);
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(true);   // 命中即打
    for (let i = 0; i < 239; i++) player.fixedUpdate(1 / 60, hooks);
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(true);   // 余 1t
    player.fixedUpdate(1 / 60, hooks);
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(false);  // 恰 240t 耗尽
  });
  it('tagEffectDuration 缩放：×3 → 240t 时仍存活（SilverBracer +2f,Player.cs:13072-13073;旧恒 240 实现在此必红）', () => {
    const a = mkEnemy(11, 0, 0);
    const { player, hooks } = makeHooks([a]);
    Object.defineProperty(player, 'tagEffectDuration', { value: 3, configurable: true });
    whipHit(player, hooks, a);
    for (let i = 0; i < 240; i++) player.fixedUpdate(1 / 60, hooks);
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(true);   // 240t 仍在（=240×3 剩 480）
    for (let i = 0; i < 480; i++) player.fixedUpdate(1 / 60, hooks);
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(false);  // 720t 耗尽
  });
  it('同鞭刷新：再命中同鞭 tag 型不增条目（TrySetActiveEffect MRU 提顶,TagEffectStack.cs:42-58）', () => {
    const a = mkEnemy(11, 0, 0);
    const { player, hooks } = makeHooks([a]);
    whipHit(player, hooks, a);
    whipHit(player, hooks, a);
    expect(player.tagEffectStack.activeTypes()).toEqual([4672]);        // 单条目 MRU 顶
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(true);
  });
  it('多鞭叠加受 maxTagEffects 门：缺省 1 → 新鞭驱逐旧鞭;置 2 → 并存 MRU 序', () => {
    const a = mkEnemy(11, 0, 0);
    const { player, hooks } = makeHooks([a]);
    whipHit(player, hooks, a, 841, 4672);
    whipHit(player, hooks, a, 914, 4913);                               // 荆鞭 Snapthorn
    expect(player.tagEffectStack.activeTypes()).toEqual([4913]);        // 缺省 1 槽:4672 被驱逐
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(false);
    const b = makeHooks([a]);
    Object.defineProperty(b.player, 'maxTagEffects', { value: 2, configurable: true });
    whipHit(b.player, b.hooks, a, 841, 4672);
    whipHit(b.player, b.hooks, a, 914, 4913);
    expect(b.player.tagEffectStack.activeTypes()).toEqual([4913, 4672]);// 双 tag 并存（多 tag 全值叠加基础）
    expect(b.player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(true);
    expect(b.player.tagEffectStack.isNPCTagged(4913, a.id)).toBe(true);
  });
});

// ============================================================
// ② 视觉标记（Main.cs:47250-47284 DrawInterface_1_2_DrawEntityMarkersInWorld）
// ============================================================
describe('② 视觉标记数据面（Extra_199 帧序/帧矩形/色 α/HeldItem.summon 门）', () => {
  it('帧序 = (int)(GlobalTimeWrappedHourly×10)%4（:47268）——0.1s 步进 4 帧循环', () => {
    expect(whipMarkerFrameIndex(0)).toBe(0);
    expect(whipMarkerFrameIndex(0.0999)).toBe(0);
    expect(whipMarkerFrameIndex(0.1)).toBe(1);
    expect(whipMarkerFrameIndex(0.3)).toBe(3);
    expect(whipMarkerFrameIndex(0.4)).toBe(0);        // 回绕
    expect(whipMarkerFrameIndex(123.45)).toBe(1234 % 4);   // 2
  });
  it('帧矩形 = Frame(1,4,0,frameY,0,-2)：16×72 表 → 每帧 16×18 去尾 2px = 16×16（Utils.cs:1389-1396）', () => {
    expect(whipMarkerFrameRect(0)).toEqual({ sx: 0, sy: 0, sw: 16, sh: 16 });
    expect(whipMarkerFrameRect(2)).toEqual({ sx: 0, sy: 36, sw: 16, sh: 16 });
    expect(whipMarkerFrameRect(3)).toEqual({ sx: 0, sy: 54, sw: 16, sh: 16 });
  });
  it('色 α = Color.White×0.7f 后 A/=2 = (178,178,178,89)（:47272-47273）', () => {
    expect(WHIP_MARKER_TINT_RGB).toBe(178);           // 255×0.7 截断（旧恒白/恒 0.7 α 实现在此必红）
    expect(WHIP_MARKER_ALPHA).toBeCloseTo(89 / 255, 10);
  });
  it('贴图资产在库:vanilla/Extra_199.png 16×72（TextureAssets.Extra[199]）', () => {
    const p = join(__dirname, '..', 'public', 'sprites', 'vanilla', 'Extra_199.png');
    const buf = readFileSync(p);
    expect(buf.readUInt32BE(16)).toBe(16);            // PNG IHDR width
    expect(buf.readUInt32BE(20)).toBe(72);            // PNG IHDR height（4 帧 ×18px）
  });
  it('HeldItem.summon 门面（Item.cs:47822 DefaultToWhip 置 summon=true——鞭族含内）', () => {
    const byVid = (vid: number) => Object.values(ITEM_DEFS).find((d) => d.vid === vid);
    const leather = byVid(4672);                       // 皮革鞭
    expect(leather).toBeTruthy();
    expect(combatWeapon(leather!)?.kind).toBe('whip'); // 门真支
    const impStaff = byVid(1157);                      // 恶魔法杖（vanilla-itemcombat summon=true,shoot 191）
    expect(combatWeapon(impStaff!)?.kind).toBe('summon'); // 门真支（随从杖）
    const sword = byVid(3507);                         // 铜阔剑——非 summon 族
    const kw = combatWeapon(sword!)?.kind;
    expect(kw === 'summon' || kw === 'whip').toBe(false);   // 门假支
  });
});

// ============================================================
// ③ 召唤索敌优先（单槽集火链:写门/清除/消费—— Projectile.cs:14321-14323 →
//    AI 第一桶 :49889-49897 等 → Player.cs:57682-57685）
// ============================================================
describe('③ 召唤索敌优先（tag 目标 = 集火单槽;有/无 tag 对照）', () => {
  it('本击致死：tag 照打（:13635 无 active 门）∧ 集火槽不写（:14322 `if (targetNPC.active)`——旧无门实现在此必红）', () => {
    const a = mkEnemy(11, 0, 0);
    a.hp = 40;   // 鞭伤 50 → 本击致死
    a.hurt = (d: number) => { a.hp -= d; if (a.hp <= 0) a.dead = true; return true; };
    const { player, hooks } = makeHooks([a]);
    whipHit(player, hooks, a);
    expect(a.dead).toBe(true);
    expect(player.minionTargetId).toBe(-1);                            // 致死不写槽
    expect(player.tagEffectStack.isNPCTagged(4672, a.id)).toBe(true);  // tag 面无 active 门
  });
  it('鞭命中写槽 → 随从优先攻击被鞭目标（超越野生末位覆盖）：野生末位=近敌 450（vx=0.9 档）,集火=鞭打目标 250（vx=1.2 档）', () => {
    // 对照组：无鞭命中（槽=-1）→ 野生支取【末位通过者】A(450)（:43690 无最近比较）
    const a0 = mkEnemy(21, 0, 0);
    const b0 = mkEnemy(22, 0, 0);
    const c0 = makeHooks([b0, a0]);                    // 槽序 [B,A] → 野生末位=A
    a0.cx = c0.player.cx + 450; a0.x = a0.cx - 8; a0.cy = c0.player.cy; a0.y = a0.cy - 12;
    b0.cx = c0.player.cx + 250; b0.x = b0.cx - 8; b0.cy = c0.player.cy; b0.y = b0.cy - 12;
    const head0 = new MinionProj(c0.player.cx - 12, c0.player.cy - 12, 625, 10, 2, false, 0, false, () => c0.player);
    head0.fixedUpdate(1, c0.hooks);
    expect(head0.vx).toBeCloseTo(0.9, 6);              // 追 A(450 档)
    // 实验组：鞭命中 B → 槽=B → 集火支（:43667 num4×2<1400 无 num5 门）优先 → 追 B
    const a1 = mkEnemy(21, 0, 0);
    const b1 = mkEnemy(22, 0, 0);
    const c1 = makeHooks([b1, a1]);                    // 同槽序 [B,A]
    b1.cx = c1.player.cx + 250; b1.x = b1.cx - 8; b1.cy = c1.player.cy; b1.y = b1.cy - 12;
    whipHit(c1.player, c1.hooks, b1);                  // 鞭打 B（写槽 22）——命中后重摆位
    b1.cx = c1.player.cx + 250; b1.x = b1.cx - 8; b1.cy = c1.player.cy; b1.y = b1.cy - 12;
    a1.cx = c1.player.cx + 450; a1.x = a1.cx - 8; a1.cy = c1.player.cy; a1.y = a1.cy - 12;
    expect(c1.player.minionTargetId).toBe(22);
    const head1 = new MinionProj(c1.player.cx - 12, c1.player.cy - 12, 625, 10, 2, false, 0, false, () => c1.player);
    head1.fixedUpdate(1, c1.hooks);
    expect(head1.vx).toBeCloseTo(1.2, 6);              // 追 B(250 档)——旧「无槽消费」实现在此必红
  });
});

describe('③b 右键集火选靶（MinionNPCTargetAim Player.cs:57587-57605,Game.selectMinionAttackTarget 抽站）', () => {
  const shell = (enemies: MockEnemy[], player: Player) => {
    const g = Object.create(Game.prototype) as unknown as {
      entities: { enemies: unknown[] }; player: Player;
      selectMinionAttackTarget: (wx: number, wy: number) => void;
    };
    g.entities = { enemies };
    g.player = player;
    return g;
  };
  it('CanBeChasedBy 选靶门（:57592 原文链首）:点在假人 488 盒心 → 不选假人,选真敌（旧无门实现=选 1 必红）', () => {
    const { player } = makeHooks([]);
    const dummy = mkEnemy(1, 100, 100);
    dummy.vanillaId = 488;                             // 训练假人（CHASE_EXCLUDED_VIDS）
    const real = mkEnemy(2, 160, 100);
    shell([dummy, real], player).selectMinionAttackTarget(100, 100);
    expect(player.minionTargetId).toBe(2);
  });
  it('选靶=Hitbox.Distance 最近（入盒=0）+ 同目标再选取消 toggle（:57598-57605）', () => {
    const { player } = makeHooks([]);
    const a = mkEnemy(1, 100, 100);
    const b = mkEnemy(2, 130, 100);
    const g = shell([a, b], player);
    g.selectMinionAttackTarget(108, 100);              // 盒距:a=0（入盒）,b=14 → 选 a
    expect(player.minionTargetId).toBe(1);
    g.selectMinionAttackTarget(108, 100);              // 同目标再选 → 取消
    expect(player.minionTargetId).toBe(-1);
    g.selectMinionAttackTarget(130, 100);              // 改选 b
    expect(player.minionTargetId).toBe(2);
  });
});
