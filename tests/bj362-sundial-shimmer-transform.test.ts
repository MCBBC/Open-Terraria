// BJ362（2026-09-27 用户实报）：附魔日晷扔微光不变附魔月晷。
// 定谳（物证 = behavior-log-Starter_World-2026-09-26 t=1661 drop key=
//   place_v_356_enchanted_sundial）：微光转化链（vanilla ItemID.cs:88
//   ShimmerTransformToItem 3064→5381 / ShimmerTransforms.GetTransformToItem :88-111 /
//   WorldItem.GetShimmered :1722-1724）与本仓 stats/Shimmer.ts + ItemDrop.getShimmered
//   全链可用（vitest 合成池 + 实机探针双证），真件 vi_3064_Sundial 入微光即变 5381。
//   病灶在发放面：itemSearch 覆盖去重（2026-08-25「两个阿比盖尔的花」刀）写于
//   createTile 双源回填之前，把回填后【真可放置】的 vi_ 真件当死条目滤掉，只发
//   place_v 克隆——克隆 vid 恒 undefined=原版域外 → getTransformToItem(-1)=0 →
//   扔微光无反应。修刀（items.ts ⑦ + itemSearch BJ362 判据）：
//   ① 唯一真件对应 tile 的 place_v 克隆退位（byKey 别名 + 读档桥 ITEM_INTERNAL_OF_STABLE
//     克隆 stable → 真件=存量存档愈合），多件族（雕像/旗帜/画…62）与无对应件
//     （纯装饰 107）不动；② 搜索池真件入池、退位克隆出池。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import {
  ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID,
  ITEM_INTERNAL_OF_STABLE, PLACE_CLONE_SUPERSEDED,
} from '../src/data/items';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_NAME_BY_ID, TILE_NAME_ITEM_BY_SHEET, TILE_NAME_ZH_BY_ID } from '../src/i18n/idNames.generated';
import { buildItemSearchPool } from '../src/ui/itemSearch';
import type { GameHooks } from '../src/entities/types';

// 生产同名链最小复刻（vi_ 官方名 + place_v_ 方块 placer 名;zh 终值）
const ROOT362 = join(dirname(fileURLToPath(import.meta.url)), '..');
const zh362 = JSON.parse(readFileSync(join(ROOT362, 'public/l10n/zh-Hans.json'), 'utf8')) as {
  ItemName: Record<string, string>;
};
const nameOf = (key: string): string => {
  const m = /^vi_(\d+)_/.exec(key);
  const iid = m ? ITEM_NAME_BY_ID[Number(m[1])] : undefined;
  if (iid && zh362.ItemName[iid]) return zh362.ItemName[iid];
  if (key.startsWith('place_v_')) {
    const def = ITEM_DEFS[ITEM_BY_KEY[key]];
    const sheet = def?.tile ? TILE_DEFS[TILE_BY_KEY[def.tile]]?.vanilla?.sheet : undefined;
    if (sheet !== undefined) {
      const tzh = TILE_NAME_ZH_BY_ID[sheet];
      if (tzh) return tzh;                                   // 方块名直译档（垃圾桶/人体模型 legacy/苔藓砖…）
      const placer = TILE_NAME_ITEM_BY_SHEET[sheet];
      if (placer !== undefined) {
        const piid = ITEM_NAME_BY_ID[Number(placer)];
        if (piid && zh362.ItemName[piid]) return zh362.ItemName[piid];
      }
    }
  }
  return key;
};

const W = 60, H = 256;

function poolWorld(): World {
  const w = new World(W, H, 11, 'bj362');
  const st = w.store;
  for (let x = 8; x < 48; x++) for (let y = 24; y <= 32; y++) st.setTile(x, y, 0);
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4);   // 微光满格（type 4=本仓编码,原版 3+1）
  }
  for (let x = 30; x < 46; x++) st.setTile(x, 40, 1);
  return w;
}

function hooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {},
  } as unknown as GameHooks;
}

/** 物品投池底 → 步进至转变/超时（90t 浸入 + 100t 缓冲） */
function shimmerUntil(drop: ItemDrop, h: GameHooks, maxT = 400): void {
  for (let i = 0; i < maxT && !drop.dead && drop.itemId !== 5381; i++) drop.fixedUpdate(1, h);
}

