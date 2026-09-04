// 红蓝对抗 R25（存量债清偿验证轮）回归：2026-08-24 蓝队修复批。
// 覆盖：①A10 statueMimic 掉落接通（StatueMimicItemDropRule.cs:15-37）
//       ②StormLightning AI_203 索敌槽序首中+盒最近点距（Projectile1458.cs:40397-40411）
//       ③E10 Chum 注册面/累进加成 + 鲨鱼 SharkSpawnChance 接线（ChumBucketProjectileHelper.cs
//         / NPC1458.cs:5558-5576 / Projectile1458.cs:20759-20770）+ E16 渔情四文本位接线
//       ④extract-recipes.mjs 强制门（stored-only>0 中止，--force/--out 豁免）
//       ⑤recon-item 免疫帧列闸门扩面（DRIFT=0 的数据侧锚）
//       ⑥room.ts msg32 上行槽位门 CHEST_MAX_ITEMS 对齐
//       ⑦HarpyCharm 音效段（ParticleOrchestrator1458.cs:477-504 Item_39/Item_20）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RNG } from '../src/core/rng';
import { resolveDrops, type NpcDropCtx } from '../src/drops/NpcDrops';
import { STATUES } from '../src/data/vanillaStyleDrops';
import {
  chumOnPreUpdateAll, chumReport, chumsInTile, chumSpots,
} from '../src/entities/chumBucket';
import { StormLightning } from '../src/entities/proj1457';
import { Arrow, harpyCharmEffect } from '../src/entities/Arrow';
import { TileStore } from '../src/world/TileStore';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const REPO = join(GAME, '..');

function mkCtx(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: new RNG(42),
    netId: 1, type: 1,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 1000, y: 1000,
    worldSurfaceTile: 200, rockLayerTile: 400, underworldTileY: 900,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 50, friendly: false, boss: false, damage: 10, value: 10,
    hp: 80, hpMax: 100, mana: 15, manaMax: 20,
    ...over,
  };
}

describe('R25-① A10 statueMimic 掉落接通', () => {
  // StatueStyleToItem 锚点档（WorldGen1458.cs:38319-38377；表=vanillaStyleDrops.STATUES）
  it('STATUES 83 档与 StatueStyleToItem 锚点逐值一致', () => {
    expect(STATUES.length).toBe(83);
    expect(STATUES[0]).toBe(360);    // case 0
    expect(STATUES[1]).toBe(52);     // case 1
    expect(STATUES[43]).toBe(1152);  // case 43
    expect(STATUES[49]).toBe(1462);  // case 49
    expect(STATUES[50]).toBe(2672);  // case 50
    expect(STATUES[62]).toBe(3662);  // 3651+62-51
    expect(STATUES[75]).toBe(3720);  // 3708+75-63
    expect(STATUES[76]).toBe(4397);  // case 76
    expect(STATUES[82]).toBe(5319);  // case 82（1.4.5 新鹦鹉）
    expect(STATUES[5]).toBe(441);    // default 档 438+style-2
  });

  function statueDropOf(ai1?: number): Array<{ id: number; n: number }> {
    const res = resolveDrops(mkCtx({ netId: 690, type: 690, ai1 }));
    return res.drops.filter((d) => (STATUES as readonly number[]).includes(d.id))
      .map((d) => ({ id: d.id, n: d.n }));
  }

  it('ai1=风格 id → 恰掉对应雕像物品 ×1（CanDrop ai1∈(0,6147)）', () => {
    expect(statueDropOf(5)).toEqual([{ id: 441, n: 1 }]);
    expect(statueDropOf(43)).toEqual([{ id: 1152, n: 1 }]);
    expect(statueDropOf(82)).toEqual([{ id: 5319, n: 1 }]);
  });

  it('ai1=0（未掷）/越界 → 无掉落（failedCond）', () => {
    expect(statueDropOf(0)).toEqual([]);
    expect(statueDropOf(undefined)).toEqual([]);
    expect(statueDropOf(7000)).toEqual([]);
  });
});

