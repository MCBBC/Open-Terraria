// ★SW-BN6 2026-09-08 模特假人 P3a 形体合成器守卫（SW-BL1 分期 P3a）。
// 定谳链：TEDisplayDoll.cs:339-499 Draw（_dollPlayer skinVariant 10/hair 15/白肤
// :118-121;pose→玩家形体帧 switch :414-460;锚 :471;朝向 :347-351）+ PlayerFrame
// 行号（Jumping=空中支行 5 :36523/:36824;Walking=显式行 9 :422-424）。
// 仓内链路 = Renderer.drawFurnitureItems display_doll 支消费 src/render/DisplayDoll.ts
// 纯函数 + compositePaperDoll（实时玩家同链,BJ11/BJ21 守卫域)。
// P3b（持握展示/物品姿态动画）/P3c（dye/mount/paint/女档/net）= 分期债（模块头注）。
// 纯 node,无 DOM（BJ11 同风格:纯函数行为锁 + 源文本结构锁 + 数据面抽检）。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));
import {
  DOLL_APPEARANCE, dollEquipFromSlots, displayDollRenderState, isValidDollPose,
  displayDollAnchor, displayDollFacing, dollHeldUseStyle, dollUsesMaleTables,
} from '../src/render/DisplayDoll';
import { DOLL_SUPPORTED_USE_STYLE_POSES } from '../src/world/FurnitureItems';

const rendererSrc = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const dollSrc = readFileSync(new URL('../src/render/DisplayDoll.ts', import.meta.url), 'utf8');
const tedSrc = existsSync(new URL('../../Terarria1457/Terraria.GameContent.Tile_Entities/TEDisplayDoll.cs', import.meta.url))
  ? readFileSync(new URL('../../Terarria1457/Terraria.GameContent.Tile_Entities/TEDisplayDoll.cs', import.meta.url), 'utf8')
  : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

describe.skipIf(EXT_MISSING)('SW-BN6 假人 P3a ①数据面：_dollPlayer 固定外观 + 行档锚原版值', () => {
  it('外观 = skinVariant 10 / hair 15 / 白肤（TEDisplayDoll.cs:118-121 逐值）', () => {
    expect(DOLL_APPEARANCE.skinVariant).toBe(10);
    expect(DOLL_APPEARANCE.hair).toBe(15);
    expect(DOLL_APPEARANCE.skinColor).toEqual({ r: 255, g: 255, b: 255 });
    // 反编译抽检：三行原文在位（防反编译源版本漂移）
    expect(tedSrc).toContain('_dollPlayer.hair = 15;');
    expect(tedSrc).toContain('_dollPlayer.skinVariant = 10;');
    expect(tedSrc).toContain('_dollPlayer.skinColor = Color.White;');
  });

  it('variant 10 走男表链（MALE_VARIANTS 含 10——女表链不进模特域）', () => {
    expect(dollUsesMaleTables()).toBe(true);
  });

  it('锚公式 = (tx+1,ty+3)×16+(−width/2,−height−6+num2)（:471,盒 20×42）', () => {
    // 身体底边中心 = (tx*16+16, ty*16+48−6+offset)
    const a = displayDollAnchor(100, 200, 0);
    expect(a.cx).toBe(101 * 16);
    expect(a.bottomY).toBe(200 * 16 + 42);
    const s = displayDollAnchor(0, 0, 14);       // Sitting num2=14
    expect(s.bottomY).toBe(3 * 16 - 6 + 14);
  });

  it('朝向 = frameX%72==36 → +1,缺省 −1（:347-351）', () => {
    expect(displayDollFacing(0)).toBe(-1);
    expect(displayDollFacing(36)).toBe(1);
    expect(displayDollFacing(72)).toBe(-1);      // 第二列（%72==0）
    expect(displayDollFacing(108)).toBe(1);
  });
});

describe.skipIf(EXT_MISSING)('SW-BN6 假人 P3a ②行为面：pose → 形体行档（DisplayDollPoseID 0-8）', () => {
  const equip = { head: null, body: null, legs: null };
  it('Standing(0) → 行 0/0、无坐姿、offsetY 0', () => {
    expect(displayDollRenderState(0, true, equip)).toEqual({
      rows: { body: 0, legs: 0 }, sitting: null, offsetY: 0 });
  });
  it('Sitting(1) → 坐姿切片 + num2=14（:430）', () => {
    const st = displayDollRenderState(1, true, { head: null, body: 7, legs: 9 });
    expect(st.sitting).toEqual({ legIndex: 9, seatYOffset: 0, body: 7 });
    expect(st.offsetY).toBe(14);
  });
  it('Jumping(2) → 空中支行 5（Player.cs:36523/:36824 velocity=UnitY 支）', () => {
    expect(displayDollRenderState(2, true, equip).rows).toEqual({ body: 5, legs: 5 });
  });
  it('Walking(3) → 显式 legFrame/bodyFrame 行 9（:422-424）', () => {
    expect(displayDollRenderState(3, true, equip).rows).toEqual({ body: 9, legs: 9 });
  });
  it('非法 pose（4+ 无持握）原版回 Standing（IsValidPose :135-153 门）', () => {
    expect(displayDollRenderState(5, false, equip).rows).toEqual({ body: 0, legs: 0 });
  });
});

