// ★BJ581（2026-10-09）苔藓黄蜂/黄蜂族镜像定谳——BJ584 用户补充面（用户最先复现的
// 就是「苔藓黄蜂」，BJ584 只裁了史莱姆全族，黄蜂族镜像面未核）。销案（无落刀）：
// 原版黄蜂族 = 【随面镜像族】，本仓已 1:1 同相——用户复报「反复镜像调转」= 原版本相
// （黄蜂悬停/折返飞行 vx 频繁变号，贴图随 vx 合法翻转；与史莱姆「从不镜像」族正交）。
//
// 定谳（Terarria1457 亲读，唯一标杆；Terarria1456 交叉参照）：
//  · id 勘误：苔藓黄蜂 = NPCID.MossHornet = 176（任务假设 280 无效；黄蜂 = Hornet = 42，
//    任务假设 210 实为 Bee）；Moth = 205；HornetFatty..Stingy = 231-235。变体
//    Tiny/Little/Big/Giant Moss Hornet = netId -18..-21（NetIdMap[17..20] 全 176）。
//  · 唯一 spriteDirection 写面 = AI_005（NPC.cs:51186-51189）：
//    `spriteDirection = ((velocity.X > 0f) ? 1 : (-1))`（★1457 三元 = vx==0 强制 -1；
//    1456 同支 :51031-51042 为 if/if 死区档 = vx==0 保前值——本仓按 1457 三元落）
//    + `rotation = velocity.X * 0.1f`。FindFrame 黄蜂 case 组（42/231-235/205/176，
//    :75705-75753）零写点——AI 每 tick 随 vx 重写；渲染翻面门 Main.cs:23357-23361
//    `spriteDirection == 1 → FlipHorizontally`（字段默认 -1 = 原生朝向）。
//  · 本仓同相三件套：swarmerAI `facing = vx > 0 ? 1 : -1`（Enemy.ts 朝向段）≙
//    spriteDirection；Renderer tiltOnly5 出 rotationDriven（禁双翻）+ rotate(vx*0.1)
//    + 通用门 `e.facing > 0 → scale(-1,1)` ≙ sdir==1 翻。极性/节拍全等 → 销案。
//  · 同域普查（登记不落刀，勿在本案强扩）：
//    - 蜜蜂 210/211：原版 FindFrame case 210/211（:75652-75658）写 sdir【死区档】
//      （vx==0 保前值）+ rotation vx*0.2——本仓 swarmerAI/findFrameRotation 均无蜂
//      facing 写点 → facing 恒默认 1 = 恒镜像面（真缺面，另立刀）。
//    - FindFrame 死区写点大案组 = case 48/49/51/60/82/93/137/182/210/211/253/316/
//      634/662/664（Harpy/CaveBat/JungleBat/Hellbat/Wraith/GiantBat/IlluminantBat/
//      FloatyGross/Bee/Reaper/Ghost/SporeBat/PirateGhost/TorchGod）——BJ584 已登记的
//      「地狱蝠族债」扩名至此（同款死区档：vx==0 保前值）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seededRandom, BATTERY_SEED } from './seeded-rng';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { NET_ID_MAP } from '../src/world/spawn/VanillaSpawner';
import { Renderer } from '../src/render/Renderer';
import type { GameHooks } from '../src/entities/types';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');
const spawnerSrc = readFileSync(join(ROOT, 'src/world/spawn/VanillaSpawner.ts'), 'utf8');
const npc1457 = readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8');
const npc1456 = readFileSync(join(ROOT, '../Terarria1456/Terraria/NPC.cs'), 'utf8');
const npcids = readFileSync(join(ROOT, '../Terarria1457/Terraria.ID/NPCID.cs'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');

const HORNET_FAMILY = [42, 176, 205, 231, 232, 233, 234, 235];

// ---------------------------------------------------------------------------
// 原版活体锚（Terarria1457 源码直读，原版语义漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ581 原版黄蜂族「随面镜像」活体锚', () => {
  it('id 勘误钉值：MossHornet=176（非 280）/Hornet=42（210=Bee）/Moth=205/231-235', () => {
    expect(npcids).toContain('public const short Hornet = 42;');
    expect(npcids).toContain('public const short MossHornet = 176;');
    expect(npcids).toContain('public const short Bee = 210;');
    expect(npcids).toContain('public const short Moth = 205;');
    for (const [n, id] of [['HornetFatty', 231], ['HornetHoney', 232], ['HornetLeafy', 233],
      ['HornetSpikey', 234], ['HornetStingy', 235]] as const) {
      expect(npcids).toContain(`public const short ${n} = ${id};`);
    }
    // 名称表（LegacyNameToIdMap 同表直读）
    expect(npcids).toContain('{ "Moss Hornet", 176 }');
    expect(npcids).toContain('{ "Hornet", 42 }');
  });

  it('变体 netId -18..-21 全走基底 176（NetIdMap[17..20]，SetDefaultsFromNetId case 组）', () => {
    // NetIdMap 数组直读：index 17/18/19/20（0 基）= -18/-19/-20/-21 的基底
    const m = npcids.match(/private static readonly int\[\] NetIdMap = new int\[65\]\s*\{([^;]+)\};/);
    expect(m, 'NetIdMap 数组').toBeTruthy();
    const ids = (m![1].match(/\d+/g) ?? []).map(Number);
    expect(ids.length).toBe(65);
    expect([ids[17], ids[18], ids[19], ids[20]]).toEqual([176, 176, 176, 176]);
    // SetDefaultsFromNetId case -18..-21：SetDefaults_ForNetId(num,…,scale) —— num=FromNetId=176
    const sig = npc1457.indexOf('private void SetDefaultsFromNetId(int id');
    const body = npc1457.slice(sig, sig + 8000);
    expect(body).toMatch(/case -18:\s*SetDefaults_ForNetId\(num, spawnparams, 0\.8f\);/);
    expect(body).toMatch(/case -21:\s*SetDefaults_ForNetId\(num, spawnparams, 1\.2f\);/);
  });

  it('AI_005 黄蜂支 = 唯一写面，1457 三元式（vx==0 强制 -1），全文件唯一', () => {
    const ternary = 'spriteDirection = ((velocity.X > 0f) ? 1 : (-1));';
    expect(npc1457.split(ternary).length - 1, '三元写点全文件唯一').toBe(1);
    // 黄蜂支形貌：三元 + rotation=vx*0.1 同支
    const branch = /else if \(type == 42 \|\| type == 176 \|\| type == 205 \|\| \(type >= 231 && type <= 235\)\)\s*\{\s*spriteDirection = \(\(velocity\.X > 0f\) \? 1 : \(-1\)\);\s*rotation = velocity\.X \* 0\.1f;\s*\}/;
    expect(npc1457, 'AI_005 黄蜂支（1457 三元式）').toMatch(branch);
  });

  it('1456 交叉参照：同支为 if/if 死区档（vx==0 保前值）——本仓按 1457 三元落', () => {
    expect(npc1456).not.toContain('spriteDirection = ((velocity.X > 0f) ? 1 : (-1));');
    const branch = /else if \(type == 42 \|\| type == 176 \|\| type == 205 \|\| \(type >= 231 && type <= 235\)\)\s*\{\s*if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*rotation = velocity\.X \* 0\.1f;/;
    expect(npc1456, 'AI_005 黄蜂支（1456 死区档）').toMatch(branch);
  });

  it('FindFrame 黄蜂 case 组（42/231-235 + 205 + 176）零 spriteDirection 写点', () => {
    const start = npc1457.indexOf('case 42:\n\t\tcase 231:\n\t\tcase 232:');
    expect(start, 'FindFrame 黄蜂 case 组定位（唯一）').toBeGreaterThan(0);
    const end = npc1457.indexOf('case 43:', start);
    const body = npc1457.slice(start, end);
    expect(body).toContain('case 205:');
    expect(body).toContain('case 176:');
    expect((body.match(/spriteDirection\s*=/g) ?? []).length, '组体零写点').toBe(0);
  });

  it('DrawNPC 翻面门：spriteDirection == 1 → FlipHorizontally（默认 -1 = 原生朝向）', () => {
    const gate = 'SpriteEffects spriteEffects = SpriteEffects.None;\n\t\t'
      + 'if (rCurrentNPC.spriteDirection == 1)\n\t\t{\n\t\t\tspriteEffects = SpriteEffects.FlipHorizontally;\n\t\t}';
    expect(mainSrc.split(gate).length - 1, '翻面门唯一').toBe(1);
  });

  it('同域普查（登记不落刀）：FindFrame 死区写点大案组 15 型活体钉值', () => {
    const labels = ['48', '49', '51', '60', '82', '93', '137', '182', '210', '211',
      '253', '316', '634', '662', '664'];
    const start = npc1457.indexOf(`case ${labels[0]}:\n\t\tcase ${labels[1]}:\n\t\tcase ${labels[2]}:\n\t\tcase ${labels[3]}:\n\t\tcase ${labels[4]}:`);
    expect(start, '死区大案组定位').toBeGreaterThan(0);
    const head = npc1457.slice(start, start + 500);
    const got = (head.match(/case (\d+):/g) ?? []).map((s) => s.slice(5, -1));
    expect(got).toEqual(labels);
    // 死区档形貌（vx==0 保前值）+ 蜂 rotation vx*0.2 覆写
    const end = npc1457.indexOf('case 330:', start);
    const body = npc1457.slice(start, end);
    expect(body).toMatch(/if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}/);
    expect(body).toMatch(/rotation = velocity\.X \* 0\.2f;/);
  });
});

