// ★BJ630（2026-10-10）两件：BJ625/623 新登记债
//
// 件1 [bj625-aura-body-lightlerp-residual] 688-690 本体/底座光照色通道：
//  定谳锚（Terarria1457 亲读）：Main.cs:32481-32527 DrawProjDirect 专支三笔
//  【同色】——color73 = Color.Lerp(proj.GetAlpha(projectileColor), White, 0.5)
//  （:32497 本体/:32524 底座同式）、color74 = color73 截 A=127（glow :32498-32499）;
//  projectileColor = proj 中心 tile 光照（:30068 Lighting.GetColor(position+w/2,
//  position+h/2)）。本仓世界层合成乘光管线下本体/底座吃 plain 光 → 暗处比原版暗
//  50%（暗处 net = light×1.0 vs vanilla light×0.5+0.5）;glow 层（BJ625件3 已落）
//  半亮自发光 → 反差更显。落刀 = 三笔全数 op 化进 itemGlowQueue 同槽（BJ621 迁层
//  习语：免世界层乘光目标进合成后逃逸队列）,绘制色显式 = auraGlowTint(lightAt(
//  中心 tile)) 逐值 1:1。仅 688-690 三型进通道（663/677/691 已判零缺面 plain 光
//  同构等价,勿扩——BJ625件3 同注）。
//
// 件2 [BJ623-D2] openChestRef 关箱生命周期锁：
//  定谳（全库关箱路径普查,2026-10-10）——开箱置位面全库唯一 = UI.openChestPanel
//  （UI.ts:6664,经 game.openChest 回调;世界箱 Game.ts:30775/储物族 :29889/容器宠
//  :46369/MP msg31 :3925 四入口全汇）。关箱清位面两站：①UI.closeChest（:6703,
//  单源收口——closeInventory :3848/vinvOpenModernCraft 门 :9877/vinvCloseAllQuiet
//  :9933/vinvCloseAllLoud :9954 四臂全汇）;②UI.closeAll（:7734,退世界 teardown
//  直清）。五条触发链逐支对账全数覆盖：Esc 关包（main.ts escapeChain 'closeInventory'
//  → ui.closeInventory→closeChest）/ 走远自动关+开箱中被拆（Game.tickChestAutoClose
//  → closeChestPanel→closeInventory→closeChest）/ 开另一箱切换（openChestPanel 重赋
//  =旧箱隐式关,ref 随新箱）/ 退出世界（mainFlow quitToMenu/onCloseAllUI → ui.closeAll
//  直清）/ 死亡（tickChestAutoClose dead 臂 → closeChestPanel+closeInventory）。同箱
//  再点三面（世界箱 :30764/储物族 :29891/容器宠 :46362）与容器宠追踪失联（:46745）
//  亦全走 closeChestPanel。**判谳=零漏支**：「提炼被永久闸住」（extractinatorPullImpl
//  Game.ts:30514 `openChestRef?.() === chest → return null` = Wiring.cs:2571
//  Chest.UsingChest 判定）所需「漏 null 关包支」在现树不存在 → 登记债以生命周期
//  矩阵锁转正收案（漏支回潮必红）。
//
// 运行：cd game && npx vitest run tests/bj630-proj-light-chest-lock.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auraGlowMaskOf, auraGlowTint, AURA_GLOW_ALPHA } from '../src/data/vanillaProjGlow';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { UI } from '../src/ui/UI';
import { resolveEscapeChain } from '../src/ui/escapeChain';
import type { GameHooks } from '../src/entities/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MP_SRC = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
const UI_SRC = readFileSync(join(ROOT, 'src', 'ui', 'UI.ts'), 'utf8');
const GAME_SRC = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');
const MAIN_SRC = readFileSync(join(ROOT, 'src', 'main.ts'), 'utf8');

beforeAll(() => {
  // projFrameImg 帧切片画布垫片（BJ606/BJ625 同式,吸掉 2d 调用）
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const cv: Record<string, unknown> = { width: 0, height: 0 };
      cv.getContext = () => new Proxy({}, { get: () => () => { /* noop */ }, set: () => true });
      return cv;
    },
    querySelector: () => null,
  };
  // closeAll 反射扫场/研究面板收刀的 node 垫片（instanceof Node/	removeEventListener）
  (globalThis as Record<string, unknown>).Node = class Node {};
  (globalThis as Record<string, unknown>).window = {
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => true,
  };
});

afterEach(() => {
  for (const v of [688, 689, 690, 677]) setProjSpriteOverride(v, undefined as never);
});

// ===================== 件1：688-690 本体/底座光照色通道 =====================

