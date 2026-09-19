// SW-BJ120 2026-09-19 用户实报「原版点击地图不会打开地图，应正常接收使用武器等事件」。
// 反编译标杆：Terarria1457（1458 同域零变更——MinimapFrame.cs / PingMapLayer.cs 与 1457
// 逐字节相等；Main.cs/Player.cs 相关段仅行移 +4~6）：
//  · 场景 Y（非全屏态点小地图）——原版 minimap 支（Main.cs:56340-56381，mapStyle==1
//    分支）无任何点击处理：不开图、不置 mouseInterface，点击【穿透】到世界（武器/挖掘
//    照常）。MinimapFrame.Update（MinimapFrame.cs:138-166）只在三个缩放钮命中时
//    （GetButtonUnderMouse :197-206）置 Main.LocalPlayer.mouseInterface=true 且
//    Click()——钮上点击被 TriggersSet.cs:835-841 的 !mouseInterface 门拦在
//    controlUseItem/controlUseTile 之外 = 钮上挥剑/挖矿/右键交互不触发。
//  · 场景 X（全屏地图态）——①不暂停：CanPauseGame（Main.cs:17493-17503）只列
//    ingameOptionsWindow/InGameUI/autoPause 背包系，无 mapFullscreen → 世界照跑；
//    ②武器【不可】用：Player.cs:24961-25010 mapFullscreen 支先消费方向键平移地图、
//    随即把 controlJump/UseItem/UseTile/Throw/Hook/Torch/Smart/Mount/Dash/
//    ArmorSetAbility 整批清零，且 Main.cs:56162 drawFullMap 支置 mouseInterface=true
//    （TriggersSet MouseLeft 门 + TryingToUseItem Player.cs:24519 双封）——
//    「边看地图边用武器」不是原版语义（世界跑、玩家控制被地图消费才是）。
//  · 开图入口全集 = Map Full Screen 专用键（Player.cs:25163-25176 mapFullScreen 触发器
//    →TryOpeningFullscreenMap）/背包态地图按钮（Main.cs:41777-41820，playerInventory
//    门内）/右键晶塔（Player.cs:32426）。小地图本体不在其列。
//  · 全屏地图点击面（Main.cs:56153-56161 拖拽平移；56310-56319 双击 0.5s/<2px =ping；
//    56760-56802 虫洞队友头像=传送；56850-56870 左下角地图钮=关图）——无「点击再开图」。
// 本仓刀（三处）：
//  ①Game.ts fixedUpdate：小地图点击→开图面整面摘除（自创面；2026-08-25 只修过边沿）；
//  ②Game.ts updateUse 早退门并入 minimapUiHover（缩放钮 mouseInterface 等价面——
//    此前钮上同一击既缩放小地图又打中钮下世界 tile 的劫持面）；
//  ③Renderer.ts drawMinimap：全屏地图态按钮输入面整挂起（原版按钮 Update 仅经
//    MinimapFrameManager.DrawTo 被调——其唯一调用点在非全屏 minimap 支 Main.cs:56372；
//    本仓小地图先于全屏图绘制，无门=全屏图下按住左键静默缩放被盖住的小地图）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const gameSrc = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');
const rendererSrc = readFileSync(join(ROOT, 'src', 'render', 'Renderer.ts'), 'utf8');
const keybindsSrc = readFileSync(join(ROOT, 'src', 'core', 'Keybinds.ts'), 'utf8');

/** 抽取从 begin 锚到 end 锚的第一段（含两端） */
const slice = (src: string, begin: RegExp, end: RegExp): string => {
  const b = src.search(begin);
  expect(b).toBeGreaterThanOrEqual(0);
  const e = src.slice(b).search(end);
  return src.slice(b, b + e + src.slice(b).match(end)![0].length);
};

describe('SW-BJ120 场景 Y：小地图本体点击=穿透（不开图/不吞武器事件）', () => {
  it('①刀：fixedUpdate 不再消费 minimapRect（点击开图面整面摘除）', () => {
    // 摘除前 Game.ts 唯一 minimapRect 消费点=小地图矩形点击→fm.open；重引入须有
    // 原版锚并同步重产本测试
    expect(gameSrc.includes('minimapRect')).toBe(false);
    expect(gameSrc).toContain('SW-BJ120');
  });

  it('②保留面：_mapClickLatch 清除线仍在（晶塔开图路径 :27056 置位依赖回落）', () => {
    expect(gameSrc).toContain('if (!inp.mouseDown) this._mapClickLatch = false;');
    // 晶塔右键开图（原版 Player.cs:32426 同款）置 _mapOpenClick 的写点仅剩 1 处
    expect(gameSrc.split("this.renderer['_mapOpenClick'] = true;").length - 1).toBe(1);
  });

  it('③开图专用键保留：MapFull = KeyM（原版 mapFullScreen 触发器 Player.cs:25163）', () => {
    expect(keybindsSrc).toMatch(/MapFull:\s*\['KeyM'\]/);
    expect(gameSrc).toContain('toggleFullMap()');
  });

  it('④刀：updateUse 早退门并入 minimapUiHover（缩放钮 mouseInterface 等价面）', () => {
    const gate = slice(gameSrc, /const cursorHeld = !!this\.uiHeldItemRef/, /this\.mining = null;/);
    expect(gate).toContain('this.renderer.minimapUiHover');
    // 门内既有 fullMap 早退（场景 X 武器面）不被本刀削弱
    expect(gate).toContain('this.renderer.fullMap.open');
  });
});

describe('SW-BJ120 场景 X：全屏地图态=世界照跑/武器被消费/点击语义不被隐藏面劫持', () => {
  it('⑤不暂停：fullMap.open 不触发 paused（原版 CanPauseGame 无 mapFullscreen 项）', () => {
    const lines = gameSrc.split('\n');
    for (const line of lines) {
      if (/paused\s*=\s*true/.test(line)) {
        expect(line.includes('fullMap')).toBe(false);
      }
    }
  });

  it('⑥刀：全屏地图态小地图按钮输入面挂起（原版按钮 Update 只在非全屏支被调）', () => {
    // reset 必须无条件先行（每帧 false 起算=无陈旧 true 让位门）
    const region = slice(
      rendererSrc,
      /\/\/ 按钮：悬停高亮 \+ 按住生效/,
      /记录小地图区域供点击检测/,
    );
    const resetAt = region.indexOf('this.minimapUiHover = false;');
    const guardAt = region.indexOf('if (!this.fullMap.open) {');
    expect(resetAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeGreaterThan(resetAt);
    // 按钮循环（minimapUiHover=true 的唯一置位点）在挂起门之内
    const loopAt = region.indexOf('for (const [tex, [bx, by], kind] of btns)');
    const closeAt = region.indexOf('this.minimapUiHover = true;');
    expect(loopAt).toBeGreaterThan(guardAt);
    expect(closeAt).toBeGreaterThan(guardAt);
  });

  it('⑦刀：Renderer 侧孪生开图面同摘（drawMinimap 点击→openFullMapFocusedOnPlayer 调用点清零）', () => {
    // 刀②让位后 updateUse 不再消费点击边沿——渲染侧残留的同一自创面会在缩放钮
    // 点击时吃掉存活边沿照样开图（探针 _bj15-mapprobe2 1a2 实测）；两处必须同摘
    expect(rendererSrc.includes('this.openFullMapFocusedOnPlayer(')).toBe(false);
    // 预置函数本体保留（单源复用位）
    expect(rendererSrc).toContain('openFullMapFocusedOnPlayer(player');
  });
});
