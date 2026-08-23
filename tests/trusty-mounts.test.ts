// 1457 Trusty 坐骑 64/65（TrustyChillet/TrustyChilletIgnis）+ Palworld 未折算三项收口
// （docs/audit/item-audit-2026-08-22.md Palworld 回报段「vanilla-mounts.json 无 64/65 条,
// 坐骑本体未造」的清偿批）。标杆 = Terarria1457/（1456 无 Trusty 族,MountID.Count=64）：
//   ① 坐骑本体数据（MountID.cs:162/:164/:166 + Mount.cs:2567-2572 SetAsChillet
//      hardmode:true → :2682-2690 冲刺/跳档 + :2691-2756 帧组/偏移 + Extra[301]/[302]）
//   ② 物品 6150/6151（Item.cs:47385-47410 mountType=64/65,UseSound=PalSummon）——
//      ★任务面"6151/6152"为笔误：6152=DaybloomStaff（DaybloomStaff,非坐骑）,
//      TrustyChillet/Ignis 坐骑物品实为 6150/6151（ItemID.cs:13846/:13848 +
//      Mount.cs:6168-6171 cursorItemIconID 64→6150/65→6151 双确证）
//   ③ buff 391/392（BuffID.cs:152 MountType 尾段 `391,64,392,65`）→ BUFF_TO_MOUNT
//   ④ 62-65 家族行为（UpdateEffects :4862-4867 四系伤害 +0.1 / UpdateFrame :4208-4210
//      待机档 :4246-4251 打断 :4395-4411 扇翼 :4541-4545 盾冲帧 / SetMount :6349-6352
//      PalChillet / TryPettingMount :6137-6189 + PetMount Player.cs:33601-33619 PalChilletJoy）
//   ⑤ 帕鲁随从未折算两项接通：湿身 vy×2（Projectile.cs:51616-51619,1456 :51545）+
//      抚摸 Joy 音计时（:50053-50113 AI_067 / :59101-59131 AI_026）;ai[0]=3 帮工意图
//      （TryAssigningHelp :52208 依赖 IntentionGuesser）维持登记
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOUNT_DATA, MOUNT_NAMES, MOUNT_SETS, MOUNT_COUNT, MOUNT_TEXTURE_OK,
  mountOfItem, mountOfBuff, MountInstance,
  FRAME_STANDING,
  type MountedPlayerView,
} from '../src/entities/Mounts';
import { Player } from '../src/entities/Player';
import { MinionProj } from '../src/entities/MinionProj';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOUNTS_TS = readFileSync(join(ROOT, 'src/entities/Mounts.ts'), 'utf8');
const GAME_TS = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');

