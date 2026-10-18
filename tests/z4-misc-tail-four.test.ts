// ★Z4 清偿刀（2026-10-02,红蓝 D3/D4/D6/D7 揭出四件）判别面：
//   ①BJ426 载入侧 FitsItem 校验（D3 漏修#1）——原版 TELeashedEntityAnchorWithItem
//     .OnWorldLoaded（TELeashedEntityAnchorWithItem.cs:38-45）`!FitsItem(itemType) →
//     itemType=0` 在重生前清型;本仓 respawnAll 原只防实体错生不清记录槽 → 损坏/导入
//     档非风筝 vid 滞留 723 记录,取回/破坏可捞出走私件。落刀 = LeashedEntityManager
//     .respawnAll 补 1:1 门（FitsItem 判据:TEKiteAnchor.cs:46-49 = IsAKite[ItemID.cs:157]
//     ⇔ KITE_ITEM_PROJ 键域;TECritterAnchor.cs:48-51 = makeNPC>0 ⇔ ITEM_MAKE_NPC）。
//   ②BJ429 VoidLens 白化半项（D4 真漏修）——原版本体顶点色 = Lerp(光照,White,0.5)×
//     opacity（VoidLensHelper.cs:82-84 亲读）;BJ429 终态「白化项由世界层合成乘光承载」
//     判读不成立（×light 暗处→0,Lerp 半项暗处恒半亮）。落刀 = 世界层 ×light 基底 +
//     compositeLight 后 'lighter' 加性补差 0.5×(255−light)（applyMoonLordLightFloor
//     7b′ 同判例）——合成代数 light+0.5×(255−light) ≡ Lerp。纯算面 =
//     voidLensComplementTint;回放 = Renderer.flushVoidLensComplements（7b0 段）。
//   ③注释归一批（D4/D6）——BJ437 诚实注补记/BJ431「与 Item_3069 同图」勘误
//     （像素对拍:Projectile_954=40×40 md5 6ec57d61 vs Item_3069=28×28 md5 33e14b58,
//     C1′ 测试内 md5 实测双域资产,尺寸/md5 互异）/vanillaItemStats acc:0 R4 双旗归一/
//     行号漂移（火把史莱姆 AddBuff 实锚 NPC.cs:61442-61450;UpdateNPC_BuffApplyVFX 在
//     NPC.cs:92263 非 Main.cs）。
//   ④D7 被缚 TownNPC 落位横向偏移 +w/2——原版 SpawnNPC → NewNPC(X=num*16+8) 走
//     `Bottom=(X,Y)`（NPC.cs:81594）= 实体中心;TownNPC 构造器 x 参 = 左缘,直传
//     tile 中心+8 → 中心 = tile 中心 + w/2。落刀 = 构造后按实盒宽校正（bound + 骷髅商
//     两路,trySpawnEnemy 域 SpawnNPC 管线约定归一）。
// 变异证红（手工执行实录,各 1 发,cp+sha256 逐字节还原）:
//   M1 LeashedCritter.ts respawnAll 删 FitsItem 清槽支 → A3/A4/A5 红;
//   M2 VoidLens.ts voidLensComplementTint 系数 0.5→0 → B1/B2 红。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import { T } from '../src/data/tiles';
import { LeashedEntityManager, leashedAnchorFitsItem, KITE_ITEM_PROJ, ITEM_MAKE_NPC,
  LEASHED_KIND_KITE } from '../src/entities/LeashedCritter';
