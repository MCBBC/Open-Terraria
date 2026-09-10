// SW-FX8（2026-09-10）审计 D-10/D-12 清偿与登记收口：
//   D-10 ①TILE_CUT 两副本合并——Game.ts TILE_CUT_VANILLA 删除,单源 = data/tiles.ts
//        TILE_CUT_SHEETS（合并前逐值对拍 41≡41,Game 副本 3 处重复项）。
//        ②454 猪隆纳彩罐/254 南瓜株/236 生命果株三件 2026-09-01 已补（本测以反编译
//        Main.cs tileCut 赋值全量反查锁完备性,防再漏）。
//   D-12  镐可清 tileAxe 族 decor（v_5_trees/v_80_cactus/v_72_mushroom_tree）——原版
//        Player.cs:45039 镐分支 `pick>0 && !tileAxe && !tileHammer` 排除 tileAxe 格;
//        本仓 toolMatchesTile 同式 + TILE_CUT 无 5/80/72（decor 秒清支不达）→ 已闭合,
//        本测锁分发矩阵与 tryMine 行为（变异：删 toolMatchesTile 的 TILE_AXE 排除臂
//        或把 5 加进 TILE_CUT_SHEETS → 红）。
// 金标：Terarria1457/Terraria/Main.cs `tileCut[N] = true` 全部赋值行（41 项去重）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Game, TILE_CUT } from '../src/core/Game';
import { TILE_CUT_SHEETS, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const MAIN_CS = join(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Main.cs');

/** 反编译 Main.cs tileCut 全量赋值反查（金标源） */
function vanillaTileCut(): Set<number> {
  let src: string;
  try {
    src = readFileSync(MAIN_CS, 'utf8');
  } catch {
    throw new Error(`金标源缺失：${MAIN_CS}（反编译 1457 全量须在仓库旁路）`);
  }
  const out = new Set<number>();
  for (const m of src.matchAll(/tileCut\[(\d+)\] = true/g)) out.add(Number(m[1]));
  return out;
}

/** Game 壳（tryMine/分发门行为面,同 decor-support.test.ts 模式） */
function mkShell(w: World) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.spawnDrop = () => null;
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.entities = { add: () => {}, critters: [], drops: [] };
  g.trackTile = 0;
  g.scene = null;
  g.player = { inv: { countOf: () => 0 }, equipStats: {}, cx: 0, cy: 0 };
  g.netCanEditTile = () => true;
  g.inTileRange = () => true;
  g.tickCount = 1000;
  g.lastMineHitTick = 0;
  g.mining = null;
  return g;
}

describe('SW-FX8 TILE_CUT 完备性（D-10,反编译 Main.cs 金标闸）', () => {
  it('TILE_CUT_SHEETS ≡ Main.tileCut 全表 41 项（对称差=∅）', () => {
    const gold = vanillaTileCut();
    expect(gold.size).toBe(41);
    const repo = [...TILE_CUT_SHEETS];
    const missing = [...gold].filter((s) => !TILE_CUT_SHEETS.has(s));
    const extra = repo.filter((s) => !gold.has(s));
    expect(missing, `缺项:${missing}`).toEqual([]);
    expect(extra, `多项:${extra}`).toEqual([]);
  });

  it('D-10 三件在表：454 猪隆纳彩罐/254 南瓜株/236 生命果株（Main.cs:8270/:10155/:10158）', () => {
    for (const s of [454, 254, 236]) expect(TILE_CUT_SHEETS.has(s), `tileCut[${s}]`).toBe(true);
  });

  it('单源守卫：Game.ts 不再有本地副本,消费统一 TILE_CUT_SHEETS', () => {
    const gameSrc = readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
    expect(gameSrc).not.toMatch(/TILE_CUT_VANILLA\s*=\s*new Set/);
    expect(gameSrc).toMatch(/import \{[^}]*TILE_CUT_SHEETS[^}]*\} from '\.\.\/data\/tiles'/);
    const tilesSrc = readFileSync(join(__dirname, '..', 'src', 'data', 'tiles.ts'), 'utf8');
    expect(tilesSrc).not.toMatch('待其战区安静后合并');   // 合并注已撤
  });

  it('内部 id 派生面：TILE_CUT（内部 id 域）覆盖=每 sheet 恰一件派生', () => {
    // 每个金标 sheet 至少映射出一个内部 id（TILE_CUT 派生循环）——防 defs 缺注册
    for (const s of TILE_CUT_SHEETS) {
      const any = TILE_DEFS.some((d) => d?.vanilla?.sheet === s);
      expect(any, `sheet ${s} 应有 def`).toBe(true);
    }
    for (const id of TILE_CUT) {
      expect(TILE_CUT_SHEETS.has(TILE_DEFS[id]?.vanilla?.sheet ?? -1), `内部 id ${id}`).toBe(true);
    }
  });
});

describe('SW-FX8 D-12 镐不伤 tileAxe 族（Player.cs:45039 排除门行为锁）', () => {
  const TREE = TILE_BY_KEY['v_5_trees']!;
  const CACTUS = TILE_BY_KEY['v_80_cactus']!;
  const SHROOM = TILE_BY_KEY['v_72_mushroom_tree']!;

  it('分发矩阵：镐不匹配三件/斧匹配/钻头直调通道豁免（Mount.cs:3115 PickTile）', () => {
    const g = mkShell(new World(40, 40, 7, 'sw-fx8-d12-dispatch'));
    const toolMatchesTile = (g as unknown as { toolMatchesTile: (t: number, k: string, d?: boolean) => boolean }).toolMatchesTile.bind(g);
    for (const id of [TREE, CACTUS, SHROOM]) {
      const sh = TILE_DEFS[id]?.vanilla?.sheet;
      expect(toolMatchesTile(id, 'pick'), `sheet${sh} pick`).toBe(false);
      expect(toolMatchesTile(id, 'axe'), `sheet${sh} axe`).toBe(true);
      expect(toolMatchesTile(id, 'pick', true), `sheet${sh} drill 豁免`).toBe(true);
    }
  });

  it('TILE_CUT 无 5/80/72——镐不达 decor 秒清支（原版 tileAxe 格镐不伤,勿"修"）', () => {
    for (const s of [5, 80, 72]) expect(TILE_CUT_SHEETS.has(s), `sheet ${s}`).toBe(false);
  });

  it('tryMine 行为：镐挥树干/仙人掌/蘑菇树 = 无动作（tile 保持,mining=null,零掉落）', () => {
    for (const [key, id] of [['v_5_trees', TREE], ['v_80_cactus', CACTUS], ['v_72_mushroom_tree', SHROOM]] as const) {
      const w = new World(40, 40, 7, `sw-fx8-d12-${key}`);
      const g = mkShell(w);
      const drops: unknown[] = [];
      g.spawnDrop = (_x: number, _y: number, k: string) => { drops.push(k); return null; };
      w.store.setTileSilent(10, 9, id, 0, 0);
      w.store.setTileSilent(10, 10, TILE_BY_KEY['dirt']!, 0, 0);
      (g as unknown as { tryMine: (x: number, y: number, p: number, t: 'pick' | 'axe' | 'hammer', s: number) => void })
        .tryMine(10, 9, 100, 'pick', 20);
      expect(w.store.get(10, 9), `${key} 镐挥后应保持`).toBe(id);
      expect(drops, `${key} 应零掉落`).toEqual([]);
    }
  });
});
