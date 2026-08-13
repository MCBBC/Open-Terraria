// DOM overlay UI：主菜单 / HUD 快捷栏 / 背包+配饰栏 / 合成 / 宝箱 / Buff栏 / 暂停 / Tooltip / Toast
import type { Game } from '../core/Game';
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { TILE_DEFS } from '../data/tiles';
import { autoFrameAt, cactusFrameAt, cactusTextureFor } from '../render/VanillaTiler';
import { vanillaItemKey, ingredientKey, VANILLA_RECIPES, RECIPE_GROUP_ITEMS, invIndexOfVanilla, type VanillaRecipeLike } from '../data/vanillaRecipes';
import vanillaRareJson from '../data/vanilla-itemrare.json';
const ITEM_RARE = vanillaRareJson as Record<string, number>;
import { atlasIconForKey } from '../assets/SpriteAtlas';
import { VI } from '../data/itemKeys';
import { prefixStat, prefixLines, prefixValueMul, PREFIX_NAMES } from '../data/vanillaPrefixes';
import { equipKindOfInternal, MISC_KINDS } from '../data/vanillaEquip';
import { armorSlotIndexOfInternal, statOfInternal } from '../data/vanillaItemStats';
import { BuffType, BUFF_DEFS, buffName, buffDesc } from '../stats/Buffs';
import { Lang } from '../i18n/Lang';
import { ChatMonitor } from './ChatMonitor';
import { NpcDialog, NpcShop, type NpcButtonId, type ShopEntry } from './NpcDialog';
import { UISfx } from '../vui/UISfx';
import { COIN_START, AMMO_START, INV_SIZE, coinIndexOf } from '../items/Inventory';
import { openAchievementsPanel, createAchievementAdvisor } from './AchievementsUI';
import type { ChestData } from '../world/World';

type SlotWhere = 'inv' | 'chest' | 'armor' | 'dye' | 'misc' | 'miscDye';

const iconCache = new Map<number, string>();

/** 组假 id → 组号 */
function reqIdShift(reqId: number): number { return reqId - 1000000; }

/** 词缀显示名（Lang.prefix → l10n "Prefix.{ConstName}"，缺失回落常量名） */
function prefixDisplayName(prefix: number): string {
  const key = PREFIX_NAMES[String(prefix)];
  if (!key) return '';
  const t = Lang.text(`Prefix.${key}`);
  return t && t !== `Prefix.${key}` ? t : key;
}

/** 词缀后伤害值（Item.Prefix :551：damage = round(damage × dmg)） */
function prefixedDamage(def: (typeof ITEM_DEFS)[number], prefix?: number): number {
  if (!def.tool?.damage || !prefix) return def.tool?.damage ?? 0;
  return Math.max(1, Math.round(def.tool.damage * prefixStat(prefix).dmg));
}
function iconUrl(game: Game, id: number): string {
  let url = iconCache.get(id);
  if (!url) {
    // 优先原版素材图标（合成 32×32 dataURL）
    const def = ITEM_DEFS[id];
    if (game.atlas && def) {
      const ar = atlasIconForKey(game.atlas, def.key);
      if (ar) {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const cx = c.getContext('2d')!;
        cx.imageSmoothingEnabled = false;
        const s = Math.min(32 / ar.sw, 32 / ar.sh);
        const w = ar.sw * s, h = ar.sh * s;
        cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, (32 - w) / 2, (32 - h) / 2, w, h);
        url = c.toDataURL();
        iconCache.set(id, url);
        return url;
      }
      // 懒加载未就绪:返回程序化兜底但【不缓存】(此前把空串/兜底缓存死,
      // 图标加载完成后道具栏永远不升级为原版图标)。预载流程完成后此路径不再触发
      const c = game.assets.itemIcons.get(id);
      return c ? c.toDataURL() : '';
    }
    const c = game.assets.itemIcons.get(id);
    url = c ? c.toDataURL() : '';
    if (url) iconCache.set(id, url);  // 无 atlas(永久)才缓存兜底;空串不缓存
  }
  return url;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const CSS = `
.sw-root { position:fixed; inset:0; pointer-events:none; font-family:inherit; z-index:10; }
/* ---- 原版风格：深蓝面板 + 浅蓝描边 ---- */
.sw-panel { pointer-events:auto;
  /* 原版 UIPanel：PanelBackground × Color(63,82,151)*0.785 —— 半透底 */
  background:linear-gradient(rgba(38,50,90,0.78), rgba(22,30,58,0.8));
  border:2px solid #7d92d6; border-radius:6px; color:#e8ecf8; padding:12px;
  box-shadow:0 0 0 2px rgba(10,14,30,0.8), 0 6px 28px rgba(0,0,0,0.65),
    inset 0 0 18px rgba(90,120,220,0.12); }
.sw-btn { pointer-events:auto; display:block; width:100%; margin:6px 0; padding:10px 16px;
  background:linear-gradient(#4a3a6a,#3a2a5a); color:#fff; border:1px solid #6a5a8a;
  border-radius:6px; cursor:pointer; font-size:15px; text-align:center; }
.sw-btn:hover { background:linear-gradient(#5a4a7e,#4a3a6e); }
.sw-btn:disabled { opacity:0.45; cursor:default; }
.sw-slot { pointer-events:auto; width:52px; height:52px; background:url(sprites/vanilla/Inventory_Back.png) 0 0 / 100% 100%;
  position:relative; cursor:pointer; image-rendering:pixelated; }
/* 原版槽底乘色通道（ItemSlot.Draw :1945+：背景贴图 × inventoryBack 灰色 180-220，
 *  默认 220/255≈0.86 亮度；Loadout 染色/锁定灰 80 均经此 overlay 实现 MultiplyRGBA） */
.sw-slot::before { content:''; position:absolute; inset:0; pointer-events:none;
  background:var(--slot-tint, rgb(220,220,220)); mix-blend-mode:multiply; }
.sw-hotbar .sw-slot::before { display:none; } /* 快捷栏 Back14/20 贴图自带 alpha 语义 */
.sw-slot:hover { filter:brightness(1.15); }
.sw-slot img { position:absolute; inset:8px; width:36px; height:36px; image-rendering:pixelated; }
.sw-slot .cnt { position:absolute; left:4px; bottom:0; font-size:12px; font-weight:bold; color:#fff;
  text-shadow:1px 1px 0 #000; transform-origin:left bottom; }
/* Loadout 三色（ItemSlot.LoadoutSlotColors :322-340，×inventoryBack 灰 = multiply）：
 * 切换瞬间白闪（GetColorByLoadout :2546：Remap(dt,0,30,0.5,0)³ lerp→白） */
@keyframes sw-loadout-flash { 0% { background:rgb(255 255 255 / 0.5); }
  100% { background:rgb(255 255 255 / 0); } }
.sw-loadout-flash .sw-slot::before { animation:sw-loadout-flash 0.5s ease-out; }
/* 物品转移 hue 脉冲（ItemSlot.cs :2144-2152：贴图换 Back13 +
 *  Lerp(基色(63,65,151)×invAlpha, hslToRgb(hue,1,0.5), (time/300)²/2)——
 *  CSS 近似：色层 alpha 沿二次曲线 0.5→0 衰减，5s（300 tick） */
@keyframes sw-slot-glow { 0% { opacity:0.5; } 100% { opacity:0; } }
.sw-slot .sw-glow-overlay { position:absolute; inset:0; pointer-events:none;
  background:var(--glow); animation:sw-slot-glow 5s cubic-bezier(0.5,0,1,1) forwards; }
/* 金币/弹药槽 0.6 缩放（Main.cs:41193/41211 inventoryScale=0.6 → 31px、列距 33.6） */
.sw-slot.sm { width:31px; height:31px; }
.sw-slot.sm img { inset:4px; width:23px; height:23px; }
.sw-slot.sm .cnt { font-size:10px; left:2px; }
.sw-slot.sm::before { border-radius:2px; }
/* ---- 快捷栏（原版 GUIHotbarDrawInner Main.cs:42996-43060 1:1）----
 * 贴图 52px：未选中 scale0.75（视觉 39px、y+6、alpha 147/255≈0.575）+ Back20；
 * 选中 scale1.0（52px、y=20、alpha1）+ Back14；x 步进 ⌊52×scale⌋+4（43/56）；
 * 格号 1-9,0（ItemSlot :2487 顶左 (8,4)×scale）；选中名居中 x=236 脉动 */
.sw-hotbar { position:fixed; top:0; left:0; pointer-events:auto; }
.sw-hotbar .sw-slot { position:absolute; transition:transform 80ms linear, opacity 80ms linear, left 80ms linear, top 80ms linear; }
.sw-hotbar .sw-slot:hover { filter:none; }
.sw-hotbar .sw-slot .sw-slot-num { position:absolute; left:5px; top:2px; font-size:11px; font-weight:bold;
  color:#fff; text-shadow:1px 1px 0 #000; pointer-events:none; }
.sw-hotbar-name { position:fixed; left:236px; top:0; transform:translateX(-50%); white-space:nowrap;
  font-size:15px; color:#fff; text-shadow:2px 2px 0 #000; pointer-events:none;
  animation:sw-name-pulse 2s ease-in-out infinite alternate; }
@keyframes sw-name-pulse { from { opacity:0.35; } to { opacity:1; } }
/* 垃圾桶：原版槽底 = Inventory_Back7（ItemSlot.cs:2063 context 6）。
 * 空槽时画 Trash.png（ItemSlot.cs:2514-2520：32×32 居中，scale 0.85，
 *  颜色 Color(100,100,100,100) = 亮度×0.39 + alpha×0.39） */
.sw-trash .sw-trash-icon { position:absolute; inset:8px; width:27px; height:27px;
  image-rendering:pixelated; pointer-events:none; filter:brightness(0.39); opacity:0.39; }
.sw-lbl { font-size:12px; color:#9fb0dd; margin:6px 0 2px 0; }
.sw-title { font-size:17px; font-weight:bold; margin-bottom:8px; color:#ffe8a0; }
.sw-drag-ghost { position:fixed; z-index:200; pointer-events:none; width:40px; height:40px; }
.sw-drag-ghost img { width:40px; height:40px; image-rendering:pixelated;
  filter:drop-shadow(2px 3px 2px rgba(0,0,0,0.6)); }
.sw-drag-ghost .cnt { position:absolute; right:-2px; bottom:-4px; font-size:12px; font-weight:bold;
  color:#fff; text-shadow:1px 1px 0 #000; }
.sw-drop-ok { border-color:#7de08a !important; }
.sw-toast { position:fixed; left:50%; top:64px; transform:translateX(-50%);
  background:rgba(20,16,28,0.9); color:#ffe8a0; padding:8px 18px; border-radius:6px;
  border:1px solid #6a5a8a; font-size:14px; transition:opacity 0.4s; pointer-events:none; }
.sw-tooltip { position:fixed; background:rgba(10,8,16,0.95); border:1px solid #6a5a8a; border-radius:4px;
  padding:6px 10px; color:#e8e4f0; font-size:13px; pointer-events:none; z-index:100; max-width:260px; }
.sw-buff { pointer-events:auto; position:relative; width:30px; height:30px; background:rgba(40,32,60,0.9);
  border:1px solid #6a5a8a; border-radius:4px; align-items:center; justify-content:center; }
.sw-recipe { pointer-events:auto; display:flex; align-items:center; gap:6px; padding:5px 8px; margin:3px 0;
  background:rgba(50,40,70,0.8); border-radius:4px; cursor:pointer; font-size:13px; }
.sw-recipe:hover { background:rgba(70,55,100,0.9); }
.sw-recipe.no { opacity:0.4; cursor:default; }
.sw-recipe img { width:22px; height:22px; image-rendering:pixelated; }
.sw-progress { position:fixed; inset:0; background:rgba(5,5,12,0.85); display:flex;
  flex-direction:column; align-items:center; justify-content:center; color:#e8e4f0; }
.sw-progress .bar { width:320px; height:14px; background:#2a2440; border:1px solid #6a5a8a; border-radius:7px; margin-top:14px; overflow:hidden; }
.sw-progress .fill { height:100%; width:0%; background:linear-gradient(90deg,#6a8ae0,#8ad0e0); transition:width 0.2s; }
`;

export interface CompatEntry { id: number; name: string | null; count: number; action: string }
export interface CompatReport {
  worldName: string; wldVersion: number; size: [number, number];
  tilesDegraded: CompatEntry[]; tilesCleared: CompatEntry[]; itemsSkipped: CompatEntry[];
}

export class UI {
  devMode = false; // 开发者模式：进世界时全道具入包 + 出生点展示区
  root: HTMLElement;
  game!: Game;
  hotbarEl!: HTMLElement;
  hotbarNameEl!: HTMLElement;
  invPanel!: HTMLElement;
  chestPanel!: HTMLElement;
  craftListEl!: HTMLElement;
  tooltip!: HTMLElement;
  toastEl: HTMLElement | null = null;
  heldStack: { id: number; stack: number } | null = null;
  heldFrom: SlotWhere = 'inv';
  openChest: ChestData | null = null;
  private toastTimer: number | null = null;
  /** 图鉴面板入口（背包按钮/暂停菜单注入；见 BestiaryPanel） */
  onBestiary?: () => void;

