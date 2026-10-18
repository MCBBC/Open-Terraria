// ★IIIII259 测试世界档案库（fixture worlds）——loadFixtureWorld
//
// 动机（用户指令 2026-09-15）：测试避免每次重复生成世界；提供不同档位/种子的已有
// 存档供载入；**仅当测试主题=世界生成本身或确需不同种子世界才允许 generateWorld**。
// 全量套件 288min 中 Top 慢文件几乎全是"整世界生成 + 静态内容断言"（生成 ~2.5min
// 一次、断言毫秒级）——对固定种子的内容断言，载入同一世界的存档=同一断言语义。
//
// 链路（全部走游戏自身存档路径，src 生产面零触碰）：
//   生成端 tests/world-fixture-gen.test.ts（SW_GEN_WORLD_FIXTURES=1 门控）
//     generateWorld(固定种子配置) → saveWorldOnly（serializeSave v5）→ gzip 落盘
//     <name>.wld.json.gz + 元数据/侧车 <name>.fixture.json（含生成↔载入往返指纹自证）
//   消费端（本文件）
//     gunzip → loadSave → loadSaveData（与游戏读档页同一解码链）→ World，秒级
//
// 断言面守恒（同世界同断言）：
//   - 存档本体重盖：tiles 八通道+帧 / walls / liquid / chests / signs / flags /
//     spawn / seedFlags / dungeonX/jungleX / treeX 等全部随档（SaveFile.buildSaveParts）。
//   - 生成态而**不落档**的少数域由侧车 <name>.fixture.json 的 `side` 回填：
//       trees            —— World.trees 仅生成期登记（SaveData 无此段；treebottom 系用）
//       starterTownNpcs  —— SpawnStarterNPCs 产物槽（仅联机包路径携带；_iii6 用）
//       seedFlags        —— 有效旗标集（saveWorldOnly/buildSaveParts 路径现不落此域）
//       gs.<field>       —— GenState 域常量（如 desertHiveHigh/Low，bj42 深度门用）
//     侧车值=生成端同拍采集，与"当次生成"逐值全等（生成端往返测试强制）。
//   - 档案=固定种子一次性生成快照：世界生成代码漂移后档案**不会自动重生成**
//     （内容测试锚的是"当时生成的世界"）；生成过程自身的活性回归由必须生成的
//     套件守卫（caves-checkpoint 逐 pass 链/world-final-hash/drunk-world-gen/
//     gen-loot-passes/_fullgen-smoke）——使用策略见 tests/README.md「测试世界使用策略」。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'fflate';
import { loadSave } from '../src/save/SaveFile';
import type { World } from '../src/world/World';
import type { GenConfig } from '../src/world/gen/WorldGen';

export const FIXTURE_DIR = join(__dirname, 'fixtures', 'worlds');

/** 侧车/元数据（<name>.fixture.json 形） */
export interface FixtureMeta {
  name: string;
  /** 与迁移用例逐字同构的生成配置（档案再生成时用） */
  cfg: Pick<GenConfig, 'width' | 'height' | 'seedText' | 'name' | 'evil' | 'seedFlags'>;
  /** 来源测试文件 + 用途（策略审计字段：为什么这个世界值得入库） */
  source?: string;
  notes?: string;
  generatedAt: string;
  /** 生成态往返自证指纹（type/flags/wall/liquid/frameX/frameY 的 fnv1a，hex 串；
   *  基线=读档边界净化后形态——见 world-fixture-gen.test.ts 落盘前 purge 注） */
  fingerprints?: Record<string, string>;
  /** 生成态原貌指纹（净化前备查）+ 净化格数（幽灵格域=生成↔读档的唯一既知差异） */
  genFingerprints?: Record<string, string>;
  ghostsPurged?: number;
  /** 生成态不落档域回填（见文件头）。seedFlags=生成态有效集（saveWorldOnly 路径
   *  现不落此域——全量 saveGame 才有；buildSaveParts 补挂前的档案侧车通道） */
  side?: {
    seedFlags?: Record<string, boolean>;
    trees?: Array<{ x: number; y: number; h: number }>;
    starterTownNpcs?: World['starterTownNpcs'];
    gs?: Record<string, number>;
  };
}

export interface FixtureLoad {
  world: World;
  fixture: FixtureMeta;
}

/** 载入档案世界（游戏读档路径 loadSave，秒级）。缺档=直接抛错并给出再生成指令
 *  （档案文件不入库——.gitignore；由生成端脚本本地再产，见 README）。 */
export function loadFixture(name: string): FixtureLoad {
  const metaPath = join(FIXTURE_DIR, `${name}.fixture.json`);
  const wldPath = join(FIXTURE_DIR, `${name}.wld.json.gz`);
  let meta: FixtureMeta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8')) as FixtureMeta;
  } catch {
    throw new Error(
      `[world-fixtures] 档案 ${name} 缺元数据（${metaPath}）。`
      + ' 先再产：SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts -t "'
      + name + '"（策略见 tests/README.md）',
    );
  }
  let json: string;
  try {
    json = new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(wldPath))));
  } catch {
    throw new Error(
      `[world-fixtures] 档案 ${name} 缺世界存档（${wldPath}）。`
      + ' 先再产：SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts -t "'
      + name + '"（策略见 tests/README.md）',
    );
  }
  const { world } = loadSave(json);
  // 生成态不落档域回填（同拍侧车；形状以生成端采集为准）
  if (meta.side?.seedFlags) world.seedFlags = { ...meta.side.seedFlags };
  if (meta.side?.trees?.length) world.trees = meta.side.trees.map((t) => ({ ...t }));
  if (meta.side?.starterTownNpcs?.length) {
    world.starterTownNpcs = meta.side.starterTownNpcs.map((s) => ({ ...s }));
  }
  return { world, fixture: meta };
}

/** 只取世界（多数内容断言测试用） */
export function loadFixtureWorld(name: string): World {
  return loadFixture(name).world;
}

// ★C 档测试可移植性（2026-10-18）：档案 gz 不入 git（.gitignore；由生成端本地再产）——
//   他人 clone 缺档时消费端不再红，改 it/describe.skipIf(fixtureMissing(...)) 跳过
//   （本机档案在=真跑，零语义变化）。与 tests/fixturePath.ts 的 localFixtureMissing
//   同族：缺档提示一条 console，不 throw。
const hinted = new Set<string>();
export function fixtureMissing(...names: string[]): boolean {
  const miss = names.filter((n) => {
    const gz = existsSync(join(FIXTURE_DIR, `${n}.wld.json.gz`));
    const meta = existsSync(join(FIXTURE_DIR, `${n}.fixture.json`));
    return !(gz && meta);
  });
  for (const n of miss) {
    if (hinted.has(n)) continue;
    hinted.add(n);
    console.warn(
      `[world-fixtures] 档案 ${n} 缺失——相关用例将 skip。`
      + ` 再产：SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts -t "${n}"`
      + `（策略见 tests/README.md；clone 侧缺档=正常形态）`,
    );
  }
  return miss.length > 0;
}
