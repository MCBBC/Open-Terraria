// ★BJ557（2026-10-07）放置预览幽灵判别测试。
// 定谳：开关 Main.placementPreview 的设置面（Options.ts:132/Settings.ts:764）早已在册，
// 效果面（TileObject.objectPreview 状态 + TileObject.DrawPreview 绘制）整链未移植 =
// 开关空转（用户实报「放置预览开了没有效果」）。本测试钉死移植后的三面：
//   A. 数据面金标——_usesCustomCanPlace 有效集（TileObjectData.cs Initialize 全序列
//      模拟,含 addBaseTile/CopyFrom 继承;SubTiles 零发散）= 382 族。
//   B. 门序/逐格值——updatePlacePreviewFrame（TileObject.CanPlace onlyCheck :340-372
//      足印三谓词 1:1;锚带格不可见判定=TileObject.cs:936-939 continue 窗外跳过）。
//   C. 绘制面——drawPlacePreview（White×0.5 / Red×0.7×0.5;TileObject.cs:908-914）。
import { describe, it, expect, afterEach } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS } from '../src/data/items';
import { options } from '../src/core/Options';
import { anchorSpecOf, validateAnchors, previewCellValues } from '../src/world/TileAnchorValidator';
import { placePreviewFrame, clearPlacePreviewFrame, updatePlacePreviewFrame,
  USES_CUSTOM_CAN_PLACE_SHEETS, type PlacePreviewCtx } from '../src/core/PlacePreview';
import { drawPlacePreview, type PvAtlas, type PvScratch } from '../src/render/PlacePreviewDraw';

const TID = {
  dirt: TILE_BY_KEY['dirt']!,
  stone: TILE_BY_KEY['stone']!,
  workbench: TILE_BY_KEY['workbench']!,
  torch: TILE_BY_KEY['torch']!,
  door: TILE_BY_KEY['door_closed']!,
  platform: TILE_BY_KEY['platform']!,
  chest: TILE_BY_KEY['chest']!,
};
const sheetOf = (id: number): number => TILE_DEFS[id]?.vanilla?.sheet ?? -1;

function mkCtx(st: TileStore, sheet: number, tx: number, ty: number,
  opts: Partial<PlacePreviewCtx> = {}): PlacePreviewCtx {
  const def = TILE_DEFS[TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet)];
  return {
    st, tx, ty, sheet,
    defFramed: !!def?.framed, defW: def?.w ?? 1, defH: def?.h ?? 1,
    style: 0, pylonDuplicate: false,
    hasSupport: () => true,                      // Game.hasSupport 透传面（既有放置测试覆盖,此处桩）
    obstructionClearable: () => false,           // 占者不豁免（石块阻挡;草药测试按需覆写）
    ...opts,
  };
}
function layFloor(st: TileStore, x0: number, x1: number, row: number): void {
  for (let x = x0; x <= x1; x++) st.setTile(x, row, TID.dirt);
}

afterEach(() => {
  clearPlacePreviewFrame();
});

describe('A. _usesCustomCanPlace 有效集金标（TileObjectData.cs 1457 模拟值）', () => {
  it('382 族;典型在册/除名族钉值（CustomPlace TileObjectData.cs:5017 受理面）', () => {
    expect(USES_CUSTOM_CAN_PLACE_SHEETS.size).toBe(382);
    // 直接置位 42 处中的代表
    for (const s of [4, 10, 11, 13, 15, 20, 21, 82, 227, 597, 220]) {
      expect(USES_CUSTOM_CAN_PLACE_SHEETS.has(s), `sheet ${s} 应在册`).toBe(true);
    }
    // CopyFrom(Style) 继承代表（18 工作台=Style2x1、34 桌=Style2x2、467 宝箱）
    for (const s of [18, 34, 467]) {
      expect(USES_CUSTOM_CAN_PLACE_SHEETS.has(s), `sheet ${s} 继承在册`).toBe(true);
    }
    // 除名代表：物块/平台/绳/轨道/种植箱 = legacy 置放,原版本就无幽灵
    for (const s of [1, 2, 19, 213, 314, 380, 427]) {
      expect(USES_CUSTOM_CAN_PLACE_SHEETS.has(s), `sheet ${s} 应除名`).toBe(false);
    }
  });
});

