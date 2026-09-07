// SW-BJ7 2026-09-07 悬停 NPC 名两缺陷（用户实报,附截图「向导 Levi 250/250」）：
//   缺陷① 盒内不显名/盒外反显：BJ1 名支数据面正常（帧盒命中即写 cursorItemIconText）,
//           但 Renderer.drawCursorItemIcon 头部早退门 `c.npcHover||...` 把名文本连带吞掉
//           ——npcHover=光标∩城镇 NPC 碰撞盒（hoveringTownNpc）,恰好"指进碰撞盒"时整函数
//           早退；帧盒=碰撞盒外扩（40×56 vs 20×42 底对齐居中）,盒外帧盒内反而能画名
//           ⇒ 与原版相反。原版 :45794 `HoveringOverAnNPC||mouseInterface` 早退在
//           DrawInterface_40_InteractItemIcon（只压图标）;MouseTextInner 绘制链
//           （:45783→:20371）门仅 `mouseNPCType>-1||cursorText==null`,无悬停 NPC 门
//           ——名支独立于图标支,帧盒命中即显名并压图标（名支自身 cursorItemIconEnabled=false）。
//   缺陷② 光标箭头盖字：名文本锚 = mouse+14 裸值,而本仓光标双 pass（VUI.drawCursor:
//           阴影 pass offset(+1,+1)×scale1.1）右缘 ≈ mouse+1+14×1.1≈+16.4（呼吸峰
//           cursorScale=1.1）→ 箭头盖住字首。原版 MouseTextInner :20379-20419：
//           X/Y=mouse+14 → ThickMouse 再 +6（MouseBorderColor 默认 (64,64,64,64)
//           Main.cs:276 ≠ Transparent ⇒ ThickMouse :2684 默认档恒 true）= 实锚 +20
//           恒净空；屏幕右/下缘 40px 收边;XNA DrawString origin 零=字形左上
//           ⇒ canvas textAlign/textBaseline 显式钉死（:14145-14147 同前例）。
//
// 测试法：Game 原型桩（sw-bj1 同法,atlas 换 40×56 帧盒桩走真实帧盒路径）+
//         Renderer 原型桩 + 录制型 2D ctx Proxy（绘制调用/属性置位全录）+
//         mouseTextAnchor 纯函数直测（popupLabelMeasure 同款导出风格）+
//         门行结构锁（渲染层回归钉）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { TownNPC } from '../src/entities/TownNPC';
import { Renderer, mouseTextAnchor } from '../src/render/Renderer';

type AnyGame = Record<string, any>;

/** Game 原型桩（sw-bj1 同法;atlas.vnpc 换 40×56 帧盒桩=npcHoverHit 走帧盒支） */
function stubGame(): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    x: 160, y: 160, w: 20, h: 42,
    cx: 170, cy: 181, dead: false,
    cursorItemIconEnabled: false,
    cursorItemIconID: 0,
    cursorItemIconText: '',
  };
  g.entities = { enemies: [], npcs: [] };
  g.renderer = { atlas: { vnpc: () => ({ sw: 40, sh: 56 }) }, fullMap: { open: false } };
  g.input = { mouseX: 0, mouseY: 0 };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] };
  return g;
}

const mkNpc = (over: Partial<TownNPC> = {}): TownNPC =>
  Object.assign(Object.create(TownNPC.prototype), {
    id: 1, vanillaId: 22, dead: false, bound: false, givenName: '',
    x: 160, y: 160, w: 20, h: 42, hp: 250, maxHp: 250,
    ...over,
  }) as TownNPC;

// 向导碰撞盒 [160,180)×[160,202);帧盒 = 底边钉盒底、水平盒中心居中 40×56
// = [150,190)×[146,202)（npcHoverHit :17547 Game.ts 同式）
const IN_BOX: [number, number] = [170, 180];        // 碰撞盒内（且帧盒内）
const FRAME_EDGE: [number, number] = [155, 150];    // 帧盒内、碰撞盒外（左上角带）
const OUT_BOTH: [number, number] = [145, 180];      // 帧盒外（盒外但近）