// ---- StormLightning 索敌 harness（batch-c-1457 同款最小桩）----
interface StubEnemy extends Record<string, unknown> {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  maxHp: number;
}
function mkEnemy(id: number, x: number, y: number, w = 16, h = 16): StubEnemy {
  const e = { id, x, y, w, h, dead: false, maxHp: 100 } as StubEnemy;
  Object.defineProperties(e, {
    cx: { get: () => e.x + e.w / 2 },
    cy: { get: () => e.y + e.h / 2 },
  });
  return e;
}

function slHooks(enemies: StubEnemy[]): unknown {
  return {
    world: { store: new TileStore(200, 160) },
    player: { cx: 800, cy: 1440, dead: false },
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
  };
}

function targetIdxOf(p: StormLightning): number {
  return (p as unknown as { targetIdx: number }).targetIdx;
}

describe('R25-② StormLightning AI_203 索敌（:40397-40411）', () => {
  // ★R34-② 勘误：1122 SetDefaults timeLeft=1（:10447）→ 出生首拍即 Kill，AI_203
  //   索敌/移动段对 1122 为死代码（仅 1117 与敌意 1091 消费）——索敌语义用例改用 1117。
  it('槽序首中：slot0 入圈即锁定，不再比 slot1 更近者（曾取最近者）', () => {
    const p = new StormLightning(1117, 800, 480, 100, 2);   // 构造器按中心定位：cx=800, cy=480
    const e0 = mkEnemy(0, 806, 474);                        // 盒距 6 ≤12（半径 1117 档）
    const e1 = mkEnemy(1, 798, 478);                        // 盒距 0（更近）
    p.fixedUpdate(1 / 60, slHooks([e0, e1]) as never);
    expect(targetIdxOf(p)).toBe(0);
  });

  it('盒最近点距：大体型敌中心距超半径、盒缘入圈仍锁定；全离圈不锁（曾用中心距）', () => {
    const big = mkEnemy(0, 840, 460, 200, 40);   // cx=940 中心距 120>12；左缘盒距 20>12 不锁
    const p1 = new StormLightning(1117, 820, 480, 100, 2);  // 1117 半径 12（1122 的 32 档随其首拍落雷退役）
    p1.fixedUpdate(1 / 60, slHooks([big]) as never);
    expect(targetIdxOf(p1)).toBe(-1);

    const near = mkEnemy(0, 826, 472);           // 盒距 ≤12 → 锁定
    const p2 = new StormLightning(1117, 820, 480, 100, 2);
    p2.fixedUpdate(1 / 60, slHooks([near]) as never);
    expect(targetIdxOf(p2)).toBe(0);

    const far = mkEnemy(0, 900, 460, 200, 40);   // 左缘盒距 80>12
    const p3 = new StormLightning(1117, 820, 480, 100, 2);
    p3.fixedUpdate(1 / 60, slHooks([far]) as never);
    expect(targetIdxOf(p3)).toBe(-1);
  });
});

