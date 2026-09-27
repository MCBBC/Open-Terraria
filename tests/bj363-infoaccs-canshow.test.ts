// ★BJ363（2026-09-27）信息列 CanShowInfoAccs 抑制门复活 + DOM 覆盖悬停门。
// 定谳（反编译锚 Main.cs:47559-47567 / CanShowInfoAccs :3099-3110）：
//   · 原版悬停/行标签/hideInfo 点击整链在 DrawInfoAccs 内、置于
//     `if (!CanShowInfoAccs) return;` 之后——抑制期（talkNPC>0 && chest==-1）
//     无绘制即无交互面。
//   · 本仓 BJ105 拆面时该门丢失,且门输入面本就是【双幻影字段读】：
//     (player as {talking?}).talking（Player 无此字段）/（renderer as
//     {chestOpen?}).chestOpen（Renderer 无此字段）恒 undefined → 绘侧抑制门
//     死码 + 悬停面无门 → 上一绘制帧冻结 iconRects 仍被命中:行标签照 claim
//     （cursorItemIconText 后写者胜,覆写三族回填）+ timeUiHover 吞点击 +
//     hideInfo 被误翻转（用户实报「携带贝壳电话时某些情况下信息栏不显示时间」
//     ——对话/告示牌期误点,时间行被藏;重进=存档未落即还原）。
// 修法：门输入改 Game 注入（dialogNpc / openChestRef 活引用,Main.cs:3099 两腿;
// sign 臂=牌对话框无可读态,登记未接恒 false 绘/悬停同口径）+ tickInfoAccsHover
// 补 canShow 早退 + inpOverDomUi 门（背包 DOM 格实测压住图标条右段,
// scripts/_bj363-overlap-sweep.mjs 五档几何普查——DOM 格悬停期不再按其下隐形
// 图标 rect 误命中;DOM 点击本就被 Input.isDomUiTarget 吃掉,本门收口悬停 claim 面）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game } from '../src/core/Game';
import { Renderer } from '../src/render/Renderer';
import { InfoAccsLayer } from '../src/render/InfoAccsLayer';
import { emptyInfoAccGates } from '../src/stats/InfoAccs';

type AnyGame = Record<string, any>;

const here = join(dirname(fileURLToPath(import.meta.url)));
const gameSrc = readFileSync(join(here, '../src/core/Game.ts'), 'utf8');
const rendererSrc = readFileSync(join(here, '../src/render/Renderer.ts'), 'utf8');

/** Game 原型桩（sw-bj105 同法）：信息悬停面所需最小字段。 */
function bj363Game(over: Record<string, unknown> = {}): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    hideInfo: new Array(13).fill(false),
    cursorItemIconEnabled: false, cursorItemIconID: 0, cursorItemIconText: '',
    cursorItemIconRare: 0, cursorItemIconDiff: 0,
  };
  g.input = { mouseX: 995, mouseY: 350, mouseDown: false };   // 首图标 rect(990,343,14,14) 内
  g.sfx = { play: () => {} };
  g.renderer = {
    infoAccHover: -1,
    infoAccTalking: false,
    infoAccChestOpen: false,
    // 真 InfoAccsLayer：hitTest/state 走真面（iconRects 注入首行命中域）
    infoAccs: new InfoAccsLayer(),
  };
  Object.assign(g, over);
  return g;
}

/** 给 InfoAccsLayer 植入上一绘制帧冻结面：1 行（icon0 时间行）+ 命中 rect。 */
function freezeRow(g: AnyGame, inventoryOpen: boolean): void {
  const layer = g.renderer.infoAccs as InfoAccsLayer;
  const row = { row: 0, icon: 0, hideIndex: 0, text: '上午 8:18', label: '时间' };
  layer.state = {
    rows: [row],
    iconRects: [{ x: 990, y: 343, w: 14, h: 14, row }],
    inventoryOpen,
  };
}

