// DOM overlay UI：主菜单 / HUD 快捷栏 / 背包+配饰栏 / 合成 / 宝箱 / Buff栏 / 暂停 / Tooltip / Toast
import type { Game } from '../core/Game';
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { TILE_DEFS } from '../data/tiles';
import { autoFrameAt, cactusFrameAt, cactusTextureFor } from '../render/VanillaTiler';
import { RECIPES } from '../data/recipes';
import { atlasIconForKey } from '../assets/SpriteAtlas';
import { BuffType, BUFF_DEFS, buffName, buffDesc } from '../stats/Buffs';
import { Lang } from '../i18n/Lang';
import { ACCESSORY_START, ARMOR_START, COIN_START, INV_SIZE, VANITY_START } from '../items/Inventory';
import type { ChestData } from '../world/World';

const iconCache = new Map<number, string>();
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
  background:linear-gradient(rgba(38,50,90,0.96), rgba(22,30,58,0.97));
  border:2px solid #7d92d6; border-radius:6px; color:#e8ecf8; padding:12px;
  box-shadow:0 0 0 2px rgba(10,14,30,0.8), 0 6px 28px rgba(0,0,0,0.65),
    inset 0 0 18px rgba(90,120,220,0.12); }
.sw-btn { pointer-events:auto; display:block; width:100%; margin:6px 0; padding:10px 16px;
  background:linear-gradient(#4a3a6a,#3a2a5a); color:#fff; border:1px solid #6a5a8a;
  border-radius:6px; cursor:pointer; font-size:15px; text-align:center; }
.sw-btn:hover { background:linear-gradient(#5a4a7e,#4a3a6e); }
.sw-btn:disabled { opacity:0.45; cursor:default; }
.sw-slot { pointer-events:auto; width:44px; height:44px; background:rgba(24,34,70,0.9);
  border:2px solid #4d5f9e; border-radius:4px; position:relative; cursor:pointer; }
.sw-slot:hover { border-color:#aebfe8; background:rgba(40,56,110,0.95); }
.sw-slot.sel { border-color:#ffd75a; box-shadow:0 0 8px rgba(255,215,90,0.5); }
.sw-slot img { position:absolute; inset:4px; width:36px; height:36px; image-rendering:pixelated; }
.sw-slot .cnt { position:absolute; right:3px; bottom:1px; font-size:12px; font-weight:bold; color:#fff;
  text-shadow:1px 1px 0 #000; }
.sw-slot.trash::after { content:'🗑'; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-52%); font-size:18px; opacity:0.55; pointer-events:none; }
.sw-slot.trash:hover { border-color:#e08a8a; }
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
  invPanel!: HTMLElement;
  chestPanel!: HTMLElement;
  craftListEl!: HTMLElement;
  tooltip!: HTMLElement;
  toastEl: HTMLElement | null = null;
  heldStack: { id: number; stack: number } | null = null;
  heldFrom: 'inv' | 'chest' = 'inv';
  openChest: ChestData | null = null;
  private toastTimer: number | null = null;

  constructor(parent: HTMLElement) {
    const style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'sw-root');
    parent.appendChild(this.root);
    this.installDragListeners();
    (window as unknown as { __swUI?: UI }).__swUI = this; // 调试句柄
  }

  private slotContent(where: 'inv' | 'chest', i: number): { id: number; stack: number } | null {
    if (where === 'inv') return this.game.player.inv.slots[i];
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
    // 快捷栏（原版位置：左上角，首行与背包对齐）
    this.hotbarEl = el('div');
    this.hotbarEl.style.cssText = 'pointer-events:auto; position:fixed; top:14px; left:14px; display:flex; gap:2px;';
    for (let i = 0; i < 10; i++) {
      this.hotbarEl.appendChild(this.makeSlotEl(i, 'inv'));
    }
    this.root.appendChild(this.hotbarEl);
    this.refreshHotbar();

    // Tooltip
    this.tooltip = el('div', 'sw-tooltip');
    this.tooltip.style.display = 'none';
    this.root.appendChild(this.tooltip);

    game.openChest = (c) => this.openChestPanel(c);
  }

  slotEl(i: number, where: 'inv' | 'chest'): HTMLElement {
    // 背包格（idx>=10）在背包面板里，快捷栏格在 HUD 上——全文档查
    const found = document.querySelector(`[data-idx="${i}"][data-where="${where}"]`);
    return found as HTMLElement;
  }

  private makeSlotEl(i: number, where: 'inv' | 'chest'): HTMLElement {
    const s = el('div', 'sw-slot');
    s.dataset.idx = String(i);
    s.dataset.where = where;
    s.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 2) {
        this.splitHalf(i, where);
      } else {
        this.dragFrom = { i, where, sx: e.clientX, sy: e.clientY };
      }
    });
    s.addEventListener('mouseenter', () => this.showTooltipFor(i, where));
    s.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    return s;
  }

  // ---- 拖拽系统：按下起点 + 光标持有物（ghost 跟随） ----
  private dragFrom: { i: number; where: 'inv' | 'chest'; sx: number; sy: number } | null = null;
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
  private pickUp(i: number, where: 'inv' | 'chest') {
    const cur = this.slotContent(where, i);
    if (!cur) return;
    if (this.heldStack && this.heldStack.id !== cur.id) return;
    if (where === 'inv') this.game.player.inv.slots[i] = null;
    else if (this.openChest) this.openChest.items[i] = null;
    if (this.heldStack) this.heldStack.stack += cur.stack;
    else this.heldStack = { id: cur.id, stack: cur.stack };
    this.refreshAll();
  }

  /** 右键：拆半到光标 */
  private splitHalf(i: number, where: 'inv' | 'chest') {
    if (this.heldStack) return;
    const cur = this.slotContent(where, i);
    if (!cur) return;
    const half = Math.ceil(cur.stack / 2);
    if (where === 'inv') this.game.player.inv.removeAt(i, half);
    else if (this.openChest) {
      cur.stack -= half;
      if (cur.stack <= 0) this.openChest.items[i] = null;
    }
    this.heldStack = { id: cur.id, stack: half };
    this.refreshAll();
  }

  /** 放下到背包/宝箱格（合并→交换，装备位校验） */
  private placeHeld(i: number, where: 'inv' | 'chest'): void {
    if (!this.heldStack) return;
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
  private resolveDrop(from: { i: number; where: 'inv' | 'chest' }) {
    const target = document.elementFromPoint(this.mouseX, this.mouseY) as HTMLElement | null;
    const slotEl = target?.closest?.('.sw-slot') as HTMLElement | null;
    if (slotEl?.dataset.idx !== undefined && slotEl?.dataset.where) {
      const ti = Number(slotEl.dataset.idx);
      const tw = slotEl.dataset.where as 'inv' | 'chest';
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

  private showTooltipFor(i: number, where: 'inv' | 'chest') {
    const s = this.slotContent(where, i);
    if (!s) { this.tooltip.style.display = 'none'; return; }
    const def = ITEM_DEFS[s.id];
    let html = `<b style="color:#ffe8a0">${Lang.itemNameByKey(def.key)}</b> ×${s.stack}`;
    if (def.tool?.damage) html += `<br>${Lang.text('Mods.SandboxWorld.Item.Damage', def.tool.damage)}`;
    if (def.tool?.power && def.tool.type !== 'sword') html += `<br>${Lang.text(def.tool.type === 'pick' ? 'Mods.SandboxWorld.Item.PickPower' : 'Mods.SandboxWorld.Item.AxePower', def.tool.power)}`;
    if (def.heal) html += `<br>${Lang.text('CommonItemTooltip.RestoresLife', def.heal)}`;
    if (def.desc) html += `<br><span style="color:#9a8ab8">${def.desc}</span>`;
    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    const slotEl = this.slotEl(i, where);
    if (slotEl) {
      const r = slotEl.getBoundingClientRect();
      this.tooltip.style.left = `${r.right + 8}px`;
      this.tooltip.style.top = `${r.top}px`;
    }
  }

  // ============ 背包 + 合成 ============

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
    this.closeChest();
    // 放回手上物品
    if (this.heldStack) {
      this.game.player.inv.add(this.heldStack.id, this.heldStack.stack);
      this.heldStack = null;
    }
    // 垃圾桶结算：关闭背包才真正删除
    if (this.trashStack) {
      const def = ITEM_DEFS[this.trashStack.id];
      this.toast(Lang.text('Mods.SandboxWorld.UI.Dropped', Lang.itemNameByKey(def.key), this.trashStack.stack));
      this.trashStack = null;
      this.paintTrash();
    }
    this.moveGhost();
    this.game.input.uiBlocking = false;
  }

  /** 垃圾桶暂存（关闭背包才删除；可取回） */
  trashStack: { id: number; stack: number } | null = null;

  private placeTrash(): void {
    if (!this.heldStack) return;
    const t = this.trashStack;
    if (!t) {
      this.trashStack = this.heldStack;
      this.heldStack = null;
    } else if (t.id === this.heldStack.id) {
      const max = ITEM_DEFS[t.id].maxStack;
      const put = Math.min(max - t.stack, this.heldStack.stack);
      t.stack += put;
      this.heldStack.stack -= put;
      if (this.heldStack.stack <= 0) this.heldStack = null;
    } else {
      this.trashStack = this.heldStack; // 交换：可把误放的东西取回
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
    if (this.trashStack) {
      const im = el('img') as HTMLImageElement;
      im.src = iconUrl(this.game, this.trashStack.id);
      im.draggable = false;
      this.trashEl.appendChild(im);
      if (this.trashStack.stack > 1) {
        this.trashEl.appendChild(el('span', 'cnt', String(this.trashStack.stack)));
      }
    }
  }

  trashEl: HTMLElement | null = null;

  private buildInventoryPanel() {
    this.invPanel = el('div', 'sw-panel');
    this.invPanel.style.cssText = 'position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); display:none; max-height:88vh; overflow:auto;';
    this.invPanel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Inventory')));

    // 主体：左纸娃娃列（装备/时装/垃圾桶/配饰/金钱） + 右背包 10×4
    const body = el('div');
    body.style.cssText = 'display:flex; gap:14px; margin-bottom:8px;';
    const left = el('div');
    left.style.cssText = 'width:152px; flex:none;';
    const equipRow = (label: string, from: number, n: number, cols = 3) => {
      const wrap = el('div');
      wrap.appendChild(el('div', 'sw-lbl', label));
      const row = el('div');
      row.style.cssText = `display:grid; grid-template-columns:repeat(${cols},44px); gap:4px; margin-bottom:6px;`;
      for (let k = 0; k < n; k++) row.appendChild(this.makeSlotEl(from + k, 'inv'));
      wrap.appendChild(row);
      return wrap;
    };
    left.appendChild(equipRow(Lang.text('Mods.SandboxWorld.UI.Equipment'), ARMOR_START, 3));
    left.appendChild(equipRow(Lang.text('Mods.SandboxWorld.UI.Vanity'), VANITY_START, 3));
    // 垃圾桶（暂存，关闭背包时才真正删除；可交换取回）
    left.appendChild(el('div', 'sw-lbl', Lang.text('LegacyInterface.3')));
    const trash = el('div', 'sw-slot trash sw-trash');
    trash.style.cssText = 'width:44px; height:44px; flex:none;';
    trash.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.heldStack) {
        this.placeTrash();
      } else if (this.trashStack) {
        this.heldStack = this.trashStack; // 取回
        this.trashStack = null;
        this.paintTrash();
      }
      this.refreshAll();
    });
    this.trashEl = trash;
    left.appendChild(trash);
    left.appendChild(equipRow(Lang.text('Mods.SandboxWorld.UI.Accessories'), ACCESSORY_START, 5)); // 3 列自动换行
    left.appendChild(equipRow(Lang.text('Mods.SandboxWorld.UI.Coins'), COIN_START, 3));
    body.appendChild(left);

    // 背包 10×4（10-39）
    const right = el('div');
    right.appendChild(el('div', 'sw-lbl', Lang.text('Mods.SandboxWorld.UI.InvLabel')));
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(10,48px); gap:4px;';
    for (let i = 10; i < ACCESSORY_START; i++) {
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
    this.craftListEl = el('div');
    this.craftListEl.style.cssText = 'max-height:240px; overflow-y:auto; width:520px;';
    this.invPanel.appendChild(this.craftListEl);
    this.root.appendChild(this.invPanel);
  }

  /** Buff 状态栏（对齐原版 DrawInterface_Resources_Buffs，Main.cs:42618-42640）：
   *  起点 (32,76)、每行 11 个（横距 38px）、行距 50px、裸 32×32 图标无背景板、
   *  剩余时长文字在图标下方（ItemStack 字号 0.8 倍）、悬停高亮、右键取消
   *  （TryRemovingBuff：非 debuff 播 SoundID 12=menuTick）、背包打开时隐藏 */
  private buildBuffBar() {
    this.buffBar = el('div');
    // 32 + 10×38 宽容纳 11 个/行（wrap = 原版 num2=11 行卷绕，行距 50-32=18）
    this.buffBar.style.cssText = 'pointer-events:auto; position:fixed; top:76px; left:32px; display:flex; flex-wrap:wrap; width:412px; column-gap:6px; row-gap:18px;';
    this.root.appendChild(this.buffBar);
    this.buffBlocks.clear();
    for (const t of [BuffType.Agility, BuffType.Ironskin, BuffType.Resistance, BuffType.Thorns, BuffType.Regen, BuffType.Honey]) {
      const block = el('div', 'sw-buff');
      block.style.display = 'none';
      block.style.cssText += 'width:32px; height:32px; background:none; border:none; border-radius:0; cursor:pointer;';
      const icon = el('img') as HTMLImageElement;
      icon.draggable = false;
      icon.style.cssText = 'width:32px; height:32px; image-rendering:pixelated; display:block;';
      block.appendChild(icon);
      const time = el('span', '', '');
      time.style.cssText = 'position:absolute; left:-4px; right:-4px; top:34px; text-align:center; font-size:11px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000; white-space:nowrap;';
      block.appendChild(time);
      // 悬停高亮（原版 buffAlpha 悬停 +0.1/t 至 1、离开 -0.05/t 至 0.4——CSS 渐变近似）
      block.addEventListener('mouseenter', () => { icon.style.filter = 'brightness(1.35)'; });
      block.addEventListener('mouseleave', () => { icon.style.filter = ''; });
      // 右键取消（TryRemovingBuff L42793+：非 debuff → DelBuff + SoundID 12）
      block.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!this.game) return;
        this.game.player.buffs.remove(t);
        this.game.sfx.play('menuTick');
        this.refreshBuffs();
      });
      this.buffBar.appendChild(block);
      this.buffBlocks.set(t, { block, icon, time });
    }
  }

  buffBar: HTMLElement | null = null;
  buffBlocks = new Map<BuffType, { block: HTMLElement; icon: HTMLImageElement; time: HTMLElement }>();

  /** 每秒左右调用一次（由 Game 经 callbacks 驱动）。
   *  原版行为（Main.cs:42622）：背包/华美 UI 打开时整栏不画；时长文字用
   *  LocalizedDuration 缩写格式（zh-Hans "30秒"/"2分30秒"），仅剩 >2 tick 时显示 */
  refreshBuffs() {
    if (!this.game || !this.buffBar) return;
    const buffs = this.game.player.buffs;
    const invOpen = this.invPanel.style.display === 'block';
    this.buffBar.style.display = invOpen ? 'none' : 'flex';
    for (const [t, ui] of this.buffBlocks) {
      const left = buffs.active.get(t);
      if (left === undefined) {
        ui.block.style.display = 'none';
        continue;
      }
      ui.block.style.display = 'flex';
      ui.block.title = `${buffName(t)}：${buffDesc(t)}`;
      const iconId = this.buffIconItem.get(t);
      if (iconId && !ui.icon.src) ui.icon.src = iconUrl(this.game, iconId);
      const s = Math.ceil(left);
      ui.time.textContent = s >= 60
        ? (s % 60
          ? Lang.text('Mods.SandboxWorld.Time.MinSec', Math.floor(s / 60), s % 60)
          : Lang.text('Mods.SandboxWorld.Time.Minutes', Math.floor(s / 60)))
        : Lang.text('Mods.SandboxWorld.Time.Seconds', s);
    }
  }

  // Buff → 显示用物品图标（药水图标即 Buff 图标）
  buffIconItem = new Map<BuffType, number>();

  private buildChestPanel() {
    this.chestPanel = el('div', 'sw-panel');
    this.chestPanel.style.cssText = 'position:fixed; left:50%; top:16%; transform:translateX(-50%); display:none;';
    this.chestPanel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Chest')));
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(5,48px); gap:5px;';
    for (let i = 0; i < 10; i++) {
      grid.appendChild(this.makeSlotEl(i, 'chest'));
    }
    this.chestPanel.appendChild(grid);
    this.root.appendChild(this.chestPanel);
  }

  private openChestPanel(c: ChestData) {
    this.openChest = c;
    this.chestPanel.style.display = 'block';
    this.openInventory();
    this.refreshAll();
  }

  closeChest() {
    this.openChest = null;
    this.chestPanel.style.display = 'none';
  }

  // ============ 刷新 ============

  refreshHotbar() {
    if (!this.game) return;
    const inv = this.game.player.inv;
    for (let i = 0; i < 10; i++) {
      const slotEl = this.slotEl(i, 'inv');
      if (!slotEl) continue;
      this.paintSlot(slotEl, inv.slots[i]);
      slotEl.classList.toggle('sel', i === inv.selected);
    }
  }

  private paintSlot(slotEl: HTMLElement, content: { id: number; stack: number } | null) {
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
  }

  refreshAll() {
    if (!this.game) return;
    this.moveGhost();
    this.paintTrash();
    this.refreshHotbar();
    const inv = this.game.player.inv;
    for (let i = 10; i < INV_SIZE; i++) {
      const slotEl = this.slotEl(i, 'inv');
      if (slotEl) this.paintSlot(slotEl, inv.slots[i]);
    }
    this.refreshBuffs();
    if (this.openChest) {
      for (let i = 0; i < 10; i++) {
        const slotEl = this.slotEl(i, 'chest');
        if (slotEl) this.paintSlot(slotEl, this.openChest.items[i]);
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
    for (const r of RECIPES) {
      if (!stations.has(r.station)) continue;
      const ok = game.canCraft(r);
      const row = el('div', 'sw-recipe' + (ok ? '' : ' no'));
      const outDef = ITEM_DEFS[game.itemId(r.out)];
      const img = el('img') as HTMLImageElement;
      img.src = iconUrl(game, game.itemId(r.out));
      row.appendChild(img);
      const label = el('span', '', `${Lang.itemNameByKey(outDef.key)}${r.count > 1 ? ` ×${r.count}` : ''}`);
      row.appendChild(label);
      const mats = el('span', '', r.inputs.map(([k, n]) => {
        const have = game.player.inv.countOf(game.itemId(k));
        return ` ${Lang.itemNameByKey(ITEM_DEFS[game.itemId(k)].key)} ${have}/${n}`;
      }).join(' ·'));
      mats.style.cssText = 'margin-left:auto; color:#9a8ab8; font-size:11px; text-align:right;';
      row.appendChild(mats);
      if (ok) {
        row.onclick = () => {
          game.craft(r);
          this.refreshAll();
        };
      }
      this.craftListEl.appendChild(row);
    }
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

  showPause(handlers: { onResume: () => void; onSave: () => void; onQuit: () => void; onSettings?: () => void }) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:280px;';
    panel.appendChild(el('div', 'sw-title', Lang.text('Mods.SandboxWorld.UI.Paused')));
    const bRes = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.Resume'));
    bRes.onclick = () => { panel.remove(); handlers.onResume(); };
    const bSave = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.SaveGame'));
    bSave.onclick = () => handlers.onSave();
    const bSet = el('button', 'sw-btn', Lang.text('LegacyMenu.14'));
    bSet.onclick = () => handlers.onSettings?.();
    const bQuit = el('button', 'sw-btn', Lang.text('Mods.SandboxWorld.UI.BackToMenu'));
    bQuit.onclick = () => { panel.remove(); handlers.onQuit(); };
    panel.append(bRes, bSave, bSet, bQuit);
    this.root.appendChild(panel);
    return panel;
  }

  closeAll() {
    this.root.innerHTML = '';
    this.heldStack = null;
    this.openChest = null;
  }

  /** 初始化 HUD 相关面板（进入游戏后调用一次） */
  initInGame() {
    this.buildInventoryPanel();
    this.buildChestPanel();
    this.buildBuffBar();
    this.buildHud(this.game);
    // Buff → 图标物品映射
    const map: Array<[BuffType, string]> = [
      [BuffType.Agility, 'agility_potion'], [BuffType.Ironskin, 'ironskin_potion'],
      [BuffType.Resistance, 'heal_potion'], [BuffType.Thorns, 'thorns_potion'],
      [BuffType.Regen, 'regen_potion'], [BuffType.Honey, 'honey_bucket'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);
  }

  /** M5：背包/快捷栏已 Canvas 化，DOM 仅保留 Buff 栏 + Toast */
  initInGameLite() {
    this.buildBuffBar();
    const map: Array<[BuffType, string]> = [
      [BuffType.Agility, 'agility_potion'], [BuffType.Ironskin, 'ironskin_potion'],
      [BuffType.Resistance, 'heal_potion'], [BuffType.Thorns, 'thorns_potion'],
      [BuffType.Regen, 'regen_potion'], [BuffType.Honey, 'honey_bucket'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);
  }
}