import { TownNPC } from '../src/entities/TownNPC';
import { leashedAnchorPlace, leashedAnchorBreakDrop, furnitureFromSave } from '../src/world/FurnitureItems';
import { applyLeashedRetrieve, internalIdOfVid } from '../src/net/leashedSync';
import { voidLensComplementTint } from '../src/render/VoidLens';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import type { LeashedEnv } from '../src/entities/LeashedCritter';
import type { FurnitureItemRecord } from '../src/world/FurnitureItems';
import type { LeashedRetrieveHost } from '../src/net/leashedSync';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457', 'terraria-assets'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = resolve(__dirname, '..');
const GAME = readFileSync(resolve(ROOT, 'src/core/Game.ts'), 'utf8');
const RENDERER = readFileSync(resolve(ROOT, 'src/render/Renderer.ts'), 'utf8');
const VLENS = readFileSync(resolve(ROOT, 'src/render/VoidLens.ts'), 'utf8');
const VANILLA_NPC = existsSync(resolve(ROOT, '../Terarria1457/Terraria/NPC.cs')) ? readFileSync(resolve(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const ANCHOR_WITH_ITEM = existsSync(resolve(ROOT, '../Terarria1457/Terraria.GameContent.Tile_Entities/TELeashedEntityAnchorWithItem.cs'))
  ? readFileSync(resolve(ROOT, '../Terarria1457/Terraria.GameContent.Tile_Entities/TELeashedEntityAnchorWithItem.cs'), 'utf8')
  : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const KITE_ANCHOR_CS = existsSync(resolve(ROOT, '../Terarria1457/Terraria.GameContent.Tile_Entities/TEKiteAnchor.cs'))
  ? readFileSync(resolve(ROOT, '../Terarria1457/Terraria.GameContent.Tile_Entities/TEKiteAnchor.cs'), 'utf8')
  : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const CRITTER_ANCHOR_CS = existsSync(resolve(ROOT, '../Terarria1457/Terraria.GameContent.Tile_Entities/TECritterAnchor.cs'))
  ? readFileSync(resolve(ROOT, '../Terarria1457/Terraria.GameContent.Tile_Entities/TECritterAnchor.cs'), 'utf8')
  : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

// 24 件风筝（ItemID.cs:157 IsAKite 布尔集逐值;与 q4-kite-critter-domain 同源）
const KITES = [4367, 4368, 4369, 4370, 4371, 4379,
  4610, 4611, 4612, 4613, 4648, 4649, 4650, 4651,
  4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684];

/** 内部 item id → 原版 vid（记录槽存内部 id;respawnAll resolveVid 注入,与生产同式） */
const vidOfInternal = (internalId: number): number => {
  const key = ITEM_DEFS[internalId]?.key;
  const m = /^vi_(\d+)_/.exec(key ?? '');
  return m ? Number(m[1]) : -1;
};

function groundWorld(w = 120, h = 80, groundY = 40): TileStore {
  const st = new TileStore(w, h);
  for (let x = 0; x < w; x++) {
    for (let y = groundY; y < h; y++) st.setTile(x, y, T.DIRT);
  }
  return st;
}

function mkManager(st: TileStore): LeashedEntityManager {
  const m = new LeashedEntityManager();
  m.attach({ store: st });
  return m;
}

function mkEnv(): LeashedEnv {
  return {
    timeForVisualEffects: 0, dayTime: true, remix: false, worldSurface: 100,
    windForVisuals: 0.5, cloudAlpha: 0, playerCx: -99999, playerCy: -99999,
    addLight: () => { },
  };
}

/** 走私件 = 天顶剑 4956（已收录 vanilla 物品、非风筝非捕获件——D3 走私面代表样本） */
const SMUGGLED_VID = 4956;
const smuggledIid = (): number => {
  const iid = internalIdOfVid(SMUGGLED_VID);
  expect(iid, '天顶剑 4956 已收录（走私样本前提）').toBeGreaterThan(0);
  return iid;
};

// ============================================================================
// ① BJ426 载入侧 FitsItem（D3 漏修#1）
// ============================================================================

describe.skipIf(EXT_MISSING)('Z4-① BJ426 载入侧 FitsItem（OnWorldLoaded 清型门）', () => {
  it('A1 原版源锁:OnWorldLoaded !FitsItem→itemType=0 + 两子类判据', () => {
    expect(ANCHOR_WITH_ITEM).toContain('public override void OnWorldLoaded()');
    expect(ANCHOR_WITH_ITEM).toContain('if (!FitsItem(itemType))');
    expect(ANCHOR_WITH_ITEM).toContain('itemType = 0;');
    expect(KITE_ANCHOR_CS).toContain('return ItemID.Sets.IsAKite[itemType];');
    expect(CRITTER_ANCHOR_CS).toContain('makeNPC > 0');
    // NewNPC Bottom 语义锚（④D7 同源）
    expect(VANILLA_NPC).toContain('nPC.Bottom = new Vector2(X, Y);');
  });

  it('A2 FitsItem 判据域:kite=IsAKite 24 件全过/非风筝全拒;critter=makeNPC 键域', () => {
    for (const vid of KITES) {
      expect(leashedAnchorFitsItem('kite_anchor', vid), `kite ${vid}`).toBe(true);
      expect(leashedAnchorFitsItem('critter_anchor', vid), `kite ${vid} 非捕获件`).toBe(false);
    }
    for (const vid of [SMUGGLED_VID, 3063, 75, 71, 2019]) {
      expect(leashedAnchorFitsItem('kite_anchor', vid), `非风筝 ${vid}`).toBe(false);
    }
    for (const vid of Object.keys(ITEM_MAKE_NPC).map(Number)) {
      expect(leashedAnchorFitsItem('critter_anchor', vid), `critter ${vid}`).toBe(true);
    }
    expect(leashedAnchorFitsItem('critter_anchor', SMUGGLED_VID)).toBe(false);
    // KITE_ITEM_PROJ 键域 ⟺ IsAKite 24 件（TEKiteAnchor.FitsItem 等价性）
    expect(Object.keys(KITE_ITEM_PROJ).map(Number).sort((a, b) => a - b))
      .toEqual([...KITES].sort((a, b) => a - b));
  });

  it('A3 损坏档载入:风筝桩走私件 → 槽清空+零实体（OnWorldLoaded 1:1）', () => {
    const st = groundWorld();
    const m = mkManager(st);
    const recs: FurnitureItemRecord[] = [
      { x: 50, y: 39, kind: 'kite_anchor', slots: [{ id: smuggledIid(), stack: 1 }] },
      { x: 55, y: 39, kind: 'kite_anchor', slots: [{ id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4379]!], stack: 1 }] },
    ];
    m.respawnAll(recs, vidOfInternal, mkEnv());
    // 走私桩:锚空（槽 null=原版 itemType=0 记录形态）+ 无风筝实体
    expect(recs[0].slots[0]).toBeNull();
    expect(m.kites).toHaveLength(1);                       // 合法桩照常重生
    expect(m.kites[0].ax).toBe(55);
    expect(m.kites[0].projType).toBe(771);
  });

  it('A4 损坏档载入:捕获桩走私件 → 槽清空+零实体', () => {
    const st = groundWorld();
    const m = mkManager(st);
    const recs: FurnitureItemRecord[] = [
      { x: 60, y: 39, kind: 'critter_anchor', slots: [{ id: smuggledIid(), stack: 1 }] },
      { x: 65, y: 39, kind: 'critter_anchor', slots: [{ id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2019]!], stack: 1 }] },
    ];
    m.respawnAll(recs, vidOfInternal, mkEnv());
    expect(recs[0].slots[0]).toBeNull();
    expect(m.critters).toHaveLength(1);
    expect(m.critters[0].ax).toBe(65);
    expect(m.critters[0].npcType).toBe(46);                // 兔 2019 → 46
  });

  it('A5 取回零产出:清型后取回 false/破坏零掉物（走私件不可捞出=D3 病灶闭合）', () => {
    const st = groundWorld();
    const m = mkManager(st);
    const recs: FurnitureItemRecord[] = [
      { x: 50, y: 39, kind: 'kite_anchor', slots: [{ id: smuggledIid(), stack: 1 }] },
    ];
    m.respawnAll(recs, vidOfInternal, mkEnv());
    expect(leashedAnchorBreakDrop(recs, 'kite_anchor', 50, 39)).toBeNull();
    let dropped = 0;
    const host: LeashedRetrieveHost = {
      records: recs,
      netIdsAt: (x, y) => m.netIdsAt(x, y),
      removeAt: (x, y) => m.removeAt(x, y),
      dropItem: () => { dropped++; },
      broadcastRemove: () => { },
      keyOf: (id) => ITEM_DEFS[id]?.key ?? '',
    };
    expect(applyLeashedRetrieve(host, 50, 39, LEASHED_KIND_KITE)).toBe(false);
    expect(dropped).toBe(0);                               // 零产出
    // 对照:合法记录取回照常掉物（门不误杀）
    leashedAnchorPlace(recs, 'kite_anchor', 51, 39, { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4367]!], stack: 1 });
    expect(applyLeashedRetrieve(host, 51, 39, LEASHED_KIND_KITE)).toBe(true);
    expect(dropped).toBe(1);
  });

  it('A6 非锚桩 kind 不入门（物品框挂件不被误清——vid<=0 同款保槽旧语义）', () => {
    const st = groundWorld();
    const m = mkManager(st);
    const recs: FurnitureItemRecord[] = [
      { x: 70, y: 39, kind: 'item_frame', slots: [{ id: smuggledIid(), stack: 1 }] },
    ];
    m.respawnAll(recs, vidOfInternal, mkEnv());
    expect(recs[0].slots[0]).not.toBeNull();               // 门不辖,槽位原样
    expect(m.kites).toHaveLength(0);
    expect(m.critters).toHaveLength(0);
  });

  it('A7 furnitureFromSave→respawnAll 全链:走私件在载入闸被清（稳定域同构）', () => {
    // SaveData.furniture → furnitureFromSave（稳定/内部 id 映射,方案 A 后 vanilla 域
    // 恒等——此链 = 自导入与存档载入共用的世界物化闸,respawnAll 前置）
    const st = groundWorld();
    const m = mkManager(st);
    const recs = furnitureFromSave(
      [{ x: 50, y: 39, kind: 'kite_anchor', slots: [{ id: internalIdOfVid(SMUGGLED_VID), stack: 1 }] }],
      (id) => id,
    );
    m.respawnAll(recs, vidOfInternal, mkEnv());
    expect(recs[0].slots[0]).toBeNull();
    expect(m.kites).toHaveLength(0);
  });
});

