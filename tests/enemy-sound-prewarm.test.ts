// 敌怪生成期音效预热（2026-08-19 用户报"秃鹫受击第一声与后续不一致"）：
// 根因 = NPC_Hit_28 不在 VANILLA_SPAWN_POOLS 预热面 → 首击 playFiles 缓冲在途
// → Game.playSfxFiles 回退 play('hit')（NPC_Hit_1..5 通用闷响）≠ 秃鹫真声。
// 修复 = Enemy.fromVanilla / Transform 构造点回调 bindEnemySoundPrewarm。
// 断言：
//   ① fromVanilla(61) 触发预热回调，含 NPC_Hit_28 + NPC_Killed_31（cs:9495-9496）
//   ② 通用怪（僵尸 3）同样触发（NPC_Hit_1..3 组随机变体入预热面）
//   ③ 回调未绑（null）不炸——菜单态构造防御
//   ④ vanillaSoundFiles 映射 NPCHit28→NPC_Hit_28 / NPCDeath31→NPC_Killed_31
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Enemy, bindEnemySoundPrewarm } from '../src/entities/Enemy';
import { vanillaSoundFiles } from '../src/data/vanillaNpcs';

describe('敌怪生成期音效预热', () => {
  let calls: string[][];
  beforeEach(() => {
    calls = [];
    bindEnemySoundPrewarm((files) => calls.push(files));
  });
  afterEach(() => bindEnemySoundPrewarm(null));

  it('秃鹫 61：fromVanilla 预热 NPC_Hit_28 + NPC_Killed_31（首击真声根因）', () => {
    const v = Enemy.fromVanilla(61, 100, 100);
    expect(v).not.toBeNull();
    const files = calls.flat();
    expect(files).toContain('NPC_Hit_28');
    expect(files).toContain('NPC_Killed_31');
  });

  it('通用怪（僵尸 3）同样触发预热（零漂移：任何 vanilla 构造路径都覆盖）', () => {
    Enemy.fromVanilla(3, 100, 100);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.flat().some((f) => /^NPC_(Hit|Killed)_/.test(f))).toBe(true);
  });

  it('回调未绑（菜单态）不炸：构造照常成功', () => {
    bindEnemySoundPrewarm(null);
    expect(() => Enemy.fromVanilla(61, 100, 100)).not.toThrow();
  });

  it('vanillaSoundFiles：NPCHit28 → NPC_Hit_28；NPCDeath31 → NPC_Killed_31', () => {
    expect(vanillaSoundFiles('NPCHit28')).toEqual(['NPC_Hit_28']);
    expect(vanillaSoundFiles('NPCDeath31')).toEqual(['NPC_Killed_31']);
  });
});
