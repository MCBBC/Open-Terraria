// ★BJ663 杂件定谳批四件判别测试（2026-10-12）：
//   件1 533 致命球 Glow_128 本体罩（Main.cs:31588-31591 DrawProjDirect 亲读）——
//       本体后同矩形同参叠画 White×0.3（byte 截断 76）=glow mask 系 → pushGlowOps
//       'over' 逃逸队列（864 刃杖辉光/BJ625件3 同通道判例;非 Projectile.glowMask
//       字段面,不入 PROJ_GLOWMASK 表）。
//   件2 R15-F8 第二割面定谳+清偿（Projectile.cs:18021-18078 HandleMovement 撞格拍）：
//       支 A=仅 tile 484 速度外延盒（±1px）KillTile / 支 B=CrackedBricks 1/3 掷。
//       本仓 crushCrackedBricksSweptByProjectiles=支 B 既有超集（无门）→ 补
//       projSecondCutEligible 门（owner 投影=BJ293 friendly 数据面 + CanCutTiles
//       三表投影;【不】挂 npcProj/minion=原版第二割面无此二因）+ 支 A 484 补装。
//       并集差定谳：可感面=敌射弹越权碎裂砖（已修）+484 snap 1-2px 带（已补）;
//       不可感面=1/3 率统计差+死弹末拍盒（登记债,涉 BJ232 窗）。
//   件3 isVineAt 域错重写（BJ652 件2 isRopeAt 同族同刀）——TileID.Sets.IsVine
//       （TileID.cs:237 八员）经 vanillaIdOf+IS_VINE_SHEETS 单源;旧手抄表
//       {52,62,69,115,205,352,382,636,638} 直比内部 id=真藤恒假+九族撞表假阳。
//   件4 build-l10n 合并序定谳（BJ655）——built 'Saving...'≡BJ617 件3 嵌套正确版
//       意图（嵌套胜出=设计内;顶层点分键拆类别语义=l10n-merge.mjs:27-33）,
//       疑相悖【翻案销案】;真债=陈旧 flat 草稿残留（C1 结构闸只查顶层键=深度盲区
//       ——24 碰撞键+12 文件 FrameSkip 草稿泄漏已删,产物差=10 语言 FrameSkip
//       草稿值→en 兜底,余键序重排）→ 深度统一对账闸锁零容忍。
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET, TILE_DEFS } from '../src/data/tiles';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { isVineAt } from '../src/render/VanillaFraming';
import { projSecondCutEligible } from '../src/core/Game';
import { CUT_EXCLUDE_VIDS, CUT_EXCLUDE_AISTYLES, CUT_EXCLUDE_VIDS_TAIL } from '../src/entities/Entity';
import { flattenDeep, mergePacks } from '../scripts/l10n-merge.mjs';
// ★C档可移植:l10n 源目录(仓库外 tools/l10n-custom,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['tools/l10n-custom'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const V = join(ROOT, '..', 'Terarria1457');
const CUSTOM = join(ROOT, '..', 'tools', 'l10n-custom');
const BUILT = join(ROOT, 'public', 'l10n');
// ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const MAIN_CS = existsSync(join(V, 'Terraria', 'Main.cs')) ? readFileSync(join(V, 'Terraria', 'Main.cs'), 'utf8') : '';
const PROJ_CS = existsSync(join(V, 'Terraria', 'Projectile.cs')) ? readFileSync(join(V, 'Terraria', 'Projectile.cs'), 'utf8') : '';
const TILEID_CS = existsSync(join(V, 'Terraria.ID', 'TileID.cs')) ? readFileSync(join(V, 'Terraria.ID', 'TileID.cs'), 'utf8') : '';
const WORLDGEN_CS = existsSync(join(V, 'Terraria', 'WorldGen.cs')) ? readFileSync(join(V, 'Terraria', 'WorldGen.cs'), 'utf8') : '';   // ★C档可移植:缺档降级
const MINION_SRC = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');
const GAME_SRC = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const VF_SRC = readFileSync(join(ROOT, 'src/render/VanillaFraming.ts'), 'utf8');
const ENTITY_SRC = readFileSync(join(ROOT, 'src/entities/Entity.ts'), 'utf8');
const BUILD_L10N_SRC = readFileSync(join(ROOT, 'scripts/build-l10n.mjs'), 'utf8');
const CUSTOM_LANGS = ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'ja-JP', 'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU', 'zh-Hans', 'zh-Hant'];

// ─── 通用夹具（bj650 同式） ───
function makeHooks(): { hooks: GameHooks; player: Player } {
  const w = new World(200, 120, 7, 'bj663');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, player };
}