describe('BJ363 ① CanShowInfoAccs 抑制门（Main.cs:47559-47567 整链早退）', () => {
  it('对话中未开箱（talking=true, chestOpen=false）：悬停不命中、不 claim、hideInfo 不被翻转', () => {
    const g = bj363Game();
    g.renderer.infoAccTalking = true;        // tickInfoAccs 注入后的抑制态（注入面见 ③）
    freezeRow(g, true);                       // 冻结面=背包开横排（点击翻转域）
    g.input.mouseDown = true;                 // 误点隐形图标列
    (g as AnyGame).tickInfoAccsHover();
    expect(g.renderer.infoAccHover).toBe(-1);                    // 不命中
    expect(g.player.cursorItemIconText).toBe('');                // 行标签不 claim
    expect(g.renderer.timeUiHover).toBeUndefined();              // 不吞点击
    expect(g.player.hideInfo[0]).toBe(false);                    // 时间行不被藏
  });

  it('开箱豁免腿（talkNPC>0 && chest!=-1 → CanShow=true,Main.cs:3099 原式）', () => {
    const g = bj363Game();
    g.renderer.infoAccTalking = true;
    g.renderer.infoAccChestOpen = true;
    freezeRow(g, false);
    (g as AnyGame).tickInfoAccsHover();
    expect(g.renderer.infoAccHover).toBe(0);
    expect(g.player.cursorItemIconText).toBe('时间');
  });

  it('非对话态照常 claim（回归面：行标签后写者胜 + rare/diff 域重建）', () => {
    const g = bj363Game();
    freezeRow(g, false);
    g.player.cursorItemIconText = '铁镐 (1)';
    g.player.cursorItemIconRare = 5;
    (g as AnyGame).tickInfoAccsHover();
    expect(g.renderer.infoAccHover).toBe(0);
    expect(g.player.cursorItemIconText).toBe('时间');
    expect(g.player.cursorItemIconRare).toBe(0);
    expect(g.player.cursorItemIconDiff).toBe(0);
  });

  it('抑制期不吃点击闩残态：恢复可见后首次误按不误翻转（latch 显式归零）', () => {
    const g = bj363Game();
    g.renderer.infoAccTalking = true;
    freezeRow(g, true);
    g.input.mouseDown = true;
    (g as AnyGame).tickInfoAccsHover();            // 抑制期:翻转不发生
    expect(g.player.hideInfo[0]).toBe(false);
    g.renderer.infoAccTalking = false;             // 对话关闭
    g.input.mouseDown = false;
    (g as AnyGame).tickInfoAccsHover();            // 可见帧:清闩
    g.input.mouseDown = true;
    (g as AnyGame).tickInfoAccsHover();            // 新沿:翻转发生
    expect(g.player.hideInfo[0]).toBe(true);
  });
});

describe('BJ363 ② DOM 覆盖悬停门（inpOverDomUi=mouseInterface 等价面）', () => {
  it('光标落在覆盖图标条的 DOM 格上：不按隐形 rect 命中/claim/翻转', () => {
    const g = bj363Game();
    g.inpOverDomUi = () => true;               // 阴影原型法（IIIII248 面桩）
    freezeRow(g, true);
    g.input.mouseDown = true;
    (g as AnyGame).tickInfoAccsHover();
    expect(g.renderer.infoAccHover).toBe(-1);
    expect(g.player.cursorItemIconText).toBe('');
    expect(g.player.hideInfo[0]).toBe(false);
    expect(g.renderer.timeUiHover).toBeUndefined();
  });

  it('光标在裸图标上（无 DOM 覆盖）：悬停 claim 照常（回归面）', () => {
    const g = bj363Game();
    g.inpOverDomUi = () => false;
    freezeRow(g, false);
    (g as AnyGame).tickInfoAccsHover();
    expect(g.renderer.infoAccHover).toBe(0);
    expect(g.player.cursorItemIconText).toBe('时间');
  });
});

