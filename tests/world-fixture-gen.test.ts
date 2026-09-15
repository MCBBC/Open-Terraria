// ★IIIII259 测试世界档案库——生成端（门控工具，非常规回归测试）
//
// 用法（在 game/ 下）：
//   SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts                 # 全量（建议分三组并行，见 SW_FIXTURE_GROUP）
//   SW_GEN_WORLD_FIXTURES=1 SW_FIXTURE_GROUP=a npx vitest run tests/world-fixture-gen.test.ts
//   SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts -t "small"      # 单档位再产
// 不带 SW_GEN_WORLD_FIXTURES 时整文件 skip（零开销，防误触发生成）。
//
// 与消费端（tests/world-fixtures.ts loadFixtureWorld）的关系：
//   - 每个档案 = 固定种子一次 generateWorld → saveWorldOnly（游戏自身存档路径）→
//     gzip 落 tests/fixtures/worlds/<name>.wld.json.gz + 元数据/侧车 <name>.fixture.json；
//   - 落盘后立即经**消费端同一条 loadSave 链**读回，对 type/flags/wall/liquid/frameX/frameY
//     六通道 fnv1a 指纹 + 侧车域（trees/starterTownNpcs/gs.*）做生成↔载入全等自证——
//     "载入世界与生成世界同结果"由本自证在档案产出时一次性钉死；
//   - 档案文件不入库（.gitignore）；本测试+消费端 lib+档案清单随仓（用户指令：
//     gitignore + 生成脚本入库随仓）。世界生成代码漂移后档案不自动失效——
//     内容测试锚的是"当时生成的世界"，生成过程活性由必须生成的套件守卫
//     （caves-checkpoint/world-final-hash/drunk-world-gen/gen-loot-passes/_fullgen-smoke）。
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'fflate';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { saveWorldOnly } from '../src/save/SaveFile';
import type { World } from '../src/world/World';
import { fnv1a } from './pass-hash.test';
import { loadFixture, FIXTURE_DIR, type FixtureMeta } from './world-fixtures';

const GEN = !!process.env.SW_GEN_WORLD_FIXTURES;
const GROUP = process.env.SW_FIXTURE_GROUP; // a/b/c 三组并行（18 核机 wall ~30min）
const ONLY = process.env.SW_FIXTURE_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);

interface Spec {
  name: string;
  group: 'a' | 'b' | 'c';
  cfg: FixtureMeta['cfg'];
  /** 生成态不落档域采集开关/字段 */
  side?: { trees?: boolean; starterTownNpcs?: boolean; gsFields?: string[] };
  source: string;   // 来源测试文件（策略审计字段）
  notes: string;
}

/** 档案清单（IIIII259 Top-14 慢文件迁移所需 + 通用档位）。cfg 与迁移用例逐字同构——
 *  改测试种子必须同步这里再产档案（详见 tests/README.md「测试世界使用策略」）。 */