// ---------------------------------------------------------------------------
// 本仓销案锚（无落刀——已 1:1 同相；任何一侧漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ581 本仓同相销案锚', () => {
  it('swarmerAI 黄蜂 facing 写点 = 1457 三元同构 + rotation vx*0.1', () => {
    expect(enemySrc).toMatch(/\} else if \(isHornet \|\| vid === 205\) \{/);
    expect(enemySrc).toMatch(
      /this\.facing = this\.vx > 0 \? 1 : -1;\s*this\.visAngle = this\.vx \* 0\.1;/,
    );
  });

  it('Renderer tiltOnly5 含黄蜂全族（出 rotationDriven=不禁镜像）+ rotate(vx*0.1) 支', () => {
    expect(rendererSrc).toMatch(
      /const tiltOnly5 = stR === 5 && \(idR === 23 \|\| idR === 42 \|\| idR === 139 \|\| idR === 176 \|\| idR === 205\s*\|\| idR === 210 \|\| idR === 211 \|\| \(idR >= 231 && idR <= 235\)\);/,
    );
    expect(rendererSrc).toMatch(
      /if \(id5 === 42 \|\| id5 === 176 \|\| id5 === 205 \|\| \(id5 >= 231 && id5 <= 235\)\) ctx\.rotate\(e\.vx \* 0\.1\);/,
    );
  });

  it('通用 facing 镜像门原样（facing>0 → 翻，≙ 原版 sdir==1）——与 BJ584 锚互证', () => {
    // ★BJ588：门表新增 !ffSdirMirror 排除（FindFrame case 48..664 死区档 15 型族收编
    // = 独立 ffSdir 显示面, BatAI/ghostAI 的 facing=direction 不再代位显示面）——
    // 排除位插入在 !slimeNoMirror 之后,其余门序原样。
    expect(rendererSrc).toMatch(
      /if \(!rotationDriven && !slimeNoMirror && !ffSdirMirror && !owlMirror && !sdirNeg && !ravenMirror && !wormMirror && !snailMirror && !fairyMirror && !revFlipMirror && !eyeMirrorByVx && e\.facing > 0\) ctx\.scale\(-1, 1\);/,
    );
  });

  it('黄蜂族不入 SLIME_NO_MIRROR（BJ584「从不镜像」表与随面镜像族零交集）', () => {
    for (const id of HORNET_FAMILY) {
      expect(Renderer.SLIME_NO_MIRROR.has(id), `${id} 不入从不镜像表`).toBe(false);
    }
  });

  it('变体 -18..-21 → 基底 176（NET_ID_MAP，BJ337 行）→ tiltOnly5 经 id=176 同相', () => {
    for (const netId of [-18, -19, -20, -21]) {
      expect(NET_ID_MAP[netId]?.base, `${netId} 基底`).toBe(176);
    }
    expect(spawnerSrc).toMatch(/'-18': \{ base: 176, scale: 0\.8 \}, '-19': \{ base: 176, scale: 0\.9 \}/);
    expect(spawnerSrc).toMatch(/'-20': \{ base: 176, scale: 1\.1 \}, '-21': \{ base: 176, scale: 1\.2 \}/);
  });
});