describe('B. 开关→预览判别（BJ557 主角：开关开=有数据,开关关=无数据）', () => {
  const prev = options.data.placementPreview;
  afterEach(() => { options.data.placementPreview = prev; });

  function fixtureFloor(st: TileStore): void {
    layFloor(st, 5, 30, 13);            // 地台 row13
    st.setTile(10, 12, TID.workbench);  // 摆个工作台当邻居（不影响判别）
  }

  it('开关开（缺省 true）：持工作台对地台 → 幽灵数据在册、全白、锚=Origin 对位', () => {
    options.data.placementPreview = true;
    const st = new TileStore(48, 32);
    fixtureFloor(st);
    // 点击格 = 物件左格（Style2x1 Origin(0,0)）;底锚=点击行下一行
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.workbench), 14, 12));
    const pv = placePreviewFrame.data;
    expect(pv).not.toBeNull();
    expect(pv!.sheet).toBe(18);
    expect(pv!.ax).toBe(14); expect(pv!.ay).toBe(12);
    expect(pv!.w).toBe(2); expect(pv!.h).toBe(1);
    expect(Array.from(pv!.cells)).toEqual([1, 1]);           // 全白=可放
  });

  it('开关关：同一场景 → 数据恒空（绘制面零消费）', () => {
    options.data.placementPreview = false;
    const st = new TileStore(48, 32);
    fixtureFloor(st);
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.workbench), 14, 12));
    expect(placePreviewFrame.data).toBeNull();
  });
});

