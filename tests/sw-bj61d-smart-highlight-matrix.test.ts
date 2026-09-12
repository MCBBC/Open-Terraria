// SW-BJ61-d（2026-09-12）空手「地面暗黄痕迹」四矩阵测试 —— 光照{0,中,亮}×智能光标{关,开}
// ×{宝箱,纯地面} 语义矩阵（实机镜像探针 = scripts/_bj61d.mjs,25/25 绿）。
//
// 【金标锚（1457 终值;1458 同域逐字同——Player.cs:17488-17512 仅行号漂移）】
//   · 高亮色：Colors.GetSelectionGlowColor（Colors.cs:127-130）
//       (!selected) → (avg/2, avg/2, avg/2, avg)   ——灰白（未选中档）
//        selected  → (avg, avg, avg/3, avg)        ——黄调（选中档）
//   · 门：TileDrawing.GetTileOutlineInfo（TileDrawing.cs:4518-4528）
//       avg = (tileLight.R+G+B)/3 整除（:4522）;num > 10 才画（:4523-4525）——
//       暗处 avg=0 ⇒ rgba(0,0,0,0)=全透明=【原版语义下暗处"痕迹"不可见】;
//       tileLight = Lighting.GetColor(x,y)（:880,GetTileOutlineInfo ref 传入 :903）。
//   · 高亮面：Main.InSmartCursorHighlightArea（Main.cs:4042-4052）=
//       SmartInteractTileCoords（交互候选整件足迹,TileSmartInteractCandidateProvider.cs:
//       321-329 只装候选件）∩ 扫描域±10 —— 普通地面【永不入集】。
//   · 触发面：Player.SmartInteractLookup（Player.cs:17490-17513）
//       (!ShowGamepadHints && !SmartCursorIsUsed) || !mouseItem.IsAir → 整支清空;
//       Main.mouseItem = 光标拖拽件（背包关恒 air;Player.cs:5133-5136 关包掉落即证）
//       ——【与手持工具无关】,空手/持镐同面。
//   · 黄框：DrawSmartCursor（Main.cs:47385-47442）门 = SmartCursorShowing
//       （SmartCursorHelper.cs:161 仅 fX/fY 命中置位）;空手（pick/axe/hammer 全 0）
//       在 Step_ForceCursorToAnyMinableThing（:2239-2272 三支 item.axe/hammer/pick<1
//       即 false）与其余全 Step 的持物门下 fX/fY 恒 -1 ⇒ 空手无黄框=原版本相。
//
// 【仓库链】Renderer.drawSmartInteractTileHighlights（Renderer.ts:15205-15263,avg 门
//   :15236）+ Game.tickSmartInteractTiles（Game.ts:32712-32753 门序）+
//   SmartInteractTiles.sheetOfStoreType 域归一（BJ61:store.type=内部 id 域,表=vanilla
//   sheet 域——internal 21 高草曾吃 sheet21 宝箱候选=用户实报暗黄痕迹根因）。
// 【变异证红】M1 sheetOfStoreType→identity ⇒ §B 红;M2 GetSelectionGlowColor 未选中
//   档→[avg,avg,avg] ⇒ §A 红;M3 Renderer avg 门 10→-1 ⇒ §D 红（各已实测）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import {
  scanSmartInteractTiles,
  clearSmartInteractTileFrame,
  smartInteractTileFrame,
  FILL_TARGET_TYPES,
} from '../src/core/SmartInteractTiles';
import { TILE_HAS_OUTLINES, getSelectionGlowColor } from '../src/render/TileHighlight';
import { SmartCursor, DEFAULT_SMART_CURSOR_SETTINGS, type SmartCursorEnv } from '../src/player/SmartCursor';
import { TILE_DEFS } from '../src/data/tiles';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, '..', p), 'utf8');

/** 夹具入参统一 vanilla sheet 域,写 store 转内部 id（与生产链 sheetOfStoreType 同式） */
function internalOfSheet(sheet: number): number {
  const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

function makeScene(): TileStore {
  const st = new TileStore(100, 120);
  // 石地板行 y=104（x 30..44）;宝箱 2×2 @ (36,100);地面 canary 带：
  //   泥土(0)/草(2)@104、高草(3)@103、木块(30)@100、平台(19)@100
  for (let x = 30; x <= 44; x++) {
    const si = st.idx(x, 104);
    st.type[si] = internalOfSheet(1); st.flags[si] = 1;   // stone
  }
  for (const [sheet, x, y] of <Array<[number, number, number]>>[
    [0, 33, 104], [2, 40, 104], [3, 40, 103], [30, 42, 100], [19, 43, 100],
  ]) {
    const si = st.idx(x, y);
    st.type[si] = internalOfSheet(sheet); st.flags[si] = 1;
  }
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const si = st.idx(36 + i, 100 + j);
    st.type[si] = internalOfSheet(21); st.flags[si] = 1;
    st.frameX[si] = i * 18; st.frameY[si] = j * 18;
  }
  return st;
}

// 扫描域 30..44 × 96..106（覆盖宝箱+canary 全带）;mousevec 世界 px
const LX = 30, LY = 96, HX = 44, HY = 106;
const mouseAt = (tx: number, ty: number): [number, number] => [tx * 16 + 8, ty * 16 + 8];