  constructor(parent: HTMLElement) {
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'sw-root');
    parent.appendChild(this.root);
    this.installDragListeners();
    (window as unknown as { __swUI?: UI }).__swUI = this; // 调试句柄
  }

  private slotContent(where: SlotWhere, i: number): { id: number; stack: number; favorited?: boolean } | null {
    if (where === 'inv') return this.game.player.inv.slots[i];
    if (where === 'armor') return this.game.player.inv.armor[i];
    if (where === 'dye') return this.game.player.inv.dye[i];
    if (where === 'misc') return this.game.player.inv.miscEquips[i];
    if (where === 'miscDye') return this.game.player.inv.miscDyes[i];
    return this.openChest?.items[i] ?? null;
  }

  // ============ 主菜单 ============
  showMainMenu(handlers: {
    onNew: (seed: string, w: number, h: number) => void;
    onLoadFile: (file: File) => void;
    onImportWld: (file: File) => void;
    onQuickLoad: (() => void) | null;
  }) {
    this.closeAll();
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:340px;';
    panel.appendChild(el('div', 'sw-title', '🌍 SandboxWorld'));
    const sub = el('div', '', '2D 沙盒动作冒险 · 泰拉瑞亚风格复刻');
    sub.style.cssText = 'font-size:12px; color:#9a8ab8; margin-bottom:10px;';
    panel.appendChild(sub);

    const seedInput = el('input') as HTMLInputElement;
    seedInput.placeholder = '世界种子（留空随机）';
    seedInput.style.cssText = 'width:100%; padding:8px; margin:4px 0; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px; box-sizing:border-box;';
    panel.appendChild(seedInput);

    const sizeSel = el('select') as HTMLSelectElement;
    sizeSel.style.cssText = 'width:100%; padding:8px; margin:4px 0; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px;';
    for (const [label, w, h] of [['小世界 4200×1200', 4200, 1200], ['中世界 6400×1800', 6400, 1800], ['大世界 8400×2400', 8400, 2400]] as const) {
      const o = el('option', '', label);
      o.value = `${w}x${h}`;
      sizeSel.appendChild(o);
    }
    sizeSel.selectedIndex = 1;
    panel.appendChild(sizeSel);

    const bNew = el('button', 'sw-btn', '创建新世界');
    bNew.onclick = () => {
      const [w, h] = sizeSel.value.split('x').map(Number);
      panel.remove();
      handlers.onNew(seedInput.value.trim(), w, h);
    };
    panel.appendChild(bNew);

    const bQuick = el('button', 'sw-btn', '继续上次存档');
    bQuick.onclick = () => { panel.remove(); handlers.onQuickLoad?.(); };
    bQuick.disabled = !handlers.onQuickLoad;
    panel.appendChild(bQuick);

    const fileWrap = el('div');
    const bLoad = el('button', 'sw-btn', '读取存档文件…');
    const fileInput = el('input') as HTMLInputElement;
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.onchange = () => {
      if (fileInput.files?.[0]) { panel.remove(); handlers.onLoadFile(fileInput.files[0]); }
    };
    bLoad.onclick = () => fileInput.click();
    fileWrap.appendChild(bLoad);
    fileWrap.appendChild(fileInput);
    panel.appendChild(fileWrap);

    const wldWrap = el('div');
    const bWld = el('button', 'sw-btn', '导入泰拉瑞亚地图 (.wld)…');
    const wldInput = el('input') as HTMLInputElement;
    wldInput.type = 'file';
    wldInput.accept = '.wld';
    wldInput.style.display = 'none';
    wldInput.onchange = () => {
      if (wldInput.files?.[0]) { panel.remove(); handlers.onImportWld(wldInput.files[0]); }
    };
    bWld.onclick = () => wldInput.click();
    wldWrap.appendChild(bWld);
    wldWrap.appendChild(wldInput);
    panel.appendChild(wldWrap);

    // 开发者模式开关：进世界时全道具入包 + 出生点摆放全部可放置图块
    const devRow = el('div');
    devRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12px; color:#9a8ab8;';
    const devCb = el('input') as HTMLInputElement;
    devCb.type = 'checkbox';
    devCb.checked = this.devMode;
    devCb.onchange = () => { this.devMode = devCb.checked; };
    devRow.appendChild(devCb);
    devRow.appendChild(el('span', '', '开发者模式（全道具入包 + 出生点展示区）'));
    panel.appendChild(devRow);

    this.root.appendChild(panel);
  }

  /** 墓碑/告示牌阅读弹窗（原版 Sign 阅读界面简化）：碑文 + 关闭 */
  showSign(text: string) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:360px; max-height:70vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', `🪦 ${Lang.tileName(85) ?? '墓碑'}`));
    const body = el('div');
    body.style.cssText = 'font-size:13px; line-height:1.8; white-space:pre-wrap; color:#d8d4e4; margin:8px 0;';
    body.textContent = text;
    panel.appendChild(body);
    const close = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    close.addEventListener('click', () => panel.remove());
    panel.appendChild(close);
    this.root.appendChild(panel);
  }

  /** 广播盒文本编辑（Player.cs:32231-32250 OpenSign → 原版聊天行输入框；
   *  DOM 近似为文本域 + 保存按钮）。保存写回 Sign 登记（Sign.TextSign） */
  editSign(x: number, y: number, text: string) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:420px; max-height:70vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.Sign.Title')));
    const body = el('div');
    body.style.cssText = 'font-size:12px; color:#9a8ab8; margin:8px 0 4px;';
    body.textContent = Lang.text('Mods.SandboxWorld.Sign.Hint');
    panel.appendChild(body);
    const input = el('textarea') as HTMLTextAreaElement;
    input.value = text;
    input.style.cssText = 'width:100%; height:110px; resize:vertical; font-size:13px; color:#d8d4e4; background:#14121c; border:1px solid #3a3350; border-radius:4px; padding:6px;';
    input.placeholder = Lang.text('Mods.SandboxWorld.Sign.Placeholder');
    panel.appendChild(input);
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:10px; justify-content:flex-end;';
    const cancel = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    cancel.addEventListener('click', () => panel.remove());
    row.appendChild(cancel);
    const save = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.Sign.Save'));
    save.addEventListener('click', () => {
      this.game?.setSignText(x, y, input.value);
      panel.remove();
    });
    row.appendChild(save);
    panel.appendChild(row);
    this.root.appendChild(panel);
    input.focus();
  }

  /** 兼容报告弹窗：降级/清空/跳过内容列表 + 导出详情 JSON */
  showCompatReport(rpt: CompatReport) {
    // 不 closeAll：会把已初始化的 HUD（快捷栏等）一起拆掉，报告只叠加一层
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:480px; max-height:80vh; overflow:auto;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.Compat.Title')));
    const info = el('div', '', `「${rpt.worldName}」 v${rpt.wldVersion} · ${rpt.size[0]}×${rpt.size[1]}<br>以下内容在本版本中被降级或跳过：`);
    info.style.cssText = 'font-size:12px; color:#9a8ab8; margin-bottom:8px;';
    panel.appendChild(info);
    const section = (title: string, entries: CompatEntry[], desc: string, nameOf?: (id: number) => string | null) => {
      if (!entries.length) return;
      panel.appendChild(el('div', '', title));
      const ul = el('div');
      ul.style.cssText = 'font-size:12px; margin:4px 0 8px 0; line-height:1.7;';
      for (const e of entries.slice(0, 40)) {
        const name = nameOf?.(e.id) ?? e.name;
        ul.appendChild(el('div', '', `· id ${e.id} ${name ? `「${name}」` : ''} ×${e.count} <span style="color:#7a6a9a">(${desc})</span>`));
      }
      if (entries.length > 40) ul.appendChild(el('div', '', `… 共 ${entries.length} 种（导出查看全部）`));
      panel.appendChild(ul);
    };
    section(Lang.text('Mods.SandboxWorld.Compat.TilesDegraded'), rpt.tilesDegraded, 'degraded-to-stone', (id) => Lang.tileName(id));
    section(Lang.text('Mods.SandboxWorld.Compat.TilesCleared'), rpt.tilesCleared, 'cleared', (id) => Lang.tileName(id));
    section(Lang.text('Mods.SandboxWorld.Compat.ItemsSkipped'), rpt.itemsSkipped, 'skipped', (id) => Lang.itemName(id));
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
    const bExport = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.Compat.Export'));
    bExport.style.flex = '1';
    bExport.onclick = () => {
      const blob = new Blob([JSON.stringify({ ...rpt, exportedAt: new Date().toISOString(), note: Lang.text('Mods.SandboxWorld.Compat.Note') }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `compat-report-${rpt.worldName.replace(/\s+/g, '_')}-${rpt.wldVersion}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    const bClose = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    bClose.style.flex = '1';
    bClose.onclick = () => panel.remove();
    row.appendChild(bExport);
    row.appendChild(bClose);
    panel.appendChild(row);
    this.root.appendChild(panel);
  }

  /** 方块标注面板（F5 标注模式）：下载标注 / 下载地图 / 贴图纠错 / 清空 */
  annotatePanel: HTMLElement | null = null;
  texFixes: Array<{ x: number; y: number; typeKey: string; sheet: number; frameX: number; frameY: number }> = [];
  private fixModeBtn: HTMLButtonElement | null = null;
  private fixesCountEl: HTMLElement | null = null;
  showAnnotatePanel(handlers: {
    onExportMarks: () => void;
    onExportMap: () => void;
    onClear: () => void;
    onClose: () => void;
    onToggleFix: () => void;
    onExportFixes: () => void;
  }) {
    this.closeAnnotatePanel();
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:14px; top:90px; width:200px; padding:10px;';
    panel.appendChild(el('div', 'sw-title', '📍 方块标注模式'));
    const hint = el('div', '', '点击方块标记/取消，导出后发给开发者');
    hint.style.cssText = 'font-size:11px; color:#9fb0dd; margin-bottom:6px;';
    panel.appendChild(hint);
    this.annotateCountEl = el('div', '', '已标记：0 处');
    this.annotateCountEl.style.cssText = 'font-size:12px; color:#ffe8a0; margin-bottom:6px;';
    panel.appendChild(this.annotateCountEl);
    this.fixesCountEl = el('div', '', '贴图纠错：0 处');
    this.fixesCountEl.style.cssText = 'font-size:12px; color:#8ad0a0; margin-bottom:6px;';
    panel.appendChild(this.fixesCountEl);
    const mk = (label: string, fn: () => void) => {
      const b = el('button', 'sw-btn', label);
      b.style.margin = '4px 0';
      b.onclick = fn;
      panel.appendChild(b);
      return b;
    };
    mk('⬇ 下载标注 JSON', handlers.onExportMarks);
    mk('⬇ 下载地图存档', handlers.onExportMap);
    this.fixModeBtn = mk('🔧 贴图纠错模式：关', handlers.onToggleFix) as HTMLButtonElement;
    mk('⬇ 下载贴图纠错', handlers.onExportFixes);
    mk('🗑 清空标注', handlers.onClear);
    mk('✕ 关闭（再按 F5）', handlers.onClose);
    this.annotatePanel = panel;
    this.root.appendChild(panel);
  }

  setFixModeLabel(on: boolean) {
    if (this.fixModeBtn) this.fixModeBtn.textContent = `🔧 贴图纠错模式：${on ? '开' : '关'}`;
  }

  updateFixesCount(n: number) {
    if (this.fixesCountEl) this.fixesCountEl.textContent = `贴图纠错：${n} 处`;
  }

  /** 贴图纠错：点击方块后弹出该图块的完整原版贴图表，选正确帧 */
  openTexPicker(tx: number, ty: number) {
    this.closeTexPicker();
    const g = this.game;
    const st = g.world.store;
    if (!st.inBounds(tx, ty)) return;
    const i = st.idx(tx, ty);
    const t = st.type[i];
    const def = TILE_DEFS[t];
    const sheetId = def?.vanilla?.sheet;
    if (sheetId === undefined) { this.toast('该图块没有原版贴图表'); return; }
    const atlas = g.renderer.atlas;
    const meta = atlas ? atlas.vmeta(sheetId) : null;
    if (!atlas || !meta) { this.toast('贴图表加载失败'); return; }
    // 实际渲染用的贴图：仙人掌按生物群系换变体（腐化/猩红/神圣）
    let img: HTMLImageElement | null = atlas.vimages.get(meta.sheet) ?? null;
    if (sheetId === 80) img = cactusTextureFor(atlas, st, tx, ty) ?? img;
    if (!img) { this.toast('贴图表加载失败'); return; }
    // 当前实际渲染帧：
    // - auto 类不存储帧 → 渲染端同一查找表现算
    // - 仙人掌不存储帧 → 列角色判定现算
    // - 其余 style 类 → 存储帧
    let curCol: number, curRow: number;
    let autoNote = '';
    if (sheetId === 80) {
      const f = cactusFrameAt(st, tx, ty, t);
      curCol = f.col; curRow = f.row;
      autoNote = '（仙人掌：列角色现算）';
    } else if (def.vanilla!.frame === 'auto') {
      const f = autoFrameAt(st, tx, ty, t);
      curCol = f.col; curRow = f.row;
      autoNote = '（auto 分帧：按邻居现算）';
    } else {
      curCol = Math.floor(st.frameX[i] / meta.stride[0]);
      curRow = Math.floor(st.frameY[i] / meta.stride[1]);
    }
    const panel = el('div', 'sw-panel sw-texpicker');
    panel.style.cssText = 'pointer-events:auto; position:fixed; right:14px; top:60px; width:420px; max-height:86vh; overflow:auto; padding:10px;';
    panel.appendChild(el('div', 'sw-title', `🔧 纠错 (${tx}, ${ty})`));
    const info = el('div', '', `${def.key} · sheet ${sheetId} · 当前帧 第${curCol}列 第${curRow}行${autoNote} · 网格 ${meta.grid}×${meta.stride}`);
    info.style.cssText = 'font-size:11px; color:#9fb0dd; margin-bottom:6px;';
    panel.appendChild(info);

    const scale = Math.max(2, Math.min(4, Math.floor(400 / Math.max(1, meta.stride[0]))));
    const cv = document.createElement('canvas');
    cv.width = img.width * scale; cv.height = img.height * scale;
    cv.style.cssText = `image-rendering:pixelated; border:1px solid #4d5f9e; cursor:crosshair;`;
    // 可双向滚动的视口（大表不压缩，保持可读比例）
    const viewport = el('div');
    viewport.style.cssText = 'overflow:auto; max-height:56vh; border-radius:4px;';
    viewport.appendChild(cv);
    const cx = cv.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    let sel: { col: number; row: number } | null = { col: curCol, row: curRow };
    const redraw = () => {
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      // 网格
      cx.strokeStyle = 'rgba(160,180,255,0.25)';
      cx.lineWidth = 1;
      for (let x = 0; x <= img.width; x += meta.stride[0]) {
        cx.beginPath(); cx.moveTo(x * scale + 0.5, 0); cx.lineTo(x * scale + 0.5, cv.height); cx.stroke();
      }
      for (let y = 0; y <= img.height; y += meta.stride[1]) {
        cx.beginPath(); cx.moveTo(0, y * scale + 0.5); cx.lineTo(cv.width, y * scale + 0.5); cx.stroke();
      }
      // 选中帧高亮（绿）
      if (sel) {
        cx.strokeStyle = '#40FF80'; cx.lineWidth = 2;
        cx.strokeRect(sel.col * meta.stride[0] * scale, sel.row * meta.stride[1] * scale, meta.grid[0] * scale, meta.grid[1] * scale);
      }
    };
    redraw();
    cv.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * (cv.width / r.width);
      const py = (e.clientY - r.top) * (cv.height / r.height);
      sel = { col: Math.floor(px / scale / meta.stride[0]), row: Math.floor(py / scale / meta.stride[1]) };
      redraw();
      selInfo.textContent = `选中：第 ${sel.col} 列 第 ${sel.row} 行 → 像素偏移 (${sel.col * meta.stride[0]}, ${sel.row * meta.stride[1]})`;
    });
    panel.appendChild(viewport);
    const selInfo = el('div', '', '');
    selInfo.style.cssText = 'font-size:11px; color:#40FF80; margin:6px 0; min-height:14px;';
    if (sel) selInfo.textContent = `当前（已预选）：第 ${sel.col} 列 第 ${sel.row} 行 → 像素偏移 (${sel.col * meta.stride[0]}, ${sel.row * meta.stride[1]})`;
    panel.appendChild(selInfo);
    // 滚动定位到预选帧（视口中部）
    requestAnimationFrame(() => {
      if (sel) {
        viewport.scrollTop = Math.max(0, sel.row * meta.stride[1] * scale - viewport.clientHeight / 3);
        viewport.scrollLeft = Math.max(0, sel.col * meta.stride[0] * scale - viewport.clientWidth / 3);
      }
    });
    const mk2 = (label: string, fn: () => void) => {
      const b = el('button', 'sw-btn', label);
      b.style.margin = '4px 0';
      b.onclick = fn;
      panel.appendChild(b);
    };
    mk2('✓ 记录此纠错', () => {
      if (!sel) { this.toast('先在表上点选一帧'); return; }
      // 单选：只保留一条纠错记录，新的覆盖旧的
      this.texFixes = [{
        x: tx, y: ty, typeKey: def.key, sheet: sheetId,
        frameX: sel!.col * meta.stride[0], frameY: sel!.row * meta.stride[1],
      }];
      this.updateFixesCount(this.texFixes.length);
      this.toast(`已记录纠错：(${tx},${ty}) → (${sel!.col},${sel!.row})`);
      this.closeTexPicker();
    });
    mk2('✕ 取消', () => this.closeTexPicker());
    this.texPickerPanel = panel;
    this.root.appendChild(panel);
  }

  private texPickerPanel: HTMLElement | null = null;
  closeTexPicker() {
    this.texPickerPanel?.remove();
    this.texPickerPanel = null;
  }

  private annotateCountEl: HTMLElement | null = null;
  updateAnnotateCount(n: number) {
    if (this.annotateCountEl) this.annotateCountEl.textContent = `已标记：${n} 处`;
  }

  closeAnnotatePanel() {
    this.annotatePanel?.remove();
    this.annotatePanel = null;
    this.annotateCountEl = null;
    this.fixModeBtn = null;
    this.fixesCountEl = null;
    this.closeTexPicker();
  }

  showProgress(label: string, p: number) {
    let prog = this.root.querySelector('.sw-progress') as HTMLElement | null;
    if (!prog) {
      prog = el('div', 'sw-progress');
      prog.appendChild(el('div', '', label));
      const bar = el('div', 'bar');
      bar.appendChild(el('div', 'fill'));
      prog.appendChild(bar);
      this.root.appendChild(prog);
    }
    prog.children[0].textContent = label;
    (prog.querySelector('.fill') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  }

  hideProgress() {
    this.root.querySelector('.sw-progress')?.remove();
  }

  // ============ HUD ============

  buildHud(game: Game) {
    this.game = game;
    // 快捷栏（原版 GUIHotbarDrawInner Main.cs:42996-43060：左上角锚点 (20,20)；
    // 选中格 scale 1/其余 0.75、y=20+22(1-scale)、x 步进 ⌊52×scale⌋+4；
    // 选中物品名居中 x=236 脉动显示）
    this.hotbarEl = el('div', 'sw-hotbar');
    for (let i = 0; i < 10; i++) {
      this.hotbarEl.appendChild(this.makeSlotEl(i, 'inv'));
    }
    this.root.appendChild(this.hotbarEl);
    this.hotbarNameEl = el('div', 'sw-hotbar-name');
    this.root.appendChild(this.hotbarNameEl);
    this.refreshHotbar();

    // Tooltip
    this.tooltip = el('div', 'sw-tooltip');
    this.tooltip.style.display = 'none';
    this.root.appendChild(this.tooltip);

    game.openChest = (c) => this.openChestPanel(c);
    // 当前打开箱子引用（Game 提取机通电 Wiring.cs:2571 Chest.UsingChest 判定用）
    game.openChestRef = () => this.openChest;
  }

  slotEl(i: number, where: SlotWhere): HTMLElement {
    // 背包格（idx>=10）在背包面板里，快捷栏格在 HUD 上——全文档查
    const found = document.querySelector(`[data-idx="${i}"][data-where="${where}"]`);
    return found as HTMLElement;
  }

  private makeSlotEl(i: number, where: SlotWhere): HTMLElement {
    const s = el('div', 'sw-slot');
    s.dataset.idx = String(i);
    s.dataset.where = where;
    s.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) {
        // 右键（ItemSlot.RightClick :1496-1571）：装备物一键装备，否则拆 1 个到光标
        const cur = this.slotContent(where, i);
        if (!this.heldStack && cur && cur.stack === 1 && this.canSwapEquip(cur.id)) {
          this.swapEquipItem(cur, where, i);
          this.refreshAll();
          return;
        }
        this.splitHalf(i, where);
        return;
      }
      // Shift+左键（GetAlternateClickAction :563-662）：背包→箱子/装备→卸下/箱内→背包
      if (e.shiftKey && !e.altKey) {
        this.shiftClick(i, where);
        return;
      }
      // Alt+左键（OverrideHover :533-561）：收藏/取消（仅背包/钱币/弹药格，favorited 禁 Shift 转移）
      if (e.altKey && !e.shiftKey && (where === 'inv') && i < 58) {
        const cur = this.game.player.inv.slots[i];
        if (cur) {
          cur.favorited = !cur.favorited;
          this.game.sfx.play('menuTick', 0.5);
          this.refreshAll();
          return;
        }
      }
      this.dragFrom = { i, where, sx: e.clientX, sy: e.clientY };
    });
    s.addEventListener('mouseenter', () => this.showTooltipFor(i, where));
    s.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    return s;
  }

  /** 一键装备判定（ItemSlot.CanSwapEquip :3009-3020 + RightClick :1541：
   *  盔甲/配饰/染料/宠物/光源/矿车/坐骑/钩爪均可一键装备；
   *  vi_ 物品的盔甲/配饰归属查 vanilla-itemstats.json） */
  private canSwapEquip(id: number): boolean {
    const d = ITEM_DEFS[id];
    if (!d) return false;
    if (d.armor || d.accessory) return true;
    if (armorSlotIndexOfInternal(id) >= 0 || statOfInternal(id)?.acc !== undefined) return true;
    const k = equipKindOfInternal(id);
    return k === 'dye' || k === 'pet' || k === 'light' || k === 'cart' || k === 'mount' || k === 'hook';
  }

  /** 一键装备（ItemSlot.SwapEquip/ArmorSwap :3022-3346 近似）：部位→armor[0-2]（时装→[10-12]），
   *  配饰→armor[3-9] 第一个空槽/原槽交换；染料→dye 第一个空槽；杂项→对应 miscEquips 槽；
   *  成功后取消收藏（原版 :3341） */
  private swapEquipItem(cur: { id: number; stack: number }, where: SlotWhere, i: number): void {
    const inv = this.game.player.inv;
    const d = ITEM_DEFS[cur.id];
    const src = where === 'inv' ? inv.slots[i] : where === 'armor' ? inv.armor[i] : inv.dye[i];
    if (!src) return;
    let target = -1;
    let targetWhere: SlotWhere = 'armor';
    if (d.armor) {
      target = d.armor.slot;
    } else if (armorSlotIndexOfInternal(cur.id) >= 0) {
      target = armorSlotIndexOfInternal(cur.id); // vi_ 盔甲（vanilla-itemstats 部位）
    } else if (d.accessory || statOfInternal(cur.id)?.acc !== undefined) {
      // vi_ 配饰走 itemstats acc 判定(legacy accessory 字段已随退役消失——曾只认
      // legacy 字段导致 vi_ 配饰右键一键装备静默失效)
      for (let k = 3; k < inv.accSlotMax; k++) {
        if (!inv.armor[k]) { target = k; break; }
      }
      if (target < 0) target = 3; // 全满→交换第 3 槽
    } else {
      const kind = equipKindOfInternal(cur.id);
      if (kind === 'dye') {
        // 染料→dye[0-9] 第一个空槽（SwapEquip :3030 dye 分支）
        for (let k = 0; k < inv.dye.length; k++) {
          if (!inv.dye[k]) { target = k; break; }
        }
        targetWhere = 'dye';
        if (target < 0) return;
      } else if (kind && MISC_KINDS.includes(kind)) {
        target = MISC_KINDS.indexOf(kind);
        targetWhere = 'misc';
      } else return;
    }
    if (targetWhere === 'armor' && !inv.armorAccepts(target, cur.id)) return;
    src.favorited = false; // 装上取消收藏（原版 ArmorSwap :3341）
    const arr = targetWhere === 'armor' ? inv.armor : targetWhere === 'dye' ? inv.dye : inv.miscEquips;
    const tmp = arr[target];
    arr[target] = src;
    if (where === 'inv') inv.slots[i] = tmp ?? null;
    else if (where === 'armor') inv.armor[i] = tmp ?? null;
    else if (where === 'dye') inv.dye[i] = tmp ?? null;
    else if (where === 'misc') inv.miscEquips[i] = tmp ?? null;
    else inv.miscDyes[i] = tmp ?? null;
    this.game.sfx.play('menuTick', 0.6);
    // 成就：装备态检查（AchievementsHelper.HandleOnEquip）
    this.game.achNotifyEquipChanged();
  }

  /** Shift+左键快速转移（GetAlternateClickAction :563-662 主干）：
   *  开箱→入箱（仅堆已有或空格）；装备/配饰/染料/杂项→卸回背包；箱内→背包；背包内→垃圾桶 */
  private shiftClick(i: number, where: SlotWhere): void {
    const inv = this.game.player.inv;
    if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      // Unequip（:634-649）：卸回背包
      const arr = this.equipArray(where);
      const cur = arr[i];
      if (!cur || cur.favorited) return;
      const left = inv.add(cur.id, cur.stack);
      if (left === 0) arr[i] = null;
      this.refreshAll();
      return;
    }
    if (where === 'inv') {
      const cur = inv.slots[i];
      if (!cur || cur.favorited) return; // 收藏禁转移（:566）
      if (this.openChest) {
        // TryPlacingInChest（QuickStack 语义：先合并箱内已有类型再空格）
        const chest = this.openChest;
        let moved = 0;
        for (let k = 0; k < chest.items.length; k++) {
          const cs = chest.items[k];
          if (cs && cs.id === cur.id && cs.stack < ITEM_DEFS[cur.id].maxStack) {
            const put = Math.min(ITEM_DEFS[cur.id].maxStack - cs.stack, cur.stack);
            cs.stack += put; cur.stack -= put; moved += put;
            if (cur.stack <= 0) break;
          }
        }
        for (let k = 0; k < chest.items.length && cur.stack > 0; k++) {
          if (!chest.items[k]) { chest.items[k] = cur; inv.slots[i] = null; return; }
        }
        if (cur.stack <= 0) inv.slots[i] = null;
        if (moved > 0 || !inv.slots[i]) this.refreshAll();
        return;
      }
      // 无箱→垃圾桶（覆盖旧内容，OverrideLeftClick cursorOverride 6 :689-706）
      inv.trash = cur;
      inv.slots[i] = null;
      this.game.sfx.play('menuTick', 0.5);
      this.refreshAll();
      return;
    }
    if (where === 'chest') {
      // TransferFromChest（:626-633）：箱→背包
      const chest = this.openChest;
      if (!chest) return;
      const cur = chest.items[i];
      if (!cur) return;
      const left = inv.add(cur.id, cur.stack);
      if (left === 0) chest.items[i] = null;
      else cur.stack = left;
      this.refreshAll();
    }
  }

  // ---- 拖拽系统：按下起点 + 光标持有物（ghost 跟随） ----
  private dragFrom: { i: number; where: SlotWhere; sx: number; sy: number } | null = null;
  private ghostEl: HTMLElement | null = null;
  private mouseX = 0; private mouseY = 0;

  private installDragListeners() {
    // 点击面板外的世界区域：光标持有物直接丢出（原版行为）
    document.addEventListener('mousedown', (e) => {
      if (!this.heldStack) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.sw-slot') || t?.closest?.('.sw-panel') || t?.closest?.('.sw-btn')) return;
      this.throwHeldToWorld();
      this.refreshAll();
    });
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      this.moveGhost();
      // 未持有物品时按下并移动 >4px → 整叠拾取开始拖拽
      if (this.dragFrom && !this.heldStack) {
        const d = Math.hypot(e.clientX - this.dragFrom.sx, e.clientY - this.dragFrom.sy);
        if (d > 4) this.pickUp(this.dragFrom.i, this.dragFrom.where);
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (!this.dragFrom) return;
      const from = this.dragFrom;
      this.dragFrom = null;
      if (e.button !== 0) return;
      if (this.heldStack) {
        this.resolveDrop(from);
      } else {
        // 无拖动的普通点击：快捷栏（面板关）选中；否则拾取到光标（点击移动仍可用）
        const panelOpen = this.invPanel && this.invPanel.style.display === 'block';
        if (from.where === 'inv' && from.i < 10 && !panelOpen) {
          this.game.player.inv.selected = from.i;
          this.refreshHotbar();
        } else {
          this.pickUp(from.i, from.where);
        }
      }
      this.refreshAll();
    });
  }

  /** 整叠拾取到光标 */
  private pickUp(i: number, where: SlotWhere) {
    const cur = this.slotContent(where, i);
    if (!cur) return;
    if (this.heldStack && this.heldStack.id !== cur.id) return;
    if (where === 'inv') this.game.player.inv.slots[i] = null;
    else if (where === 'armor') this.game.player.inv.armor[i] = null;
    else if (where === 'dye') this.game.player.inv.dye[i] = null;
    else if (where === 'misc') this.game.player.inv.miscEquips[i] = null;
    else if (where === 'miscDye') this.game.player.inv.miscDyes[i] = null;
    else if (this.openChest) this.openChest.items[i] = null;
    if (this.heldStack) this.heldStack.stack += cur.stack;
    else this.heldStack = { id: cur.id, stack: cur.stack };
    this.refreshAll();
  }

  /** 右键：拆半到光标 */
  private splitHalf(i: number, where: SlotWhere) {
    if (this.heldStack) return;
    const cur = this.slotContent(where, i);
    if (!cur) return;
    const half = Math.ceil(cur.stack / 2);
    if (where === 'inv') this.game.player.inv.removeAt(i, half);
    else if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      const arr = this.equipArray(where);
      cur.stack -= half;
      if (cur.stack <= 0) arr[i] = null;
    }
    else if (this.openChest) {
      cur.stack -= half;
      if (cur.stack <= 0) this.openChest.items[i] = null;
    }
    this.heldStack = { id: cur.id, stack: half };
    this.refreshAll();
  }

  /** 装备类数组快捷取用（armor/dye/misc/miscDye 四类） */
  private equipArray(where: SlotWhere): Array<{ id: number; stack: number; favorited?: boolean; prefix?: number } | null> {
    const inv = this.game.player.inv;
    if (where === 'armor') return inv.armor;
    if (where === 'dye') return inv.dye;
    if (where === 'misc') return inv.miscEquips;
    return inv.miscDyes;
  }

  /** 放下到背包/宝箱格（合并→交换，装备位校验） */
  private placeHeld(i: number, where: SlotWhere): void {
    if (!this.heldStack) return;
    if (where === 'armor' || where === 'dye' || where === 'misc' || where === 'miscDye') {
      const inv = this.game.player.inv;
      const arr = this.equipArray(where);
      // 部位/配饰/染料/杂项分类校验（ItemSlot.PickItemMovementAction 同源判定）
      if (where === 'armor' && !inv.armorAccepts(i, this.heldStack.id)) return;
      if (where === 'dye' && !inv.dyeAccepts(this.heldStack.id)) return;
      if (where === 'misc' && !inv.miscAccepts(i, this.heldStack.id)) return;
      if (where === 'miscDye' && !inv.dyeAccepts(this.heldStack.id)) return;
      const cur = arr[i];
      if (!cur) {
        arr[i] = this.heldStack;
        this.heldStack = null;
      } else if (cur.id === this.heldStack.id) {
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else {
        // 交换前反向校验（取出的物品总是合法的，防御性保留）
        if (where === 'armor' && !inv.armorAccepts(i, cur.id)) return;
        arr[i] = this.heldStack;
        this.heldStack = cur;
      }
      this.refreshAll();
      // 成就：装备态检查（拖拽落装备位 = HandleOnEquip 同义路径）
      this.game.achNotifyEquipChanged();
      return;
    }
    if (where === 'inv') {
      const inv = this.game.player.inv;
      if (!inv.canAccept(i, this.heldStack.id)) return; // 装备位校验失败：弹回原处
      const cur = inv.slots[i];
      if (!cur) {
        inv.slots[i] = this.heldStack;
        this.heldStack = null;
      } else if (cur.id === this.heldStack.id) {
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else if (inv.canAccept(i, cur.id) === false) {
        return; // 占位物品放不回普通格（理论不发生，防御）
      } else {
        inv.slots[i] = this.heldStack;
        this.heldStack = cur;
      }
    } else {
      const chest = this.openChest;
      if (!chest) return;
      const cur = chest.items[i];
      if (!cur) {
        chest.items[i] = this.heldStack;
        this.heldStack = null;
      } else if (cur.id === this.heldStack.id) {
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cur.stack, this.heldStack.stack);
        cur.stack += put;
        this.heldStack.stack -= put;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else {
        chest.items[i] = this.heldStack;
        this.heldStack = cur;
      }
    }
  }

  /** 拖拽松手：判定落点（格子/垃圾桶/面板外丢弃/面板空白放回） */
  private resolveDrop(from: { i: number; where: SlotWhere }) {
    const target = document.elementFromPoint(this.mouseX, this.mouseY) as HTMLElement | null;
    const slotEl = target?.closest?.('.sw-slot') as HTMLElement | null;
    if (slotEl?.dataset.idx !== undefined && slotEl?.dataset.where) {
      const ti = Number(slotEl.dataset.idx);
      const tw = slotEl.dataset.where as SlotWhere;
      if (tw === 'chest' && !this.openChest) return;
      this.placeHeld(ti, tw);
      return;
    }
    if (target?.closest?.('.sw-trash')) {
      this.placeTrash();
      return;
    }
    // 面板外：丢进世界；面板内空白：放回原格
    const inPanel = target?.closest?.('.sw-panel');
    if (!inPanel) {
      this.throwHeldToWorld();
    } else {
      this.placeHeld(from.i, from.where);
    }
  }

  /** 垃圾桶：丢弃暂存（关闭背包时结算删除） */
  private trashHeld() {
    this.placeTrash();
  }

  /** 拖出面板：以掉落物形式丢在角色面前 */
  private throwHeldToWorld() {
    if (!this.heldStack || !this.game) return;
    const p = this.game.player;
    const key = ITEM_DEFS[this.heldStack.id].key;
    this.game.spawnDrop(p.cx + p.facing * 18, p.y + 6, key, this.heldStack.stack, p.facing * 1.5, -2);
    this.heldStack = null;
  }

  /** 光标持有物的 ghost 跟随 */
  private moveGhost() {
    if (!this.heldStack) {
      if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
      return;
    }
    if (!this.ghostEl) {
      this.ghostEl = el('div', 'sw-drag-ghost');
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(this.game, this.heldStack.id);
      img.draggable = false;
      this.ghostEl.appendChild(img);
      document.body.appendChild(this.ghostEl);
    }
    const img = this.ghostEl.querySelector('img') as HTMLImageElement;
    const url = iconUrl(this.game, this.heldStack.id);
    if (img.src !== url) img.src = url;
    let cnt = this.ghostEl.querySelector('.cnt') as HTMLElement | null;
    if (this.heldStack.stack > 1) {
      if (!cnt) { cnt = el('span', 'cnt'); this.ghostEl.appendChild(cnt); }
      cnt.textContent = String(this.heldStack.stack);
    } else cnt?.remove();
    this.ghostEl.style.left = `${this.mouseX - 20}px`;
    this.ghostEl.style.top = `${this.mouseY - 20}px`;
  }

  /** 稀有度着色（Main.cs GetItemNameColor :20415-20473 主干） */
  private rarityColor(rare: number): string {
    if (rare <= -13) return '#FF6400';
    if (rare === -12) return `rgb(255,${Math.floor((Math.sin(performance.now() / 60) + 1) * 127)},0)`; // expert Disco
    if (rare === -11 || rare === -1) return '#828282';
    if (rare === 0) return '#ffffff';
    if (rare === 1) return '#9696ff';
    if (rare === 2) return '#96ff96';
    if (rare === 3) return '#ffc896';
    if (rare === 4) return '#ff9696';
    if (rare === 5) return '#ff96ff';
    if (rare === 6) return '#d2a0ff';
    if (rare === 7) return '#96ff0a';
    if (rare === 8) return '#ffff0a';
    if (rare === 9) return '#0affff';
    if (rare === 10) return '#ffaa66';
    return '#b42cff';
  }

  private showTooltipFor(i: number, where: SlotWhere) {
    const s = this.slotContent(where, i) as { id: number; stack: number; favorited?: boolean; prefix?: number } | null;
    if (!s) { this.tooltip.style.display = 'none'; return; }
    const def = ITEM_DEFS[s.id];
    // 名称按稀有度着色（原版 GetItemNameColor 15 档）：vi_ 物品查 vanilla-itemrare.json
    //（tools/extract-itemrare.mjs 从 Item.cs case 块提取 1643 条）；缺条目 fallback value 近似
    let rare = 0;
    if (def.key.startsWith('vi_')) {
      const vid = parseInt(def.key.slice(3), 10);
      rare = ITEM_RARE[String(vid)] ?? 0;
      if (rare === 0) {
        const v = def.value ?? 0;
        rare = v >= 100000 ? 4 : v >= 10000 ? 3 : v >= 1000 ? 2 : v >= 100 ? 1 : 0;
      }
    }
    // 词缀稀有度档位偏移（Item.Prefix :593-600：value≥1.05 档 +1、≥1.2 档 +2 等）
    if (s.prefix) {
      const pv = prefixValueMul(s.prefix);
      if (pv >= 1.2) rare = Math.min(11, rare + 2);
      else if (pv >= 1.05) rare = Math.min(11, rare + 1);
      else if (pv <= 0.8) rare = Math.max(-1, rare - 2);
      else if (pv <= 0.95) rare = Math.max(-1, rare - 1);
    }
    const nameColor = this.rarityColor(rare);
    // 词缀名前缀（Lang.GetPrefixedItemName：Prefix.{ConstName} + 物品名）
    const prefixName = s.prefix ? prefixDisplayName(s.prefix) : '';
    let html = `<b style="color:${nameColor}">${prefixName}${Lang.itemNameByKey(def.key)}</b> ×${s.stack}`;
    if (s.favorited) html += ` <span style="color:#ffb347">★</span>`;
    if (s.prefix) {
      for (const ln of prefixLines(s.prefix)) {
        html += `<br><span style="color:${ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)'}">${ln.text}</span>`;
      }
    }
    if (def.tool?.damage) html += `<br>${Lang.text('Mods.SandboxWorld.Item.Damage', prefixedDamage(def, s.prefix))}`;
    if (def.tool?.power && def.tool.type !== 'sword') html += `<br>${Lang.text(def.tool.type === 'pick' ? 'Mods.SandboxWorld.Item.PickPower' : 'Mods.SandboxWorld.Item.AxePower', def.tool.power)}`;
    // 盔甲防御行（vi_ 物品查 vanilla-itemstats.json；原版经 item.defense 的 tooltip 行）
    const vsDef = def.armor?.defense ?? statOfInternal(s.id)?.def;
    if (vsDef) html += `<br>防御 +${vsDef}`;
    if (def.heal) html += `<br>${Lang.text('CommonItemTooltip.RestoresLife', def.heal)}`;
    if (def.desc) html += `<br><span style="color:#9a8ab8">${def.desc}</span>`;
    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    // 背景：原版不透明面板色 (23,25,81)×0.925（:20242-20245）
    this.tooltip.style.background = 'rgba(21,23,75,0.95)';
    const slotEl = this.slotEl(i, where);
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      this.tooltip.style.left = `${r.right + 8}px`;
      this.tooltip.style.top = `${r.top}px`;
    }
  }

  // ============ 背包 + 合成 ============

  /** 背包面板是否打开（原版 Main.playerInventory 语义——呼吸计锚点分支用，
   *  Game.render 经 window.__swUI 读取；与 UI.ts:802 同款活取） */
  get inventoryOpen(): boolean {
    return !!this.invPanel && this.invPanel.style.display === 'block';
  }

  openInventory() {
    if (this.invPanel.style.display === 'block') {
      this.closeInventory();
      return;
    }
    this.invPanel.style.display = 'block';
    this.refreshAll();
    this.game.input.uiBlocking = true;
  }

  closeInventory() {
    this.invPanel.style.display = 'none';
    this.closeItemSearch();
    this.closeGuideSearch();
    this.closeChest();
    // 放回手上物品
    if (this.heldStack) {
      this.game.player.inv.add(this.heldStack.id, this.heldStack.stack);
      this.heldStack = null;
    }
    // 材料格内容归还背包（CraftingGrid 关闭语义）
    this.returnCraftGrid();
    this.craftGridRecipe = null;
    // 垃圾桶为持久槽（Player.trashItem 语义）：关闭背包保留，仅死亡时由 Game 清空
    this.moveGhost();
    this.game.input.uiBlocking = false;
  }

  // ============ 调试用：道具搜索器（背包面板"🔍 道具搜索"按钮） ============
  private itemSearchEl: HTMLDivElement | null = null;

  /** 打开搜索面板：按 名称/key/原版id 过滤 ITEM_DEFS，点击条目入包 */
  openItemSearch() {
    if (!this.game) return;
    this.closeItemSearch();
    const overlay = el('div') as HTMLDivElement;
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1200; display:flex; align-items:center; justify-content:center;';
    const panel = el('div');
    panel.style.cssText = 'width:560px; max-height:70vh; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:8px;';
    const titleRow = el('div');
    titleRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
    titleRow.appendChild(el('div', 'sw-lbl', '🔍 道具搜索（点击加入背包）'));
    const closeBtn = el('button', 'sw-btn');
    closeBtn.textContent = Lang.text('Mods.SandboxWorld.UI.Close');
    closeBtn.style.cssText = 'cursor:pointer;';
    closeBtn.addEventListener('click', () => this.closeItemSearch());
    titleRow.appendChild(closeBtn);
    panel.appendChild(titleRow);
    const input = el('input') as HTMLInputElement;
    input.placeholder = '名称 / key / 原版 id…';
    input.style.cssText = 'width:100%; box-sizing:border-box; padding:6px 8px; background:#1a1a22; color:#eee; border:1px solid #555; border-radius:4px; font-size:14px;';
    panel.appendChild(input);
    const list = el('div');
    list.style.cssText = 'overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px; align-content:flex-start;';
    panel.appendChild(list);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.closeItemSearch();
    });
    document.body.appendChild(overlay);
    this.itemSearchEl = overlay;

    // 全量条目缓存（一次性构建：id/显示名/小写匹配串）
    const entries = ITEM_DEFS.map((d, id) => {
      const vid = d.key.startsWith('vi_') ? d.key.slice(3, d.key.indexOf('_', 3)) : '';
      const name = Lang.itemNameByKey(d.key) || d.key;
      return { id, d, name, lc: (name + ' ' + d.key + ' ' + vid).toLowerCase() };
    });
    const render = () => {
      const q = input.value.trim().toLowerCase();
      list.textContent = '';
      let shown = 0;
      for (const e of entries) {
        if (q && !e.lc.includes(q)) continue;
        if (++shown > 80) {
          list.appendChild(el('div', 'sw-lbl', `…更多结果请细化搜索`));
          break;
        }
        const item = el('div');
        item.title = `${e.name}  [${e.d.key}]`;
        item.style.cssText = 'display:flex; align-items:center; gap:4px; width:170px; padding:3px 5px; background:#1f1f28; border:1px solid #444; border-radius:3px; cursor:pointer; font-size:12px; color:#ddd;';
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game!, e.id);
        img.style.cssText = 'width:24px; height:24px; image-rendering:pixelated; flex:none;';
        item.appendChild(img);
        const lbl = el('span');
        lbl.textContent = e.name;
        lbl.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        item.appendChild(lbl);
        item.addEventListener('click', () => {
          // 可堆叠给一组(≤99)，不可堆叠给 1；溢出由 inv.add 处理
          const n = e.d.maxStack > 1 ? Math.min(e.d.maxStack, 99) : 1;
          this.game!.player.inv.add(e.id, n);
          this.game!.cb.onInventoryChanged?.();
          this.refreshAll();
        });
        list.appendChild(item);
      }
      if (!shown) list.appendChild(el('div', 'sw-lbl', '无匹配'));
    };
    input.addEventListener('input', render);
    render();
    input.focus();
  }

  closeItemSearch() {
    if (this.itemSearchEl) {
      this.itemSearchEl.remove();
      this.itemSearchEl = null;
    }
  }

  // ============ 重铸（哥布林工匠，Main.InReforgeMenu + ReforgeItemInReforgeSlot） ============

  /** 重铸槽物品（Main.reforgeItem；关闭时归还背包，Player.cs:4912） */
  reforgeItem: { id: number; stack: number; prefix?: number } | null = null;
  private reforgeEl: HTMLDivElement | null = null;
  private reforgeCostEl: HTMLElement | null = null;
  private reforgeSlotEl: HTMLElement | null = null;

  /** 打开重铸面板：物品槽（放 1 件）+ 费用 + 重铸按钮 */
  showReforge(): void {
    this.closeReforge();
    const overlay = el('div') as HTMLDivElement;
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1150; display:flex; align-items:center; justify-content:center;';
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'width:360px;';
    panel.appendChild(el('div', 'sw-title', '⚒ ' + Lang.inter(19)));
    const hint = el('div', 'sw-lbl', Lang.inter(20)); // 将物品放到此处重铸
    panel.appendChild(hint);
    // 槽位行：物品槽 + 费用
    const row = el('div');
    row.style.cssText = 'display:flex; align-items:center; gap:12px; margin:8px 0;';
    const slot = el('div', 'sw-slot');
    slot.style.cssText += 'width:52px; height:52px;';
    slot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.heldStack) {
        // 放入 1 件（ItemSlot :757-764：reforgeItem = item.Clone() stack=1）
        if (this.reforgeItem) return;
        if (!this.game.canReforge(this.heldStack)) { this.toast('该物品无法重铸'); return; }
        this.reforgeItem = { id: this.heldStack.id, stack: 1 };
        this.heldStack.stack -= 1;
        if (this.heldStack.stack <= 0) this.heldStack = null;
      } else if (this.reforgeItem) {
        // 取回
        this.heldStack = this.reforgeItem;
        this.reforgeItem = null;
      }
      this.refreshReforge();
    });
    slot.addEventListener('mouseenter', () => {
      if (this.reforgeItem) this.showReforgeTooltip();
    });
    slot.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    this.reforgeSlotEl = slot;
    row.appendChild(slot);
    const costWrap = el('div');
    this.reforgeCostEl = el('div', '', '');
    this.reforgeCostEl.style.cssText = 'font-size:13px; color:#ffe8a0;';
    costWrap.appendChild(this.reforgeCostEl);
    row.appendChild(costWrap);
    panel.appendChild(row);
    const doBtn = el('button', 'sw-btn', Lang.inter(19));
    doBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (!this.reforgeItem) return;
      const cost = this.game.reforgeCost(this.reforgeItem);
      if (this.game.coinsOwned() < cost) {
        this.toast(Lang.inter(46) + ' 不足');
        return;
      }
      const np = this.game.doReforge(this.reforgeItem);
      if (np < 0) { this.toast('重铸失败'); return; }
      this.toast(`${Lang.inter(46)}: ${cost} · ${prefixDisplayName(np)}`);
      this.refreshReforge();
    });
    panel.appendChild(doBtn);
    const closeBtn = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    closeBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.closeReforge();
    });
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.closeReforge();
    });
    document.body.appendChild(overlay);
    this.reforgeEl = overlay;
    this.refreshReforge();
  }

  private refreshReforge(): void {
    if (!this.reforgeSlotEl) return;
    // 画槽内容
    const old = this.reforgeSlotEl.querySelector('img');
    old?.remove();
    this.reforgeSlotEl.querySelector('.cnt')?.remove();
    if (this.reforgeItem) {
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(this.game, this.reforgeItem.id);
      img.draggable = false;
      this.reforgeSlotEl.appendChild(img);
    }
    // 费用行（Main.cs:41026：value×stack÷3）
    if (this.reforgeCostEl) {
      if (this.reforgeItem) {
        const cost = this.game.reforgeCost(this.reforgeItem);
        const owned = this.game.coinsOwned();
        this.reforgeCostEl.textContent = `${Lang.inter(46)}: ${cost} 铜` + (owned < cost ? '（不足）' : '');
        this.reforgeCostEl.style.color = owned < cost ? '#e08a8a' : '#ffe8a0';
      } else {
        this.reforgeCostEl.textContent = '';
      }
    }
    this.refreshAll();
  }

  /** 重铸槽 tooltip（词缀前后对比行） */
  private showReforgeTooltip(): void {
    const s = this.reforgeItem;
    if (!s) return;
    const def = ITEM_DEFS[s.id];
    let rare = 0;
    if (def.key.startsWith('vi_')) rare = ITEM_RARE[String(parseInt(def.key.slice(3), 10))] ?? 0;
    const prefixName = s.prefix ? prefixDisplayName(s.prefix) : '';
    let html = `<b style="color:${this.rarityColor(rare)}">${prefixName}${Lang.itemNameByKey(def.key)}</b>`;
    if (s.prefix) for (const ln of prefixLines(s.prefix)) {
      html += `<br><span style="color:${ln.good ? 'rgb(120,190,120)' : 'rgb(190,120,120)'}">${ln.text}</span>`;
    }
    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    if (this.reforgeSlotEl) {
      const r = this.reforgeSlotEl.getBoundingClientRect();
      this.tooltip.style.left = `${r.right + 8}px`;
      this.tooltip.style.top = `${r.top}px`;
    }
  }

  closeReforge(): void {
    // 归还重铸槽物品（Player.cs:4912：GetOrDropItem）
    if (this.reforgeItem) {
      this.game.player.inv.add(this.reforgeItem.id, this.reforgeItem.stack);
      this.reforgeItem = null;
    }
    if (this.reforgeEl) {
      this.reforgeEl.remove();
      this.reforgeEl = null;
    }
    this.reforgeSlotEl = null;
    this.refreshAll();
  }

  // ============ 向导配方反查（guideItem → CollectGuideRecipes，组匹配生效） ============

  private guideEl: HTMLDivElement | null = null;

  /** 反查面板：搜物品 → 列出以它为材料的全部配方（含 RecipeGroup 成员） */
  openGuideSearch(): void {
    this.closeGuideSearch();
    const overlay = el('div') as HTMLDivElement;
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1200; display:flex; align-items:center; justify-content:center;';
    const panel = el('div');
    panel.style.cssText = 'width:620px; max-height:76vh; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:8px;';
    const titleRow = el('div');
    titleRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
    titleRow.appendChild(el('div', 'sw-lbl', '📖 ' + Lang.inter(21)));
    const closeBtn = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Close'));
    closeBtn.style.cssText = 'cursor:pointer; width:auto; margin:0;';
    closeBtn.addEventListener('click', () => this.closeGuideSearch());
    titleRow.appendChild(closeBtn);
    panel.appendChild(titleRow);
    const input = el('input') as HTMLInputElement;
    input.placeholder = '材料名称 / key / 原版 id…';
    input.style.cssText = 'width:100%; box-sizing:border-box; padding:6px 8px; background:#1a1a22; color:#eee; border:1px solid #555; border-radius:4px; font-size:14px;';
    panel.appendChild(input);
    const itemRow = el('div');
    itemRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; overflow-y:auto; max-height:120px; align-content:flex-start;';
    panel.appendChild(itemRow);
    const recipeList = el('div');
    recipeList.style.cssText = 'overflow-y:auto; flex:1;';
    panel.appendChild(recipeList);
    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.closeGuideSearch();
    });
    document.body.appendChild(overlay);
    this.guideEl = overlay;

    const entries = ITEM_DEFS.map((d, id) => {
      const vid = d.key.startsWith('vi_') ? parseInt(d.key.slice(3, d.key.indexOf('_', 3)), 10) : -1;
      const name = Lang.itemNameByKey(d.key) || d.key;
      return { id, vid, name, lc: (name + ' ' + d.key + ' ' + vid).toLowerCase() };
    }).filter((e) => e.vid >= 0);
    const renderItems = () => {
      const q = input.value.trim().toLowerCase();
      itemRow.textContent = '';
      let shown = 0;
      for (const e of entries) {
        if (q && !e.lc.includes(q)) continue;
        if (++shown > 40) break;
        const chip = el('div');
        chip.title = e.name;
        chip.style.cssText = 'display:flex; align-items:center; gap:3px; width:150px; padding:2px 4px; background:#1f1f28; border:1px solid #444; border-radius:3px; cursor:pointer; font-size:12px; color:#ddd;';
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game!, e.id);
        img.style.cssText = 'width:22px; height:22px; image-rendering:pixelated; flex:none;';
        chip.appendChild(img);
        const lbl = el('span');
        lbl.textContent = e.name;
        lbl.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        chip.appendChild(lbl);
        chip.addEventListener('click', () => this.renderGuideRecipes(recipeList, e.vid));
        itemRow.appendChild(chip);
      }
      if (!shown) itemRow.appendChild(el('div', 'sw-lbl', '无匹配'));
    };
    input.addEventListener('input', renderItems);
    renderItems();
    input.focus();
  }

  /** 材料的配方列表（CollectGuideRecipes：items 直接命中或 RecipeGroup 成员命中） */
  private renderGuideRecipes(listEl: HTMLElement, vid: number): void {
    listEl.textContent = '';
    const game = this.game;
    const avail = new Map<unknown, number>();
    for (const { r, count } of game.vanillaAvailableRecipes()) avail.set(r, count);
    let hits = 0;
    for (const r of VANILLA_RECIPES) {
      const used = r.items.some((req) => req.id === vid
        || (req.id >= 1000000 && (RECIPE_GROUP_ITEMS[String(req.id - 1000000)] ?? []).includes(vid)));
      if (!used) continue;
      if (++hits > 60) { listEl.appendChild(el('div', 'sw-lbl', '…更多结果请细化')); break; }
      const outKey = vanillaItemKey(r.create);
      if (!outKey) continue;
      const row = el('div', 'sw-recipe' + (avail.has(r) ? '' : ' no'));
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(game, game.itemId(outKey));
      row.appendChild(img);
      const label = el('span', '', `${Lang.itemNameByKey(outKey)}${r.createStack > 1 ? ` ×${r.createStack}` : ''}`);
      row.appendChild(label);
      const info = el('span', '', `${r.tile >= 0 ? (Lang.tileName(r.tile) ?? `站点 ${r.tile}`) : Lang.text('Mods.SandboxWorld.UI.StationHand')} · ${
        r.items.map((req) => `${req.id >= 1000000 ? '任何组物' : (Lang.itemNameByKey(ingredientKey(req.id) ?? '') ?? req.id)} ${req.stack}`).join(' +')}`);
      info.style.cssText = 'margin-left:auto; color:#9a8ab8; font-size:11px; text-align:right; max-width:280px;';
      row.appendChild(info);
      if (avail.has(r)) {
        row.onclick = () => {
          game.vanillaCraft(r, 1);
          this.refreshAll();
        };
      }
      listEl.appendChild(row);
    }
    if (!hits) listEl.appendChild(el('div', 'sw-lbl', '该物品不用于任何配方'));
  }

  closeGuideSearch(): void {
    if (this.guideEl) {
      this.guideEl.remove();
      this.guideEl = null;
    }
  }

  /** 垃圾桶暂存（关闭背包才删除；可取回） */
  /** @deprecated 改走 inv.trash 持久槽（Player.trashItem 语义）——保留字段仅作 UI 缓存兼容 */

  private placeTrash(): void {
    if (!this.heldStack) return;
    const t = this.game.player.inv.trash;
    if (!t) {
      this.game.player.inv.trash = this.heldStack;
      this.heldStack = null;
    } else if (t.id === this.heldStack.id) {
      const max = ITEM_DEFS[t.id].maxStack;
      const put = Math.min(max - t.stack, this.heldStack.stack);
      t.stack += put;
      this.heldStack.stack -= put;
      if (this.heldStack.stack <= 0) this.heldStack = null;
    } else {
      this.game.player.inv.trash = this.heldStack; // 交换：可把误放的东西取回
      this.heldStack = t;
    }
    this.paintTrash();
  }

  private paintTrash() {
    if (!this.trashEl) return;
    const img = this.trashEl.querySelector('img');
    const cnt = this.trashEl.querySelector('.cnt');
    img?.remove();
    cnt?.remove();
    if (this.game.player.inv.trash) {
      const im = el('img') as HTMLImageElement;
      im.src = iconUrl(this.game, this.game.player.inv.trash!.id);
      im.draggable = false;
      this.trashEl.appendChild(im);
      if (this.game.player.inv.trash!.stack > 1) {
        this.trashEl.appendChild(el('span', 'cnt', String(this.game.player.inv.trash!.stack)));
      }
    } else {
      // 空槽画垃圾桶图标（ItemSlot.cs:2514-2520：Trash.png 居中，灰半透）
      const im = el('img', 'sw-trash-icon') as HTMLImageElement;
      im.src = 'sprites/vanilla/Trash.png';
      im.draggable = false;
      this.trashEl.appendChild(im);
    }
  }

  trashEl: HTMLElement | null = null;
  /** 成就提示牌（背包内 Advisor 卡） */
  achAdvisorEl: (HTMLElement & { update(): void }) | null = null;
  /** 装备/杂项页签与 Loadout 按钮（背包面板顶部） */
  private eqPageEl: HTMLElement | null = null;
  private miscPageEl: HTMLElement | null = null;
  private loadoutBtns: HTMLButtonElement[] = [];
  private eqPageBtns: HTMLButtonElement[] = [];
  private equipPage = 0;

  /** 页签切换（原版 EquipPage 0=装备 2=杂项；DrawInventory :40614） */
  setEquipPage(page: number): void {
    this.equipPage = page;
    if (this.eqPageEl) this.eqPageEl.style.display = page === 0 ? 'flex' : 'none';
    if (this.miscPageEl) this.miscPageEl.style.display = page === 1 ? 'flex' : 'none';
    this.eqPageBtns.forEach((b, k) => {
      b.style.borderColor = k === page ? '#ffd75a' : '#6a5a8a';
    });
    this.refreshAll();
  }

  private buildInventoryPanel() {
    this.invPanel = el('div', 'sw-panel');
    this.invPanel.style.cssText = 'position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); display:none; max-height:88vh; overflow:auto;';
    this.invPanel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Inventory')));

    // ---- 顶部：三套 Loadout 切换（DrawLoadoutButtons Main.cs:41386+：当前套高亮） ----
    {
      const row = el('div');
      row.style.cssText = 'display:flex; gap:4px; align-items:center; margin-bottom:6px;';
      row.appendChild(el('div', 'sw-lbl', '预设'));
      this.loadoutBtns = [];
      for (let k = 0; k < 3; k++) {
        // 原版 DrawLoadoutButtons（Main.cs:41395-41431）：Extra[259] 3×3 图集——
        // 行 = loadout 配色，列 = 常态 0 / 选中 1 / 悬停 2（OurFavoriteColor 染色帧）
        const b = el('button', 'sw-btn sw-loadout-btn');
        b.dataset.lo = String(k);
        b.style.cssText = 'margin:0; width:32px; height:32px; padding:0; border:none; flex:none;'
          + 'background:url(sprites/vanilla/Extra_259.png); background-size:300% 300%;'
          + 'image-rendering:pixelated; cursor:pointer;';
        const frame = (col: number) => { b.style.backgroundPosition = `${col * 50}% ${k * 50}%`; };
        frame(0);
        b.addEventListener('mouseenter', () => { if (this.game.player.inv.currentLoadout !== k) frame(2); });
        b.addEventListener('mouseleave', () => { if (this.game.player.inv.currentLoadout !== k) frame(0); });
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (this.game.player.inv.currentLoadout === k) return;
          this.game.player.inv.trySwitchingLoadout(k);
          this.game.sfx.play('menuTick', 0.6); // SoundID 12（TrySwitchingLoadout）
          // 切套白闪（GetColorByLoadout :2554-2559：Remap(dt,0,30,0.5,0)³→白）
          // ★ class 必须播完即摘：display:none→block 会使 CSS 动画重播，
          //   残留 class 会导致此后每次打开背包全体槽位白闪
          this.invPanel.classList.remove('sw-loadout-flash');
          void this.invPanel.offsetWidth;
          this.invPanel.classList.add('sw-loadout-flash');
          setTimeout(() => this.invPanel.classList.remove('sw-loadout-flash'), 600);
          this.refreshAll();
        });
        row.appendChild(b);
        this.loadoutBtns.push(b);
      }
      // 页签：装备 / 杂项（原版 EquipPage 0/2——时装并入装备页主列）
      const spacer = el('div');
      spacer.style.flex = '1';
      row.appendChild(spacer);
      this.eqPageBtns = [];
      for (const [label, page] of [['装备', 0], ['杂项', 1]] as const) {
        const b = el('button', 'sw-btn');
        b.textContent = label;
        b.style.cssText = 'margin:0; padding:4px 10px; font-size:12px;';
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.setEquipPage(page);
        });
        row.appendChild(b);
        this.eqPageBtns.push(b);
      }
      // 图鉴入口（原版 BestiaryMenuButton Main.cs:41896-41910：背包侧按钮
      // IngameFancyUI.OpenUIState(BestiaryUI)；打开逻辑由 main.ts 注入 onBestiary）
      const bBst = el('button', 'sw-btn', '图鉴');
      bBst.style.cssText = 'margin:0; padding:4px 10px; font-size:12px;';
      bBst.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.onBestiary?.();
      });
      row.appendChild(bBst);
      // 成就入口（原版设置菜单 Lang.menu[131] + AchievementAdvisor 卡片点击
      // IngameFancyUI.OpenAchievements——本作在背包顶栏直接给按钮）
      const bAch = el('button', 'sw-btn', Lang.text('UI.Achievements'));
      bAch.style.cssText = 'margin:0; padding:4px 10px; font-size:12px;';
      bAch.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.closeInventory();
        openAchievementsPanel(this.game);
      });
      row.appendChild(bAch);
      this.invPanel.appendChild(row);
    }

    // 主体：原版布局——左装备竖列（盔甲 0-2 + 配饰 3-7 | 染料 0-2+3-7 | 时装 10-12 + 时装配饰 13-17）
    // / 杂项页（miscEquips[5] + miscDyes[5]，Main.cs:40616-40672 EquipPage==2）+
    // 垃圾桶 + 钱币 + 弹药；右背包 10×4（10-49）。原版三列 x=sw-92/-139/-186。
    const body = el('div');
    body.style.cssText = 'display:flex; gap:14px; margin-bottom:8px;';
    const left = el('div');
    left.style.cssText = 'display:flex; gap:6px; flex:none;';
    // 竖排列构建器（原版 DrawInventory :40844-40968 语义：同 x 纵向排，label 顶部）
    const vcol = (label: string, from: number, n: number, where: SlotWhere) => {
      const col = el('div');
      col.appendChild(el('div', 'sw-lbl', label));
      for (let k = 0; k < n; k++) col.appendChild(this.makeSlotEl(from + k, where));
      col.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
      return col;
    };
    // 装备页：三列 L→R = 染料 | 时装 | 装备（原版 DrawInventory :40830-40968：
    //  x=sw-186/-139/-92 单列纵向 47px 列距；配饰段相对盔甲段下移 num35=4px）。
    //  两段式竖列（盔甲段 + 4px 组距 + 配饰段）
    const vcol2 = (label: string, a: number, na: number, b: number, nb: number, where: SlotWhere) => {
      const col = el('div');
      col.appendChild(el('div', 'sw-lbl', label));
      const wrap = el('div');
      wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
      for (let k = 0; k < na; k++) wrap.appendChild(this.makeSlotEl(a + k, where));
      for (let k = 0; k < nb; k++) {
        const sl = this.makeSlotEl(b + k, where);
        if (k === 0) sl.style.marginTop = '4px'; // 段组距（原版 num35=4）
        wrap.appendChild(sl);
      }
      col.appendChild(wrap);
      col.style.cssText = 'display:flex; flex-direction:column;';
      return col;
    };
    this.eqPageEl = el('div');
    this.eqPageEl.style.cssText = 'display:flex; gap:2px;'; // 原版 47px 列距≈贴列
    this.eqPageEl.appendChild(vcol2(Lang.text('LegacyInterface.57'), 0, 3, 3, 7, 'dye'));            // 染料 dye[0-2]+[3-9]
    this.eqPageEl.appendChild(vcol2(Lang.text('Mods.SandboxWorld.UI.Vanity'), 10, 3, 13, 5, 'armor')); // 时装 armor[10-12]+[13-17]
    this.eqPageEl.appendChild(vcol2(Lang.text('Mods.SandboxWorld.UI.Equipment'), 0, 3, 3, 5, 'armor')); // 装备 armor[0-2]+[3-7]
    left.appendChild(this.eqPageEl);
    // 杂项页：miscEquips[5]（宠物/光源/矿车/坐骑/抓钩，context 19/20/18/17/16）+ miscDyes[5]（context 33）
    this.miscPageEl = el('div');
    this.miscPageEl.style.cssText = 'display:none; gap:10px;';
    const MISC_LABELS = ['宠物', '光源', '矿车', '坐骑', '抓钩'];
    const miscCol = el('div');
    miscCol.style.cssText = 'display:flex; flex-direction:column;';
    MISC_LABELS.forEach((lbl, k) => {
      const pair = el('div');
      pair.style.cssText = 'display:flex; flex-direction:column;';
      pair.appendChild(el('div', 'sw-lbl', lbl));
      pair.appendChild(this.makeSlotEl(k, 'misc'));
      miscCol.appendChild(pair);
    });
    this.miscPageEl.appendChild(miscCol);
    this.miscPageEl.appendChild(vcol('染料', 0, 5, 'miscDye'));
    left.appendChild(this.miscPageEl);
    // 垃圾桶（持久槽；可交换取回）——原版 (448,258) scale0.85=44px、槽底 Back7（context 6）
    const trashWrap = el('div');
    trashWrap.appendChild(el('div', 'sw-lbl', Lang.text('LegacyInterface.3')));
    const trash = el('div', 'sw-slot trash sw-trash');
    trash.style.cssText = 'width:44px; height:44px; flex:none;'
      + 'background-image:url(sprites/vanilla/Inventory_Back7.png);';
    trash.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.heldStack) {
        this.placeTrash();
      } else if (this.game.player.inv.trash) {
        this.heldStack = this.game.player.inv.trash; // 取回
        this.game.player.inv.trash = null;
        this.paintTrash();
      }
      this.refreshAll();
    });
    this.trashEl = trash;
    trashWrap.appendChild(trash);
    // 钱币 4 格（50-53）+ 弹药 4 格（54-57）——原版 Main.cs:41189-41224：
    //  inventoryScale 0.6 → 31px 竖列、间距 33.6px（gap 2.6），Coins x=497 / Ammo x=534
    const coinAmmo = el('div');
    coinAmmo.style.cssText = 'display:flex; gap:5px;';
    const mkCol = (label: string, from: number) => {
      const col = el('div');
      col.appendChild(el('div', 'sw-lbl', label));
      const colSlots = el('div');
      colSlots.style.cssText = 'display:flex; flex-direction:column; gap:2.6px;';
      for (let k = 0; k < 4; k++) {
        const sl = this.makeSlotEl(from + k, 'inv');
        sl.classList.add('sm');
        colSlots.appendChild(sl);
      }
      col.appendChild(colSlots);
      col.style.cssText = 'display:flex; flex-direction:column;';
      return col;
    };
    coinAmmo.appendChild(mkCol(Lang.text('LegacyInterface.26'), COIN_START));
    coinAmmo.appendChild(mkCol(Lang.text('LegacyInterface.27'), AMMO_START));
    const rightRail = el('div');
    rightRail.style.cssText = 'display:flex; gap:8px; align-items:flex-start;';
    rightRail.appendChild(trashWrap);
    rightRail.appendChild(coinAmmo);
    left.appendChild(rightRail);
    // 成就提示牌（AchievementAdvisor：未完成成就小卡，点击开成就菜单）
    this.achAdvisorEl = createAchievementAdvisor(this.game);
    left.appendChild(this.achAdvisorEl);
    body.appendChild(left);

    // 背包 10×4（10-39）
    const right = el('div');
    // 背包标签行 + 调试搜索按钮（原版无此按钮——调试用道具检索器）
    {
      const lblRow = el('div');
      lblRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; width:100%;';
      lblRow.appendChild(el('div', 'sw-lbl', Lang.text('Mods.SandboxWorld.UI.InvLabel')));
      const searchBtn = el('button', 'sw-btn');
      // 调试专用按钮：不入 l10n 包（生成产物 12 语言），标签硬编码
      searchBtn.textContent = '🔍 道具搜索';
      searchBtn.style.cssText = 'font-size:12px; padding:2px 8px; cursor:pointer;';
      searchBtn.addEventListener('click', () => this.openItemSearch());
      lblRow.appendChild(searchBtn);
      // 向导配方反查（guideItem 槽 → CollectGuideRecipes；LegacyInterface.21 标题）
      const guideBtn = el('button', 'sw-btn');
      guideBtn.textContent = '📖 ' + Lang.text('LegacyInterface.21').replace('：', '');
      guideBtn.style.cssText = 'font-size:12px; padding:2px 8px; cursor:pointer;';
      guideBtn.addEventListener('click', () => this.openGuideSearch());
      lblRow.appendChild(guideBtn);
      right.appendChild(lblRow);
    }
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(10,52px); gap:4px;';
    for (let i = 10; i < INV_SIZE; i++) {
      grid.appendChild(this.makeSlotEl(i, 'inv'));
    }
    right.appendChild(grid);
    body.appendChild(right);
    this.invPanel.appendChild(body);

    // 合成区
    this.invPanel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Crafting')));
    const stations = el('div', '', '');
    stations.style.cssText = 'font-size:12px; color:#8ad0a0; margin-bottom:6px;';
    stations.dataset.role = 'stations';
    this.invPanel.appendChild(stations);
    // ---- Modern 合成网格控件（1.4.5 CraftingGrid：搜索栏 + 焦点配方材料格） ----
    const modernRow = el('div');
    modernRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
    this.craftSearchEl = el('input') as HTMLInputElement;
    this.craftSearchEl.placeholder = '搜索配方成品…';
    this.craftSearchEl.style.cssText = 'flex:1; padding:4px 8px; background:#241e38; color:#fff; border:1px solid #6a5a8a; border-radius:4px; font-size:12px;';
    this.craftSearchEl.addEventListener('input', () => { this.craftFocus = 0; this.refreshVanillaCrafting(); });
    modernRow.appendChild(this.craftSearchEl);
    this.craftGridEl = el('div');
    this.craftGridEl.style.cssText = 'display:flex; gap:4px; align-items:center; flex-wrap:wrap; max-width:520px;';
    modernRow.appendChild(this.craftGridEl);
    this.invPanel.appendChild(modernRow);
    this.craftListEl = el('div');
    this.craftListEl.style.cssText = 'max-height:240px; overflow-y:auto; width:520px;';
    this.invPanel.appendChild(this.craftListEl);
    this.root.appendChild(this.invPanel);
  }

  /** Buff 状态栏（对齐原版 DrawInterface_Resources_Buffs，Main.cs:42618-42640 +
   *  DrawBuffIcon :42725）：
   *  起点 (32,76)、**每行 11 个横排**（步距 38px = 32 图标 + 6 缝；行宽 418）、
   *  行距 50px、裸 32×32 **原版 Buff_{vanillaBuff} 贴图**（TextureAssets.Buff 1:1
   *  尺寸原大绘制，不用药水物品图标替代）、剩余时长文字在图标正下方（ItemStack
   *  0.8 倍字号）、悬停提亮（原版 buffAlpha 0.4↔1.0 的 CSS 近似）、右键取消
   *  （TryRemovingBuff：非 debuff 播 SoundID 12=menuTick）、背包打开时隐藏 */
  private buildBuffBar() {
    this.buffBar = el('div');
    // 11×38=418 行宽 = 原版 num2=11 行卷绕，行距 50-32=18（纵排 bug 修复：此前
    // 缺 flex-direction 显式声明且行宽 412 装不下第 11 个）
    this.buffBar.style.cssText = 'pointer-events:auto; position:fixed; top:76px; left:32px; display:flex; flex-direction:row; flex-wrap:wrap; width:418px; column-gap:6px; row-gap:18px; align-content:flex-start;';
    this.root.appendChild(this.buffBar);
    this.buffBlocks.clear();
    // 块按激活顺序动态创建（原版按 buff 槽序全量显示，无白名单——此前硬编码
    // 19 种，战斗/镇静/挖矿/糖分冲刺等 20+ 种永不显示）
  }

  /** 单个 buff 块（原版 DrawBuffIcon Main.cs:42725 的 DOM 化） */
  private makeBuffBlock(t: BuffType): { block: HTMLElement; icon: HTMLImageElement; time: HTMLElement } {
    const block = el('div', 'sw-buff');
    block.style.display = 'none';
    block.style.cssText += 'position:relative; width:32px; height:32px; background:none; border:none; border-radius:0; cursor:pointer; flex:0 0 auto;';
    const icon = el('img') as HTMLImageElement;
    icon.draggable = false;
    // 原版 buffAlpha（Main.cs:42732/42750-42777）：基准 0.4、悬停渐亮至 1.0、
    // 离开回落 0.4——alpha 通道本身（Color×alpha），非 brightness
    icon.style.cssText = 'width:32px; height:32px; image-rendering:pixelated; display:block; opacity:0.4; transition:opacity 0.2s linear;';
    block.appendChild(icon);
    const time = el('span', '', '');
    time.style.cssText = 'position:absolute; left:-4px; right:-4px; top:34px; text-align:center; font-size:11px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000; white-space:nowrap;';
    block.appendChild(time);
    // 悬停提亮（原版 buffAlpha 悬停 +0.1/t 至 1、离开 -0.05/t 至 0.4 的 CSS 近似）
    block.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
    block.addEventListener('mouseleave', () => { icon.style.opacity = '0.4'; });
    // 右键取消（TryRemovingBuff L42793+：非 debuff → DelBuff + SoundID 12）
    block.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.game) return;
      this.game.player.buffs.remove(t);
      this.game.sfx.play('menuTick');
      this.refreshBuffs();
    });
    return { block, icon, time };
  }

  buffBar: HTMLElement | null = null;
  buffBlocks = new Map<BuffType, { block: HTMLElement; icon: HTMLImageElement; time: HTMLElement }>();

  /** 每秒左右调用一次（由 Game 经 callbacks 驱动）。
   *  原版行为（Main.cs:42618-42640）：遍历 buff 槽按序显示全部激活 buff；
   *  背包/华美 UI 打开时整栏不画；时长文字用 LocalizedDuration 缩写格式
   *  （zh-Hans "30秒"/"2分30秒"），仅剩 >2 tick 时显示 */
  refreshBuffs() {
    if (!this.game || !this.buffBar) return;
    const buffs = this.game.player.buffs;
    const invOpen = this.invPanel.style.display === 'block';
    this.buffBar.style.display = invOpen ? 'none' : 'flex';
    const seen = new Set<BuffType>();
    for (const [t, left] of buffs.active) {
      seen.add(t);
      let ui = this.buffBlocks.get(t);
      if (!ui) {
        // 动态建块：无白名单，任何激活 buff 都显示（原版按 buff 槽序）
        ui = this.makeBuffBlock(t);
        this.buffBar.appendChild(ui.block);
        this.buffBlocks.set(t, ui);
      }
      ui.block.style.display = 'flex';
      ui.block.title = `${buffName(t)}：${buffDesc(t)}`;
      // 原版 DrawBuffIcon（Main.cs:42736）：TextureAssets.Buff[type] 原大绘制——
      // 用原版 Buff_{vanillaBuff} 贴图（2026-08-13 前：误用对应药水物品图标）
      const want = `/sprites/vanilla/Buff_${BUFF_DEFS[t].vanillaBuff}.png`;
      if (!ui.icon.src.endsWith(want)) {
        ui.icon.onerror = () => {
          // 素材缺失兜底：退回药水物品图标（缺表时仍可见）
          const iconId = this.buffIconItem.get(t);
          if (iconId && this.game) ui.icon.src = iconUrl(this.game, iconId);
          ui.icon.onerror = null;
        };
        ui.icon.src = want;
      }
      const s = Math.ceil(left);
      ui.time.textContent = s >= 60
        ? (s % 60
          ? Lang.text('Mods.SandboxWorld.Time.MinSec', Math.floor(s / 60), s % 60)
          : Lang.text('Mods.SandboxWorld.Time.Minutes', Math.floor(s / 60)))
        : Lang.text('Mods.SandboxWorld.Time.Seconds', s);
    }
    for (const [t, ui] of this.buffBlocks) {
      if (!seen.has(t)) ui.block.style.display = 'none';
    }
  }

  // Buff → 物品图标（仅作原版 Buff 贴图缺失时的兜底——正道是 Buff_{vanillaBuff}.png）
  buffIconItem = new Map<BuffType, number>();

  private buildChestPanel() {
    this.chestPanel = el('div', 'sw-panel');
    this.chestPanel.style.cssText = 'position:fixed; left:50%; top:16%; transform:translateX(-50%); display:none;';
    this.chestTitle = el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Chest'));
    this.chestPanel.appendChild(this.chestTitle);
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(10,52px); gap:5px;';
    // 按 40 槽上限构建（玩家储物 bank×4）；打开时按容器实际长度显隐（宝箱 10 / 储物 40）
    for (let i = 0; i < 40; i++) {
      grid.appendChild(this.makeSlotEl(i, 'chest'));
    }
    this.chestGrid = grid;
    this.chestPanel.appendChild(grid);
    // ---- 箱子三按钮（ChestUI.DrawButtons :182-260：LootAll/DepositAll/QuickStack） ----
    const btns = el('div');
    btns.style.cssText = 'display:flex; gap:6px; margin-top:8px;';
    const mkBtn = (label: string, act: () => void) => {
      const b = el('button', 'sw-btn', label);
      b.style.cssText = 'margin:0; padding:6px 10px; font-size:12px; flex:1;';
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        act();
      });
      btns.appendChild(b);
    };
    mkBtn(Lang.text('LegacyInterface.29'), () => this.chestLootAll());       // 全部取出
    mkBtn(Lang.text('LegacyInterface.30'), () => this.chestDepositAll());    // 存入全部（仅箱内尚无的类型，跳钱币）
    mkBtn(Lang.text('LegacyInterface.31'), () => this.chestQuickStack());    // 快速堆叠（只堆箱内已有类型）
    this.chestPanel.appendChild(btns);
    this.root.appendChild(this.chestPanel);
  }

  /** Loot All（ChestUI.LootAll :282/389）：箱内全部入包，装不下的留在箱里 */
  private chestLootAll(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    for (let i = 0; i < chest.items.length; i++) {
      const cur = chest.items[i];
      if (!cur) continue;
      const left = inv.add(cur.id, cur.stack);
      if (left === 0) chest.items[i] = null;
      else cur.stack = left;
    }
    this.game.sfx.play('pickup');
    this.refreshAll();
  }

  /** Deposit All（ChestUI.DepositAll :531：背包→箱，仅放箱内尚不存在的类型；跳过钱币 71-74） */
  private chestDepositAll(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    for (let i = 0; i < 50; i++) { // 0-49 背包（钱币 50-53 不动）
      const cur = inv.slots[i];
      if (!cur || cur.favorited) continue;
      if (coinIndexOf(cur.id) >= 0) continue; // 钱币不存箱（Coin 槽 50-53 归属）
      if (chest.items.some((cs) => cs && cs.id === cur.id)) continue; // 箱内已有类型 → 跳过（走 QuickStack）
      const empty = chest.items.findIndex((cs) => !cs);
      if (empty < 0) break; // 箱满
      chest.items[empty] = cur;
      inv.slots[i] = null;
    }
    this.game.sfx.play('pickup');
    this.refreshAll();
  }

  /** Quick Stack（ChestUI.QuickStack :651：只堆箱内已存在类型；收藏禁转移） */
  private chestQuickStack(): void {
    const chest = this.openChest;
    if (!chest) return;
    const inv = this.game.player.inv;
    const movedChest = new Map<number, number>(); // 箱格 → 物品 id（glow 分层用）
    for (let i = 0; i < 54; i++) { // 0-53（含钱币栏堆叠）
      const cur = inv.slots[i];
      if (!cur || cur.favorited) continue;
      for (let k = 0; k < chest.items.length; k++) {
        const cs = chest.items[k];
        if (!cs || cs.id !== cur.id) continue;
        const max = ITEM_DEFS[cur.id].maxStack;
        const put = Math.min(max - cs.stack, cur.stack);
        cs.stack += put;
        cur.stack -= put;
        if (put > 0 && !movedChest.has(k)) movedChest.set(k, cur.id);
        if (cur.stack <= 0) { inv.slots[i] = null; break; }
      }
    }
    // 转移脉冲（ItemSorting :1513-1529：按类型分层 hue=(层+0.5)/层数 渐进彩虹）
    if (movedChest.size) {
      const order = new Map<number, number>();
      for (const id of movedChest.values()) {
        if (!order.has(id)) order.set(id, order.size);
      }
      const n = order.size;
      for (const [k, id] of movedChest) {
        this.setSlotGlow('chest', k, ((order.get(id) ?? 0) + 0.5) / n);
      }
    }
    this.game.sfx.play('pickup');
    this.refreshAll();
  }
  private chestTitle!: HTMLElement;
  private chestGrid!: HTMLElement;

  private openChestPanel(c: ChestData) {
    this.openChest = c;
    // 容器来源标识（原版 player.chest 约定）：-2 存钱罐 / -3 保险箱 / -4 守护者熔炉 / -5 虚空保险库
    const bankNames: Record<number, string> = { [-2]: '存钱罐', [-3]: '保险箱', [-4]: "守护者熔炉", [-5]: '虚空保险库' };
    this.chestTitle.textContent = bankNames[c.x] ?? Lang.text('Mods.SandboxWorld.UI.Chest');
    // 按容器实际槽位数显隐（宝箱 10 / 玩家储物 40）
    const n = Math.min(40, c.items.length);
    for (let i = 0; i < 40; i++) {
      const s = this.chestGrid.children[i] as HTMLElement | undefined;
      if (s) s.style.display = i < n ? '' : 'none';
    }
    this.chestPanel.style.display = 'block';
    this.openInventory();
    this.refreshAll();
  }

  closeChest() {
    this.openChest = null;
    this.chestPanel.style.display = 'none';
  }

  // ============ 槽底贴图 / Loadout 染色 / 转移脉冲 / 金币跳字 ============

  /** LoadoutSlotColors（ItemSlot.cs:322-340）——行=loadout，列=context 组
   *  （TryGetSlotColor :2567：8,10 装备→0 / 9,11 时装→1 / 12 染料→2） */
  private static readonly LOADOUT_COLORS: ReadonlyArray<readonly [string, string, string]> = [
    ['rgb(50,106,64)', 'rgb(46,106,98)', 'rgb(45,85,105)'],
    ['rgb(35,106,126)', 'rgb(50,89,140)', 'rgb(57,70,128)'],
    ['rgb(122,63,83)', 'rgb(104,46,85)', 'rgb(84,37,87)'],
  ];

  /** 槽底贴图按 context（ItemSlot.Draw :1983-2142 逐 case：
   *  装备/时装/染料=13 / 杂项装备=3 / 杂项染料=12 / 箱=5 / 其余=默认 Back；
   *  收藏=10 覆盖（:1987，除 13/21/22/14/35 等——快捷栏不在本路径） */
  private paintSlotChrome(slotEl: HTMLElement, where: SlotWhere, i: number): void {
    let tex = 'Inventory_Back';
    let tint: string | null = null;
    if (where === 'armor' || where === 'dye') {
      tex = 'Inventory_Back13';
      const lo = UI.LOADOUT_COLORS[this.game.player.inv.currentLoadout] ?? UI.LOADOUT_COLORS[0];
      tint = where === 'dye' ? lo[2] : i <= 9 ? lo[0] : lo[1];
    } else if (where === 'misc') tex = 'Inventory_Back3';
    else if (where === 'miscDye') tex = 'Inventory_Back12';
    else if (where === 'chest') tex = 'Inventory_Back5';
    const content = this.slotContent(where, i);
    if (content?.favorited) tex = 'Inventory_Back10';
    // 权威重绘：清掉残留的 glow 色层（面板 display:none 期间动画被 cancel 而非
    // end——overlay 会以基础样式（不透明）卡死在槽上，重开面板即一排色块）
    slotEl.querySelector('.sw-glow-overlay')?.remove();
    slotEl.style.backgroundImage = `url(sprites/vanilla/${tex}.png)`;
    if (tint) slotEl.style.setProperty('--slot-tint', tint);
    else slotEl.style.removeProperty('--slot-tint');
  }

  /** 物品转移 hue 脉冲（ItemSlot.SetGlow :428 + :2144-2152：贴图换 Back13 +
   *  hslToRgb(hue,1,0.5) 色层 (time/300)²/2 衰减 5s；CSS 动画近似二次曲线） */
  setSlotGlow(where: SlotWhere, i: number, hue: number): void {
    const slotEl = this.slotEl(i, where);
    if (!slotEl) return;
    slotEl.querySelector('.sw-glow-overlay')?.remove();
    slotEl.style.backgroundImage = 'url(sprites/vanilla/Inventory_Back13.png)';
    const ov = el('div', 'sw-glow-overlay');
    ov.style.setProperty('--glow', `hsl(${(hue * 360).toFixed(1)} 100% 50%)`);
    ov.addEventListener('animationend', () => {
      ov.remove();
      if (this.game) this.paintSlotChrome(slotEl, where, i);
    });
    slotEl.appendChild(ov);
  }

  /** CoinSlot 动画表（CoinSlot.cs :228-249：Jump 25 帧×JumpScale10 / Text 17 帧 / 自旋 8 帧） */
  private static readonly COIN_JUMP = [0, .23748, .43408, .59366, .72007, .81717, .88881, .93885, .97115, .98955,
    .99793, 1, 1, 1, .99793, .98955, .97115, .93885, .88881, .81717, .72007, .59366, .43408, .23748, 0];
  private static readonly COIN_TEXT = [1, 1.0107, 1.0391, 1.0791, 1.125, 1.1709, 1.2109, 1.2393, 1.25, 1.2393,
    1.2109, 1.1709, 1.125, 1.0791, 1.0391, 1.0107, 1];
  private prevCoinStack = [-1, -1, -1, -1];
  private coinBusy = [false, false, false, false];

  /** 金币跳字（CoinSlot.UpdateState：堆叠变化 → 跳 25 帧 + 计数弹跳缩放 + 自旋帧） */
  private coinJump(k: number): void {
    if (this.coinBusy[k]) return;
    const slotEl = this.slotEl(COIN_START + k, 'inv');
    if (!slotEl) return;
    this.coinBusy[k] = true;
    const img = slotEl.querySelector<HTMLImageElement>('img');
    const cnt = slotEl.querySelector<HTMLElement>('.cnt');
    // 自旋层（CoinSlot.DrawItemCoin：Coin_k 8 帧竖条，跳帧窗 9-13 推进）
    let spin: HTMLElement | null = null;
    let t = 0;
    let last = 0;
    const step = (now: number) => {
      if (!last) last = now;
      while (now - last >= 16.7 && t < 25) {
        last += 16.7;
        t++;
        const jump = UI.COIN_JUMP[t] ?? 0;
        if (img) img.style.transform = `translateY(${(-jump * 10).toFixed(1)}px)`;
        if (cnt) cnt.style.transform = `scale(${UI.COIN_TEXT[Math.min(t, 16)]})`;
        if (t >= 9 && t <= 13) {
          if (!spin) {
            spin = el('div');
            spin.style.cssText = 'position:absolute; inset:4px; pointer-events:none; image-rendering:pixelated;'
              + `background:url(sprites/vanilla/Coin_${k}.png); background-size:100% 800%;`;
            slotEl.appendChild(spin);
            img && (img.style.visibility = 'hidden');
          }
          spin.style.backgroundPositionY = `${(Math.floor((t - 9) * 1.4) % 7) * 12.5}%`;
        } else if (spin) {
          spin.remove(); spin = null;
          if (img) img.style.visibility = '';
        }
      }
      if (t < 25) { requestAnimationFrame(step); return; }
      if (img) { img.style.transform = ''; img.style.visibility = ''; }
      if (cnt) cnt.style.transform = '';
      spin?.remove();
      this.coinBusy[k] = false;
    };
    requestAnimationFrame(step);
  }

  // ============ 刷新 ============

  refreshHotbar() {
    if (!this.game) return;
    const inv = this.game.player.inv;
    // 原版布局（Main.cs:43017-43060）：x 从 20 起步进 ⌊52×scale⌋+4；
    // y = 20 + 22×(1-scale)（选中 20，未选中 25→CSS 视觉再随 scale 收缩）；
    // 未选中 alpha = 200×187/255 ≈ 147（Back20 半透明），选中 255（Back14）
    let x = 20;
    for (let i = 0; i < 10; i++) {
      const slotEl = this.slotEl(i, 'inv');
      if (!slotEl) continue;
      const sel = i === inv.selected;
      const scale = sel ? 1 : 0.75;
      this.paintSlot(slotEl, inv.slots[i]);
      slotEl.style.left = `${x}px`;
      slotEl.style.top = `${Math.trunc(20 + 22 * (1 - scale))}px`;
      slotEl.style.width = slotEl.style.height = '52px';
      slotEl.style.transform = `scale(${scale})`;
      slotEl.style.transformOrigin = 'top left';
      slotEl.style.opacity = sel ? '1' : '0.575';
      slotEl.style.backgroundImage = `url(sprites/vanilla/Inventory_Back${sel ? 14 : 20}.png)`;
      slotEl.style.boxShadow = ''; // 原版快捷栏不画收藏高亮（ItemSlot :1987 context!=13）
      if (!slotEl.querySelector('.sw-slot-num')) {
        const num = el('span', 'sw-slot-num', i === 9 ? '0' : String(i + 1));
        slotEl.appendChild(num);
      }
      x += Math.floor(52 * scale) + 4;
    }
    // 选中物品名（:43003-43009：居中 x=236、mouseTextColor 脉动；空手回退 inter[37]）
    const held = inv.slots[inv.selected];
    const name = held ? (Lang.itemName(ITEM_DEFS[held.id]?.vid ?? -1) ?? ITEM_DEFS[held.id]?.name) : null;
    this.hotbarNameEl.textContent = name || Lang.inter(37);
  }

  private paintSlot(slotEl: HTMLElement, content: { id: number; stack: number; favorited?: boolean } | null) {
    const oldImg = slotEl.querySelector('img');
    const oldCnt = slotEl.querySelector('.cnt');
    if (oldImg) oldImg.remove();
    if (oldCnt) oldCnt.remove();
    if (content) {
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(this.game, content.id);
      img.draggable = false;
      slotEl.appendChild(img);
      if (content.stack > 1) {
        slotEl.appendChild(el('span', 'cnt', String(content.stack)));
      }
    }
    // 收藏星标（原版 Inventory_Back10 金边贴图——ItemSlot :1966-1985 favorited 分支）
    const inHotbar = !!slotEl.closest('.sw-hotbar');
    if (!inHotbar) {
      slotEl.style.backgroundImage = content?.favorited ? 'url(sprites/vanilla/Inventory_Back10.png)' : '';
    }
    slotEl.title = content?.favorited ? '已收藏（Alt+左键取消；禁止快速转移）' : '';
  }

  refreshAll() {
    if (!this.game) return;
    this.moveGhost();
    this.paintTrash();
    this.achAdvisorEl?.update();
    this.refreshHotbar();
    const inv = this.game.player.inv;
    for (let i = 10; i < INV_SIZE; i++) {
      const slotEl = this.slotEl(i, 'inv');
      if (slotEl) {
        this.paintSlot(slotEl, inv.slots[i]);
        this.paintSlotChrome(slotEl, 'inv', i);
      }
    }
    // 金币跳字（CoinSlot：堆叠变化触发且槽内有币——原版仅钱币族动画，空槽不跳）
    for (let k = 0; k < 4; k++) {
      const cur = inv.slots[COIN_START + k];
      const st = cur?.stack ?? 0;
      if (st !== this.prevCoinStack[k]) {
        this.prevCoinStack[k] = st;
        if (cur) this.coinJump(k);
      }
    }
    // 装备列全量重绘（armor[20] / dye[10] / miscEquips[5] / miscDyes[5]）
    for (const where of ['armor', 'dye', 'misc', 'miscDye'] as const) {
      const arr = this.equipArray(where);
      for (let i = 0; i < arr.length; i++) {
        const slotEl = this.slotEl(i, where);
        if (slotEl) {
          this.paintSlot(slotEl, arr[i]);
          this.paintSlotChrome(slotEl, where, i);
        }
      }
    }
    // Loadout 按钮（Extra[259] 图集：选中=列1；悬停态由 mouseenter/leave 管）
    this.loadoutBtns.forEach((b, k) => {
      const cur = k === inv.currentLoadout;
      b.style.backgroundPosition = `${(cur ? 1 : 0) * 50}% ${k * 50}%`;
    });
    this.refreshBuffs();
    if (this.openChest) {
      const n = Math.min(40, this.openChest.items.length);
      for (let i = 0; i < n; i++) {
        const slotEl = this.slotEl(i, 'chest');
        if (slotEl) {
          this.paintSlot(slotEl, this.openChest.items[i]);
          this.paintSlotChrome(slotEl, 'chest', i);
        }
      }
    }
    this.refreshCrafting();
  }

  private refreshCrafting() {
    const game = this.game;
    if (!game || !this.craftListEl) return;
    const stations = game.stationsNearby();
    const stationsEl = this.invPanel.querySelector('[data-role="stations"]') as HTMLElement;
    if (stationsEl) {
      const stName: Record<string, string> = { hand: Lang.text('Mods.SandboxWorld.UI.StationHand'), workbench: '🛠 ' + Lang.text('ItemName.WorkBench'), furnace: '🔥 ' + Lang.text('ItemName.Furnace'), anvil: '⚒ ' + Lang.text('ItemName.IronAnvil') };
      stationsEl.textContent = Lang.text('Mods.SandboxWorld.UI.CraftStations', [...stations].map((s) => stName[s] ?? s).join('、'));
    }
    this.craftListEl.innerHTML = '';
    // 自制 RECIPES 表已随本地物品退役整体移除——合成列表只留原版配方段
    // （3173 条，Recipe.UpdateRecipeList 主干：环境+材料双门）
    this.refreshVanillaCrafting();
  }

  /** 鱼眼合成列表焦点行（原版 focusRecipe；滚轮 ±1，CraftingUI 滚动 ±6.5/帧） */
  private craftFocus = 0;
  /** Modern 合成网格：搜索栏 + 焦点配方材料格（1.4.5 CraftingGrid 语义） */
  private craftSearchEl: HTMLInputElement | null = null;
  private craftGridEl: HTMLElement | null = null;
  /** 材料格已存（原版 vid → 数量；焦点配方切换/关面板时归还背包） */
  private craftGrid = new Map<number, number>();
  private craftGridRecipe: VanillaRecipeLike | null = null;
  /** 原版配方列表（数据驱动 1456 全量；鱼眼缩放 = 100/(|Δ|+100) 下限 0.75，CraftingUI.cs:184-192 DOM 近似） */
  private refreshVanillaCrafting(): void {
    const game = this.game;
    if (!game || !this.craftListEl) return;
    let avail = game.vanillaAvailableRecipes();
    if (!avail.length) return;
    // 搜索过滤（Modern 网格搜索栏：按成品名过滤）
    const q = this.craftSearchEl?.value.trim().toLowerCase() ?? '';
    if (q) {
      const filtered = avail.filter(({ r }) => {
        const k = vanillaItemKey(r.create);
        const name = k ? Lang.itemNameByKey(k) : '';
        return name.toLowerCase().includes(q);
      });
      if (filtered.length) avail = filtered;
    }
    const head = el('div', 'sw-lbl', '── 原版配方 ──');
    this.craftListEl.appendChild(head);
    const MAX_ROWS = 60; // 焦点 ±30（超出原版 middleY 视口即 alpha→0 :177）
    const start = Math.max(0, Math.min(this.craftFocus - 30, avail.length - MAX_ROWS));
    if (this.craftFocus >= avail.length) this.craftFocus = 0;
    for (let idx = start; idx < Math.min(avail.length, start + MAX_ROWS); idx++) {
      const { r, count } = avail[idx];
      const dy = idx - this.craftFocus; // 相对焦点的连续偏移（原版 availableRecipeY）
      const scale = Math.max(0.75, 100 / (Math.abs(dy) + 100));
      const outKey = vanillaItemKey(r.create);
      if (!outKey) continue;
      const row = el('div', 'sw-recipe');
      row.style.cssText += ` transform:scale(${scale.toFixed(3)}); transform-origin:left center; opacity:${(1 - Math.min(0.75, Math.abs(dy) / 30)).toFixed(2)}; transition:transform 0.08s;`;
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(game, game.itemId(outKey));
      row.appendChild(img);
      const label = el('span', '', `${Lang.itemNameByKey(outKey)}${r.createStack > 1 ? ` ×${r.createStack}` : ''} ×${count}`);
      row.appendChild(label);
      const mats = el('span', '', r.items.map((req) => {
        const k = ingredientKey(req.id);
        if (!k) return ` ? ${req.stack}`;
        const have = game.player.inv.countOf(game.itemId(k));
        return ` ${Lang.itemNameByKey(k)} ${Math.min(have, req.stack)}/${req.stack}`;
      }).join(' ·'));
      mats.style.cssText = 'margin-left:auto; color:#9a8ab8; font-size:11px; text-align:right;';
      row.appendChild(mats);
      row.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        this.craftFocus = idx; // 选中置焦（原版 focusRecipe=i）
        game.vanillaCraft(r, (ev as MouseEvent).shiftKey ? 10 : 1);
        this.refreshAll();
      });
      this.craftListEl.appendChild(row);
    }
    // 滚轮：焦点 ±1（原版 ScrollCraftingList；±6.5/帧的平滑由 transition 兜）
    if (!this._craftWheelBound) {
      this._craftWheelBound = true;
      this.craftListEl.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.craftFocus = Math.max(0, this.craftFocus + (ev.deltaY > 0 ? 1 : -1));
        this.refreshAll();
      }, { passive: false });
    }
    // Modern 合成网格材料格（焦点配方）
    this.refreshCraftGrid(avail);
  }
  private _craftWheelBound = false;

  /** 材料格覆盖计数：req（含组假 id）当前格内存量 */
  private gridCovered(reqId: number): number {
    if (reqId < 1000000) return this.craftGrid.get(reqId) ?? 0;
    const items = RECIPE_GROUP_ITEMS[String(reqId - 1000000)] ?? [];
    let n = 0;
    for (const m of items) n += this.craftGrid.get(m) ?? 0;
    return n;
  }

  /** 现代合成网格材料行（1.4.5 CraftingGrid：左键=放入/右键=取回/合成=格子优先） */
  private refreshCraftGrid(avail: Array<{ r: VanillaRecipeLike; count: number }>): void {
    if (!this.craftGridEl) return;
    const focusR = avail[Math.min(this.craftFocus, avail.length - 1)]?.r ?? null;
    // 焦点配方变更：归还旧格内容
    if (focusR !== this.craftGridRecipe) {
      this.returnCraftGrid();
      this.craftGridRecipe = focusR;
    }
    this.craftGridEl.textContent = '';
    if (!focusR) return;
    for (const req of focusR.items) {
      const chip = el('div', 'sw-slot');
      // context 22 槽底 = Inventory_Back4（ItemSlot.cs:2101-2123）
      chip.style.cssText += 'width:38px; height:38px;'
        + 'background-image:url(sprites/vanilla-ui/Inventory_Back4.png);';
      const k = ingredientKey(req.id < 1000000 ? req.id : (RECIPE_GROUP_ITEMS[String(reqIdShift(req.id))]?.[0] ?? req.id));
      if (k) {
        const img = el('img') as HTMLImageElement;
        img.src = iconUrl(this.game, this.game.itemId(k));
        chip.appendChild(img);
      }
      const have = this.gridCovered(req.id);
      const cnt = el('span', 'cnt', `${have}/${req.stack}`);
      if (have >= req.stack) cnt.style.color = '#7de08a';
      chip.appendChild(cnt);
      chip.title = `${k ? Lang.itemNameByKey(k) : req.id}（左键放入 / 右键取回）`;
      chip.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 2) { this.craftGridReturnReq(focusR, req.id); this.refreshAll(); return; }
        this.craftGridDeposit(focusR, req.id);
        this.refreshAll();
      });
      chip.addEventListener('contextmenu', (e) => e.preventDefault());
      this.craftGridEl.appendChild(chip);
    }
    // 合成按钮（格子优先：格内材料齐备才可点）
    const ready = focusR.items.every((req) => this.gridCovered(req.id) >= req.stack);
    const btn = el('button', 'sw-btn', '⚒ 合成');
    btn.style.cssText = `margin:0; padding:4px 10px; font-size:12px; ${ready ? '' : 'opacity:0.4;'}`;
    if (ready) {
      btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        // 扣格子材料（组假 id 依序扣组内成员）
        for (const req of focusR.items) {
          let need = req.stack;
          const members = req.id >= 1000000 ? RECIPE_GROUP_ITEMS[String(reqIdShift(req.id))] ?? [] : [req.id];
          for (const m of members) {
            if (need <= 0) break;
            const have = this.craftGrid.get(m) ?? 0;
            const take = Math.min(have, need);
            if (take > 0) { this.craftGrid.set(m, have - take); need -= take; }
          }
        }
        this.game.vanillaCraftOutput(focusR);
        this.refreshAll();
      });
    }
    this.craftGridEl.appendChild(btn);
  }

  /** 材料格放入：从背包按缺口拉取（组材料依序拉组内成员） */
  private craftGridDeposit(r: VanillaRecipeLike, reqId: number): void {
    void r;
    const req = (r.items.find((x) => x.id === reqId));
    if (!req) return;
    const need = req.stack - this.gridCovered(reqId);
    if (need <= 0) return;
    const members = reqId >= 1000000 ? RECIPE_GROUP_ITEMS[String(reqIdShift(reqId))] ?? [] : [reqId];
    let left = need;
    for (const m of members) {
      if (left <= 0) break;
      const iid = invIndexOfVanilla(m);
      if (iid < 0) continue;
      const take = Math.min(this.game.player.inv.countOf(iid), left);
      if (take > 0) {
        this.game.player.inv.remove(iid, take);
        this.craftGrid.set(m, (this.craftGrid.get(m) ?? 0) + take);
        left -= take;
      }
    }
  }

  /** 材料格单材料取回（格内该 req 的全部存量回背包） */
  private craftGridReturnReq(r: VanillaRecipeLike, reqId: number): void {
    void r;
    const members = reqId >= 1000000 ? RECIPE_GROUP_ITEMS[String(reqIdShift(reqId))] ?? [] : [reqId];
    for (const m of members) {
      const n = this.craftGrid.get(m) ?? 0;
      if (n > 0) { this.game.player.inv.add(invIndexOfVanilla(m), n); this.craftGrid.delete(m); }
    }
  }

  /** 材料格全部归还背包（关背包/换焦点时） */
  returnCraftGrid(): void {
    for (const [vid, n] of this.craftGrid) {
      if (n > 0) {
        const iid = invIndexOfVanilla(vid);
        if (iid >= 0) this.game?.player.inv.add(iid, n);
      }
    }
    this.craftGrid.clear();
  }

  // ============ Toast ============

  toast(msg: string) {
    if (this.toastEl) this.toastEl.remove();
    const t = el('div', 'sw-toast', msg);
    this.toastEl = t;
    this.root.appendChild(t);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 500);
    }, 2500);
  }

  // ============ 暂停菜单 ============

  showPause(handlers: { onResume: () => void; onSave: () => void; onQuit: () => void; onSettings?: () => void; onBestiary?: () => void }) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:280px;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Paused')));
    const bRes = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Resume'));
    bRes.onclick = () => { panel.remove(); handlers.onResume(); };
    const bSave = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.SaveGame'));
    bSave.onclick = () => handlers.onSave();
    const bSet = el('button', 'sw-btn', Lang.text('LegacyMenu.14'));
    bSet.onclick = () => handlers.onSettings?.();
    const bBst = el('button', 'sw-btn', '图鉴');
    bBst.onclick = () => handlers.onBestiary?.();
    const bQuit = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.BackToMenu'));
    bQuit.onclick = () => { panel.remove(); handlers.onQuit(); };
    panel.append(bRes, bSave, bSet, bBst, bQuit);
    this.root.appendChild(panel);
    return panel;
  }

  closeAll() {
    this.chatMonitor?.clear(); // 消息列根节点随 root 清空,定时器必须同步清防泄漏
    this.chatMonitor = null;
    this.root.innerHTML = '';
    this.heldStack = null;
    this.openChest = null;
    this.reforgeItem = null;
    this.reforgeEl?.remove();
    this.reforgeEl = null;
    this.guideEl?.remove();
    this.guideEl = null;
    this.itemSearchEl?.remove();
    this.itemSearchEl = null;
  }

  /** 初始化 HUD 相关面板（进入游戏后调用一次） */
  initInGame() {
    // 原版左下角消息列(Main.NewText → LegacyChatMonitor;NewText 播 SoundID 12)
    this.chatMonitor?.clear();
    this.chatMonitor = new ChatMonitor(this.root, () => UISfx.sfx.play('menuTick', 0.6));
    // 回放进世界前缓冲的消息(如新世界出生时的 NPC 入驻公告)
    for (const [t, r, g, b, width] of this.chatPending) this.chatMonitor.message(t, r, g, b, width);
    this.chatPending = [];

    this.buildInventoryPanel();
    this.buildChestPanel();
    this.buildBuffBar();
    this.buildHud(this.game);
    // Buff → 图标物品映射
    const map: Array<[BuffType, string]> = [
      [BuffType.Agility, VI(290)], [BuffType.Ironskin, VI(292)],
      [BuffType.Resistance, VI(188)], [BuffType.Thorns, VI(301)],
      [BuffType.Regen, VI(289)], [BuffType.Honey, VI(1128)],
      // 环境 debuff(原版用专属 buff 贴图,此处以近义物品图标近似)
      [BuffType.OnFire, VI(8)], [BuffType.Burning, VI(117)],
      [BuffType.Bleeding, VI(28)], [BuffType.Suffocation, VI(169)],
      [BuffType.ObsidianSkin, VI(288)], [BuffType.Gills, VI(291)],
      [BuffType.ManaRegen, VI(293)], [BuffType.MagicPower, VI(294)],
      [BuffType.Featherfall, VI(295)], [BuffType.WaterWalking, VI(302)],
      [BuffType.Archery, VI(303)], [BuffType.NightOwl, VI(299)],
      // R1 数值批（vi_ 药水物品图标）
      [BuffType.Battle, 'vi_300_BattlePotion'], [BuffType.Calming, 'vi_2324_CalmingPotion'],
      [BuffType.Mining, 'vi_2322_MiningPotion'], [BuffType.Builder, 'vi_2325_BuilderPotion'],
      [BuffType.Heartreach, 'vi_2323_HeartreachPotion'], [BuffType.FlipperPotion, 'vi_2327_FlipperPotion'],
      [BuffType.Titan, 'vi_2326_TitanPotion'], [BuffType.AmmoReservation, 'vi_2344_AmmoReservationPotion'],
      [BuffType.Lifeforce, 'vi_2345_LifeforcePotion'], [BuffType.Endurance, 'vi_2346_EndurancePotion'],
      [BuffType.Wrath, 'vi_2349_WrathPotion'], [BuffType.Rage, 'vi_2347_RagePotion'],
      [BuffType.Tipsy, 'vi_2266_Sake'],
      // 后期批（近似图标：月噬→吸血鬼 knives / 遮挡→暗影钥匙）
      [BuffType.MoonLeech, 'vi_1569_vampire_knives'], [BuffType.Obstructed, 'vi_329_shadow_key'],
      // 食物三档（以已注册食物贴图为图标近似）
      [BuffType.WellFed, 'vi_5275_joja_cola'], [BuffType.WellFed2, 'vi_4023_grapes'],
      [BuffType.WellFed3, 'vi_1919_sugar_cookie'],
      // 微光化 353：银河珍珠 5340 近似（原版 Buff 353 无独立物品图标，debuff 显示
      // 微光池主素材；两处 init 路径的 map 必须同步——曾只加一处导致另一路径无图标）
      [BuffType.Shimmered, 'vi_5340_galaxy_pearl'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);  }

  /** 原版消息列(Main.NewText 入口) */
  private chatMonitor: ChatMonitor | null = null;
  /** 消息缓冲:ChatMonitor 未建(initInGame 之前,如新世界 afterWorldLoad
   *  发出的 NPC 入驻公告)时暂存,initInGame 创建后回放——曾直接丢弃 */
  private chatPending: Array<[string, number, number, number, number]> = [];
  chatMessage(text: string, r = 255, g = 255, b = 255, width = -1): void {
    if (this.chatMonitor) this.chatMonitor.message(text, r, g, b, width);
    else this.chatPending.push([text, r, g, b, width]);
  }

  // ---- NPC 对话系统(SetTalkNPC + GetChat;内容在 Game 生成,此处纯渲染) ----
  private npcDialog: NpcDialog | null = null;
  private npcShop: NpcShop | null = null;

  showNpcDialog(name: string, chat: string, buttons: Array<{ id: NpcButtonId; label: string }>, portrait?: string | null): void {
    if (!this.npcDialog) {
      this.npcDialog = new NpcDialog(this.root, (id) => {
        this.npcShop?.close();
        this.npcShop = null;
        this.game?.npcDialogButton(id);
      });
    }
    this.npcDialog.open(name, chat, buttons, portrait);
  }

  closeNpcDialog(): void {
    this.npcDialog?.close();
    this.npcShop?.close();
    this.npcShop = null;
  }

  showNpcShop(title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number }>, copper: number): void {
    if (!this.npcShop) {
      this.npcShop = new NpcShop(this.root,
        (vid) => this.game?.npcShopBuy(vid),
        () => { this.npcShop?.close(); this.npcShop = null; });
    }
    // 图标由 UI 侧按原版 id 补(atlas 管线)
    const entries: ShopEntry[] = items.map((it) => ({
      ...it,
      iconUrl: this.game ? iconUrl(this.game, it.vanillaId) || '' : '',
    }));
    this.npcShop.open(title, entries, copper);
  }

  /** M5：背包/快捷栏已 Canvas 化，DOM 仅保留 Buff 栏 + Toast */
  initInGameLite() {
    this.buildBuffBar();
    const map: Array<[BuffType, string]> = [
      [BuffType.Agility, VI(290)], [BuffType.Ironskin, VI(292)],
      [BuffType.Resistance, VI(188)], [BuffType.Thorns, VI(301)],
      [BuffType.Regen, VI(289)], [BuffType.Honey, VI(1128)],
      [BuffType.OnFire, VI(8)], [BuffType.Burning, VI(117)],
      [BuffType.Bleeding, VI(28)], [BuffType.Suffocation, VI(169)],
      [BuffType.ObsidianSkin, VI(288)], [BuffType.Gills, VI(291)],
      [BuffType.ManaRegen, VI(293)], [BuffType.MagicPower, VI(294)],
      [BuffType.Featherfall, VI(295)], [BuffType.WaterWalking, VI(302)],
      [BuffType.Archery, VI(303)], [BuffType.NightOwl, VI(299)],
      // R1 数值批（vi_ 药水物品图标）
      [BuffType.Battle, 'vi_300_BattlePotion'], [BuffType.Calming, 'vi_2324_CalmingPotion'],
      [BuffType.Mining, 'vi_2322_MiningPotion'], [BuffType.Builder, 'vi_2325_BuilderPotion'],
      [BuffType.Heartreach, 'vi_2323_HeartreachPotion'], [BuffType.FlipperPotion, 'vi_2327_FlipperPotion'],
      [BuffType.Titan, 'vi_2326_TitanPotion'], [BuffType.AmmoReservation, 'vi_2344_AmmoReservationPotion'],
      [BuffType.Lifeforce, 'vi_2345_LifeforcePotion'], [BuffType.Endurance, 'vi_2346_EndurancePotion'],
      [BuffType.Wrath, 'vi_2349_WrathPotion'], [BuffType.Rage, 'vi_2347_RagePotion'],
      [BuffType.Tipsy, 'vi_2266_Sake'],
      // 后期批（近似图标：月噬→吸血鬼 knives / 遮挡→暗影钥匙）
      [BuffType.MoonLeech, 'vi_1569_vampire_knives'], [BuffType.Obstructed, 'vi_329_shadow_key'],
      // 食物三档（以已注册食物贴图为图标近似）
      [BuffType.WellFed, 'vi_5275_joja_cola'], [BuffType.WellFed2, 'vi_4023_grapes'],
      [BuffType.WellFed3, 'vi_1919_sugar_cookie'],
      // 微光化 353：银河珍珠 5340 近似（与上方 init 全量路径的 map 保持同步）
      [BuffType.Shimmered, 'vi_5340_galaxy_pearl'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);
  }
}