// ---------------------------------------------------------------------------
// ① 坐骑本体数据（Mount.cs SetAsChillet hardmode 支）
// ---------------------------------------------------------------------------
describe('① Trusty 坐骑 64/65 数据表（SetAsChillet hardmode:true）', () => {
  it('1457 hardmode 档：runSpeed 3/dashSpeed 9/acc 0.32/jumpHeight 11/jumpSpeed 8.1（:2682-2690）', () => {
    for (const id of ['64', '65']) {
      expect(MOUNT_DATA[id]).toMatchObject({
        runSpeed: 3, dashSpeed: 9, acceleration: 0.32, jumpHeight: 11, jumpSpeed: 8.1,
        fallDamage: 0.5, heightBoost: 4, flightTimeMax: 0, walkingGraceTimeMax: 10,
        spawnDust: 15, totalFrames: 13,
      });
      // 非 hardmode 支（1457 侧 62/63 的新档 6.5/6/8.01）不得混入
      expect(MOUNT_DATA[id].dashSpeed).not.toBe(6.5);
      expect(MOUNT_DATA[id].jumpHeight).not.toBe(6);
    }
  });
  it('62/63 非 hardmode 档（★1457 :2692-2698 SetAsChillet 增 hardmode 形参,普通支 dashSpeed 6.5/jumpHeight 6/jumpSpeed 8.01;V2b 复核补——旧表载 1456 单档 9/8）', () => {
    for (const id of ['62', '63']) {
      expect(MOUNT_DATA[id]).toMatchObject({
        dashSpeed: 6.5, jumpHeight: 6, jumpSpeed: 8.01, runSpeed: 3, acceleration: 0.32,
      });
    }
  });
  it('帧组/偏移与 62/63 同表（:2691-2756 ≡ 1456 助手段）+ buff 391/392', () => {
    expect(MOUNT_DATA['64']).toMatchObject({
      buff: 391, xOffset: 7, bodyFrame: 3, yOffset: -10, playerHeadOffset: 10,
      standingFrameCount: 4, runningFrameCount: 6, dashingFrameStart: 5,
      flyingFrameCount: 6, inAirFrameStart: 4, idleFrameCount: 4, idleFrameLoop: true,
    });
    expect(MOUNT_DATA['65']).toMatchObject({ buff: 392 });
    expect(MOUNT_DATA['64'].playerYOffsets).toEqual(MOUNT_DATA['62'].playerYOffsets);
    expect(MOUNT_DATA['64'].playerYOffsets).toEqual([10, 10, 10, 10, 12, 16, 12, 10, 12, 16, 16, 14, 10]);
  });
  it('名称/Count/能力位（MountID.cs:162/:164/:166 + :11 CanDash 62-65）', () => {
    expect(MOUNT_NAMES['64']).toBe('TrustyChillet');
    expect(MOUNT_NAMES['65']).toBe('TrustyChilletIgnis');
    expect(MOUNT_COUNT).toBe(66);
    expect(MOUNT_SETS.CanDash[62]).toBe(true);
    expect(MOUNT_SETS.CanDash[63]).toBe(true);
    expect(MOUNT_SETS.CanDash[64]).toBe(true);
    expect(MOUNT_SETS.CanDash[65]).toBe(true);
    expect(MOUNT_SETS.Cart[64]).toBe(false);
    expect(MOUNT_SETS.Cart[65]).toBe(false);
  });
  it('贴图与 62/63 共用 Extra_301/302.png（1457 :2752-2753 同下标）+ 缺图登记断言', () => {
    // 64/65 主贴图在盘（textureOk=true）——若未来素材丢失,提取器应登记 false 走色块近似
    expect(MOUNT_TEXTURE_OK['64']).toBe(true);
    expect(MOUNT_TEXTURE_OK['65']).toBe(true);
    expect(MOUNT_DATA['64'].backTexture).toBe('Extra_301.png');
    expect(MOUNT_DATA['65'].backTexture).toBe('Extra_302.png');
    expect(MOUNT_DATA['62'].backTexture).toBe('Extra_301.png');   // 与 64 共表
    expect(MOUNT_DATA['63'].backTexture).toBe('Extra_302.png');   // 与 65 共表
    expect(existsSync(join(ROOT, 'public/sprites/vanilla/Extra_301.png'))).toBe(true);
    expect(existsSync(join(ROOT, 'public/sprites/vanilla/Extra_302.png'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ② 物品 6150/6151 使用链（Item.cs:47385-47410）
// ---------------------------------------------------------------------------
describe('② 物品映射（mountType→SetMount 链入口）', () => {
  it('mountOfItem：6150→64 / 6151→65；6152=DaybloomStaff 非坐骑（-1）', () => {
    expect(mountOfItem(6150)).toBe(64);
    expect(mountOfItem(6151)).toBe(65);
    expect(mountOfItem(6152)).toBe(-1);
  });
  it('物品 def：useTime/useAnimation 20 + noUseGraphic（itemCombat 表）+ 注册键在盘', () => {
    expect(itemCombat(6150)).toMatchObject({ useTime: 20, useAnimation: 20, noMelee: true, noUseGraphic: true });
    expect(itemCombat(6151)).toMatchObject({ useTime: 20, useAnimation: 20 });
    expect(VANILLA_ITEM_KEY_BY_ID[6150]).toBe('vi_6150_PalworldMountTrustyChillet');
    expect(VANILLA_ITEM_KEY_BY_ID[6151]).toBe('vi_6151_PalworldMountTrustyChilletIgnis');
  });
  it('稀有度/价值已在盘（Item.cs:47386 Blue1/1 银 → rare 1/value 100 铜币口径）', () => {
    // rare/value 由 vanilla-itemrare/itemvalue.json 承载（extract-itemrare.mjs,
    // 1.4.4 铜币口径不含 ×5）——坐骑批只补 mountType 映射
    const rare = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemrare.json'), 'utf8'));
    const value = JSON.parse(readFileSync(join(ROOT, 'src/data/vanilla-itemvalue.json'), 'utf8'));
    expect([rare['6150'], value['6150']]).toEqual([1, 100]);   // Blue1 + sellPrice(0,0,1)
    expect([rare['6151'], value['6151']]).toEqual([5, 100]);   // Pink5 + sellPrice(0,0,1)
  });
});

// ---------------------------------------------------------------------------
// ③ buff 391/392 → BUFF_TO_MOUNT（BuffID.cs:152 尾段）+ 续期模型
// ---------------------------------------------------------------------------
describe('③ BUFF_TO_MOUNT {391:64, 392:65} 与 buffTime=10 续期模型', () => {
  it('mountOfBuff：391→64 / 392→65（UpdateBuffs MountType 分支消费的映射对）', () => {
    expect(mountOfBuff(391)).toBe(64);
    expect(mountOfBuff(392)).toBe(65);
    // 数据对自洽：data.buff ↔ BUFF_TO_MOUNT 往返（原版 :9968-9971 即按此对 SetMount）
    for (const id of ['64', '65']) {
      expect(mountOfBuff(MOUNT_DATA[id].buff)).toBe(Number(id));
    }
  });
  it('续期 10t 模型 = mount.active 单一真源（:9968-9971 SetMount+buffTime=10 / :6214 ClearBuff）', () => {
    // 原版：骑乘 buff 每 tick `SetMount+buffTime=10` 续期,掉 buff 即下坐;本仓以
    // active 常驻表达（Mounts.ts setMount 注）——锚注释在案,防回退成"无载体"
    expect(MOUNTS_TS).toContain('buffTime=10');
    expect(MOUNTS_TS).toContain(':9968-9971');
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    expect(p.mount.setMount(64, p)).toBe(true);    // 上骑 ≡ buff 391 落槽常驻
    expect(p.mount.active).toBe(true);
    expect(p.ridingMount).toBe(true);
    p.mount.dismount(p);                            // 下坐 ≡ ClearBuff(:6214)
    expect(p.mount.active).toBe(false);
    expect(p.ridingMount).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ④ 62-65 家族行为（伤害/帧/音效）
// ---------------------------------------------------------------------------
const view = (over: Partial<MountedPlayerView> = {}): MountedPlayerView => ({
  x: 100, y: 100, w: 20, h: 42, vx: 0, vy: 0,
  onGround: true, inWater: false, facing: 1,
  inputX: 0, inputJump: false, inputUp: false, inputDown: false,
  prevInputJump: false, gravDir: 1, store: null, ...over,
});

describe('④ 62-65 家族行为', () => {
  it('四系伤害 +10%（UpdateEffects :4862-4867）：骑 64 时 melee/summon 乘区 1.1', () => {
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    expect(p.damageMult('melee')).toBe(1);                       // 基线无加成
    expect(p.mount.setMount(64, p)).toBe(true);
    expect(p.damageMult('melee')).toBeCloseTo(1.1);
    expect(p.damageMult('ranged')).toBeCloseTo(1.1);
    expect(p.damageMult('magic')).toBeCloseTo(1.1);
    expect(p.damageMult('summon')).toBeCloseTo(1.1);
    p.mount.dismount(p);
    expect(p.damageMult('melee')).toBe(1);
  });
  it('上骑音 PalChillet（SetMount :6349-6352）：62-65 播,族外不播', () => {
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    const tracks: string[] = [];
    const game = { spawnParticles: () => {}, playSfxFiles: (f: string | string[]) => {
      for (const t of Array.isArray(f) ? f : [f]) tracks.push(t);
    } };
    const m = new MountInstance();
    m.setMount(64, p, game);
    expect(tracks).toContain('pal_chillet');
    tracks.length = 0;
    m.reset();
    m.setMount(10, p, game);                                     // 独角兽族外
    expect(tracks).not.toContain('pal_chillet');
  });
  it('盾冲帧（:4541-4545）：dashDelay ∈ [-5,-1] → 帧 5,出窗还原', () => {
    const p = view();
    const m = new MountInstance();
    m.setMount(64, p);
    m.updateFrame(p, FRAME_STANDING, 0, 0);
    expect(m.frame).not.toBe(5);                                 // 静立帧组
    p.dashDelay = -1;
    m.updateFrame(p, FRAME_STANDING, 0, 0);
    expect(m.frame).toBe(5);
    p.dashDelay = -5;
    m.updateFrame(p, FRAME_STANDING, 0, 0);
    expect(m.frame).toBe(5);
    p.dashDelay = -6;                                            // 滑行结束
    m.updateFrame(p, FRAME_STANDING, 0, 0);
    expect(m.frame).not.toBe(5);
  });
  it('空中扇翼保持（:4395-4411）：入空中帧钳 inAirFrameStart=4,计数钉 6 档', () => {
    const p = view({ vy: 1 });
    const m = new MountInstance();
    m.setMount(64, p);
    m.updateFrame(p, 2 /* FRAME_IN_AIR */, 0, 1);
    expect(m.frame).toBe(4);                                     // inAirFrameStart
    expect((m as unknown as { frameCounter: number }).frameCounter).toBe(6); // 钉档（扇翼支稳态）
  });
  it('待机打断（:4246-4251）：idle 循环回卷时 1/20 概率提前回站立首帧——分支在案', () => {
    expect(MOUNTS_TS).toContain('4246-4251');
    expect(MOUNTS_TS).toContain('idleFrameLoop');                // 64/65 数据侧 loop=true
  });
});

// ---------------------------------------------------------------------------
// ⑤ 坐骑抚摸（TryPettingMount :6137-6166 + PetMount Player.cs:33601-33620）
// ---------------------------------------------------------------------------
describe('⑤ 坐骑抚摸支（62-65 骑乘中右键）', () => {
  it('petMount toggle（:33603-33606）：进→mount 态,再点停', () => {
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    expect(p.petMount()).toBe(true);
    expect(p.petting.isPetting).toBe(true);
    expect(p.petting.mount).toBe(true);
    expect(p.petting.isPetSmall).toBe(false);                    // isPetSmall:false（:6186）
    expect(p.petMount()).toBe(false);                            // 二次 = Stop
    expect(p.petting.isPetting).toBe(false);
    expect(p.petting.mount).toBe(false);
  });
  it('下坐即停抚摸（Dismount :6229-6231）：tryDismountMount/强制下坐两路都清', () => {
    expect(GAME_TS).toContain('Mount.Dismount :6229-6231');
    expect(GAME_TS).toContain('pal_chillet_joy');                // PetMount :33615-33618 音
    expect(GAME_TS).toContain('handleSpecialEvent(21');          // 成就 21（:33612）
  });
});

// ---------------------------------------------------------------------------
// ⑥ 帕鲁随从未折算两项：湿身 vy×2 + 抚摸 Joy 计时
// ---------------------------------------------------------------------------
const W = 200, H = 120;
function makeStore(wet: boolean): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  if (wet) for (let x = 0; x < W; x++) for (let y = 96; y < 100; y++) store.setLiquid(x, y, 255, 1);
  return store;
}
const mkEnemy = (id: number, cx: number, cy: number) => {
  const e = { id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false, cx, cy, hp: 100000,
    hurt: (d: number) => { e.hp -= d; return true; } };
  return e;
};
function makeHooks(enemies: unknown[] = [], wet = false) {
  const store = makeStore(wet);
  const pl = new Player(60 * 16, 90 * 16, new Inventory());
  const sfx: string[] = [];
  const projectiles: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: pl as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (tracks: string | string[]) => {
      for (const t of Array.isArray(tracks) ? tracks : [tracks]) sfx.push(t);
    },
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { projectiles.push(e); },
    projectiles,
  };
  return { hooks, store, player: pl, sfx };
}

describe('⑥ 湿身 vy×2（Projectile.cs:51616-51619,1456 :51545）', () => {
  // 敌在上方 50px → 高出差表 vy=-6（:51492-51527 d<60 档）；wet 支翻倍 → -12
  const jumpVy = (wet: boolean): number => {
    const { hooks, player } = makeHooks([mkEnemy(1, 60 * 16, 100 * 16 - 62)], wet);
    const m = new MinionProj(60 * 16, 100 * 16 - 16, 1112, 10, 2, false, 0, false, () => player);
    m.fixedUpdate(1, hooks);
    return (m as unknown as { vy: number }).vy;
  };
  it('水中贴地起跳速度翻倍（-6 → -12）,干地不翻', () => {
    const dry = Math.abs(jumpVy(false));
    const wetV = Math.abs(jumpVy(true));
    expect(dry).toBeGreaterThan(0);
    expect(wetV).toBeCloseTo(dry * 2);
  });
  it('门 num62 恒真备案在案（:51509 贴地段 vy==0 → 第二因子钳 0）', () => {
    expect(readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8')).toContain('num62');
  });
});

describe('⑦ 抚摸 Joy 音计时（:50053-50113 AI_067 / :59101-59131 AI_026）', () => {
  it('1112 被摸 → pal_cattiva_joy 0.35 + 60t 计时;抚摸中钉 1 不重触发', () => {
    const { hooks, player, sfx } = makeHooks();
    const m = new MinionProj(60 * 16, 90 * 16 - 40, 1112, 10, 2, false, 0, false, () => player);
    player.petting.isPetting = true;
    m.beingPetted = true;
    m.fixedUpdate(1, hooks);
    expect(sfx.filter((t) => t === 'pal_cattiva_joy')).toHaveLength(1);
    // 触发拍内置 60 后同拍递减（原版 :50106-50113 同序：置 60 → `>1` 减 → 59）
    expect((m as unknown as { palJoyCd: number }).palJoyCd).toBe(59);
    for (let k = 0; k < 100; k++) m.fixedUpdate(1, hooks);   // 抚摸持续：钉 1,一声一会话
    expect(sfx.filter((t) => t === 'pal_cattiva_joy')).toHaveLength(1);
    expect((m as unknown as { palJoyCd: number }).palJoyCd).toBe(1);
  });
  it('停摸放空后再摸重触发；1118 只计时无音;1094/1113 走 pal_foxparks_joy', () => {
    const { hooks, player, sfx } = makeHooks();
    const m8 = new MinionProj(60 * 16, 90 * 16 - 40, 1118, 10, 2, false, 0, false, () => player);
    player.petting.isPetting = true;
    m8.beingPetted = true;
    m8.fixedUpdate(1, hooks);
    expect((m8 as unknown as { palJoyCd: number }).palJoyCd).toBe(59);
    expect(sfx).not.toContain('pal_cattiva_joy');                // flag9 支无音（:50066-50070）
    player.petting.isPetting = false;                            // 停摸 → 放空
    for (let k = 0; k < 61; k++) m8.fixedUpdate(1, hooks);
    expect((m8 as unknown as { palJoyCd: number }).palJoyCd).toBe(0);
    player.petting.isPetting = true;
    m8.fixedUpdate(1, hooks);                                    // 重触发（仍无音）
    expect((m8 as unknown as { palJoyCd: number }).palJoyCd).toBe(59);

    const m4 = new MinionProj(60 * 16, 90 * 16 - 40, 1113, 10, 2, false, 0, false, () => player);
    m4.beingPetted = true;
    m4.fixedUpdate(1, hooks);
    expect(sfx).toContain('pal_foxparks_joy');                   // AI_026 flag8 支（:59122-59131）
  });
  it('抚摸白名单：帕鲁随从五件入表（GetPettingInfo :39545-39563）', () => {
    // ★2026-08-23 内容缺口批：+1098/1123 钻地龟（:39552-39555 isPetSmall+num2=48）
    expect(GAME_TS).toContain('PALPETTABLE_MINIONS = new Set([1093, 1112, 1118, 1094, 1113, 1098, 1123])');
  });
});

// ---------------------------------------------------------------------------
// ⑧ ai[0]=3 帮工意图——维持登记（IntentionGuesser 本仓无,勿造系统）
// ---------------------------------------------------------------------------
describe('⑧ ai[0]=3 帮工意图维持登记（TryAssigningHelp :52208）', () => {
  it('本仓无 IntentionGuesser 系统（grep 零命中）+ 登记注释在案', () => {
    expect(GAME_TS.includes('IntentionGuesser')).toBe(false);
    const minionTs = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');
    expect(minionTs).toContain('IntentionGuesser');
    expect(minionTs).toContain('TryAssigningHelp :52208');
    expect(minionTs).not.toMatch(/ai\[0\] = 3|palA0 = 3/);        // 帮工态未折算
  });
});
