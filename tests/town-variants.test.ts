// 城镇 NPC 贴图变体三件套回归：
// ① 微光态切表（TownNPCProfiles.cs:19-181 + Profiles.cs GetTextureNPCShouldUse，
//    DrawNPCCheckAlt Main.cs:22304-22309）——29 只微光变体全命中 + 派对/狼人 alt；
// ② 动物学家狼人态（ShouldBestiaryGirlBeLycantrope NPC.cs:94961-94972 +
//    UpdateAltTexture :91254-91273）；
// ③ 小动物笼族 tile 识别（TileID.Sets.CritterCageLidStyle TileID.cs:199 +
//    GetTileDrawData 帧带 TileDrawing.cs:5730-5974）。
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  TOWN_NPC_PROFILE, townNpcProfileSheet, shouldBestiaryGirlBeLycantrope, townNpcAltTexture,
} from '../src/data/townNpcProfiles';
import { TownNPC } from '../src/entities/TownNPC';
import shimmerJson from '../src/data/vanilla-shimmer.json';
import { TILE_DEFS } from '../src/data/tiles';
import { CAGE_FAMILY, cageFamilyOf, cageLidStyle, cageSlot, cageFrameRow, CAGE_FRAMES } from '../src/render/CritterCage';
import { DRAW_Y_OFFSET } from '../src/render/VanillaTiler';