describe('SW-BJ7 ① 三位置显示矩阵（数据面,Main.cs:43820-43832 帧盒命中即 claim）', () => {
  for (const [pos, label, want] of [
    [IN_BOX, '碰撞盒内', true],
    [FRAME_EDGE, '帧盒边缘（碰撞盒外）', true],
    [OUT_BOTH, '盒外', false],
  ] as Array<[[number, number], string, boolean]>) {
    it(`${label}：光标 (${pos[0]},${pos[1]}) → 名 ${want ? '显示' : '不显'}`, () => {
      const g = stubGame();
      g.input.mouseX = pos[0]; g.input.mouseY = pos[1];
      g.entities.npcs = [mkNpc({ givenName: 'Levi' })];
      (g as any).tickHoverNpcName();
      if (want) {
        expect(g.player.cursorItemIconText).toBe('Levi: 250/250');
        // 名支压图标（:43822 cursorItemIconEnabled=false）——两种命中位都压
        expect(g.player.cursorItemIconEnabled).toBe(false);
      } else {
        expect(g.player.cursorItemIconText).toBe('');
      }
    });
  }

  it('缺陷①回归：碰撞盒内命中时名支【不被图标支吞】（数据面照写,消费端门拆至 Renderer）', () => {
    const g = stubGame();
    g.input.mouseX = IN_BOX[0]; g.input.mouseY = IN_BOX[1];
    g.entities.npcs = [mkNpc({ givenName: 'Levi' })];
    (g as any).tickHoverNpcName();
    // 旧缺陷在绘制端：此断言钉数据面不变式,绘制端由 ②③ 组断言钉
    expect(g.player.cursorItemIconText).toBe('Levi: 250/250');
  });
});

// ================= ②③ Renderer.drawCursorItemIcon 绘制端 =================

type CtxEvent =
  | { t: 'call'; name: string; args: unknown[] }
  | { t: 'set'; key: string; value: unknown };

/** 录制型 2D ctx（Proxy:方法调用/属性置位全录;measureText 定宽 8px/字） */
function recordingCtx() {
  const events: CtxEvent[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 8 });
      return (...args: unknown[]) => { events.push({ t: 'call', name: String(key), args }); };
    },
    set(_t, key, value) {
      events.push({ t: 'set', key: String(key), value });
      return true;
    },
  });
  return { ctx, events };
}

const calls = (events: CtxEvent[], name: string) =>
  events.filter((e) => e.t === 'call' && e.name === name) as Array<{ t: 'call'; name: string; args: unknown[] }>;
const sets = (events: CtxEvent[], key: string) =>
  events.filter((e) => e.t === 'set' && e.key === key) as Array<{ t: 'set'; key: string; value: unknown }>;

/** Renderer 原型桩（无构造器;字段按 drawCursorItemIcon 消费面注入） */
function stubRenderer(cursorIconCtx: Record<string, unknown>, player: Record<string, unknown>) {
  const r = Object.create(Renderer.prototype) as unknown as AnyGame;
  r.cursorIconCtx = cursorIconCtx;
  r.atlas = {};                       // 真值守门 `if (!this.atlas) return`
  r._mouseX = 500; r._mouseY = 300;
  r.canvas = { width: 1920, height: 1080 };
  r.lighting = null;                  // mouseTextColor 缺省 255 路径;tint 链跳过
  r.signBubbleScreen = null;
  r.signHoverText = '';
  r.atlasIcon = () => ({ img: {}, sx: 0, sy: 0, sw: 16, sh: 16 });
  const { ctx, events } = recordingCtx();
  (r as any).drawCursorItemIcon(ctx, player);
  return events;
}