// ============================================================================
// ② BJ429 VoidLens 白化半项（D4 真漏修）
// ============================================================================

describe.skipIf(EXT_MISSING)('Z4-② BJ429 透镜白化补差（Lerp(光照,White,0.5) 半项）', () => {
  it('B1 合成代数恒等:基底 light + 补差 0.5×(255−light) ≡ Lerp(light,White,0.5)', () => {
    for (const l of [0, 1, 37, 64, 128, 200, 254, 255]) {
      const [tr] = voidLensComplementTint([l, l, l]);
      const total = l + tr;                                 // 世界层 ×light 基底 + 加性补差
      const vanilla = l + (255 - l) * 0.5;                  // XNA Lerp 精确值（f32 域）
      expect(Math.abs(total - vanilla), `l=${l}`).toBeLessThanOrEqual(1);
    }
  });

  it('B2 判别面:暗处透镜亮度 ≥50% 白化（light 0 → 补差每通道 128 ≥ 50% 白）', () => {
    const [cr, cg, cb] = voidLensComplementTint([0, 0, 0]);
    for (const c of [cr, cg, cb]) {
      expect(c).toBe(128);                                  // round(0.5×255)=128 ≥ 50.2% 白
      expect(c).toBeGreaterThanOrEqual(255 * 0.5);
    }
    // 半亮 128 → 补差 64 → 合成 192 = Lerp(128,255,0.5)=191.5 ✓ 逐档钉值
    expect(voidLensComplementTint([128, 128, 128])).toEqual([64, 64, 64]);
    // 全亮 → 零补差（flush 侧 cr+cg+cb===0 跳过 = 全亮零开销）
    expect(voidLensComplementTint([255, 255, 255])).toEqual([0, 0, 0]);
  });

  it('B3 Renderer 源锁:2c′.0 收集 → 7b0 段 compositeLight 后 lighter 回放', () => {
    // 收集位（本体画后入表）
    expect(RENDERER).toContain('this._voidLensComps.push({');
    // 回放位在 compositeLight 调用【之后】（同文件行序:compositeLight 行号 < flush 调用行号）
    const compLine = RENDERER.indexOf('this.compositeLight(cam, viewW, viewH,');
    const flushLine = RENDERER.indexOf('this.flushVoidLensComplements();');
    expect(compLine).toBeGreaterThan(0);
    expect(flushLine).toBeGreaterThan(compLine);
    // 回放实现:补差色纯算面 + 'lighter' + 全零跳过 + 表清空（防跨帧双份）
    expect(RENDERER).toContain('voidLensComplementTint([c.lr, c.lg, c.lb])');
    expect(RENDERER).toContain("ctx.globalCompositeOperation = 'lighter';\n        ctx.drawImage(scr, c.xd, c.yd);");
    expect(RENDERER).toContain('if (cr + cg + cb === 0) continue;');
    expect(RENDERER).toContain('comps.length = 0;');
    // 纯算面源锁:0.5 系数 + 255 补域
    expect(VLENS).toContain('0.5 * (255 - light[0])');
  });

  it('B4 旧判读勘误源锁:Renderer 不再声明「白化项由世界层合成乘光承载」', () => {
    expect(RENDERER).not.toContain('白化项由世界层合成乘光承载');
    expect(RENDERER).toContain('applyMoonLordLightFloor 同判例');
  });
});