// ---------------------------------------------------------------------------
// 行为级逐拍采样（苔藓黄蜂复报判别：镜像随 vx 变号 = 原版本相）
// 采样法：玩家钉同 8px 量化格（dist=0 → sx=vx 快照），脚本化 vx 逐拍驱动
// swarmerAI，读 facing（≙原版 spriteDirection）与 visAngle（≙原版 rotation=vx*0.1）。
// AI 内部摆动项/步进会在写点前微调 vx（与原版 cs:51062 摆动→:51186 写面同序），
// 而空域 moveAndCollide 零改速 → 写点后读回的 e.vx 即写面输入——facing ≡ sign(e.vx)
// 逐拍自洽 = 原版「sdir 随 vx 三元重写」的行为像。首拍脚本 vx=0 经摆动落到负半轴
// → facing=-1（与原版 tick1 同像：sway 先行、三元后写）。判别面：若本仓写点改
// 死区档/极性反/或被「从不镜像」表吞，本组逐拍自洽断言与源锚同时爆红。
// ---------------------------------------------------------------------------
function makeGame(): GameHooks {
  const world = new World(96, 48, 13, 'bj581-hornet');
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}
const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (g: GameHooks, p?: unknown) => void>)[fn];

/** 玩家钉同格（8px 量化 → dist=0）：cx 格 = floor(e.cx/8)*8 + 2（避免跨格漂移） */
function sameCellPlayer(e: Enemy): Record<string, unknown> {
  const cx = Math.floor(e.cx / 8) * 8 + 2;
  const cy = Math.floor(e.cy / 8) * 8;
  return { cx, cy, dead: false, stealth: 0, itemAnimTicks: 0, useTime: 0 };
}