describe.skipIf(EXT_MISSING)('SW-BN6 假人 P3a ③行为面：IsValidPose（TEDisplayDoll.cs:135-153 1:1）', () => {
  it('≤3 恒合法（(uint)testedPose <= 3u）', () => {
    for (const p of [0, 1, 2, 3]) expect(isValidDollPose(p, 0)).toBe(true);
  });
  it('4+ 需持握物品 useStyle ∈ 注册表（use1-5 族 4-8 / 单 Use1 族仅 4）', () => {
    expect(isValidDollPose(4, 0)).toBe(false);   // 空手
    expect(isValidDollPose(8, 1)).toBe(true);    // 剑族 useStyle1 → Use1-5
    expect(isValidDollPose(6, 12)).toBe(true);   // 回旋镖族 useStyle12 → Use1-3
    expect(isValidDollPose(7, 12)).toBe(false);  // Use4 不在回旋镖列
    expect(isValidDollPose(4, 2)).toBe(true);    // 枪族 useStyle2 → 仅 Use1
    expect(isValidDollPose(5, 2)).toBe(false);
    expect(DOLL_SUPPORTED_USE_STYLE_POSES[1]).toEqual([4, 5, 6, 7, 8]);
  });
  it('持握槽 useStyle 解析：空槽=0（未知 vid 容错返 0）', () => {
    expect(dollHeldUseStyle([null, null, null, null, null, null, null, null, null, null])).toBe(0);
    expect(dollHeldUseStyle([])).toBe(0);
    expect(dollHeldUseStyle([null, null, null, null, null, null, null, null, null, { id: 99999999 }])).toBe(0);
  });
});

describe.skipIf(EXT_MISSING)('SW-BN6 假人 P3a ④行为面：三甲映射（内部 id → vid → hs/bs/ls）', () => {
  it('空槽三甲全 null;未知 id 容错 null', () => {
    expect(dollEquipFromSlots([null, null, null])).toEqual({ head: null, body: null, legs: null });
    expect(dollEquipFromSlots([{ id: 42424242 }, null, null]).head).toBeNull();
  });
  it('结构：槽布局 equip[9]+misc[1]+dye[9]=19 槽记录面未漂移', () => {
    const src = readFileSync(new URL('../src/world/FurnitureItems.ts', import.meta.url), 'utf8');
    expect(src).toContain("case 'display_doll': return 19; // equip[9] + misc[1] + dye[9]（TEDisplayDoll.cs:156-278）");
  });
});

describe.skipIf(EXT_MISSING)('SW-BN6 假人 P3a ⑤结构锁：Renderer 接线位与兜底链', () => {
  it('display_doll 支消费合成器:锚/朝向/行档/乘色调用在位', () => {
    expect(rendererSrc).toContain('const dollBake = dollState.sitting');
    expect(rendererSrc).toContain('compositePaperDoll(DOLL_APPEARANCE, dollEquip');
    expect(rendererSrc).toContain('displayDollAnchor(rec.x, rec.y, dollState.offsetY)');
    expect(rendererSrc).toContain('displayDollFacing(stFx.frameX[stFx.idx(rec.x, rec.y)])');
    expect(rendererSrc).toContain('dollLightTint(f.img, f.sx, f.sy, f.sw, f.sh,');
  });
  it('★普查案①（2026-09-25）dollLightTint 裁剪回贴【源精灵】α:自引 destination-in=multiply 后全域 α=1 的 no-op(框外实色泄漏,探针 _census-flagcolor-dolltint ①角像素 α=255 实锤→修后 0)', () => {
    const dd = readFileSync(new URL('../src/render/DisplayDoll.ts', import.meta.url), 'utf8');
    // 旧病形态禁再现:destination-in 后自引 drawImage(c,0,0)
    expect(dd).not.toMatch(/globalCompositeOperation = 'destination-in';\s*\n\s*cx\.drawImage\(c, 0, 0\);/);
    // 正身:与全仓预染色配方族同式——destination-in(源精灵同源矩形)
    expect(dd).toMatch(/globalCompositeOperation = 'destination-in';\s*\n\s*\/\/[^\n]*\n(?:[^\n]*\n){0,8}?\s*cx\.drawImage\(src, sx, sy, sw, sh, 0, 0, sw, sh\);/);
  });
  it('贴图未就绪回落旧图标叠画（ready 门自愈,CharCreation 同语义）', () => {
    const caseBody = rendererSrc.slice(rendererSrc.indexOf("case 'display_doll': {"));
    const nextCase = caseBody.indexOf("case 'hat_rack':");
    const body = caseBody.slice(0, nextCase);
    expect(body).toContain('drawIcon(s.id, bx + 16, by + 8 + row * 13, 14);');   // 旧占位保留
  });
  it('纯函数单源：DisplayDoll.ts 为 Renderer 消费唯一入口（防逻辑回流内联）', () => {
    expect(rendererSrc).toContain("from './DisplayDoll'");
  });
});