describe('BJ363 ③ Game 注入面（tickInfoAccs → renderer.infoAccTalking/ChestOpen）', () => {
  it('dialogNpc / openChestRef 活引用 → 两腿注入（Main.cs:3099 输入域）', () => {
    const g = bj363Game();
    // tickInfoAccs 最小面：空门禁（不触 radar/秒表支）+ 空 entity 桶 + 时钟/天气桩
    g.player.equipStats = { infoAccs: emptyInfoAccGates() };
    g.player.displayedFishingInfo = '';
    g.player.accCritterGuideText = null;
    g.player.accCritterGuideVid = null;
    g.player.accThirdEyeNumber = 0;
    g.player.accThirdEyeCounter = 0;
    g.player.accCritterGuideCounter = 0;
    g.player.getDPS = () => 0;
    g.player.cx = 170; g.player.cy = 181; g.player.y = 160; g.player.h = 42;
    g.world = {
      clock: { timeOfDay: 0.3, isDay: true, moonPhase: 0, bloodMoon: false, eclipse: false },
      weather: { shouldUseStormMusic: false, maxRaining: 0, cloudBGActive: 0, numClouds: 200, windSpeedCurrent: 0, sandstorm: { happening: false } },
      bannerKills: [], groundLevel: 100, rockLevel: 200, store: { w: 4200, h: 1200 },
    };
    g.entities = { projectiles: [], enemies: [], critters: [], npcs: [] };
    g.dialogNpc = { x: 0, y: 0, w: 20, h: 42 };
    g.openChestRef = () => ({ x: 1, y: 1 });
    (g as AnyGame).tickInfoAccs();
    expect(g.renderer.infoAccTalking).toBe(true);
    expect(g.renderer.infoAccChestOpen).toBe(true);
  });

  it('无对话无箱：两腿 false（回归面）', () => {
    const g = bj363Game();
    g.player.equipStats = { infoAccs: emptyInfoAccGates() };
    g.player.displayedFishingInfo = '';
    g.player.accCritterGuideText = null;
    g.player.accCritterGuideVid = null;
    g.player.accThirdEyeNumber = 0;
    g.player.accThirdEyeCounter = 0;
    g.player.accCritterGuideCounter = 0;
    g.player.getDPS = () => 0;
    g.player.cx = 170; g.player.cy = 181; g.player.y = 160; g.player.h = 42;
    g.world = {
      clock: { timeOfDay: 0.3, isDay: true, moonPhase: 0, bloodMoon: false, eclipse: false },
      weather: { shouldUseStormMusic: false, maxRaining: 0, cloudBGActive: 0, numClouds: 200, windSpeedCurrent: 0, sandstorm: { happening: false } },
      bannerKills: [], groundLevel: 100, rockLevel: 200, store: { w: 4200, h: 1200 },
    };
    g.entities = { projectiles: [], enemies: [], critters: [], npcs: [] };
    g.dialogNpc = null;
    g.openChestRef = null;
    (g as AnyGame).tickInfoAccs();
    expect(g.renderer.infoAccTalking).toBe(false);
    expect(g.renderer.infoAccChestOpen).toBe(false);
  });
});

describe('BJ363 ④ 结构锁（幻影字段读退役 + 门常驻）', () => {
  it('Renderer 调用点不再读 talking/chestOpen 幻影字段（恒 undefined 死门根除）', () => {
    expect(rendererSrc).not.toContain('(player as unknown as { talking?: boolean }).talking');
    expect(rendererSrc).not.toContain('(this as unknown as { chestOpen?: boolean }).chestOpen');
    // 两调用点走注入面
    expect(rendererSrc.match(/canShow\(\s*this\.infoAccTalking,/g)?.length).toBe(2);
  });

  it('tickInfoAccsHover 持 canShow 早退 + inpOverDomUi 门;tickInfoAccs 持注入面', () => {
    const sHover = gameSrc.indexOf('private tickInfoAccsHover(): void {');
    const sEmote = gameSrc.indexOf('private tickNpcEmotes', sHover);
    const hoverBody = gameSrc.slice(sHover, sEmote);
    expect(hoverBody).toContain('r.infoAccs.canShow(r.infoAccTalking, r.infoAccChestOpen, false)');
    expect(hoverBody).toContain('this.inpOverDomUi()');
    expect(hoverBody.indexOf('canShow')).toBeLessThan(hoverBody.indexOf('infoAccs.hitTest'));
    const sInfo = gameSrc.indexOf('private tickInfoAccs(): void {');
    const tickBody = gameSrc.slice(sInfo, sHover);
    expect(tickBody).toContain('r.infoAccTalking = this.dialogNpc != null');
    expect(tickBody).toContain('(this.openChestRef?.() ?? null) != null');
  });

  it('Renderer 声明注入字段（缺省 false=绘制相既有行为零漂移）', () => {
    expect(rendererSrc).toContain('infoAccTalking = false;');
    expect(rendererSrc).toContain('infoAccChestOpen = false;');
  });
});