let minionSeq = 0;
const minion = (player: Player, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, pid, 6, 0, false, 0, false, () => player);
  m.id = ++minionSeq;
  m.x = cx - m.w / 2;
  m.y = cy - m.h / 2;
  return m;
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const cv: Record<string, unknown> = { width: 0, height: 0 };
      cv.getContext = () => new Proxy({}, { get: () => () => { /* noop */ }, set: () => true });
      return cv;
    },
    querySelector: () => null,
  };
});

// ===================== 件1：533 Glow_128 本体罩 =====================

describe.skipIf(EXT_MISSING)('BJ663件1：533 Glow_128 本体罩（Main.cs:31588-31591）', () => {
  it('原版锚：本体 :31578 后 else-if 533 支 White*0.3 同矩形同参（逐字）', () => {
    const i = MAIN_CS.indexOf('EntitySpriteDraw(value15, proj.Center + zero - screenPosition + new Vector2(0f, proj.gfxOffY + (float)num151), rectangle4, color48, rotation24, origin8, num192, dir);');
    expect(i, '本体绘 :31578 缺失').toBeGreaterThan(-1);
    const tail = MAIN_CS.slice(i, i + 1200);
    expect(tail).toContain('else if (proj.type == 533)');
    expect(tail).toContain('EntitySpriteDraw(TextureAssets.GlowMask[128].Value, proj.Center - screenPosition + new Vector2(0f, proj.gfxOffY), rectangle4, Microsoft.Xna.Framework.Color.White * 0.3f, proj.rotation, origin8, proj.scale, dir);');
    expect(tail).toContain('if (proj.type == 503)');
    expect(tail.indexOf('if (proj.type == 503)'), '503 if 在 533 else-if 之前（位序锁）').toBeLessThan(tail.indexOf('else if (proj.type == 533)'));
    // 533 无 num151/num152 专项（=0）与 zero=Vector2.Zero（:30635）→ glow 位≡本体位
    expect(MAIN_CS).toContain('Vector2 zero = Vector2.Zero;');
  });

  it('repo 落刀位：pushGlowOps over 逃逸 + byte 截断 76 色式（M1 红位）', () => {
    expect(MINION_SRC).toContain("tex: 'vanilla/Glow_128.png'");
    expect(MINION_SRC).toContain('tint: [76 / 255, 76 / 255, 76 / 255], alpha: 76 / 255');
    expect(MINION_SRC).toContain("sy: frame * img.height, sw: img.width, sh: img.height");
  });

  it('行为面：dFrame 帧切片同参 op（sy=frame×48/origin 帧心/blend over/76 色式）', () => {
    const { player } = makeHooks();
    const m = minion(player, 533, 50 * 16, 90 * 16);
    (m as unknown as { dFrame: number }).dFrame = 5;   // BJ635 状态帧通道直写（private 位,draw 侧消费）
    setProjSpriteOverride(533, { width: 48, height: 1008 } as never);   // 21 帧×48
    const glowOps: Array<Record<string, unknown>> = [];
    let gotM: unknown = null;
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, k) {
        if (k === 'canvas') return undefined;
        if (k === 'getTransform') return () => ({ __m: 1 });
        return () => { /* noop */ };
      },
      set(_t, k, v) { void k; void v; return true; },
    });
    const fakeR = {
      ctx,
      atlas: { ensureVImage: (f: string) => (f === 'vanilla/Glow_128.png' ? { width: 48, height: 1008 } : null) },
      lighting: { lightAt: () => [255, 255, 255] },
      pushGlowOps: (o: Array<Record<string, unknown>>, mm: unknown) => { glowOps.push(...o); gotM = mm; },
    };
    (m as unknown as { draw(r: unknown): void }).draw(fakeR);
    expect(glowOps.length, '恰 1 份本体罩 op（M1:删支=0）').toBe(1);
    const op = glowOps[0];
    expect(op.tex).toBe('vanilla/Glow_128.png');
    expect(op.sx).toBe(0);
    expect(op.sy).toBe(5 * 48);                    // rectangle4 帧切片同本体
    expect(op.sw).toBe(48);
    expect(op.sh).toBe(48);
    expect(op.dx).toBe(-24);                       // origin8=帧矩形心（:30634）
    expect(op.dy).toBe(-24);
    expect(op.blend).toBe('over');
    expect(op.tint).toEqual([76 / 255, 76 / 255, 76 / 255]);   // White*0.3 → (byte)76.5=76
    expect(op.alpha).toBeCloseTo(76 / 255, 6);
    expect(gotM, 'm=本体当帧矩阵（translate/rotate 后捕获）').toEqual({ __m: 1 });
  });
});