describe('SW-BJ61-d §A 高亮色/门金标（Colors.cs:127-130 + TileDrawing.cs:4522-4525）', () => {
  it('GetSelectionGlowColor 全 avg 域 0..255 双档逐值 1:1（未选中 avg/2 灰、选中 avg/3 蓝）', () => {
    for (let avg = 0; avg <= 255; avg++) {
      expect(getSelectionGlowColor(false, avg)).toEqual([
        Math.floor(avg / 2), Math.floor(avg / 2), Math.floor(avg / 2), avg,
      ]);
      expect(getSelectionGlowColor(true, avg)).toEqual([
        avg, avg, Math.floor(avg / 3), avg,
      ]);
    }
  });

  it('avg 门决策矩阵（:4523 num>10）：avg=10 不画/11 画——暗处 avg=0 全透明=痕迹不可见', () => {
    const draw = (light: readonly [number, number, number]): boolean => {
      const [r, g, b] = light;
      return Math.floor((r + g + b) / 3) > 10;             // TileDrawing.cs:4522-4525
    };
    const expectDraw = (light: readonly [number, number, number], want: boolean, why: string) => {
      expect(draw(light), why).toBe(want);
    };
    // 实机探针三态（scripts/_bj61d.mjs 实测 avg 0/109/159）的代表光带
    expectDraw([0, 0, 0], false, 'L0 纯黑：avg=0 ⇒ rgba(0,0,0,0) 不可见（暗处无痕迹=原版语义）');
    expectDraw([10, 10, 10], false, 'avg=10 边界：num>10 严格,10 不画');
    expectDraw([33, 0, 0], true, 'avg=11 边界：11 画');
    expectDraw([51, 45, 30], true, '中等光带 avg=42 画（探针 Lmid 实测 109 同判）');
    expectDraw([200, 190, 170], true, '明亮光带 avg=186 画（探针 Lbright 实测 159 同判）');
  });

  it('暗处「隐约度」量化：未选中档合成贡献 avg≤42 时 ≤7/255——暗黄痕迹在原版语义下不可察', () => {
    // 中低光 avg=42：rgb=21,α=42/255——纯黑底合成每通道 21×42/255≈3.5（XNA AlphaBlend
    // 直通 α）;α=42/255≈0.165。与 BJ61 已回滚的「恒亮分歧」对照面。
    const [r, g, b, a] = getSelectionGlowColor(false, 42);
    expect([r, g, b, a]).toEqual([21, 21, 21, 42]);
    expect((r * a) / 255).toBeLessThanOrEqual(7);
  });
});

describe('SW-BJ61-d §B 地面 canary 扫描矩阵（域归一回归锁=用户实报直接面）', () => {
  it('canary 五型（泥土0/草2/高草3/木块30/平台19）不在候选谓词与 HasOutlines 两表', () => {
    for (const s of [0, 2, 3, 30, 19]) {
      expect(FILL_TARGET_TYPES.has(s), `sheet ${s} ∉ Fill 表`).toBe(false);
      expect(TILE_HAS_OUTLINES.has(s), `sheet ${s} ∉ HasOutlines`).toBe(false);
    }
    expect(TILE_HAS_OUTLINES.has(21)).toBe(true);   // 宝箱在场（对照面）
  });

  it('光标在箱上：coords=宝箱整件 4 格,canary 格零入集（修复前高草21吃sheet21=2×2 黄框画草上）', () => {
    const st = makeScene();
    const [mx, my] = mouseAt(37, 101);
    const scan = scanSmartInteractTiles(st, LX, LY, HX, HY, mx, my, Infinity, true);
    expect(scan.coords.sort((a, b) => a.x - b.x || a.y - b.y)).toEqual([
      { x: 36, y: 100 }, { x: 36, y: 101 }, { x: 37, y: 100 }, { x: 37, y: 101 },
    ]);
    expect(scan.selected.length).toBe(4);
    // canary 逐格断零
    const keys = new Set(scan.coords.map((c) => `${c.x},${c.y}`));
    for (const [x, y] of [[33, 104], [40, 104], [40, 103], [42, 100], [43, 100]] as const) {
      expect(keys.has(`${x},${y}`), `canary (${x},${y}) 不入集`).toBe(false);
    }
  });

  it('纯地面（无候选件）：winDist=null ⇒ tileWon 不置 ⇒ 渲染整支早退——任何光照无痕迹', () => {
    const st = makeScene();
    // 拆宝箱 → 纯地面
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const si = st.idx(36 + i, 100 + j);
      st.type[si] = 0; st.flags[si] = 0;
    }
    const [mx, my] = mouseAt(40, 103);                 // 光标正落高草
    const scan = scanSmartInteractTiles(st, LX, LY, HX, HY, mx, my, Infinity, true);
    expect(scan.winDist).toBeNull();
    expect(scan.coords.length).toBe(0);
    // 渲染侧同构早退（Renderer.ts:15211）
    clearSmartInteractTileFrame();
    smartInteractTileFrame.coords = scan.coords;
    expect(smartInteractTileFrame.coords.length === 0 || !smartInteractTileFrame.tileWon).toBe(true);
  });

  it('帧态清空链（Main.ClearSmartInteract Main.cs:48855-48863 tile 半边）：三字段全复位', () => {
    smartInteractTileFrame.tileWon = true;
    smartInteractTileFrame.coords = [{ x: 1, y: 2 }];
    smartInteractTileFrame.selected = new Set(['1,2']);
    clearSmartInteractTileFrame();
    expect(smartInteractTileFrame.tileWon).toBe(false);
    expect(smartInteractTileFrame.coords.length).toBe(0);
    expect(smartInteractTileFrame.selected.size).toBe(0);
  });
});

