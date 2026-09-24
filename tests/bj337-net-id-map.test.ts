// BJ337（2026-09-24）VanillaSpawner.NET_ID_MAP 全表判别面（防回潮）。
// 原版真值 = NPCID.NetIdMap（Terarria1457/Terraria.ID/NPCID.cs:10450-10460，65 项），
// FromNetId 公式（NPCID.cs:12478-12484）：netID<0 → NetIdMap[-id-1]。
// 防回潮对象（BJ334 登记三死行 + BJ337 普查新发现缺行）：
//   ① '-1'/'-2' base 16（母史莱姆）→ 应 81（腐化史莱姆，Slimeling/Slimer2）；
//   ② '-15' base 1（绿史莱姆!）→ 应 77（Heavy Skeleton）——洞穴主池 L4959 实刷点
//      D(-15) 曾刷 1.15 倍绿史莱姆（BJ334"纯潜伏"判注不实，BJ337 亲读翻案）；
//      case -15（NPC.cs:7831-7842）硬置 life=400 → 表内 hp:400 钉值；
//   ③ '-18'..'-21' 苔藓黄蜂变体整缺（NetIdMap[17..20]=176）——蜂巢块 225 / 深层
//      丛林草 60 两刷点 D(-21..-18) 曾 fromVanilla(-N)=null 静默丢刷。
// 变异判别（1 发）：任一 base 改动 / 删行 / hp 钉值改动均爆红（结构面+行为面双轴）。
import { describe, it, expect } from 'vitest';
import { VanillaSpawner, NET_ID_MAP } from '../src/world/spawn/VanillaSpawner';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { World } from '../src/world/World';
import { RNG } from '../src/core/rng';

// 逐值照录 Terarria1457/Terraria.ID/NPCID.cs:10450-10460（禁手改：改此表须先亲读反编译）
const VANILLA_NET_ID_MAP = [
  81, 81, 1, 1, 1, 1, 1, 1, 1, 1,
  6, 6, 31, 31, 77, 42, 42, 176, 176, 176,
  176, 173, 173, 183, 183, 3, 3, 132, 132, 186,
  186, 187, 187, 188, 188, 189, 189, 190, 191, 192,
  193, 194, 2, 200, 200, 21, 21, 201, 201, 202,
  202, 203, 203, 223, 223, 231, 231, 232, 232, 233,
  233, 234, 234, 235, 235,
];
const NEG_IDS = VANILLA_NET_ID_MAP.map((_, i) => -(i + 1));   // -1..-65

describe('NET_ID_MAP vs 原版 NetIdMap（NPCID.cs:10450-10460）', () => {
  it('全表 65 项：行齐 + base 逐值 = NetIdMap[-id-1]', () => {
    for (const id of NEG_IDS) {
      const row = NET_ID_MAP[id];
      const exp = VANILLA_NET_ID_MAP[-id - 1];
      expect(row, `netID ${id} 缺行（spawnNPC 会走 map?.base??netId → fromVanilla(null) 静默丢刷）`).toBeDefined();
      expect(row!.base, `netID ${id} base=${row!.base} ≠ NetIdMap[${-id - 1}]=${exp}`).toBe(exp);
    }
  });

  it('tripwire：每行基底均可被 vanillaNpc 解析（防 fromVanilla null 丢刷族）', () => {
    for (const [k, row] of Object.entries(NET_ID_MAP)) {
      const base = typeof k === 'string' ? Number(k) : k;
      expect(vanillaNpc(row.base), `netID ${base} 基底 ${row.base} 不在 vanilla-npcs.json=刷出必丢`).not.toBeNull();
    }
  });

  it('flag=true 族硬置钉值（case -1/-2 :7687-7702 / case -15 :7831-7842）', () => {
    expect(NET_ID_MAP[-1]).toMatchObject({ hp: 90, dmg: 45, def: 10 });
    expect(NET_ID_MAP[-2]).toMatchObject({ hp: 90, dmg: 45, def: 20 });
    expect(NET_ID_MAP[-15]!.hp, 'case -15 life=400 硬置（非 ×scale，NPC.cs:7838）').toBe(400);
  });
});

describe('NET_ID_MAP 行为面（spawnNPC 消费链）', () => {
  const w = new World(400, 400, 42, 'jungle');
  const spawner = new VanillaSpawner(w);
  const s = spawner as unknown as {
    spawnNPC: (x: number, y: number, id: number, rng: RNG) => { vanillaId: number; maxHp: number } | null;
  };

  it('spawnNPC(-15) → Heavy Skeleton 77（曾刷绿史莱姆 1 的实刷点判别）', () => {
    const e = s.spawnNPC(100, 100, -15, new RNG(1));
    expect(e).not.toBeNull();
    expect(e!.vanillaId).toBe(77);
    expect(e!.maxHp).toBe(400);   // case -15 life=400 硬置消费链
  });

  it('spawnNPC(-18/-21) → 苔藓黄蜂 176（曾整缺=静默丢刷的实刷点判别）', () => {
    const e18 = s.spawnNPC(100, 100, -18, new RNG(2));
    const e21 = s.spawnNPC(100, 100, -21, new RNG(3));
    expect(e18, '-18 曾缺行 → fromVanilla(-18)=null').not.toBeNull();
    expect(e18!.vanillaId).toBe(176);
    expect(e21!.vanillaId).toBe(176);
  });

  it('spawnNPC(-1) → 腐化史莱姆 81（曾误 base 16 母史莱姆）', () => {
    const e = s.spawnNPC(100, 100, -1, new RNG(4));
    expect(e).not.toBeNull();
    expect(e!.vanillaId).toBe(81);
    expect(e!.maxHp).toBe(90);    // case -1 life=90 硬置消费链
  });
});
