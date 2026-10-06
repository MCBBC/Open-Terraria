// ★BJ514（2026-10-05）：minion 索敌 per-AI 逐型归真审计批①（BJ512 登记债①②清偿）。
//  原版谱系定谳（Terarria1457/Terraria/Projectile.cs 亲读,本文件表内逐行钉锚）：
//  · 集火（OwnerMinionAttackTargetNPC,单槽）消费者全集 = 13 站：
//    :29043 AI_053_FrostHydra（曼哈顿<900+CanHit 盒）/ :30314 aiStyle 66 内联
//    （533/387/388,Dist<num526×3=6000+CanHitLine 盒）/ :37836 AI_123_FloatingTurrets
//    （Dist<num=1000+CanHitLine 心 0,0）/ :40927 AI_053_HandleSentryNPCTargeting
//    （曼哈顿<maxDistance+CanHit/CanHitLine,1025 借道 :41175 maxDistance=num8=1240）/
//    :43663 AI_121_StardustDragon（Dist<num4×2<1400）/ :49890 Minion_FindTargetInRange
//    respectOwnerTarget 支（IsInRangeOfMeOrMyOwner;AI_067 :50524/AI_158 :49670/
//    AI_169 :46603/AI_206 :38199 四站借道）/ :52772 AI_156_TryAttackingNPCs
//    （黑名单+Dist≤1000+CanHitWithOwnBody）/ :62606+:62791 AI_026 双支（曼哈顿+CanHit
//    盒）/ :66369+:66405 AI_062 双支（num12×3=6000;963 分档 700×3=2100）/ :69421
//    AI_130_FindTarget（角度比门+shot_range）/ :69468 AI_134_Ballista_FindTarget
//    （deadBottomAngle 门）。写槽 = :14321-14323（鞭命中,aiStyle 165,单槽最新胜出）
//    + 召唤杖右键;失效清除 = Player.cs:57682-57685。
//  · 【不】消费者（FindTarget 式扫不含集火桶）：AI_120_StardustGuardian_FindTarget
//    :45785（玩家心锚 Euclid 收缩最近）/ AI_177 FindTargetWithinRange :45918
//    （917/1036,400+localNPCImmunity 门）/ AI_204_Digtoise :39169-39507（零索敌）/
//    aiStyle 54（317 乌鸦）。
//  · 【无】tag 扫描式索敌：TagEffectStack（TagEffectStack.cs:1-139）纯伤害加成/proc
//    面,零择敌消费——鞭→随从优先完全走单槽（BJ512 同谳,SW-FX19 approx-registry L5+④）。
//  本批落刀（批①）：
//    A. AI_120 三站（状态 0 :45526/状态 1 :45581/状态 2 重锁 :45716）改专用
//       ai120FindTarget（玩家心锚/无集火/无 tag——状态 0 曾错挂随从心一并归真）;
//    B. nearestEnemy 鞭 tag 扫描桶摘除（WhipTag.anyTagged 随刀退役）;
//    C. AI_177（917/1036）改 ai177FindTarget（曾吃通用集火/tag 桶）;
//    D. AI_156（946/755）tTarget 补集火支（原版第一桶 :52772,曾整缺）;
//    E. 集火门距归真：963=2100（曾 900）/533+387/388=6000（曾 900/双子曾落通用
//       1000 无视线档）/AI_123=1000（曾 900）。
//  ★变异证红：各断言注释给出「旧实现退化值」,变异该刀必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
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
  const w = new World(200, 120, 7, 'bj514');
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

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;   // cx/cy 对齐给定点（盒左上=Entity 语义）
  return m;
};

/** 替换玩家 tag 栈为「anyTagged→只认指定敌」探针——若任何择敌路径仍消费 tag 桶,
 *  探针即翻红（★变异证红：re-add `tagged ?? best` 桶 → ② tag 摘除组两案必红） */
function probeTagStack(player: Player, taggedIds: number[]): void {
  Object.defineProperty(player, 'tagEffectStack', {
    value: {
      anyTagged: (id: number) => taggedIds.includes(id),
      isNPCTagged: () => false,
      canProcOnNPC: () => false,
    },
    configurable: true,
  });
}