const SPRITES = join(__dirname, '..', 'public', 'sprites', 'vanilla');
const fileExists = (rel: string) => existsSync(join(SPRITES, rel.replace(/^vanilla\//, '')));

/** vanilla-shimmer.json npcTownTransform = NPCID.Sets.ShimmerTownTransform（29 条） */
const TOWN_SHIMMER_IDS = (shimmerJson as { npcTownTransform: number[] }).npcTownTransform;

describe('① 城镇 NPC 微光/派对/狼人切表（TownNPCProfiles）', () => {
  it('档案表覆盖全部 29 只微光变体 + slime 八只（共 37 档案）', () => {
    for (const id of TOWN_SHIMMER_IDS) {
      expect(TOWN_NPC_PROFILE[id], `id ${id} 应有档案`).toBeDefined();
    }
    expect(Object.keys(TOWN_NPC_PROFILE)).toHaveLength(37);
  });

  it('微光态（variant=1）→ Shimmered_{Name}_Default 且素材在库（29/29 全命中）', () => {
    expect(TOWN_SHIMMER_IDS).toHaveLength(29);
    for (const id of TOWN_SHIMMER_IDS) {
      const sheet = townNpcProfileSheet(id, 1, 0)!;
      expect(sheet.startsWith('vanilla/Shimmered_'), `${id}: ${sheet}`).toBe(true);
      expect(fileExists(sheet), `缺素材 ${sheet}`).toBe(true);
    }
  });

  it('常态（variant=0）→ {Name}_Default 且素材在库（37/37 全命中）', () => {
    for (const id of Object.keys(TOWN_NPC_PROFILE).map(Number)) {
      const sheet = townNpcProfileSheet(id, 0, 0)!;
      expect(sheet.startsWith('vanilla/Shimmered_'), `${id} 不该是微光档`).toBe(false);
      expect(fileExists(sheet), `缺素材 ${sheet}`).toBe(true);
    }
  });

  it('派对 alt=1：uniquePartyTexture=true 才指 _Party，且 _Party 素材真实存在', () => {
    for (const [idStr, p] of Object.entries(TOWN_NPC_PROFILE)) {
      const id = Number(idStr);
      const sheet = townNpcProfileSheet(id, 0, 1)!;
      if (p.party) {
        expect(sheet.endsWith('_Default_Party.png'), `${id}: ${sheet}`).toBe(true);
        expect(fileExists(sheet), `缺素材 ${sheet}`).toBe(true);
      } else {
        // 无 _Party 贴图 → 回落 _Default（LegacyNPCProfile _defaultParty=_defaultNoAlt）
        expect(sheet.endsWith('_Default.png'), `${id}: ${sheet}`).toBe(true);
        expect(sheet.includes('_Party'), `${id}: 不该有 _Party`).toBe(false);
      }
      // 微光档同理（slime 无微光档，shimmerParty 恒 false 已在表内钉死）
      const shimmerSheet = townNpcProfileSheet(id, 1, 1)!;
      if (!p.shimmer) {
        // 裸 LegacyNPCProfile（slime 族）：不看 townNpcVariationIndex，恒常态档
        expect(shimmerSheet.startsWith('vanilla/Shimmered_'), `${id}: ${shimmerSheet}`).toBe(false);
        expect(fileExists(shimmerSheet), `${shimmerSheet}`).toBe(true);
      } else if (p.shimmerParty) {
        expect(shimmerSheet.endsWith('_Party.png'), `${id}: ${shimmerSheet}`).toBe(true);
        expect(fileExists(shimmerSheet), `缺素材 ${shimmerSheet}`).toBe(true);
      } else {
        // 注意用 endsWith：PartyGirl 等档案名本身含 "Party" 子串
        expect(shimmerSheet.endsWith('_Default_Party.png'), `${id}: 不该有微光 _Party`).toBe(false);
      }
    }
  });

  it('633 狼人 alt=2 → _Default_Transformed（常态/微光两档素材都在库）', () => {
    expect(townNpcProfileSheet(633, 0, 2)).toBe('vanilla/BestiaryGirl_Default_Transformed.png');
    expect(townNpcProfileSheet(633, 1, 2)).toBe('vanilla/Shimmered_BestiaryGirl_Default_Transformed.png');
    expect(fileExists('vanilla/BestiaryGirl_Default_Transformed.png')).toBe(true);
    expect(fileExists('vanilla/Shimmered_BestiaryGirl_Default_Transformed.png')).toBe(true);
    // 非 Transformable 档案 alt=2 回落 _Default（原版 LegacyNPCProfile 无 alt==2 分支）
    expect(townNpcProfileSheet(22, 0, 2)).toBe('vanilla/Guide_Default.png');
  });

  it('宠物三只/未知类型无档案 → null（渲染端回落 NPC_{id} 竖条）', () => {
    for (const id of [637, 638, 656, 999]) {
      expect(townNpcProfileSheet(id, 0, 0), `id ${id}`).toBeNull();
    }
  });

  it('TownNPC.townSheet getter：微光 flag → 微光档；altTexture → 派对/狼人', () => {
    const guide = new TownNPC('guide', 0, 0);
    expect(guide.shimmered).toBe(false);
    expect(guide.townSheet).toBe('vanilla/Guide_Default.png');
    guide.altTexture = 1;
    expect(guide.townSheet).toBe('vanilla/Guide_Default.png');   // Guide 无 _Party（TownNPCProfiles.cs:23）
    guide.shimmered = true;
    expect(guide.townSheet).toBe('vanilla/Shimmered_Guide_Default.png');

    const merch = new TownNPC('merchant', 0, 0);
    merch.altTexture = 1;
    expect(merch.townSheet).toBe('vanilla/Merchant_Default_Party.png');
    merch.shimmered = true;
    expect(merch.townSheet).toBe('vanilla/Shimmered_Merchant_Default_Party.png');

    const zoo = new TownNPC('zoologist', 0, 0);
    zoo.altTexture = 2;
    expect(zoo.townSheet).toBe('vanilla/BestiaryGirl_Default_Transformed.png');
    zoo.shimmered = true;
    expect(zoo.townSheet).toBe('vanilla/Shimmered_BestiaryGirl_Default_Transformed.png');
  });
});

describe('② 动物学家狼人条件（NPC.cs:94961-94972）', () => {
  it('条件表：血月夜 / 满月夜 变身，白天与其余月相不变', () => {
    const F = shouldBestiaryGirlBeLycantrope;
    // 血月
    expect(F(0, true, false)).toBe(true);    // 血月夜
    expect(F(4, true, false)).toBe(true);    // 血月夜任意月相
    expect(F(0, true, true)).toBe(false);    // 血月白天（:94963 !bloodMoon||dayTime 入内层）
    // 满月 moonPhase==0
    expect(F(0, false, false)).toBe(true);   // 满月夜
    expect(F(0, false, true)).toBe(false);   // 满月白天
    // 其余
    expect(F(1, false, false)).toBe(false);
    expect(F(4, false, false)).toBe(false);  // 新月夜
    expect(F(7, false, false)).toBe(false);
  });

  it('townNpcAltTexture（UpdateAltTexture :91254-91273）：派对=1；441/453/633 强制不参派；633 狼人=2', () => {
    const A = townNpcAltTexture;
    expect(A(17, true, 4, false, true)).toBe(1);    // 商人：派对白天
    expect(A(17, false, 4, false, false)).toBe(0);
    expect(A(441, true, 4, false, true)).toBe(0);   // 税收官强制不参派（:91261）
    expect(A(453, true, 4, false, true)).toBe(0);   // 骷髅商
    expect(A(633, true, 4, false, true)).toBe(0);   // 动物学家强制不参派
    expect(A(633, false, 0, false, false)).toBe(2); // 满月夜 → 狼人
    expect(A(633, false, 0, false, true)).toBe(0);  // 满月白天
    expect(A(633, true, 0, false, false)).toBe(2);  // 派对被强制关，狼人仍胜出
    expect(A(22, true, 0, true, false)).toBe(1);    // 血月白天仍是"派对"（血月不禁派对）
  });
});

describe('③ 小动物笼族 tile 识别（TileID.cs:199 + TileDrawing.cs:5730-5974）', () => {
  /** tiles.ts 全部 cage 键 → vanilla sheet id */
  const cageSheets = [...new Set(
    TILE_DEFS.filter((d) => d.key.includes('cage') && d.vanilla).map((d) => d.vanilla!.sheet),
  )].sort((a, b) => a - b);

  it('tiles.ts 的全部笼族 sheet 都在 CAGE_FAMILY（无漏登记）', () => {
    expect(cageSheets.length).toBeGreaterThan(60);
    for (const s of cageSheets) {
      expect(CAGE_FAMILY[s], `sheet ${s} 缺笼族档案`).toBeDefined();
    }
    // 65 张笼键（cage）表 = 64 顶盖笼 + 360 金蝴蝶笼（无顶盖）
    expect(cageSheets).toHaveLength(65);
    // CAGE_FAMILY 全量 93 张 = 65 笼 + 28 罐/缸族（288-295/580/620 蝴蝶罐 11、
    // 282/505/543 鱼缸 3、598 熔岩鱼缸 1、568-570 妖精罐 3、521-527 蜻蜓罐 7、
    // 316-318 水母罐 3，TileDrawing.cs:5925-6001）
    expect(Object.keys(CAGE_FAMILY)).toHaveLength(93);
  });

  it('顶盖样式表 1:1（TileID.cs:199）', () => {
    expect(cageLidStyle(275)).toBe(0);   // 兔笼 6×3
    expect(cageLidStyle(710)).toBe(0);   // 河豚笼
    expect(cageLidStyle(559)).toBe(1);   // 海马笼
    expect(cageLidStyle(358)).toBe(1);   // 金鸟笼
    expect(cageLidStyle(605)).toBe(2);   // gem bunny
    expect(cageLidStyle(285)).toBe(3);   // 蜗牛笼 3×2
    expect(cageLidStyle(619)).toBe(3);   // 蠕虫笼
    expect(cageLidStyle(556)).toBe(4);   // 金水黾笼
    expect(cageLidStyle(361)).toBe(4);   // 金蛙笼
    expect(cageLidStyle(360)).toBe(-1);  // 金蝴蝶笼无顶盖（:5961-5974 蝴蝶族）
    // 非笼族
    expect(cageLidStyle(214)).toBe(-1);  // 链条
    expect(cageLidStyle(21)).toBe(-1);   // 宝箱
    expect(cageLidStyle(0)).toBe(-1);
  });

  it('帧带步长：0-2 样式 54px（6×3）/ 3-4 样式与蝴蝶笼 36px（3×2/2×2）', () => {
    for (const fam of Object.values(CAGE_FAMILY)) {
      if (fam.lid >= 0 && fam.lid < 3) expect(fam.step, fam.family).toBe(54);
      else expect(fam.step, fam.family).toBe(36);
    }
  });

  it('同物体各格槽位一致（TileDrawing.cs:6646-6652 物体锚还原）且 mod 25', () => {
    // 6×3 大笼锚 (100,200)：顶/中/底行 + 各列 → 同槽
    const slots = [
      cageSlot('big', 100, 200, 0, 0), cageSlot('big', 101, 200, 18, 0),
      cageSlot('big', 105, 200, 90, 0), cageSlot('big', 100, 201, 0, 18),
      cageSlot('big', 100, 202, 0, 36),
    ];
    expect(new Set(slots).size).toBe(1);
    expect(slots[0]).toBe(Math.floor(100 / 6) * Math.floor(200 / 4) % CAGE_FRAMES);
    // 3×2 小笼
    expect(cageSlot('small', 30, 40, 0, 0)).toBe(Math.floor(30 / 3) * Math.floor(40 / 3) % CAGE_FRAMES);
    expect(cageSlot('small', 31, 40, 18, 0)).toBe(cageSlot('small', 30, 40, 0, 0));
    // water（360 金蝴蝶笼，:6636-6639 /2 /3）
    expect(cageSlot('water', 10, 20, 0, 0)).toBe(Math.floor(10 / 2) * Math.floor(20 / 3) % CAGE_FRAMES);
    // 值域
    for (let x = 0; x < 300; x += 7) {
      for (let y = 0; y < 300; y += 11) {
        const s = cageSlot('big', x, y, 0, 0);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(CAGE_FRAMES);
      }
    }
  });

  it('笼内动画帧行：空闲帧 0 → 动作段 → 回空闲，恒在值域内（逐族状态机见 critter-cages.test.ts）', () => {
    const frames = 22;   // Tiles_275：1188/54
    // 兔笼空闲窗：逐 tick 竞速首达（counter>rand(30,900)，首帧最早 t=31 触发）
    let zeroRun = 0;
    for (let t = 0; t < 3000; t++) {
      if (cageFrameRow(0, 3, t, frames) === 0) zeroRun++;
      else break;
    }
    expect(zeroRun).toBeGreaterThanOrEqual(30);
    expect(zeroRun).toBeLessThanOrEqual(901);   // counter=901 必 > rand 上界 900
    // 动作段逐帧推进且不越界（一个完整空闲+动作循环足够覆盖）
    let prev = -1, sawAction = false, returned = false;
    for (let t = 0; t < 4000; t++) {
      const f = cageFrameRow(0, 3, t, frames);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(frames);
      if (f > 0) sawAction = true;
      if (prev > 0 && f === 0) returned = true;
      prev = f;
    }
    expect(sawAction).toBe(true);
    expect(returned).toBe(true);
    // 单帧行（无动画）恒 0
    expect(cageFrameRow(0, 3, 12345, 1)).toBe(0);
    // 同族同槽确定性（同 tick 同帧）
    expect(cageFrameRow(5, 7, 999, frames)).toBe(cageFrameRow(5, 7, 999, frames));
  });

  it('tileTop=2 全量登记（GetTileDrawData :5746/:5873/:5965）', () => {
    for (const s of Object.keys(CAGE_FAMILY).map(Number)) {
      expect(DRAW_Y_OFFSET[s], `sheet ${s} 缺 tileTop 2`).toBe(2);
    }
  });

  it('CageTop_0-4 顶盖素材在库', () => {
    for (let n = 0; n <= 4; n++) {
      expect(fileExists(`vanilla/CageTop_${n}.png`), `CageTop_${n}.png`).toBe(true);
    }
  });
});