const mkPlayer = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  cursorItemIconEnabled: false, cursorItemIconID: 0, cursorItemIconPush: 0,
  cursorItemIconText: '', cursorItemIconReversed: false,
  ...over,
});

const NPC_HOVER_CTX = {
  heldVid: 0, uiHeld: false, cacheTime: 0, cacheVid: 0,
  npcHover: true, biomeTorch: null, biomeCampfire: null,
  paintAmmoVid: 0, housingHead: null, cursorScale: 1, uiBlocking: false,
};

describe('SW-BJ7 ② 缺陷①：npcHover 只压图标支不压名支（:45794 门域,MouseTextInner :20371 无 NPC 门）', () => {
  it('光标指进碰撞盒（npcHover=true）+ 名已 claim → 名照画、图标零绘制', () => {
    const events = stubRenderer(
      { ...NPC_HOVER_CTX },
      mkPlayer({ cursorItemIconText: 'Levi: 250/250' }),
    );
    const fills = calls(events, 'fillText');
    expect(fills.length).toBe(5);                       // 四向描边 + 本体
    const core = fills[fills.length - 1];
    expect(core.args[0]).toBe('Levi: 250/250');
    expect(calls(events, 'drawImage').length).toBe(0);  // 图标支整门关闭
  });

  it('npcHover=true 且悬停图标 enabled（手持工具射程支）→ 图标仍被压（:45794 语义保留）', () => {
    const events = stubRenderer(
      { ...NPC_HOVER_CTX },
      mkPlayer({ cursorItemIconEnabled: true, cursorItemIconID: 48 }),
    );
    expect(calls(events, 'drawImage').length).toBe(0);
    expect(calls(events, 'fillText').length).toBe(0);   // 无名文本时也不画字
  });

  it('npcHover=false（帧盒边缘/盒外）+ 名已 claim → 名照画（旧版本同,回归钉）', () => {
    const events = stubRenderer(
      { ...NPC_HOVER_CTX, npcHover: false },
      mkPlayer({ cursorItemIconText: 'Levi: 250/250' }),
    );
    expect(calls(events, 'fillText').length).toBe(5);
  });

  it('npcHover=false + 悬停图标 enabled → 图标照画（icon 门不误伤非 NPC 悬停）', () => {
    const events = stubRenderer(
      { ...NPC_HOVER_CTX, npcHover: false },
      mkPlayer({ cursorItemIconEnabled: true, cursorItemIconID: 48 }),
    );
    expect(calls(events, 'drawImage').length).toBe(1);
  });

  it('uiHeld / uiBlocking 维持整函数门（拖拽物/面板态,原版 mouseItem 域,本次不动）', () => {
    for (const extra of [{ uiHeld: true }, { uiBlocking: true }]) {
      const events = stubRenderer(
        { ...NPC_HOVER_CTX, ...extra },
        mkPlayer({ cursorItemIconText: 'Levi: 250/250', cursorItemIconEnabled: true, cursorItemIconID: 48 }),
      );
      expect(calls(events, 'fillText').length).toBe(0);
      expect(calls(events, 'drawImage').length).toBe(0);
    }
  });
});