type RecOp = { m: string; a: unknown[] };
type GlowOp = Record<string, unknown>;

function makeGame(): { hooks: GameHooks; player: Player } {
  const W = 200, H = 120;
  const w = new World(W, H, 7, 'bj630-aura');
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const list: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never, player: player as never,
    enemies: () => list as never, npcs: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {}, spawnFriendlyProj: () => undefined,
    entities: { add: () => {}, nextId: 1, projectiles: [] } as never,
  } as never;
  return { hooks, player };
}

/** 688-690 落地+绘制：返回 pushGlowOps 收到的 ops（队列序）与 world 层绘制序列。 */
function drawAura(vid: 688 | 689 | 690, opts: { carried?: boolean; light?: [number, number, number]; fade?: number } = {}): {
  glowOps: GlowOp[]; drawOps: RecOp[];
} {
  const { hooks, player } = makeGame();
  const m = new MinionProj(50 * 16, 98 * 16 - 8, vid, 30, 0, true, 0, false, () => player);
  for (let i = 0; i < 3 && !m.dead; i++) m.fixedUpdate(1 / 60, hooks);
  if (opts.carried) (m as unknown as { carriedByBackpack: boolean }).carriedByBackpack = true;
  if (opts.fade !== undefined) (m as unknown as { alphaFade: number }).alphaFade = opts.fade;
  const dims: Record<number, [number, number]> = { 688: [22, 180], 689: [28, 192], 690: [34, 304] };
  const [iw, ih] = dims[vid];
  setProjSpriteOverride(vid, { width: iw, height: ih } as never);
  const baseStub = { width: 28, height: 10, __base: vid };
  const glowOps: GlowOp[] = [];
  const drawOps: RecOp[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k) {
      if (k === 'canvas') return undefined;
      if (k === 'getTransform') return () => ({ __m: 1 });
      return (...a: unknown[]) => { drawOps.push({ m: String(k), a }); };
    },
    set(_t, k, v) { drawOps.push({ m: `set:${String(k)}`, a: [v] }); return true; },
  });
  const fakeR = {
    ctx,
    atlas: { ensureVImage: (f: string) => (f.includes('Extra_') ? baseStub : { width: iw, height: ih, __f: f }) },
    lighting: { lightAt: () => opts.light ?? [255, 255, 255] },
    pushGlowOps: (o: GlowOp[]) => { glowOps.push(...o); },
  };
  (m as unknown as { draw(r: unknown): void }).draw(fakeR);
  return { glowOps, drawOps };
}

const FRAMES: Record<number, number> = { 688: 6, 689: 6, 690: 8 };   // Main.cs:8603-8605