// ===================== 件2：R15-F8 第二割面 =====================

describe.skipIf(EXT_MISSING)('BJ663件2：第二割面定谳+落刀（Projectile.cs:18021-18078）', () => {
  it('原版锚：撞格拍门四因（:18021）+ 支 A 仅 484（:18027）+ 支 B 裂砖 1/3（:18059）', () => {
    const i = PROJ_CS.indexOf('if (owner == Main.myPlayer && CanCutTiles() && (friendly || hostile) && damage > 0)');
    expect(i, '第二割面门 :18021').toBeGreaterThan(-1);
    const a = PROJ_CS.slice(i, i + 2400);
    expect(a).toContain('.type == 484 && WorldGen.CanCutTile(i, j, TileCuttingContext.AttackProjectile)');
    expect(a).toContain('int num7 = (int)(position.X + velocity.X - 1f) / 16;');   // 速度外延 ±1px
    // 门面差：第二割面【无】!npcProj/!minion（中央收口 :12516 才有）——本仓门不挂二因的结构锁
    expect(a.slice(0, 90)).not.toContain('npcProj');
    const k = PROJ_CS.indexOf('if (Main.rand.Next(3) == 0 && owner == Main.myPlayer && CanCutTiles() && (friendly || hostile) && damage > 0)');
    const b = PROJ_CS.slice(k, k + 2400);
    expect(k, '支 B 1/3 掷 :18059').toBeGreaterThan(-1);
    expect(b).toContain('TileID.Sets.CrackedBricks[Main.tile[k, l].type]');
  });

  it('CanCutTiles 三表单源导出（Entity.ts）+ vanilla Projectile.cs:15407 同源', () => {
    expect(ENTITY_SRC).toContain('export const CUT_EXCLUDE_VIDS');
    expect(ENTITY_SRC).toContain('export const CUT_EXCLUDE_AISTYLES');
    expect(ENTITY_SRC).toContain('export const CUT_EXCLUDE_VIDS_TAIL');
    const j = PROJ_CS.indexOf('private bool CanCutTiles()');
    const body = PROJ_CS.slice(j, j + 1600);
    expect(body).toContain('aiStyle != 45 && aiStyle != 137 && aiStyle != 92 && aiStyle != 105 && aiStyle != 106');
    expect(body).toContain('return type != 1091');
    expect(CUT_EXCLUDE_VIDS_TAIL).toEqual(new Set([1091]));
    expect(CUT_EXCLUDE_AISTYLES.has(105) && CUT_EXCLUDE_AISTYLES.has(106)).toBe(true);
  });

  it('门纯核 projSecondCutEligible：owner 投影 BJ293 friendly-only + 三表投影（M3 红位）', () => {
    // 随从 533：friendly=true 且【无】minion 拒门 → 过（原版第二割面随从撞格照割）
    expect(projSecondCutEligible(533, { friendly: true, aiStyle: 66 }, {})).toBe(true);
    // 敌射 84 PinkLaser：hostile=true 但 friendly 缺 → 拒（BJ293 owner 投影;hostile 支=PvP 域登记）
    expect(projSecondCutEligible(84, { hostile: true, aiStyle: 1 }, {})).toBe(false);
    // vid=0 SW 自造弹：保守照准（BJ294 缺省向真）
    expect(projSecondCutEligible(0, undefined, {})).toBe(true);
    // 机关双旗 98：friendly=true → 过（vanilla 机关弹 owner=myPlayer 照割,Wiring.cs:1965）
    expect(projSecondCutEligible(98, { friendly: true, hostile: true, aiStyle: 14 }, {})).toBe(true);
    // CanCutTiles 投影：高尔夫 715（aiStyle 147）/ DD2 塔 aiStyle 105 / 尾支 1091 / 排除 vid 864
    expect(projSecondCutEligible(715, { friendly: true, aiStyle: 147 }, {})).toBe(false);
    expect(projSecondCutEligible(662, { friendly: true, aiStyle: 105 }, {})).toBe(false);
    expect(projSecondCutEligible(1091, { friendly: true, aiStyle: 203 }, {})).toBe(false);
    expect(projSecondCutEligible(864, { friendly: true, aiStyle: 164 }, {})).toBe(false);
    // 拒割位三面：noVanillaCut（敌射类级）/ reflected（反射支 friendly=false :67197）/ netPuppet（owner 端归属）
    expect(projSecondCutEligible(0, undefined, { noVanillaCut: true })).toBe(false);
    expect(projSecondCutEligible(533, { friendly: true, aiStyle: 66 }, { reflected: true })).toBe(false);
    expect(projSecondCutEligible(533, { friendly: true, aiStyle: 66 }, { netPuppet: true })).toBe(false);
  });

  it('repo 落刀位：crush sweep 挂门 + 支 A 484 速度外延 ±1px 补装', () => {
    expect(GAME_SRC).toContain('if (!projSecondCutEligible(vid, vid !== 0 ? projectileData(vid) : undefined, p)) continue;');
    expect(GAME_SRC).toContain('const rollingCactus = TILE_INTERNAL_BY_SHEET.get(484) ?? -1;');
    expect(GAME_SRC).toContain('this.cutTile(x, y, vid);            // KillTile 直派(:18038-18043) ≡ cutTile 候选路由');
    // ±1px 外延（:18023-18026 逐式）
    expect(GAME_SRC).toContain('Math.min(p.x, p.x + p.vx) - 1) / TILE');
    expect(GAME_SRC).toContain('Math.max(p.x, p.x + p.vx) + p.w + 1) / TILE');
    expect(GAME_SRC).toContain('const rollingCactus = TILE_INTERNAL_BY_SHEET.get(484) ?? -1;');
  });
});

