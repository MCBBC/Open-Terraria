// IIIII14（DRUNK 05162020）生成内容层回归：小世界直驱 generateWorld，断言双邪恶
// 群落共存（P0）+ 本批 P1 面的最小计数。普通种子零扰动护栏在
// seed-parity/worldgen-1457-rewire/micro-biomes/liquid-settle-golden 四套件。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const ID: Record<string, number> = {};
TILE_DEFS.forEach((d, i) => { ID[d.key] = i; });

describe('IIIII14 DRUNK(05162020) 世界效应', () => {
  it('5162020 小世界：双邪恶带/双 style 祭坛与珠族/双邪恶矿/四档矿组混合', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '5162020' });
    const st = world.store;
    const gs = (world as unknown as { __gs?: never }).__gs; // GenState 不落 world——用 evilZones 之外的瓦片证据
    void gs;
    const cnt = (key: string): number => {
      const id = ID[key] ?? -1;
      let n = 0;
      for (let i = 0; i < st.type.length; i++) if (st.type[i] === id && st.flags[i]) n++;
      return n;
    };
    // --- P0 双邪恶 ---
    expect(cnt('v_25_ebonstone_block')).toBeGreaterThan(300);
    expect(cnt('v_203_crimstone_block')).toBeGreaterThan(300);
    expect(cnt('v_23_corrupt_grass_block')).toBeGreaterThan(20);
    expect(cnt('v_199_crimson_grass_block')).toBeGreaterThan(20);
    // 双 style 祭坛（frameX 带 = style*54）
    const ALTAR = ID['v_26_altars'];
    let altarS0 = 0, altarS1 = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (!st.flags[i] || st.type[i] !== ALTAR) continue;
      if (Math.floor(st.frameX[i] / 54) === 0) altarS0++; else altarS1++;
    }
    expect(Math.min(altarS0, altarS1)).toBeGreaterThan(0);
    // 双 style 珠/心族（style1 帧带偏移 +36）
    const ORB = ID['v_31_orb_heart'];
    let orbS0 = 0, orbS1 = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (!st.flags[i] || st.type[i] !== ORB) continue;
      if (st.frameX[i] >= 36) orbS1++; else orbS0++;
    }
    expect(Math.min(orbS0, orbS1)).toBeGreaterThan(0);
    // 双邪恶矿并生 + 四档矿组混合（per-vein 重掷后两种都在场）
    expect(cnt('ore_demonite')).toBeGreaterThan(100);
    expect(cnt('ore_crimtane')).toBeGreaterThan(100);
    expect(cnt('ore_tin')).toBeGreaterThan(200);
    expect(cnt('ore_copper')).toBeGreaterThan(200);
    expect(cnt('ore_lead')).toBeGreaterThan(150);
    expect(cnt('ore_iron')).toBeGreaterThan(150);
    expect(cnt('ore_silver')).toBeGreaterThan(150);
    expect(cnt('ore_tungsten')).toBeGreaterThan(150);
    expect(cnt('ore_gold')).toBeGreaterThan(100);
    expect(cnt('ore_platinum')).toBeGreaterThan(100);
    // drunk 起始镇民换人（裸 drunk → 派对女孩 208 / drunk×const → 机械师 124 的
    // pass 播种记录——裸 drunk 落 party_girl）
    expect(world.starterTownNpcs?.map((s) => s.key)).toContain('party_girl');
  }, 180000);
});