describe('BJ630 件1：688-690 本体/底座光照色通道（Main.cs:32497/:32524 Lerp(light,White,.5)）', () => {
  it('暗场像素锁：light=[40,80,120] → 本体/底座/glow 三笔 tint 同式=Lerp(light,White,.5)（旧 plain 光=light/255 应红）', () => {
    const { glowOps } = drawAura(688, { light: [40, 80, 120] });
    const want = auraGlowTint([40, 80, 120]);
    expect(want).not.toEqual([40 / 255, 80 / 255, 120 / 255]);   // 判别面：≠世界层 plain 乘光
    expect(glowOps).toHaveLength(3);                              // 本体+glow+底座（携行门开）
    const [body, glow, base] = glowOps as [GlowOp, GlowOp, GlowOp];
    // ① 本体（:32503 color73）
    expect(body.tex).toBe('vanilla/Projectile_688.png');
    expect(body.tint).toEqual(want);
    expect(body.alpha).toBe(1);                                   // color73 A=255 ×fade=1
    // ② glow（:32505-32507 color74=A 截 127）
    expect(glow.tex).toBe('vanilla/Glow_228.png');
    expect(glow.tint).toEqual(want);
    expect(glow.alpha).toBeCloseTo(AURA_GLOW_ALPHA, 9);
    // ③ 底座（:32522 color73 同式——锚 Extra_86 stub 28×10）
    expect(base.tex).toBe('vanilla/Extra_86.png');
    expect(base.tint).toEqual(want);
    expect(base.alpha).toBe(1);
    // 切片/位姿面：本体=glow 同矩形（平行表,sy=frame×fh,dx=−帧宽/2,dy=0）
    for (const o of [body, glow]) {
      expect(o.sx).toBe(0); expect(o.sy).toBe(0);                 // age 3t → frame 0
      expect(o.sw).toBe(22); expect(o.sh).toBe(30);               // 帧 22×30（180/6）
      expect(o.dx).toBe(-11); expect(o.dy).toBe(0);
      expect(o.blend).toBe('over');
    }
    // 底座位姿面：origin=(宽/2, 高−2)（:32521）
    expect(base.sx).toBe(0); expect(base.sy).toBe(0);
    expect(base.sw).toBe(28); expect(base.sh).toBe(10);
    expect(base.dx).toBe(-14); expect(base.dy).toBe(-8);
  });

  it('暗场双档：全暗 [0,0,0] → 三笔 tint=[.5,.5,.5]（vanilla Lerp 地板,非世界层乘光的 [0,0,0]）', () => {
    const { glowOps } = drawAura(688, { light: [0, 0, 0] });
    expect(glowOps).toHaveLength(3);
    for (const o of glowOps) expect(o.tint).toEqual([0.5, 0.5, 0.5]);
  });

  it('亮场档：light=[255,255,255] → 三笔 tint=[1,1,1]（flush needBake/needBoost 双免=直画,亮处零回归）', () => {
    const { glowOps } = drawAura(688, { light: [255, 255, 255] });
    expect(glowOps).toHaveLength(3);
    for (const o of glowOps) expect(o.tint).toEqual([1, 1, 1]);
  });

  it('queue 序=原版笔序：本体(:32503)→glow(:32505)→底座(:32522);携行（ai[2]==1）底座缺位', () => {
    const placed = drawAura(688).glowOps.map((o) => o.tex);
    expect(placed).toEqual(['vanilla/Projectile_688.png', 'vanilla/Glow_228.png', 'vanilla/Extra_86.png']);
    const carried = drawAura(688, { carried: true }).glowOps.map((o) => o.tex);
    expect(carried).toEqual(['vanilla/Projectile_688.png', 'vanilla/Glow_228.png']);
  });

  it('三档分派：689→Glow_229+Extra_87、690→Glow_230+Extra_88（switch :32493-32501/:32524 系）', () => {
    const o689 = drawAura(689).glowOps;
    expect(o689.map((o) => o.tex)).toEqual(['vanilla/Projectile_689.png', 'vanilla/Glow_229.png', 'vanilla/Extra_87.png']);
    expect([o689[0]!.sw, o689[0]!.sh]).toEqual([28, 32]);         // 帧 28×32（192/6）
    const o690 = drawAura(690).glowOps;
    expect(o690.map((o) => o.tex)).toEqual(['vanilla/Projectile_690.png', 'vanilla/Glow_230.png', 'vanilla/Extra_88.png']);
    expect([o690[0]!.sw, o690[0]!.sh]).toEqual([34, 38]);         // 帧 34×38（304/8）
  });

  it('alphaFade 淡入淡出乘区三笔同乘（旧 world 层 globalAlpha 面迁 op alpha）', () => {
    const { glowOps } = drawAura(688, { fade: 128 });
    const fade = 127 / 255;
    expect(glowOps[0]!.alpha).toBe(fade);                                        // 本体
    expect(glowOps[1]!.alpha).toBeCloseTo(AURA_GLOW_ALPHA * fade, 12);           // glow
    expect(glowOps[2]!.alpha).toBe(fade);                                        // 底座
  });

  it('世界层乘光面退出：AURA 支零 drawImage（三笔全数出合成后逃逸队列）', () => {
    const { drawOps } = drawAura(688, { light: [40, 80, 120] });
    expect(drawOps.some((o) => o.m === 'drawImage')).toBe(false);
    // 锚仍走 translate(cx,y)+translate(cx,cy)（矩阵捕获面,BJ606 ②A/②B 同锁）
    expect(drawOps.some((o) => o.m === 'translate')).toBe(true);
  });

  it('688-690 帧档表（projFrames 6/6/8=Main.cs:8603-8605;帧高整除=平行表切片前提）', () => {
    expect(FRAMES[688]).toBe(6); expect(FRAMES[689]).toBe(6); expect(FRAMES[690]).toBe(8);
    expect(180 % 6).toBe(0); expect(192 % 6).toBe(0); expect(304 % 8).toBe(0);
  });

  it('勿扩锁：663/677/691 族不进通道（677 弩车支 world 层直绘+零 glow op——plain 光同构等价面）', () => {
    const { hooks, player } = makeGame();
    const m677 = new MinionProj(50 * 16, 98 * 16 - 8, 677, 30, 0, true, 0, false, () => player);
    for (let i = 0; i < 3 && !m677.dead; i++) m677.fixedUpdate(1 / 60, hooks);
    setProjSpriteOverride(677, { width: 124, height: 336 } as never);
    const glowOps: GlowOp[] = [];
    const drawOps: RecOp[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, k) {
        if (k === 'canvas') return undefined;
        if (k === 'getTransform') return () => ({ __m: 1 });
        return (...a: unknown[]) => { drawOps.push({ m: String(k), a }); };
      },
      set(_t, k, v) { drawOps.push({ m: `set:${String(k)}`, a: [v] }); return true; },
    });
    (m677 as unknown as { draw(r: unknown): void }).draw({
      ctx,
      atlas: { ensureVImage: () => ({ width: 40, height: 12 }) },
      lighting: { lightAt: () => [40, 80, 120] },
      pushGlowOps: (o: GlowOp[]) => { glowOps.push(...o); },
    });
    expect(glowOps, '弩车族无 per-proj 光照色通道（零 glow op）').toHaveLength(0);
    expect(drawOps.some((o) => o.m === 'drawImage'), 'world 层直绘保留（plain 光同构等价）').toBe(true);
    expect(auraGlowMaskOf(677)).toBeNull();
    expect(auraGlowMaskOf(663)).toBeNull(); expect(auraGlowMaskOf(691)).toBeNull();
  });

  it('接线锁：MinionProj 支内本体/底座 op 面 + 色式单源 auraGlowTint', () => {
    expect(MP_SRC).toContain('tex: `vanilla/Projectile_${this.projId}.png`');
    expect(MP_SRC).toContain('const tint = auraGlowTint([lt[0], lt[1], lt[2]]);');
    expect(MP_SRC).toContain('r.pushGlowOps?.(auraOps, ctx.getTransform());');
    expect(MP_SRC).toContain('dx: -baseTex.width / 2, dy: -(baseTex.height - 2)');
  });
});