// ===================== 件3：isVineAt 域错重写 =====================

describe.skipIf(EXT_MISSING)('BJ663件3：isVineAt IsVine 1:1（BJ652 isRopeAt 同族）', () => {
  const int = (sheet: number): number => TILE_INTERNAL_BY_SHEET.get(sheet) ?? -1;

  it('原版锚：TileID.cs:237 八员 + TileFrame 消费位 :82652（CheckVines 支）', () => {
    expect(TILEID_CS).toContain('public static bool[] IsVine = Factory.CreateBoolSet(52, 382, 62, 115, 205, 528, 636, 638);');
    expect(WORLDGEN_CS).toContain('if (TileID.Sets.IsVine[type] && !CheckVines(i, j, type, tile))');
  });

  it('era guard：旧手抄表退役 + vanillaIdOf/IS_VINE_SHEETS 单源接线', () => {
    expect(VF_SRC).not.toContain('[52, 62, 69, 115, 205, 352, 382, 636, 638]');   // 旧表零残留
    expect(VF_SRC).toContain('return IS_VINE_SHEETS.has(vanillaIdOf(st.type[k0]));');
    expect(VF_SRC).toContain('IS_VINE_SHEETS } from \'../data/tiles\'');
  });

  it('行为面：八员真表（真藤内部 id 全命中）+ 荆棘 69/352 脱表 + 528 补装', () => {
    const st = new TileStore(24, 24);
    expect(isVineAt(st, -1, 0), '界外恒假').toBe(false);
    const put = (x: number, y: number, sheet: number, flags = 1) => {
      const i = st.idx(x, y);
      st.type[i] = int(sheet);
      st.flags[i] = flags;
    };
    const vines = [52, 62, 115, 205, 382, 528, 636, 638];
    vines.forEach((sheet, k) => put(2 + k, 2, sheet));
    vines.forEach((sheet, k) => expect(isVineAt(st, 2 + k, 2), `sheet ${sheet} 真藤`).toBe(true));
    // 荆棘族（旧表多员）恒假：69 丛林荆棘/352 猩红荆棘
    put(2, 5, 69);
    put(3, 5, 352);
    expect(isVineAt(st, 2, 5), '69 荆棘非 vine').toBe(false);
    expect(isVineAt(st, 3, 5), '352 荆棘非 vine').toBe(false);
  });

  it('行为面：内部 id 撞表九族全假（域错判别力——旧实现全真,变异必红）', () => {
    const st = new TileStore(24, 24);
    // 内部 id 52/62/69/115/205/352/382/636/638 = 硬化沙/椅/浴缸/史莱姆块/碗/琥珀火花/血月魔镜/兔笼/松鼠笼
    const internals = [52, 62, 69, 115, 205, 352, 382, 636, 638];
    internals.forEach((id, k) => {
      const i = st.idx(2 + k, 3);
      st.type[i] = id;
      st.flags[i] = 1;
    });
    internals.forEach((id, k) => expect(isVineAt(st, 2 + k, 3), `内部 id ${id}(${TILE_DEFS[id]?.key}) 非藤`).toBe(false));
  });

  it('行为面：幽灵格（flags=0）恒假——:82652 消费前置 active 门同相', () => {
    const st = new TileStore(8, 8);
    const i = st.idx(4, 4);
    st.type[i] = int(52);
    st.flags[i] = 0;
    expect(isVineAt(st, 4, 4), '幽灵残型不视作藤').toBe(false);
  });
});

// ===================== 件4：build-l10n 合并序定谳 + 全 custom 对账 =====================