describe('R25-③ E10 Chum 注册面 + 加成累进接线', () => {
  it('chumBucket 双缓冲帧语义：live 只在 OnPreUpdate 后可见，pending 帧清', () => {
    chumOnPreUpdateAll();                       // 对齐空基线
    expect(chumsInTile(50, 60)).toBe(0);
    chumReport(800, 968, 792, 950, 18, 20);     // tile(50,60)
    chumReport(808, 970, 800, 952, 18, 20);     // 同 tile 第二只
    chumReport(300, 300, 292, 290, 18, 20);     // tile(18,18)
    expect(chumsInTile(50, 60)).toBe(0);        // 未换帧前 live 不见 pending
    expect(chumSpots().length).toBe(3);
    chumOnPreUpdateAll();
    expect(chumsInTile(50, 60)).toBe(2);
    expect(chumsInTile(18, 18)).toBe(1);
    expect(chumSpots().length).toBe(0);         // 新帧矩形表重建
    chumReport(800, 968, 792, 950, 18, 20);
    chumOnPreUpdateAll();
    expect(chumsInTile(50, 60)).toBe(1);        // 上帧计数被新帧覆盖（swap+clear）
  });

  it('Bobber 计数源已切注册面：地面掉落物扫描路径移除、加成三段累进', () => {
    const src = readFileSync(join(GAME, 'src/entities/Bobber.ts'), 'utf8');
    expect(src).not.toContain("vi_4608_chum_bucket'");          // 反向错误路径已删
    expect(src).toContain('chums += chumsInTile(i, j);');        // :21722 逐水格累计
    expect(src).toContain('if (pond.chums > 0) level += 11;');
    expect(src).toContain('if (pond.chums > 1) level += 6;');
    expect(src).toContain('if (pond.chums > 2) level += 3;');
    expect(src).not.toContain("chums > 2 ? 11 : chums > 1 ? 6 : 3");  // 单档取一旧式绝迹
  });

  it('VanillaSpawner 鲨鱼支已接 SharkSpawnChance（canHit×chumSpots→2 否则 10）', () => {
    const src = readFileSync(join(GAME, 'src/world/spawn/VanillaSpawner.ts'), 'utf8');
    expect(src).toContain('let sharkChance = 10;');
    expect(src).toMatch(/for \(const s of chumSpots\(\)\)/);
    expect(src).toMatch(/canHit\(st, px1, py1, 1, 1, s\.x, s\.y, s\.w, s\.h\)/);
    expect(src).toMatch(/sharkChance = 2/);
  });

  it('E16 渔情文本四处接线 + l10n 官方键在库', () => {
    const src = readFileSync(join(GAME, 'src/entities/Bobber.ts'), 'utf8');
    for (const key of ['GameUI.NotEnoughWater', 'GameUI.FishingWarning',
      'GameUI.FishingPower', 'GameUI.FullFishingPower']) {
      expect(src).toContain(`Lang.text('${key}'`);
    }
    for (const lang of ['zh-Hans', 'en-US']) {
      const j = JSON.parse(readFileSync(join(GAME, `public/l10n/${lang}.json`), 'utf8'));
      expect(typeof j.GameUI.NotEnoughWater).toBe('string');
      expect(typeof j.GameUI.FishingPower).toBe('string');
      expect(typeof j.GameUI.FullFishingPower).toBe('string');
      expect(typeof j.GameUI.FishingWarning).toBe('string');
    }
  });
});