// ===================== 件2：openChestRef 关箱生命周期矩阵锁 =====================

type AnyUI = Record<string, any>;

/** 裸 UI 实例（Object.create(UI.prototype),方法级真身+DOM 协作者 stub——demon-heart 同式）。
 *  openChestRef 走 buildHud 同式活 getter 接线（UI.ts:1570）。 */
function mkUi(): { ui: AnyUI; ref: () => unknown } {
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  ui.game = {
    sfx: { play: () => {} },
    closeNpcDialog: () => {},
    npcShopClose: () => {},
    housingMode: null,
    player: { inv: new Inventory() },
    spawnDrop: () => {},
  };
  ui.openChest = null;
  ui.heldStack = null;
  ui.chatMonitor = null;
  ui.root = { innerHTML: '' };
  ui.invPanel = { style: { display: 'none' } };
  ui.chestPanel = { style: { display: 'block' } };
  ui.eqDockEl = null;
  ui.npcShop = null;
  ui._builtLayout = 'vanilla';   // openChestPanel 走 vanilla 早退臂（背包条域,无独立 modal）
  ui.vinvModernCraftOpen = false;
  ui.vinvCraftAvailV = [];
  ui.vinvCraftFocusV = 0;
  ui.vinvSlots = new Map();
  ui.buffBlocks = new Map();
  ui.petBuffBlocks = new Map();
  ui.mountBuffBlocks = new Map();
  ui.nebulaBuffBlocks = new Map();
  ui.optionsUnsubs = [];
  ui.reforgeEl = null; ui.guideEl = null; ui.itemSearchEl = null;
  ui.clothesPanel = null; ui.achWrapEl = null;
  // DOM 协作者影子桩（被测面之外的副作用）
  ui.closeChestRenameDialog = () => {};
  ui.closeHousingPanel = () => {};
  ui.closeItemSearch = () => {};
  ui.closeGuideSearch = () => {};
  ui.vinvSyncGridToggle = () => {};
  ui.openInventory = () => {};
  ui.reflowBuffs = () => {};
  ui.vinvModernResetRecipes = () => {};
  ui.vinvRefreshCraft = () => {};
  ui.layoutVanilla = () => {};
  ui.returnCraftGrid = () => {};
  ui.moveGhost = () => {};
  ui.refreshAll = () => {};
  ui.refreshHousingBtn = () => {};
  ui.teardownInventoryPanel = () => {};
  ui.closeNpcDialog = () => {};
  const ref = () => ui.openChest;   // UI.ts:1570 `game.openChestRef = () => this.openChest` 同式
  return { ui, ref };
}