// ============================================================================
// ③ 注释归一批（D4/D6）
// ============================================================================

describe.skipIf(EXT_MISSING)('Z4-③ 注释归一批', () => {
  it('C1 BJ431 勘误:954 ≠ Item_3069 同图（尺寸/md5 互异实测值入注;承重结论保留）', () => {
    const arrow = readFileSync(resolve(ROOT, 'src/entities/Arrow.ts'), 'utf8');
    // 旧不实表述移除（md5 6ec57d61 曾被标为「与 Item_3069 同图」的等值证）
    expect(arrow).not.toContain('与 Item_3069 同图,md5 6ec57d61');
    // 勘误注落地:两文件实测尺寸+md5 双锚 + 承重结论不变（恒隐链与贴图无涉）
    expect(arrow).toContain('40×40 md5 6ec57d61');
    expect(arrow).toContain('28×28 md5 33e14b58');
    expect(arrow).toContain('承重结论不变');
  });

  it('C1′ 像素对拍物证:双库资产尺寸/md5 实测（954=40×40/6ec57d61,3069=28×28/33e14b58）', () => {
    const hash = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
    const p954pub = resolve(ROOT, 'public/sprites/vanilla/Projectile_954.png');
    const p954src = resolve(ROOT, '../terraria-assets/Images/Projectile_954.png');
    const i3069src = resolve(ROOT, '../terraria-assets/Images/Item_3069.png');
    expect(hash(p954pub)).toBe('6ec57d610f8d6c31e968c1b39bdfd3bf');
    expect(hash(p954src)).toBe('6ec57d610f8d6c31e968c1b39bdfd3bf');   // 双库核等=954 本体
    expect(hash(i3069src)).toBe('33e14b587f6dc4abdc2de378fc1d146c');  // ≠ 954
  });

  it('C2 vanillaItemStats acc:0 R4 双旗归一（旧「无功能效果」注撤）', () => {
    const stats = readFileSync(resolve(ROOT, 'src/data/vanillaItemStats.ts'), 'utf8');
    expect(stats).not.toContain('0 社交配饰（vanity=true；无功能效果）');
    expect(stats).toContain('R4 双旗定谳归一');
    expect(stats).toContain('acc!==undefined');
  });

  it('C3 行号漂移:火把史莱姆 AddBuff 实锚 NPC.cs:61442-61450（旧 61239-61247 系染色块撞号）', () => {
    const enemy = readFileSync(resolve(ROOT, 'src/entities/Enemy.ts'), 'utf8');
    const scale = readFileSync(resolve(ROOT, 'src/stats/ScaleStats.ts'), 'utf8');
    expect(enemy).toContain('NPC.cs:61442-61450');
    expect(enemy).not.toContain(':61239-61247');
    expect(scale).not.toContain('（:6124 默认 true / :8423');
    // 原版亲读复核:AddBuff(24, 216000) 唯一处=61445（torch 块内）
    expect(VANILLA_NPC.split('AddBuff(24, 216000);')).toHaveLength(2);
  });

  it('C4 UpdateNPC_BuffApplyVFX 文件归属勘误:NPC.cs:92263 非 Main.cs（canDisplayBuffs 门 :92265）', () => {
    const enemy = readFileSync(resolve(ROOT, 'src/entities/Enemy.ts'), 'utf8');
    const scale = readFileSync(resolve(ROOT, 'src/stats/ScaleStats.ts'), 'utf8');
    expect(enemy).toContain('NPC.cs:92263');
    expect(scale).toContain('NPC.cs:92263,非 Main.cs');
    expect(scale).toContain(':92265');
    expect(enemy).not.toContain('UpdateNPC_BuffApplyVFX 鞭标闪电粒子（:92135）');
    // canDisplayBuffs 三锚勘误（decl :6206 / reset :8519 / 染色门 :92142+Main.cs:23170）
    expect(enemy).toContain('NPC.cs:6206');
    expect(enemy).toContain(':8519');
    expect(enemy).toContain('Main.cs:23170');
    expect(scale).toContain('NPC.cs:92142');
  });

  it('C5 BJ437「曾试重构已回退」诚实注落地（流程备案:定谳行为等价+逐字节回退+门结构维持）', () => {
    const enemy = readFileSync(resolve(ROOT, 'src/entities/Enemy.ts'), 'utf8');
    expect(enemy).toContain('★BJ437 流程备案（诚实注');
    expect(enemy).toContain('已逐字节回退');
    expect(enemy).toContain('豁免门结构维持蓝队 R1-10 原判');
  });
});