const SPECS: Spec[] = [
  // ── 通用档位（新测试优先从这里取）───────────────────────────────
  { name: 'small', group: 'c', cfg: { width: 4200, height: 1200, seedText: '9293480', evil: 0 },
    source: '通用（本仓测试标准种子）', notes: '小档位 4200×1200（_b4-1457-probe 两用例同款配置）' },
  { name: 'medium', group: 'b', cfg: { width: 6400, height: 1800, seedText: '9293480', evil: 0 },
    source: '通用', notes: '中档位 6400×1800（新测试默认先取 small/medium）' },

  // ── _iii6-starter-npcs（18.8min→载入；主题=SpawnStarterNPCs 决策链，世界仅是载体；
  //     pass 活性由文件内 canary 用例以 starterNpcsPass 独立重放守卫）──
  { name: 'iii6-celeb-tenth', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: '1999040562', seedFlags: { tenthAnniversary: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts',
    notes: '十周年五初始镇民（x86 w.wld 锚 world）' },
  { name: 'iii6-celeb-plain', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: '1999040562', seedFlags: {}, evil: 0 },
    source: 'tests/_iii6-starter-npcs.test.ts', notes: '非十周年零副作用早退负例' },
  { name: 'iii6-vampire', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: 'whatahorriblenighttohaveacurse', seedFlags: { vampireSeed: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '动物学家臂' },
  { name: 'iii6-remix', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: 'dontdigup', seedFlags: { remix: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '税务员臂' },
  { name: 'iii6-notbees', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: 'notthebees', seedFlags: { notTheBees: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '商人臂' },
  { name: 'iii6-ftw', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: 'fortheworthy', seedFlags: { getGoodWorld: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '爆破匠臂' },
  { name: 'iii6-purifythis', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: 'purifythis', seedFlags: { infectedSeed: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '德鲁伊 var1 臂' },
  { name: 'iii6-drunknotbees', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: '05162020', seedFlags: { drunkWorld: true, notTheBees: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '优先级臂（notBees 截胡）' },
  { name: 'iii6-celeb-remix', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: '1999040562', seedFlags: { tenthAnniversary: true, remix: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '十周年×remix 首臂=税务员' },
  { name: 'iii6-celeb-infected', group: 'a',
    cfg: { width: 4200, height: 1200, seedText: '1999040562', seedFlags: { tenthAnniversary: true, infectedSeed: true }, evil: 0 },
    side: { starterTownNpcs: true }, source: 'tests/_iii6-starter-npcs.test.ts', notes: '十周年×infected 首臂=德鲁伊' },

  // ── sw-bj42 魔法海螺（6 种子决定论普查；gs 深度分位域常量随侧车）──
  ...(['a', 'b', 'c', 'd', 'e', 'f'] as const).map((k) => ({
    name: `bj42-${k}`, group: 'b' as const,
    cfg: { width: 4200, height: 1200, seedText: `bj42-${k}` } as FixtureMeta['cfg'],
    side: { gsFields: ['desertHiveHigh', 'desertHiveLow'] },
    source: 'tests/sw-bj42-magic-conch.test.ts',
    notes: `沙漠箱海螺普查种子 bj42-${k}（lastGenState 域常量侧车化）`,
  })),

  // ── snow-biome-plants（同种子三 evil；name 字段 display-only，断言面只扫 tiles）──
  { name: 'snow-12345-e-m1', group: 'c',
    cfg: { width: 4200, height: 1200, seedText: '12345', name: 'snow', evil: -1 },
    source: 'tests/snow-biome-plants.test.ts', notes: 'evil=-1（t1 直用；t2 mk(-1) 复用）' },
  { name: 'snow-12345-e0', group: 'c',
    cfg: { width: 4200, height: 1200, seedText: '12345', name: 'b', evil: 0 },
    source: 'tests/snow-biome-plants.test.ts', notes: 'evil=0（t2 直方图）' },
  { name: 'snow-12345-e1', group: 'c',
    cfg: { width: 4200, height: 1200, seedText: '12345', name: 'b', evil: 1 },
    source: 'tests/snow-biome-plants.test.ts', notes: 'evil=1（t2 直方图）' },

  // ── _treebottom-world-audit / _treebottom-view（两文件共用同一 8400×2400 世界；
  //     World.trees 生成期登记不落档→侧车回填）──
  { name: 'tb-8400-1814620304', group: 'c',
    cfg: { width: 8400, height: 2400, seedText: '1814620304', evil: -1 },
    side: { trees: true }, source: 'tests/_treebottom-world-audit.test.ts + _treebottom-view.test.ts',
    notes: '用户报"模型根基"世界全量（两文件共 12.1min→载入 2×）' },

  // ── _b4-1457-probe（9293480 两用例复用 small 档位）──
  { name: 'b4-seed44', group: 'c',
    cfg: { width: 4200, height: 1200, seedText: '44', evil: 0 },
    source: 'tests/_b4-1457-probe.test.ts', notes: 'makeTemple 蜥蜴砖体量用例' },

  // ── sw-bj48 传送药水（2000×700 迷你档六种子；8 连用掷域/落点安全面）──
  ...(['a', 'b', 'c', 'd', 'e', 'f'] as const).map((k) => ({
    name: `bj48-${k}`, group: 'b' as const,
    cfg: { width: 2000, height: 700, seedText: `bj48-${k}` } as FixtureMeta['cfg'],
    source: 'tests/sw-bj48-teleport-potion.test.ts',
    notes: `传送药水真世界落点种子 bj48-${k}`,
  })),

  // ── sw-bj43 魔法海螺落点（对拍金标世界两枚）──
  { name: 'bj43-b', group: 'c', cfg: { width: 4200, height: 1200, seedText: 'bj43-b' },
    source: 'tests/sw-bj43-conch-landing.test.ts', notes: '金标落点对拍种子 b' },
  { name: 'bj43-c', group: 'c', cfg: { width: 4200, height: 1200, seedText: 'bj43-c' },
    source: 'tests/sw-bj43-conch-landing.test.ts', notes: '金标落点对拍种子 c' },
];

/** 六通道指纹（type/flags/wall/liquid/frameX/frameY）——生成↔载入守恒判据 */
function fingerprints(world: World): Record<string, string> {
  const st = world.store;
  return {
    type: fnv1a(st.type), flags: fnv1a(st.flags), wall: fnv1a(st.wall),
    liquid: fnv1a(st.liquid), frameX: fnv1a(st.frameX), frameY: fnv1a(st.frameY),
  };
}

const d = GEN ? describe : describe.skip;

d('IIIII259 测试世界档案库生成（SW_GEN_WORLD_FIXTURES=1 门控）', () => {
  const specs = SPECS.filter((s) => (!GROUP || s.group === GROUP) && (!ONLY || ONLY.includes(s.name)));
  it(`清单自检：${specs.length} 个档案待产（group=${GROUP ?? 'all'}）`, () => {
    expect(specs.length, '档案清单不应为空').toBeGreaterThan(0);
    const names = new Set(SPECS.map((s) => s.name));
    expect(names.size, '档案名不得重复').toBe(SPECS.length);
  });

  for (const s of specs) {
    it(`生成档案 ${s.name}（${s.cfg.width}×${s.cfg.height} seed=${s.cfg.seedText}）`, { timeout: 2_400_000 }, async () => {
      const t0 = Date.now();
      const world = await generateWorld({ ...s.cfg });
      const genMs = Date.now() - t0;

      // 生成态侧车采集（生成态而不落 SaveData 的域，同拍钉值）
      // ★seedFlags：saveWorldOnly/buildSaveParts 服务器世界档现不携带 seedFlags
      //   （全量 saveGame 路径才有,SaveFile.ts:61 vs buildSaveParts）——档案经
      //   saveWorldOnly 落盘必丢旗标 → 侧车按生成态 world.seedFlags（cfg 直注或
      //   seedText 派生的有效集,WorldGen.ts:218）权威钉值。
      const side: FixtureMeta['side'] = { seedFlags: { ...(world.seedFlags ?? {}) } };
      if (s.side?.trees) side.trees = world.trees.map((t) => ({ ...t }));
      if (s.side?.starterTownNpcs) side.starterTownNpcs = world.starterTownNpcs?.map((n) => ({ ...n }));
      if (s.side?.gsFields?.length) {
        const gs = lastGenState();
        side.gs = {};
        for (const f of s.side.gsFields) {
          const v = gs?.[f as keyof typeof gs];
          side.gs[f] = typeof v === 'number' ? v : Number(v);
        }
      }

      const genFp0 = fingerprints(world);      // 生成态原貌指纹（存档备查）
      // ★读档边界同语义净化（SaveFile.loadSaveData 尾 purgeGhostTiles 同款：原版
      //   SaveTile 对非活格不写 type→读档本无幽灵）。档案落盘前净化=档案世界
      //   ≡「该世界被游戏读档页载入后的活存储」，消费端 loadSave 再净化为幂等。
      //   生成态↔载入态的全部差异=本净化（type/frameX/frameY 的幽灵格域；
      //   flags/wall/liquid 逐位无差——bj48-a 实测 0 失配）。
      const ghostsPurged = world.store.purgeGhostTiles();
      // ★空格帧口径统一：loadSaveData 解码段对 t==0 游程不读帧（`let fx=0, fy=0`
      //   初值，SaveFile tiles 段）→ 读档产物空格帧恒 0；而 purgeGhostTiles 置
      //   65535(-1)。档案落盘前把空格帧统一到读档解码口径（0），使档案世界
      //   ≡ loadSave 产物逐位全等（bj48-a 实测：除此之外 0 残差）。
      { const ty = world.store.type, fx = world.store.frameX, fy = world.store.frameY;
        for (let i = 0; i < ty.length; i++) if (ty[i] === 0) { fx[i] = 0; fy[i] = 0; } }
      const genFp = fingerprints(world);       // 比较基线=读档语义后的形态
      const json = saveWorldOnly(world);
      const rawBytes = json.length;

      mkdirSync(FIXTURE_DIR, { recursive: true });
      writeFileSync(`${FIXTURE_DIR}/${s.name}.wld.json.gz`, gzipSync(new TextEncoder().encode(json)));
      const meta: FixtureMeta = {
        name: s.name, cfg: s.cfg, source: s.source, notes: s.notes,
        generatedAt: new Date().toISOString(), fingerprints: genFp, side,
        genFingerprints: genFp0, ghostsPurged,
      };
      writeFileSync(`${FIXTURE_DIR}/${s.name}.fixture.json`, JSON.stringify(meta, null, 1));

      // ── 生成↔载入往返自证（走消费端同一条 loadSave 链）——同世界同断言的根据 ──
      const t1 = Date.now();
      const { world: rt, fixture: rtMeta } = loadFixture(s.name);
      const loadMs = Date.now() - t1;
      const rtFp = fingerprints(rt);
      for (const k of Object.keys(genFp)) {
        expect(rtFp[k], `${s.name} 载入↔生成指纹守恒（${k}）`).toBe(genFp[k]);
      }
      if (side.trees) expect(rt.trees.length, `${s.name} trees 侧车回填`).toBe(side.trees.length);
      if (side.starterTownNpcs) {
        expect(rt.starterTownNpcs, `${s.name} starterTownNpcs 侧车回填`).toEqual(side.starterTownNpcs);
      }
      if (side.gs) {
        for (const [k, v] of Object.entries(side.gs)) {
          expect(Number.isFinite(v), `${s.name} gs.${k} 数值化`).toBe(true);
          expect(rtMeta.side?.gs?.[k], `${s.name} gs.${k} 侧车读取`).toBe(v);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[world-fixture-gen] ${s.name}: gen=${(genMs / 60000).toFixed(1)}min `
        + `save=${(rawBytes / 1048576).toFixed(1)}MB load=${(loadMs / 1000).toFixed(1)}s fp=${genFp.type.slice(0, 8)}`);
    });
  }
});