describe('SW-BJ7 ③ 缺陷②：MouseTextInner 锚定同式（:20379-20419）+ 左上锚钉死', () => {
  it('实锚 = mouse+(20,20)（:20379 +14 与 :20386 ThickMouse +6,默认档恒真）', () => {
    const events = stubRenderer(
      { ...NPC_HOVER_CTX, npcHover: false },
      mkPlayer({ cursorItemIconText: 'Levi: 250/250' }),
    );
    const core = calls(events, 'fillText')[calls(events, 'fillText').length - 1];
    expect(core.args[1]).toBe(500 + 20);
    expect(core.args[2]).toBe(300 + 20);
    // 净空不变式：+20 > 光标阴影 pass 右缘 ≈ mouse+1+14×1.1 ≈ +16.4（呼吸峰）
    expect((core.args[1] as number) - 500).toBeGreaterThan(16.4);
  });

  it('textAlign/textBaseline 在 save() 后、fillText 前钉死为 left/top（XNA origin 零=字形左上）', () => {
    const events = stubRenderer(
      { ...NPC_HOVER_CTX, npcHover: false },
      mkPlayer({ cursorItemIconText: 'Levi: 250/250' }),
    );
    const idx = (pred: (e: CtxEvent) => boolean, from = 0) =>
      events.findIndex((e, i) => i >= from && pred(e));
    const lastSave = idx((e) => e.t === 'call' && e.name === 'save');
    const alignAt = idx((e) => e.t === 'set' && e.key === 'textAlign', lastSave);
    const baselineAt = idx((e) => e.t === 'set' && e.key === 'textBaseline', lastSave);
    const coreAt = idx((e) => e.t === 'call' && e.name === 'fillText', baselineAt);
    expect(alignAt).toBeGreaterThan(lastSave);
    expect(baselineAt).toBeGreaterThan(alignAt);
    expect(coreAt).toBeGreaterThan(baselineAt);
    expect(sets(events, 'textAlign').pop()!.value).toBe('left');
    expect(sets(events, 'textBaseline').pop()!.value).toBe('top');
  });

  it('屏幕右缘翻折：X+宽+40 溢出 → X=屏宽-宽-40（:20412-20415,文本整体折到指针左侧）', () => {
    const a = mouseTextAnchor(1880, 300, 112, 14, 1920, 1080);
    expect(a.x).toBe(1920 - 112 - 40);
    expect(a.x).toBeLessThan(1880);          // 翻到光标左侧
    expect(a.y).toBe(320);                   // Y 支不受影响
  });

  it('屏幕下缘翻折：Y+高+40 溢出 → Y=屏高-高-40（:20416-20419）', () => {
    const a = mouseTextAnchor(500, 1050, 112, 14, 1920, 1080);
    expect(a.y).toBe(1080 - 14 - 40);
    expect(a.x).toBe(520);
  });

  it('光标持物 +34（:20390-20392 helper 面全转录;本仓 uiHeld 整函数早退不接=债 BJ7-R1）', () => {
    const a = mouseTextAnchor(500, 300, 112, 14, 1920, 1080, { heldOnCursor: true });
    expect(a.x).toBe(500 + 14 + 6 + 34);
    expect(a.y).toBe(320);
  });

  it('thickMouse=false 档（MouseBorderColor=Transparent 设置面,本仓不建模,公式完备性）', () => {
    const a = mouseTextAnchor(500, 300, 112, 14, 1920, 1080, { thickMouse: false });
    expect(a.x).toBe(514);
    expect(a.y).toBe(314);
  });
});

// ================= ④ 门行结构锁（渲染层回归钉,BJ1 同法） =================

describe('SW-BJ7 ④ 结构锁：drawCursorItemIcon 门拓扑', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../src/render/Renderer.ts', import.meta.url)), 'utf8',
  );

  it('整函数早退门不含 npcHover（旧门 `c.npcHover||c.uiHeld||c.uiBlocking` 已拆）', () => {
    expect(src).toContain('if (c.uiHeld || c.uiBlocking) return;');
    expect(src).not.toContain('if (c.npcHover || c.uiHeld || c.uiBlocking) return;');
  });

  it('图标支门含 !c.npcHover（npcHover 下沉至图标支,余辉支一并压）', () => {
    expect(src).toContain('if ((flag || flag2) && !c.npcHover) {');
  });

  it('名文本支走 mouseTextAnchor（+14 裸锚公式不得回流）', () => {
    expect(src).toContain('const anchor = mouseTextAnchor(this._mouseX, this._mouseY, w, h, this.canvas.width, this.canvas.height);');
    expect(src).not.toMatch(/let x = this\._mouseX \+ 14, y = this\._mouseY \+ 14;/);
  });
});