describe('B2. 逐格 1/2 值（CanPlace onlyCheck 足印三谓词 1:1）', () => {
  it('阻挡格=2（红）,无解回落 prim 逐格红白;含 2 ⟹ validateAnchors 恒假（不变量）', () => {
    const st = new TileStore(48, 32);
    st.setTile(15, 12, TID.stone);      // 足印右格石块阻挡
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.workbench), 14, 12));
    const pv = placePreviewFrame.data!;
    expect(pv).not.toBeNull();
    expect(pv!.ax).toBe(14); expect(pv!.ay).toBe(12);        // 无锚可寻 → prim（click−Origin）
    expect(Array.from(pv!.cells)).toEqual([1, 2]);           // 左格空=白,右格石=红
    const rec = anchorSpecOf(18)!;
    expect(validateAnchors(st, 14, 12, rec, 0)).toBe(false); // 含阻挡格 ⟹ 实放必拒
  });

  it('锚点带失败但足印全空 → 幽灵全白（TileObject.cs:936-939 锚带窗外=原版本相,非本仓缺陷）', () => {
    const st = new TileStore(48, 32);   // 无地台
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.workbench), 14, 12));
    const pv = placePreviewFrame.data!;
    expect(Array.from(pv!.cells)).toEqual([1, 1]);           // 白格
    const rec = anchorSpecOf(18)!;
    expect(validateAnchors(st, 14, 12, rec, 0)).toBe(false); // 底锚缺失 → 点击落空（原版同相）
  });

  it('液体门逐格（M-3 同源）：宝箱足印遇水 → 基档 water=allowed 白;换岩浆=底行红', () => {
    const st = new TileStore(48, 32);
    layFloor(st, 5, 30, 14);
    st.setLiquid(14, 12, 255, LIQUID_TYPE.WATER);
    st.setLiquid(15, 12, 255, LIQUID_TYPE.WATER);
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.chest), 14, 12));
    // 箱 21 基档 water=allowed → 水中白格（TileObjectData.cs:1767）;吸附锚=底行坐地台
    const pv = placePreviewFrame.data!;
    expect(Array.from(pv!.cells)).toEqual([1, 1, 1, 1]);     // 2×2 全白
    // 换岩浆 → 基档 lava=notAllowed（:1768）→ 含岩浆行红;无解回落 prim（ay=ty−oy=11）
    for (let x = 14; x <= 15; x++) st.setLiquid(x, 12, 255, LIQUID_TYPE.LAVA);
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.chest), 14, 12));
    const pv2 = placePreviewFrame.data!;
    expect(pv2!.ax).toBe(14); expect(pv2!.ay).toBe(11);      // prim=click−Origin(0,1)
    expect(Array.from(pv2!.cells)).toEqual([1, 1, 2, 2]);    // 底行（row12 岩浆）红
  });

  it('火把（sheet 4 专用支）：地台=白+帧档直供;水中普通炬=红;水炬 style8=白', () => {
    const st = new TileStore(48, 32);
    layFloor(st, 5, 30, 13);
    updatePlacePreviewFrame(mkCtx(st, 4, 14, 12, { style: 0 }));
    let pv = placePreviewFrame.data!;
    expect(pv!.w).toBe(1); expect(pv!.h).toBe(1);
    expect(pv!.cells[0]).toBe(1);
    expect(pv!.fx).toBe(0);                                  // 底锚档帧
    expect(pv!.fy).toBe(0);                                  // style0 → 0×22
    // 水中普通炬（style0 WaterPlacement=NotAllowed）
    st.setLiquid(14, 12, 255, LIQUID_TYPE.WATER);
    updatePlacePreviewFrame(mkCtx(st, 4, 14, 12, { style: 0 }));
    pv = placePreviewFrame.data!;
    expect(pv!.cells[0]).toBe(2);
    // 水炬 8（WaterPlacement=Allowed,Torch.ts isWaterTorchStyle(8×22)）
    updatePlacePreviewFrame(mkCtx(st, 4, 14, 12, { style: 8 }));
    pv = placePreviewFrame.data!;
    expect(pv!.cells[0]).toBe(1);
    expect(pv!.fy).toBe(8 * 22);
  });

  it('门（sheet 10 双锚寻位镜像）：地台+顶块 → 候选命中全白;无锚 → prim 回落', () => {
    const st = new TileStore(48, 32);
    layFloor(st, 5, 30, 12);            // 门底锚 row12
    st.setTile(14, 8, TID.stone);       // 门顶锚 row8（cy=9 候选:足印 9..11）
    updatePlacePreviewFrame(mkCtx(st, sheetOf(TID.door), 14, 10));   // 点击=中格
    const pv = placePreviewFrame.data!;
    expect(pv!.ax).toBe(14); expect(pv!.ay).toBe(9);         // 双锚全满足候选（[ty-1,ty,ty-2] 首中）
    expect(Array.from(pv!.cells)).toEqual([1, 1, 1]);
    // 无锚场景 → prim（首 alternate Origin(0,0)——TileObjectData.cs:2226 门基记录）逐格白
    const st2 = new TileStore(48, 32);
    updatePlacePreviewFrame(mkCtx(st2, sheetOf(TID.door), 14, 10));
    const pv2 = placePreviewFrame.data!;
    expect(pv2!.ax).toBe(14); expect(pv2!.ay).toBe(10);      // prim=click−Origin(0,0)
    expect(Array.from(pv2!.cells)).toEqual([1, 1, 1]);
  });

  it('597 晶塔 AllInvalid（HookCheckIfCanPlace badReturn=1→全红,TileObjectData.cs:3421）', () => {
    const st = new TileStore(48, 32);
    layFloor(st, 5, 30, 18);
    updatePlacePreviewFrame(mkCtx(st, 597, 14, 14, { pylonDuplicate: true }));
    const pv = placePreviewFrame.data!;
    expect(pv!.w).toBe(3); expect(pv!.h).toBe(4);
    expect(Array.from(pv!.cells).every((v) => v === 2)).toBe(true);
  });

  it('CustomPlace 不受理族（平台 19/物块 1）→ 无幽灵（原版本就无,防过预览发散）', () => {
    const st = new TileStore(48, 32);
    layFloor(st, 5, 30, 13);
    updatePlacePreviewFrame(mkCtx(st, 19, 14, 12));
    expect(placePreviewFrame.data).toBeNull();
    updatePlacePreviewFrame(mkCtx(st, 1, 14, 12));
    expect(placePreviewFrame.data).toBeNull();
  });

  it('previewCellValues 与 validateAnchors 不变量：任一格 2 ⟹ validateAnchors 假（随机化抽样）', () => {
    const st = new TileStore(40, 30);
    layFloor(st, 4, 20, 12);
    st.setTile(9, 11, TID.stone);
    st.setTile(13, 12, TID.stone);
    const rec = anchorSpecOf(18)!;
    for (let cx = 5; cx < 20; cx++) {
      for (let cy = 8; cy < 13; cy++) {
        const cells = previewCellValues(st, cx, cy, rec, 0);
        const anyRed = Array.from(cells).some((v) => v === 2);
        if (anyRed) {
          expect(validateAnchors(st, cx, cy, rec, 0), `(${cx},${cy}) 含红格实放必拒`).toBe(false);
        }
      }
    }
  });
});

