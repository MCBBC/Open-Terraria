// Ambient 环境音轨测试（2026-08-14）。
// 对照原版（Terraria 1.4.5.6 反编译）：
//   音轨成员集   DoesSoundScaleWithAmbientVolume（LegacySoundPlayer.cs:1443-1461）
//                —— 14 个 SoundID：30 Duck/31 Frog/32 Bird/33 Critter/34 Waterfall/
//                35 Lavafall/39 Drip/43 Thunder/44 Seagull/45 Dolphin/46 Owl/
//                67 Cockatiel/68 Macaw/69 Toucan（wav 映射见各 case 行号）
//                + SoundType.Ambient trackable（SoundID.cs:819-827 Blizzard 双轨 +
//                liquids_* 六配对；ActiveSound.cs:150-153 分轨消费）
//   音量替换语义 LegacySoundPlayer.cs:420-429：ambient 成员 num2 *= ambientVolume，
//                其余 num2 *= soundVolume——替换而非叠加
//   默认值       Main.cs:1413 ambientVolume = 1f；config 键 "VolumeAmbient"
//                （Main.cs:4159 Put / :4383 Get）
import { describe, it, expect } from 'vitest';
import { AMBIENT_FILES, trackVolumeFor, Sfx, WAV_MAP } from '../src/core/Sfx';
import { OptionsStore } from '../src/core/Options';

describe('Ambient 环境音轨', () => {
  it('成员集：14 个 legacy SoundID 的 wav 全量在轨（各 case bank 映射）', () => {
    // 30 Duck（:1101-1122）/ 31 Frog（:1124）/ 32 Bird（:1136）/ 33 Critter（:1199）
    for (const f of ['Zombie_10', 'Zombie_11', 'Zombie_12', 'Zombie_13', 'Zombie_14', 'Zombie_15']) {
      expect(AMBIENT_FILES.has(f), f).toBe(true);
    }
    // 34 Waterfall / 35 Lavafall（SoundLiquid[0/1] 跟踪循环，:1248/:1280）
    expect(AMBIENT_FILES.has('Liquid_0')).toBe(true);
    expect(AMBIENT_FILES.has('Liquid_1')).toBe(true);
    // 39 Drip（:1354）/ 43 Thunder（:457，Thunder_0-5）
    for (const f of ['Drip_0', 'Drip_1', 'Drip_2']) expect(AMBIENT_FILES.has(f), f).toBe(true);
    for (let i = 0; i <= 5; i++) expect(AMBIENT_FILES.has(`Thunder_${i}`)).toBe(true);
    // 44 Seagull / 45 Dolphin / 46 Owl（:1050-1090）
    for (const f of ['Zombie_106', 'Zombie_107', 'Zombie_108', 'Zombie_109',
      'Zombie_110', 'Zombie_111', 'Zombie_112', 'Zombie_113', 'Zombie_114']) {
      expect(AMBIENT_FILES.has(f), f).toBe(true);
    }
    // 67 Cockatiel / 68 Macaw / 69 Toucan（:1143-1177）
    for (const f of ['Zombie_118', 'Zombie_119', 'Zombie_120',
      'Zombie_126', 'Zombie_127', 'Zombie_128', 'Zombie_129', 'Zombie_130']) {
      expect(AMBIENT_FILES.has(f), f).toBe(true);
    }
  });

  it('成员集：SoundType.Ambient trackable（SoundID.cs:819-827）+ 非环境音不在轨', () => {
    // Blizzard 双轨 + liquids_* 六配对（×3 变体）
    for (const f of ['blizzard_strong_loop', 'blizzard_inside_building_loop']) {
      expect(AMBIENT_FILES.has(f), f).toBe(true);
    }
    for (const base of ['liquids_water_lava', 'liquids_honey_water', 'liquids_honey_lava']) {
      for (let i = 0; i <= 2; i++) expect(AMBIENT_FILES.has(`${base}_${i}`)).toBe(true);
    }
    // 非环境音：战斗/物品/UI 声不在轨（否则会被环境音滑杆吞掉）
    for (const f of ['Item_14', 'Item_55', 'Zombie_0', 'NPC_Hit_1', 'Grab', 'Menu_Open']) {
      expect(AMBIENT_FILES.has(f), f).toBe(false);
    }
  });

  it('Sfx 内置逻辑名与成员集自洽：thunder/液体六配对/暴风雪的 wav 全部在轨', () => {
    for (const name of ['thunder', 'liquidWaterLava', 'liquidHoneyWater', 'liquidHoneyLava',
      'blizzardStrong', 'blizzardInside'] as const) {
      for (const f of WAV_MAP[name]) {
        expect(AMBIENT_FILES.has(f), `${name} → ${f}`).toBe(true);
      }
    }
  });

  it('音轨分派（LegacySoundPlayer.cs:420-429）：ambient 替换 master，非成员走 master', () => {
    // ambient 成员：ambientVol 0.4 生效、master 被替换（不叠加）
    expect(trackVolumeFor('Thunder_3', 0.4, 1)).toBe(0.4);
    expect(trackVolumeFor('Drip_2', 0.4, 0.8)).toBe(0.4);
    expect(trackVolumeFor('Liquid_0', 0, 1)).toBe(0);      // 环境音滑杆归零即静音
    // 非成员：不受 ambientVol 影响
    expect(trackVolumeFor('Item_14', 0.4, 1)).toBe(1);
    expect(trackVolumeFor('Item_14', 0, 0.7)).toBe(0.7);
  });

  it('Sfx.ambient 默认 1（Main.cs:1413）；与 master 各自独立', () => {
    const sfx = new Sfx();
    expect(sfx.ambient).toBe(1);
    expect(sfx.master).toBe(1);
    sfx.ambient = 0.25;
    sfx.master = 0.9;
    expect(trackVolumeFor('Thunder_0', sfx.ambient, sfx.master)).toBe(0.25);
    expect(trackVolumeFor('Roar_0', sfx.ambient, sfx.master)).toBe(0.9);
  });

  it('Options.ambientVol 默认 1 + set 即时生效（旧存档无此键走默认）', async () => {
    const store = new OptionsStore();
    expect(store.data.ambientVol).toBe(1);       // Main.cs:1413 同款默认
    await store.set('ambientVol', 0.35);
    expect(store.data.ambientVol).toBe(0.35);
    // 音量互不串轨（musicVol 默认 = Main.cs:1432 musicVolume = 1f，R24 勘误）
    expect(store.data.sfxVol).toBe(1);
    expect(store.data.musicVol).toBe(1);
  });
});