describe('BJ362 判别面：用户存档路径（稳定 id 10286 克隆）读档愈合 → 微光转变', () => {
  it('读档桥 10286 → 3064（真件 vi_3064_Sundial）', () => {
    expect(ITEM_INTERNAL_OF_STABLE.get(10286)).toBe(3064);
    expect(ITEM_BY_KEY['place_v_356_enchanted_sundial']).toBe(3064);   // 键面发放同走真件
    expect(ITEM_DEFS[3064]?.key).toBe('vi_3064_Sundial');
    expect(ITEM_DEFS[3064]?.vid).toBe(3064);
    expect(ITEM_DEFS[3064]?.tile).toBe('v_356_enchanted_sundial');
  });

  it('存量克隆槽位物品入微光 → 变 5381 附魔月晷（真实物品 def,shimmered 上浮）', () => {
    const w = poolWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    // 用户存档槽位稳定 id 10286 经 mapItem 桥还原出的 internal id（=真件）
    const loadedId = ITEM_INTERNAL_OF_STABLE.get(10286)!;
    const d = new ItemDrop(20 * TILE, 34 * TILE, loadedId, 1);
    d.vx = 0; d.vy = 0;
    shimmerUntil(d, h);
    expect(d.dead).toBe(false);
    expect(d.itemId).toBe(5381);
    expect(d.shimmered).toBe(true);
    expect(ITEM_DEFS[d.itemId]?.key).toBe('vi_5381_Moondial');   // 变成的是真件非克隆
    expect(ITEM_DEFS[d.itemId]?.vid).toBe(5381);
  });

  it('真件 vi_3064_Sundial 直投入微光 → 5381（原版奇偶面:transform 目标月晷无回变条目）', () => {
    const w = poolWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const h = hooks(w, p);
    const d = new ItemDrop(20 * TILE, 34 * TILE, ITEM_BY_KEY['vi_3064_Sundial'], 1);
    d.vx = 0; d.vy = 0;
    shimmerUntil(d, h);
    expect(d.itemId).toBe(5381);
    expect(d.shimmered).toBe(true);
  });
});

describe('BJ362 发放面：搜索池真件入池 / 退位克隆出池', () => {
  const pool = buildItemSearchPool({ nameOf: (k) => k });

  it('搜 sundial/日晷（vid 桥）→ vi_3064_Sundial 在池,place_v_356 克隆不在池', () => {
    const real = pool.find((e) => e.vid === 3064);
    expect(real).toBeDefined();
    expect(real!.key).toBe('vi_3064_Sundial');
    expect(pool.some((e) => e.key === 'place_v_356_enchanted_sundial')).toBe(false);
  });

  it('月晷镜像面:vi_5381 在池,克隆退位（真件不可再微光变回=原版单向,表中无 5381 条目）', () => {
    expect(pool.some((e) => e.vid === 5381)).toBe(true);
    expect(pool.some((e) => e.key === 'place_v_663_enchanted_moondial')).toBe(false);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_663_enchanted_moondial')).toBe(5381);
  });
});

describe('BJ362 家族普查（同族收口:退位判据三界）', () => {
  it('退位克隆恰 567（唯一真件 509 + 多件族 style0 基件 58）;月晷克隆在册', () => {
    expect(PLACE_CLONE_SUPERSEDED.size).toBe(567);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_356_enchanted_sundial')).toBe(3064);
  });

  it('多件族克隆退位到 style0 基件（篝火→966/人体模型→498/雕像→360/旗帜→337;同名双行根除）', () => {
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_215_campfires')).toBe(966);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_470_mannequins')).toBe(498);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_105_statue')).toBe(360);
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_91_banners')).toBe(337);
  });

  it('无对应件纯装饰克隆不退位（cattails 519 等零 vi_ 对应,读档桥保持恒等）', () => {
    expect(PLACE_CLONE_SUPERSEDED.has('place_v_519_cattails')).toBe(false);
    const cattailsDef = ITEM_DEFS[ITEM_BY_KEY['place_v_519_cattails']];
    expect(ITEM_INTERNAL_OF_STABLE.get(cattailsDef ? ITEM_BY_KEY['place_v_519_cattails'] : -1))
      .toBe(ITEM_BY_KEY['place_v_519_cattails']);   // 桥恒等不动
  });

  it('真件镜像抽验:克隆退位后键面发放 = 真件 def（piggy bank 代表样本:ItemID.PiggyBank=87/TileID.PiggyBank=29）', () => {
    expect(PLACE_CLONE_SUPERSEDED.get('place_v_29_piggy_bank')).toBe(87);
    expect(ITEM_BY_KEY['place_v_29_piggy_bank']).toBe(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[87]]);
  });

  it('搜索面同名克隆退役（用户复报「搜索重复道具」第二刀）:legacy 人体模型/武器架/垃圾桶/晶莹宝石 off 不进池', () => {
    // nameOf 须走生产同名链（vi_ 官方名 + place_v_ 方块 placer 名）——键名兜底无
    // 撞名面,同名规则失效（BJ154 同款教训）。此处最小链:官方名 + placer 名。
    const pool = buildItemSearchPool({ nameOf });
    for (const k of [
      'place_v_128_mannequin_legacy', 'place_v_269_womannequin_legacy',
      'place_v_334_weapon_rack_legacy_do_not_use', 'place_v_99_trash_can',
      'place_v_255_amethystgemsparkoff', 'place_v_389_tall_gate_open',
      'place_v_512_green_moss_brick',
    ]) {
      expect(pool.some((e) => e.key === k)).toBe(false);
    }
    // 真件不受株连:vi_498/vi_348/vi_1970/vi_3240 在池
    for (const vid of [498, 348, 1970, 3240]) {
      expect(pool.some((e) => e.vid === vid)).toBe(true);
    }
  });
});