describe('R25-④ extract-recipes.mjs 强制门', () => {
  it('--out 对拍流不受限（正常产出）', () => {
    const r = spawnSync(process.execPath, ['tools/extract-recipes.mjs', '--out',
      '/tmp/redblue-r25-recipes.json'], { cwd: GAME, encoding: 'utf8', timeout: 60000 });
    expect(r.status).toBe(0);
  }, 70000);

  it('缺省裸跑写现库 → stored-only>0 中止 exit≠0 且现库不动', () => {
    const libPath = join(GAME, 'src/data/vanilla-recipes.json');
    const before = readFileSync(libPath, 'utf8');
    const r = spawnSync(process.execPath, ['tools/extract-recipes.mjs'],
      { cwd: GAME, encoding: 'utf8', timeout: 60000 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('强制门中止');
    expect(r.stderr).toMatch(/存量独有配方/);
    expect(readFileSync(libPath, 'utf8')).toBe(before);
  }, 70000);
});

describe('R25-⑤ recon-item 免疫帧列闸门扩面（数据侧锚）', () => {
  // 期望值=NON_LITERAL_57.proj 扩面钉值（Terarria1457/1458 双树 SetDefaults 核对一致）
  const LOCAL: Record<string, number> = {
    '639': -1, '932': 60, '1112': 9, '1115': -1, '1116': -1, '1118': 30, '1119': 30,
    '1120': 60, '1121': 60, '1125': -1, '1126': -1, '1127': -1, '1129': -1,
    '1130': -1, '1131': 60, '1132': 60,
  };
  const IDSTATIC: Record<string, number> = { '1122': 10, '1128': 30, '1134': 20, '1135': 10 };
  it('vanilla-projectiles.json 免疫帧列与钉值逐条一致（重跑提取器抹列即 DRIFT 爆红）', () => {
    const j = JSON.parse(readFileSync(join(GAME, 'src/data/vanilla-projectiles.json'), 'utf8'));
    for (const [id, v] of Object.entries(LOCAL)) {
      expect(j[id]?.localNPCHitCooldown).toBe(v);
    }
    for (const [id, v] of Object.entries(IDSTATIC)) {
      expect(j[id]?.idStaticNPCHitCooldown).toBe(v);
    }
  });
});

describe('R25-⑥ room.ts msg32 上行槽位门', () => {
  it('门随 CHEST_MAX_ITEMS=40 对齐，slot<10 硬编码绝迹', () => {
    const src = readFileSync(join(REPO, 'server/src/room.ts'), 'utf8');
    expect(src).toContain('slot < CHEST_MAX_ITEMS');
    expect(src).not.toContain('slot < 10 && itemId < ITEM_DEFS.length');
  });
});

describe('R25-⑦ HarpyCharm 音效段', () => {
  function charmRun(equip: Partial<{ accSeraphNecklace: boolean; hasPhoenixQuiver: boolean }>):
    Array<{ name: string; vol: number; x: number; y: number }> {
    const played: Array<{ name: string; vol: number; x: number; y: number }> = [];
    const arrow = new Arrow(900, 500, 3, 0, 10, 1, 1);   // 距玩家 cx=400 → d≈500 ∈[400,1200]
    arrow.nearestEnemyWithLos = (() => ({ cx: 1000, cy: 500 })) as typeof arrow.nearestEnemyWithLos;
    const game = {
      entities: { projectiles: [arrow] },
      playSfxWav: (name: string, vol: number, x: number, y: number) => { played.push({ name, vol, x, y }); },
    };
    const player = {
      cx: 400, cy: 500,
      equipStats: { accHarpyCharm: true, accSeraphNecklace: false, hasPhoenixQuiver: false, ...equip },
      accHarpyCharmCooldown: 0,
    };
    harpyCharmEffect(game as never, player as never);
    return played;
  }

  it('默认件 6166/6180 → Item_39 @弹体位置 vol1；6181 凤凰箭袋 → Item_20', () => {
    const base = charmRun({});
    expect(base).toHaveLength(1);
    expect(base[0].name).toBe('Item_39');
    expect(base[0].vol).toBe(1);
    const seraph = charmRun({ accSeraphNecklace: true });
    expect(seraph[0].name).toBe('Item_39');           // flag2 不换声（:481-485 仅换贴图）
    const phoenix = charmRun({ hasPhoenixQuiver: true });
    expect(phoenix[0].name).toBe('Item_20');          // flag=6181 → SoundID.Item20
  });

  // ★重产（2026-09-04）：音效资产管线整体 wav→opus/mp3 迁移（盘上 0 个 .wav、
  //   863 对 opus+mp3），Sfx 解析序改为 .opus 主 → .mp3 回退（src/core/Sfx.ts
  //   ensureBufferAsync 双格式回退段）——本仓消费链吃双格式，非资产缺口
  //   （asset-gap-report.md 原版音全量在库，无需登记）。oracle 改锁双格式在盘。
  it('两轨资产在盘（Sfx 双格式解析序 opus→mp3 对应双格式落盘）', () => {
    for (const name of ['Item_39', 'Item_20']) {
      for (const ext of ['opus', 'mp3'] as const) {
        expect(readFileSync(join(GAME, `public/sounds/${name}.${ext}`)).byteLength).toBeGreaterThan(0);
      }
    }
  });
});