describe('D. tickPlacePreview 门层（★BJ-C7/R9-F2 判别补锁：itemAnimation==0 门,Player.cs:43734/:43737）', () => {
  // 旧测试只锁 updatePlacePreviewFrame 纯函数层——Game.tickPlacePreview 的
  // `swing && swing.t > 0` 早退门（itemAnimation==0,挥动期隐藏=原版同相）无锁定,
  // 拆门变异存活。本组经 Game 原型壳直调 tickPlacePreview,锁门序四态。
  function gateShell(w: import('../src/world/World').World, swing: { t: number; dur: number; item: number } | null,
    dead = false) {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      tickPlacePreview: (tx: number, ty: number, def: unknown) => void;
    };
    g.world = w;
    g.swing = swing;
    g.player = {
      dead,
      x: 14 * 16 + 2, y: 12 * 16 - 6, w: 12, h: 28,   // 贴近点击格 (14,12) → 射程内
      equipStats: {},
      buffs: { has: () => false },
      inv: { heldItem: () => null },                   // 实例级 placeStyle 覆盖缺省
    };
    return g;
  }
  function ghostFloor(w: import('../src/world/World').World): void {
    const st = w.store;
    for (let x = 5; x <= 30; x++) st.setTile(x, 13, TID.dirt);
  }
  const workbenchDef = ITEM_DEFS[ITEM_DEFS.findIndex((d) => d?.tile === 'workbench')];   // 入参=物品 def（tryPlace 同域）
  const prevOpt = options.data.placementPreview;
  afterEach(() => { options.data.placementPreview = prevOpt; clearPlacePreviewFrame(); });

  it('对照态（swing=null）：同场景预览数据在册（证门后路径通,判别有效）', () => {
    options.data.placementPreview = true;
    const w = new World(48, 32, 15, 'pv');
    ghostFloor(w);
    clearPlacePreviewFrame();
    gateShell(w, null).tickPlacePreview(14, 12, workbenchDef);
    expect(placePreviewFrame.data).not.toBeNull();
    expect(placePreviewFrame.data!.sheet).toBe(18);
  });

  it('★判别位：挥动在途（swing.t>0=itemAnimation≠0）→ 早退,数据恒 null（拆门变异必红）', () => {
    options.data.placementPreview = true;
    const w = new World(48, 32, 15, 'pv');
    ghostFloor(w);
    clearPlacePreviewFrame();
    gateShell(w, { t: 5, dur: 10, item: 0 }).tickPlacePreview(14, 12, workbenchDef);
    expect(placePreviewFrame.data).toBeNull();
  });

  it('边界态：swing.t===0（动画已衰减尽）→ 门放行,数据在册（:43737 `==0` 精确语义）', () => {
    options.data.placementPreview = true;
    const w = new World(48, 32, 15, 'pv');
    ghostFloor(w);
    clearPlacePreviewFrame();
    gateShell(w, { t: 0, dur: 10, item: 0 }).tickPlacePreview(14, 12, workbenchDef);
    expect(placePreviewFrame.data).not.toBeNull();
  });

  it('防御位：死亡玩家（ItemCheck 不跑）→ null（门序尾部,与挥动无关）', () => {
    options.data.placementPreview = true;
    const w = new World(48, 32, 15, 'pv');
    ghostFloor(w);
    clearPlacePreviewFrame();
    gateShell(w, null, true).tickPlacePreview(14, 12, workbenchDef);
    expect(placePreviewFrame.data).toBeNull();
  });
});