describe('SW-BJ61-d §C 空手黄框门（SmartCursorHelper.cs:2239-2272 三支工具力门）', () => {
  function env(st: TileStore, mouse: { x: number; y: number }, held: { def: null; tool: null | { type: 'pick'; power: number } }): SmartCursorEnv {
    // 站位 tile 37：tileRegion reach 5 → 扫描域 32..43 × 98..106（覆盖 canary 全带
    // 40..43 与宝箱 36..37——旧 tile 32 站位 HX=38,鼠标格 40 超程被原版
    // InTileBounds 门拒（SmartCursorHelper.cs:2255）=门在而测试假红）
    const actor = { x: 37 * 16, y: 104 * 16 - 42, w: 20, h: 42, cx: 37 * 16 + 10, cy: 104 * 16 - 21, facing: 1 };
    return {
      st, mouse, actor, held,
      settings: { ...DEFAULT_SMART_CURSOR_SETTINGS },
      tileBoost: 0, wireToolMode: 0, occupants: [], controlUseItem: false,
    };
  }

  it('空手（pick/axe/hammer=0）悬停地面 canary 全带：showing=false——黄框不画（S5 实机镜像）', () => {
    const st = makeScene();
    const sc = new SmartCursor();
    sc.wanted = true;                                  // Main.SmartCursorIsUsed
    for (const [tx, ty] of [[40, 103], [42, 100], [43, 100], [33, 103], [37, 102]] as const) {
      sc.lookup(env(st, { x: tx * 16 + 8, y: ty * 16 + 8 }, { def: null, tool: null }));
      expect(sc.showing, `空手 (${tx},${ty}) 无目标`).toBe(false);
    }
  });

  it('对照支（判别力）：持镐悬停高草（非实心可杀）→ showing=true——门是工具力非链断', () => {
    const st = makeScene();
    const sc = new SmartCursor();
    sc.wanted = true;
    sc.lookup(env(st, { x: 40 * 16 + 8, y: 103 * 16 + 8 }, { def: null, tool: { type: 'pick', power: 35 } }));
    expect(sc.showing).toBe(true);
    expect([sc.x, sc.y]).toEqual([40, 103]);
  });
});

describe('SW-BJ61-d §D 渲染/驱动 wiring 锁（BJ63 环⑦式;变异 M3 证红）', () => {
  const renderer = read('src/render/Renderer.ts');
  const game = read('src/core/Game.ts');
  const sit = read('src/core/SmartInteractTiles.ts');
  const th = read('src/render/TileHighlight.ts');

  it('Renderer 高亮支门序在链：tileWon 早退/avg>10 门/域归一/选中档消费/mask 域', () => {
    expect(renderer).toContain('if (!frame.tileWon || frame.coords.length === 0) return;');
    expect(renderer).toContain('if (avg <= 10) continue;');
    expect(renderer).toContain('const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;');
    expect(renderer).toContain('getSelectionGlowColor(frame.selected.has(');
    expect(renderer).toContain('const mask = loadHighlightMask(sheet);');
  });

  it('Game 驱动面门序在链（Player.cs:17497-17498 域）：wanted/uiHeldItem/block/winDist/胜出', () => {
    expect(game).toContain('if (!this.smartCursor.wanted || this.player.dead) return;');
    expect(game).toContain('if (this.uiHeldItemRef?.()) return;');
    expect(game).toContain('if (shouldBlockSmartInteract(this.world.store, gtx, gty)) return;');
    expect(game).toContain('if (scan.winDist === null) return;');
    expect(game).toContain('if (scan.winDist < this.smartInteractNpcDist) {');
  });

  it('黄框门（Main.cs:47387 SmartCursorShowing ≙ sc.showing）：hover.smart 仅 showing 置位', () => {
    expect(game).toContain('if (sc.showing && this.world.store.inBounds(sc.x, sc.y)) {');
    expect(renderer).toContain('if (hover?.smart) {');
  });

  it('BJ61 分歧回滚标记在位：smartHighlightSampleLight=恒等直通（用户复核=反编译语义）', () => {
    expect(th).toContain('return [light[0], light[1], light[2]];');
  });

  it('域归一单源在位：sheetOfStoreType 经 TILE_DEFS vanilla sheet 桥（三消费点同源）', () => {
    expect(sit).toContain('return TILE_DEFS[type]?.vanilla?.sheet ?? -1;');
    expect(sit.match(/sheetOfStoreType\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