// ============================================================================
// ④ D7 被缚 TownNPC 落位横向对齐（+w/2 偏移）
// ============================================================================

describe.skipIf(EXT_MISSING)('Z4-④ D7 被缚 TownNPC 落位横向对齐', () => {
  it('D1 构造器语义实证:x 参=左缘直赋,w 按 SetDefaults 盒宽——直传 tile 中心+8 即 +w/2 漂移', () => {
    const spawnCenterPx = 42 * 16 + 8;                     // vanilla NewNPC X = tile 中心
    const tn = new TownNPC('stylist', spawnCenterPx, 40 * 16);
    expect(tn.w).toBe(18);                                 // 354 造型师 SetDefaults 盒宽
    expect(tn.x).toBe(spawnCenterPx);                      // 左缘=直传值（病灶形态）
    expect(tn.x + tn.w / 2).toBe(spawnCenterPx + 9);       // 中心 = tile 中心 + 9px
    tn.x -= tn.w / 2;                                      // ★落刀式:构造后按实盒宽校正
    expect(tn.x + tn.w / 2).toBe(spawnCenterPx);           // 中心 = tile 中心（=原版 Bottom.X）
  });

  it('D2 Game 源锁:被缚/骷髅商两路构造后均有 tn.x/sm.x 中心校正（SpawnNPC 管线归一）', () => {
    expect(GAME).toContain('new TownNPC(boundKey, vs.currentSpawnX * TILE + 8, vs.currentSpawnY * TILE);');
    expect(GAME).toContain('tn.x -= tn.w / 2;');
    expect(GAME).toContain("new TownNPC('skeleton_merchant', this.vanillaSpawner.currentSpawnX * TILE + 8");
    expect(GAME).toContain('sm.x -= sm.w / 2;');
    // 校正行必须紧跟对应构造行（出现序:bound 构造 < tn 校正 < 骷髅商构造 < sm 校正）
    const tnCtor = GAME.indexOf('new TownNPC(boundKey, vs.currentSpawnX * TILE + 8');
    const tnFix = GAME.indexOf('tn.x -= tn.w / 2;');
    const smCtor = GAME.indexOf("new TownNPC('skeleton_merchant'");
    const smFix = GAME.indexOf('sm.x -= sm.w / 2;');
    expect(tnFix).toBeGreaterThan(tnCtor);
    expect(smFix).toBeGreaterThan(smCtor);
  });

  it('D3 vanilla 源锁:NewNPC `Bottom=(X,Y)`（NPC.cs:81594）+ 骷髅商 spawn 调用形态', () => {
    expect(VANILLA_NPC).toContain('nPC.Bottom = new Vector2(X, Y);');
    expect(VANILLA_NPC).toContain('SpawnNPC(spawnTileX * 16 + 8, spawnTileY * 16, 453);');
  });
});