// ============================================================
// ① 逐型索敌语义表（集火消费 有/无 × 每型,repo 源锚钉值）
// ============================================================
describe('① 逐型索敌语义表（原版形态 × 本仓形态钉值,变异对应刀必红）', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
  const whipSrc = readFileSync(join(__dirname, '..', 'src', 'entities', 'WhipTag.ts'), 'utf8');
  const slice = (start: string, end: string): string => {
    const a = src.indexOf(start);
    expect(a, `锚缺失: ${start}`).toBeGreaterThan(-1);
    const b = src.indexOf(end, a + start.length);
    expect(b, `尾锚缺失: ${end}`).toBeGreaterThan(a);
    return src.slice(a, b);
  };

  it('AI_120 星尘守护者 623：无集火/无 tag/玩家心锚（:45785；锚例=BJ512 点名）——旧 nearestEnemy 退化为红', () => {
    const fn = slice('private ai120FindTarget(', '\n  }\n');
    expect(fn).not.toContain('minionTargetId');        // 集火桶（旧 eager 面）
    expect(fn).not.toContain('anyTagged');             // tag 桶（旧 eager 面）
    expect(fn).toContain('p.cx, en.cy - p.cy');        // 距锚=玩家心（:45786-45788）
    const body = slice('private guardianBody(', 'private guardianDustBurst(');
    expect(body.match(/ai120FindTarget\(game, p\)/g)?.length).toBe(3); // 三站全走专用扫
    expect(body).not.toContain('nearestEnemy(');       // 旧通用段清空
    // 变异证红：ai120FindTarget 改回 this.nearestEnemy(game, 500) → ②组 AI_120 三案红
  });

  it('AI_121 星尘龙 625-628：集火有（:43663,Dist<1400）/无 tag（既有 1:1,本刀零触碰）', () => {
    const fn = slice('private dragonTarget(', 'private dragonHead(');
    expect(fn).toContain('minionTargetId');            // 集火支在位
    expect(fn).not.toContain('anyTagged');             // 无 tag 桶
  });

  it('AI_026 蜘蛛 390-392：集火有（:62606/:62791 种子式,曼哈顿+CanHit 盒）', () => {
    const fn = slice('private spiderStep(', 'private frogStep(');
    expect(fn).toContain('minionTargetId');            // 种子集火在位
  });

  it('AI_067 步行族（393-395/758/951/833-835/1022/1093/1112/1118）：集火有（FindTargetInRange :50524 respectOwnerTarget）', () => {
    const fn = slice('private findTargetInRangeDual(', '\n\n  fixedUpdate(');
    expect(fn).toContain('minionTargetId');            // :49891 焦点支
    expect(fn).not.toContain('anyTagged');
    // 六站 findTargetInRangeDual 消费（pirate/tiger/flinx/pal/mush/frog）
    expect(src.match(/findTargetInRangeDual\(game,/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('AI_156 棱镜/光蝠 946/755：集火有（:52772 第一桶）——旧整缺=变异删支必红', () => {
    const fn = slice('private tTarget(', '\n    return best;\n  }');
    expect(fn).toContain('minionTargetId');            // ★本刀补支
    expect(fn).toContain('<= 1000');                   // :52780 Distance>1000 拒
    expect(fn).toContain('canHitWithOwnBodyBox');      // :52784 CanHitWithOwnBody
  });

  it('AI_062 963 阿比盖尔：集火门距 2100（:66410 num18=num12×3,num12=700 :66330-66333）——旧 900 红', () => {
    const body = slice('private abigailBody(', 'private solidOverlap(');
    expect(body).toContain("'point', 'self', 2100");
    // 变异证红：2100→900 → ②组 963 案红
  });

  it('AI_062 射手族 373/375/407/423/613：集火门距 6000（:66327 num12=2000+:66374 ×3）', () => {
    // ★BJ515：链头锚改指现役（AI_026 尾族插队短路,ai62 支降为链中段;6000 门面零变化）
    const fn = slice('const tgt = ai026Tail', 'if (this.projId >= 626');
    expect(fn).toContain('6000');
  });

  it('aiStyle 66 三型 533/387/388：集火门距 6000+CanHitLine 盒（:30316 num539=num526×3）——旧 900/双子通用档红', () => {
    // ★BJ515：链头锚同上改指现役
    const fn = slice('const tgt = ai026Tail', 'if (this.projId >= 626');
    expect(fn).toContain('this.projId === 533 || this.projId === 387 || this.projId === 388');
    expect(fn).toContain("'line', 'self', 6000");
  });

  it('AI_123 浮游炮台 641/643：集火门距 1000（:37731 num,:37839 num4=num）——旧 900 红', () => {
    expect(src).toContain("nearestEnemy(game, 1000, 'line', 'self', 1000)");
  });

  it('AI_177 酷鞭雪花 917：无集火/无 tag（FindTargetWithinRange :45918）——旧通用段红（★BJ-C3/F5：1036 已重路由 webStep,标题残留同步）', () => {
    const fn = slice('private ai177FindTarget(', '\n  }\n');
    expect(fn).not.toContain('minionTargetId');
    expect(fn).not.toContain('anyTagged');
    expect(fn).toContain('bestD = 400');               // :46022 FindTargetWithinRange(400f)
    // ★BJ516①：1036 重路由 webStep（AI_067 flag7）——917 支单挂 ai177FindTarget,
    // 1036 支走 webStep（respectOwnerTarget=false :50520-50523）
    const face = slice("if (this.projId === 917) {", "if (!this.ground) {");
    expect(face).toContain('this.ai177FindTarget(game)');
    expect(face).not.toContain('nearestEnemy(');
    const web = slice('private webStep(', '\n  }\n');
    expect(web).toContain('respectOwnerTarget: false');
    expect(web).not.toContain('nearestEnemy(');
  });

  it('无 tag 扫描式索敌（债①）：nearestEnemy 桶态/anyTagged 调用/WhipTag.anyTagged 全站清零', () => {
    expect(src.includes('.anyTagged(')).toBe(false);   // 任意接收者形式的桶调用全摘（变异面全覆盖）
    expect(src).not.toContain('tagged ?? best');       // 桶回退摘除
    expect(whipSrc).not.toContain('anyTagged(npcId: number)');   // 方法退役
    // 保留消费者只有 isNPCTagged/canProcOnNPC（伤害加成/proc 面,TagEffectStack.cs 同名）
  });

  it('零消费面回归钉：AI_204 钻地龟/aiStyle 54 乌鸦原生无索敌（不误接通用段）', () => {
    const dig = slice('private digtoiseStep(', 'private tGroup(');
    expect(dig).not.toContain('nearestEnemy(');
    expect(dig).not.toContain('findTargetInRangeDual(');
    const raven = slice('private ravenBody(', 'private deadlySpherePhase(');
    expect(raven).not.toContain('nearestEnemy(');      // 自带曼哈顿 900+canHit 扫
    expect(raven).not.toContain('minionTargetId');     // aiStyle 54 原版不消费集火
  });
});

// ============================================================
// ② AI_120 面判别（行为级,BJ512 点名锚例;623 状态 0 三案）
// ============================================================
describe('② AI_120 星尘守护者面判别（:45785 无集火/无 tag/玩家心锚）', () => {
  it('集火免疫：槽内敌 600px（>500 检索窗外,<900 旧集火窗）→ 不追（旧 nearestEnemy 退化为红）', () => {
    const f = mkEnemy(31, 0, 0);
    const { hooks, player } = makeHooks([f]);
    player.facing = -1;
    const restX = player.cx + (5 + player.w / 2);      // facing=-1（:45484 取反式）
    const g = minion(player, 623, restX, player.cy - 25);
    player.minionTargetId = f.id;                      // 集火槽写满
    f.cx = player.cx + 600; f.x = f.cx - 8; f.cy = player.cy; f.y = f.cy - 12;
    g.fixedUpdate(1, hooks);
    expect(g.facing).toBe(-1);                         // 旧集火支：facing=+1（追 F）→ 红
    expect(g.ai120State).toBe(0);                      // 不入冲拳态
    expect((g as unknown as { gA1: number }).gA1).toBe(-1);
  });

  it('tag 桶摘除：远 tag 敌 140 / 近野生敌 100 → 追近敌（旧 `tagged ?? best` 退化为红）', () => {
    const w = mkEnemy(41, 0, 0);
    const t = mkEnemy(42, 0, 0);
    const { hooks, player } = makeHooks([t, w]);
    probeTagStack(player, [t.id]);                     // 探针：tag 桶若在,必选 T
    player.facing = 1;
    const g = minion(player, 623, player.cx - (5 + player.w / 2), player.cy - 25);
    w.cx = player.cx + 100; w.x = w.cx - 8; w.cy = player.cy; w.y = w.cy - 12;
    t.cx = player.cx + 140; t.x = t.cx - 8; t.cy = player.cy; t.y = t.cy - 12;
    g.fixedUpdate(1, hooks);
    expect(g.ai120State).toBe(2);                      // num7=115<500 → 冲拳态
    expect((g as unknown as { gA1: number }).gA1).toBe(41);  // 旧桶：gA1=42（T）→ 红
  });

  it('玩家心锚：敌在玩家正下 479px（随从心距 504≥500）→ 仍锁定并转冲拳（旧随从心锚退化为红）', () => {
    const e = mkEnemy(51, 0, 0);
    const { hooks, player } = makeHooks([e]);
    player.facing = 1;
    const g = minion(player, 623, player.cx - (5 + player.w / 2), player.cy - 25);
    e.cx = player.cx; e.x = e.cx - 8; e.cy = player.cy + 479; e.y = e.cy - 12;
    g.fixedUpdate(1, hooks);
    // 玩家锚 479<500 命中 → num7=|E.cx-g.cx|=15<500 → 冲拳;旧随从锚 504.2≥500 空手
    expect(g.ai120State).toBe(2);
    expect((g as unknown as { gA1: number }).gA1).toBe(51);
  });
});

// ============================================================
// ③ AI_177 面判别（917 酷鞭雪花：FindTargetWithinRange 400,无集火/无 tag）
// ============================================================
describe('③ AI_177 面判别（:45918 无集火/无 tag 桶）', () => {
  it('集火免疫：近野生敌 100 右 / 槽内敌 350 左 → 追近敌（旧通用集火段退化为红）', () => {
    const w = mkEnemy(61, 0, 0);
    const f = mkEnemy(62, 0, 0);
    const { hooks, player } = makeHooks([f, w]);
    player.whipBuffs[312] = 1;                         // AI_177 续命门（:45949-45953）
    const g = minion(player, 917, player.cx, player.cy - 40);
    w.cx = g.cx + 100; w.x = w.cx - 8; w.cy = g.cy; w.y = w.cy - 12;
    f.cx = g.cx - 350; f.x = f.cx - 8; f.cy = g.cy; f.y = f.cy - 12;
    player.minionTargetId = f.id;                      // 旧集火支（350<900）会追 F
    g.fixedUpdate(1, hooks);
    // ★BJ516③：Lerp(velocity, dir×min(18,dist), 0.1)（:46042）——静止首拍 vx=1.8
    //  （旧直写 5 速退役;dist=100>18 → num3=18）
    expect(g.vx).toBeCloseTo(1.8, 9);                  // 旧集火支：追 F(-350) = 负速 → 红
  });

  it('tag 桶摘除：近野生敌 100 右 / tag 敌 150 左 → 追近敌（旧 `tagged ?? best` 退化为红）', () => {
    const w = mkEnemy(63, 0, 0);
    const t = mkEnemy(64, 0, 0);
    const { hooks, player } = makeHooks([t, w]);
    player.whipBuffs[312] = 1;
    probeTagStack(player, [t.id]);
    const g = minion(player, 917, player.cx, player.cy - 40);
    w.cx = g.cx + 100; w.x = w.cx - 8; w.cy = g.cy; w.y = w.cy - 12;
    t.cx = g.cx - 150; t.x = t.cx - 8; t.cy = g.cy; t.y = t.cy - 12;
    g.fixedUpdate(1, hooks);
    // ★BJ516③：Lerp 曲线（:46042）——静止首拍 vx=1.8;旧桶：追 T(-150) = 负速 → 红
    expect(g.vx).toBeCloseTo(1.8, 9);
  });
});

// ============================================================
// ④ AI_156 面判别（946 棱镜：:52772 集火第一桶,本刀补支）
// ============================================================
describe('④ AI_156 面判别（tTarget 集火支 :52772-52793）', () => {
  it('集火优先：槽内敌 800（≤1000）压过近野生敌 300（旧无集火支退化为红）', () => {
    const w = mkEnemy(71, 0, 0);
    const f = mkEnemy(72, 0, 0);
    const { hooks, player } = makeHooks([f, w]);
    const g = minion(player, 946, player.cx + 100, player.cy - 30);
    (g as unknown as { tA0: number; tA1: number }).tA0 = 80;   // 攻击态失靶支（:52648 即查）
    (g as unknown as { tA0: number; tA1: number }).tA1 = 0;
    w.cx = player.cx + 300; w.x = w.cx - 8; w.cy = player.cy; w.y = w.cy - 12;
    f.cx = player.cx + 800; f.x = f.cx - 8; f.cy = player.cy; f.y = f.cy - 12;
    player.minionTargetId = f.id;
    g.fixedUpdate(1, hooks);
    expect((g as unknown as { tA1: number }).tA1).toBe(72);    // 旧：71（野生 W）→ 红
  });
});

// ============================================================
// ⑤ 963 阿比盖尔集火门距判别（:66410 num18=700×3=2100）
// ============================================================
describe('⑤ 963 集火门距判别（旧缺省 900 退化为红）', () => {
  it('槽内敌 1500（900 门外/2100 门内）→ 追敌向右（旧 900：tgt 空 → 悬停向左）', () => {
    const f = mkEnemy(81, 0, 0);
    const { hooks, player } = makeHooks([f]);
    player.facing = 1;
    const g = minion(player, 963, player.cx, player.cy);
    f.cx = g.cx + 1500; f.x = f.cx - 8; f.cy = g.cy; f.y = f.cy - 12;
    player.minionTargetId = f.id;
    g.fixedUpdate(1, hooks);
    expect(g.facing).toBe(1);                          // 旧 900：悬停支 facing=-1 → 红
  });
});