describe('BJ630 件2：openChestRef 关箱生命周期矩阵锁（开→各路径关→ref null）', () => {
  const chest1 = { x: 40, y: 50, items: [] as unknown[] };
  const chest2 = { x: 60, y: 50, items: [] as unknown[] };

  it('开箱置位面：openChestPanel 置 ref=该箱;开另一箱切换=旧箱隐式关（ref 随新箱）', () => {
    const { ui, ref } = mkUi();
    ui.openChestPanel(chest1);
    expect(ref()).toBe(chest1);
    ui.openChestPanel(chest2);
    expect(ref()).toBe(chest2);          // Game.ts:30775 OpenChest 重赋=旧箱隐式关（:33505 同相）
    expect(ref()).not.toBe(chest1);
  });

  it('closeChest 单源：ref→null（UI.ts:6703）', () => {
    const { ui, ref } = mkUi();
    ui.openChest = chest1;
    ui.closeChest();
    expect(ref()).toBeNull();
  });

  it('Esc 关包漏斗：closeInventory → closeChest → ref null（escapeChain closeInventory 支同汇）', () => {
    const { ui, ref } = mkUi();
    ui.openChest = chest1;
    ui.closeInventory();
    expect(ref()).toBeNull();
  });

  it('走远自动关/开箱中被拆/死亡/同箱再点四链的 Game 侧泵 = closeChestPanel → closeInventory → ref null', () => {
    const { ui, ref } = mkUi();
    ui.openChest = chest1;
    ui.game.closeChestPanel = () => ui.closeInventory();   // UI.ts:1575 接线同式（msg33 包装略）
    ui.game.closeChestPanel();
    expect(ref()).toBeNull();
  });

  it('vinv 三臂：CloseAllQuiet / CloseAllLoud / 站点开现代制作窗门 → closeChest → ref null', () => {
    const { ui, ref } = mkUi();
    ui.openChest = chest1;
    ui.vinvCloseAllQuiet();
    expect(ref()).toBeNull();
    ui.openChest = chest1;
    ui.vinvCloseAllLoud();
    expect(ref()).toBeNull();
    ui.openChest = chest1;
    ui.invPanel.style.display = 'none';   // 门臂首支（背包已收态右击站点）
    ui.vinvOpenModernCraft(null, true);
    expect(ref()).toBeNull();
  });

  it('退出世界：closeAll 直清 ref（UI.ts:7734 teardown 站）', () => {
    const { ui, ref } = mkUi();
    ui.openChest = chest1;
    ui.closeAll();
    expect(ref()).toBeNull();
  });

  it('Esc 链决策核：inventoryOpen → closeInventory（关包即携箱,Player.cs:5026 else 支）', () => {
    const base = {
      summonOpen: false, fullMapOpen: false, pauseOpen: false, npcDialogActive: false,
      signDialogActive: false, settingsOpen: false, uiBlocking: false, dead: false,
    };
    expect(resolveEscapeChain({ ...base, inventoryOpen: true }, 'escape')).toBe('closeInventory');
    expect(resolveEscapeChain({ ...base, inventoryOpen: true }, 'inventory')).toBe('closeInventory');
  });

  it('接线普查锁：开箱置位面全库唯一（openChestPanel）+ 清位面恰两站（closeChest/closeAll）+ Game 消费面在位', () => {
    // 置位面：this.openChest = <非null> 仅 openChestPanel 一站（UI.ts:6664）
    expect(UI_SRC.match(/this\.openChest = (?!null)/g)).toHaveLength(1);
    // 清位面：closeChest（单源）+ closeAll（teardown）恰两站
    expect(UI_SRC.match(/this\.openChest = null;/g)).toHaveLength(2);
    const closeChestBody = UI_SRC.slice(UI_SRC.indexOf('closeChest() {'));
    expect(closeChestBody.slice(0, 300)).toContain('this.openChest = null;');
    // ref 接线（活 getter）+ Game 侧收面板泵（=closeInventory 全关）
    expect(UI_SRC).toContain('game.openChestRef = () => this.openChest;');
    expect(UI_SRC).toContain('game.closeChestPanel = () => this.closeInventory();');
    // Game.tickChestAutoClose 三臂（死亡/原位非箱/超距）全走收面板
    const tick = GAME_SRC.slice(GAME_SRC.indexOf('private tickChestAutoClose()'),
      GAME_SRC.indexOf('private updateChestFrames()'));
    expect(tick).toContain('this.closeInventory?.();');            // 死亡臂（:46435-46440）
    expect(tick.match(/this\.closeChestPanel\?\.\(\)/g)).toHaveLength(3);
    // 提炼机 UsingChest 门（BJ623-D2 症状面,Game.ts:30514 = Wiring.cs:2571）
    expect(GAME_SRC).toContain('if (this.openChestRef?.() === chest) return null;');
    // Esc 链 + 设置浮层收包两触发面
    expect(MAIN_SRC).toContain("case 'closeInventory':");
    expect(MAIN_SRC).toContain('if (ui.inventoryOpen) ui.closeInventory();');
  });
});