describe.skipIf(EXT_MISSING)('BJ663件4：l10n 合并序定谳（BJ655 翻案）+ 深度统一对账闸', () => {
  /** 深度统一 flat∩嵌套碰撞检测（C1 顶层盲区补口）：任一完整路径若同时以
   *  「字面点分键」与「嵌套路径叶」（或两种点分形态）可达 = 碰撞。 */
  function collisions(src: string): Array<{ path: string; forms: string[] }> {
    const byPath = new Map<string, string[]>();
    const walk = (o: Record<string, unknown>, p: string) => {
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object') walk(v as Record<string, unknown>, p + k + '.');
        else {
          const path = p + k;
          const forms = byPath.get(path) ?? [];
          forms.push(k.includes('.') ? 'flat' : 'nested');
          byPath.set(path, forms);
        }
      }
    };
    walk(JSON.parse(src), '');
    return [...byPath.entries()].filter(([, forms]) => forms.length > 1).map(([path, forms]) => ({ path, forms }));
  }

  it('定谳锚：合并序=设计内（分片→custom en→custom target→target 分片,build-l10n 头注）', () => {
    // ★BJ655 翻案：built UI.Saving='Saving...'（嵌套胜出）≡ BJ617 件3「陈旧 flat 草稿
    // 不遮蔽嵌套正确版」意图——嵌套正确版胜出=设计内,非相悖。合并序头注=设计文档。
    expect(BUILD_L10N_SRC).toContain('en 7 分片 → custom en → custom <target> → <target> 7 分片');
    // flattenDeep 语义锚：顶层点分键按首段拆类别（:27-33）→ Mods 内点分键与嵌套同槽
    const flat = flattenDeep({ Mods: { 'SandboxWorld.UI.Saving': 'A' } });
    const nested = flattenDeep({ Mods: { SandboxWorld: { UI: { Saving: 'B' } } } });
    expect(flat.Mods).toEqual({ 'SandboxWorld.UI.Saving': 'A' });
    expect(nested.Mods).toEqual({ 'SandboxWorld.UI.Saving': 'B' });
    // 同文件内 Object.assign 按序覆盖=文件序偶然胜出 → 结构闸（下测）才是设计约束
    const merged = mergePacks([flat, nested]).out;
    expect(merged.Mods['SandboxWorld.UI.Saving']).toBe('B');
  });

  it('全 custom 对账：12 语言深度统一 flat∩嵌套碰撞=0（C1 深度盲区补口,M4 红位）', () => {
    for (const lang of CUSTOM_LANGS) {
      const src = readFileSync(join(CUSTOM, `${lang}.json`), 'utf8');
      const hits = collisions(src);
      expect(hits, `${lang} flat 重复键组必须为空（陈旧草稿残留=根因）`).toEqual([]);
    }
  });

  it('草稿值泄漏零容忍：Frame Mode (vanilla FrameSkipMode) 全 12 语言零残留', () => {
    for (const lang of CUSTOM_LANGS) {
      const src = readFileSync(join(CUSTOM, `${lang}.json`), 'utf8');
      expect(src, `${lang} 残留草稿值`).not.toContain('Frame Mode (vanilla FrameSkipMode)');
    }
  });

  it('产物锁：UI.Saving 嵌套版在位 + 10 语言 FrameSkip 回落 en 兜底 + Menu 嵌套译名', () => {
    const en = JSON.parse(readFileSync(join(BUILT, 'en-US.json'), 'utf8'));
    const zh = JSON.parse(readFileSync(join(BUILT, 'zh-Hans.json'), 'utf8'));
    const de = JSON.parse(readFileSync(join(BUILT, 'de-DE.json'), 'utf8'));
    const ja = JSON.parse(readFileSync(join(BUILT, 'ja-JP.json'), 'utf8'));
    expect(en.Mods['SandboxWorld.UI.Saving']).toBe('Saving...');
    expect(zh.Mods['SandboxWorld.UI.Saving']).toBe('正在保存…');
    expect(en.Mods['SandboxWorld.Settings.FrameSkip']).toBe('Frame Skip');
    expect(zh.Mods['SandboxWorld.Settings.FrameSkip']).toBe('跳帧');
    expect(de.Mods['SandboxWorld.Settings.FrameSkip'], '草稿值删除后回落 enBase').toBe('Frame Skip');
    expect(ja.Mods['SandboxWorld.Settings.FrameSkip']).toBe('Frame Skip');
    expect(de.Mods['SandboxWorld.Menu.BuyTerraria'], '嵌套译名胜出（旧 flat 英稿退役）').toBe('Terraria kaufen');
  });
});