describe('C. 绘制面（TileObject.DrawPreview 1:1——α 与逐格矩形判别）', () => {
  class RecCtx {
    ops: Array<{ op: string; alpha: number; args: unknown[] }> = [];
    globalAlpha = 1;
    imageSmoothingEnabled = true;
    globalCompositeOperation = 'source-over';
    fillStyle = '';
    drawImage(...args: unknown[]): void { this.ops.push({ op: 'drawImage', alpha: this.globalAlpha, args }); }
    save(): void { /* 计数省略 */ }
    restore(): void { this.globalAlpha = 1; }
    clearRect(): void { /* 记账省略 */ }
    fillRect(): void { this.ops.push({ op: 'fillRect', alpha: this.globalAlpha, args: [] }); }
  }

  const fakeImg = {} as CanvasImageSource;
  const atlasStub: PvAtlas = {
    vframeAt: (sheet, fx, fy) => ({ img: fakeImg, sx: fx, sy: fy, sw: 16, sh: 16 }),
    ensureVImage: () => fakeImg,
  };

  it('全白 2×1：两次 drawImage、α=0.5、dest=足印世界坐标+tileTop', () => {
    const ctx = new RecCtx();
    const pv = {
      sheet: 18, fw: 2, style: 0, ax: 14, ay: 12, w: 2, h: 1,
      cells: new Uint8Array([1, 1]),
    };
    const n = drawPlacePreview(ctx as unknown as CanvasRenderingContext2D, atlasStub, pv,
      () => null);
    expect(n).toBe(2);
    const draws = ctx.ops.filter((o) => o.op === 'drawImage');
    expect(draws.length).toBe(2);
    for (const d of draws) expect(d.alpha).toBe(0.5);        // Color.White*0.5（TileObject.cs:913）
    const [, , , , , dx0, dy0] = draws[0].args as number[];
    const [, , , , , dx1] = draws[1].args as number[];
    expect(dx0).toBe(14 * 16);                                // 足印左上（tile×16 世界 px）
    expect(dx1).toBe(15 * 16);                                // 逐格 +1 格
    expect(dy0).toBe(12 * 16 + 0);                            // tileTopOf(18,fx,fy)=0（工作台无 DrawYOffset）
  });

  it('阻挡格：红支 scratch 合成（fillRect rgb(255,0,0) + 叠画 α=0.35）', () => {
    const ctx = new RecCtx();
    const sc = new RecCtx();
    const scratch: PvScratch = {
      width: 0, height: 0,
      getContext: () => sc as unknown as CanvasRenderingContext2D,
      source: () => scratch as unknown as CanvasImageSource,
    };
    const pv = {
      sheet: 18, fw: 2, style: 0, ax: 14, ay: 12, w: 2, h: 1,
      cells: new Uint8Array([1, 2]),
    };
    const n = drawPlacePreview(ctx as unknown as CanvasRenderingContext2D, atlasStub, pv,
      () => scratch);
    expect(n).toBe(2);
    // 红支合成序：贴入(source-over) → source-in 红填充 → α0.35 叠画
    expect(sc.fillStyle).toBe('rgb(255,0,0)');
    expect(sc.globalCompositeOperation).toBe('source-in');
    const mainDraws = ctx.ops.filter((o) => o.op === 'drawImage');
    expect(mainDraws[mainDraws.length - 1].alpha).toBe(0.35); // ×0.7×0.5（TileObject.cs:908/:913）
  });

  it('数据空（开关关/早退帧）：零绘制', () => {
    const ctx = new RecCtx();
    const pv = {
      sheet: 18, fw: 2, style: 0, ax: 14, ay: 12, w: 2, h: 1,
      cells: new Uint8Array([0, 0]),                           // 锚带/未写格=0 → continue（TileObject.cs:898）
    };
    const n = drawPlacePreview(ctx as unknown as CanvasRenderingContext2D, atlasStub, pv,
      () => null);
    expect(n).toBe(0);
    expect(ctx.ops.filter((o) => o.op === 'drawImage').length).toBe(0);
  });

  it('火把帧源：fx/fy 直供（22px 步长域外）走 ensureVImage 原图切片', () => {
    const ctx = new RecCtx();
    const pv = {
      sheet: 4, fw: 1, style: 8, ax: 14, ay: 12, w: 1, h: 1,
      cells: new Uint8Array([1]), fx: 22, fy: 8 * 22,
    };
    const n = drawPlacePreview(ctx as unknown as CanvasRenderingContext2D, atlasStub, pv,
      () => null);
    expect(n).toBe(1);
    const draws = ctx.ops.filter((o) => o.op === 'drawImage');
    const [, sx, sy] = draws[0].args as number[];
    expect(sx).toBe(22); expect(sy).toBe(8 * 22);              // 锚档帧×style 档帧行
  });
});