describe('BJ581 行为级逐拍采样：苔藓黄蜂 176 / 黄蜂 42', () => {
  for (const vid of [176, 42]) {
    it(`vid ${vid}：vx 序列 [0,+0.5,-0.5] → facing 逐拍 ≡ sign(vx)（镜像变号 2 次）+ visAngle=vx*0.1`, () => {
      const game = makeGame();
      const e = Enemy.fromVanilla(vid, 40 * 16, 20 * 16);
      if (!e) throw new Error(`fromVanilla(${vid}) 失败`);
      const p = sameCellPlayer(e);
      const scripted = [0, 0.5, -0.5];
      const seen: number[] = [];
      for (const vx of scripted) {
        e.vx = vx;
        drive(e, 'swarmerAI').call(e, game, p);
        // 写点后读回的 vx = 写面输入（空域零改速）→ facing ≡ 1457 三元 sign(vx)
        expect(e.facing, `vx=${vx} 拍`).toBe(e.vx > 0 ? 1 : -1);
        // tilt 全等：rotation = vx*0.1（f32 域 ±1e-6）
        expect(e.visAngle).toBeCloseTo(e.vx * 0.1, 5);
        seen.push(e.facing);
      }
      // 复报判别：三拍采样镜像变号 2 次（-1→+1→-1）= 原版折返翻面 = 原版本相，
      // 非「从不镜像」族的零变号
      expect(seen).toEqual([-1, 1, -1]);
    });
  }
});
