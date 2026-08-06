// DOM overlay UI：主菜单 / HUD 快捷栏 / 背包+配饰栏 / 合成 / 宝箱 / Buff栏 / 暂停 / Tooltip / Toast
import type { Game } from '../core/Game';
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { RECIPES } from '../data/recipes';
import { atlasIconForKey } from '../assets/SpriteAtlas';
import { BuffType, BUFF_DEFS } from '../stats/Buffs';
import { ACCESSORY_START, INV_SIZE, isAccessoryItem, isAccessorySlot as isAccessorySlotIdx } from '../items/Inventory';
import type { ChestData } from '../world/World';

const iconCache = new Map<number, string>();
function iconUrl(game: Game, id: number): string {
  let url = iconCache.get(id);
  if (!url) {
    // 优先 Maples 素材图标（合成 32×32 dataURL）
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
    }
    const c = game.assets.itemIcons.get(id);
    url = c ? c.toDataURL() : '';
    iconCache.set(id, url);
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
.sw-panel { pointer-events:auto; background:rgba(20,16,28,0.92); border:2px solid #5a4a7a;
  border-radius:8px; color:#e8e4f0; padding:12px; box-shadow:0 4px 24px rgba(0,0,0,0.6); }
.sw-btn { pointer-events:auto; display:block; width:100%; margin:6px 0; padding:10px 16px;
  background:linear-gradient(#4a3a6a,#3a2a5a); color:#fff; border:1px solid #6a5a8a;
  border-radius:6px; cursor:pointer; font-size:15px; text-align:center; }
.sw-btn:hover { background:linear-gradient(#5a4a7e,#4a3a6e); }
.sw-btn:disabled { opacity:0.45; cursor:default; }
.sw-slot { pointer-events:auto; width:44px; height:44px; background:rgba(60,50,80,0.85);
  border:2px solid #6a5a8a; border-radius:4px; position:relative; cursor:pointer; }
.sw-slot:hover { border-color:#c8b8e8; }
.sw-slot.sel { border-color:#ffd75a; box-shadow:0 0 8px rgba(255,215,90,0.5); }
.sw-slot img { position:absolute; inset:4px; width:36px; height:36px; image-rendering:pixelated; }
.sw-slot .cnt { position:absolute; right:3px; bottom:1px; font-size:12px; font-weight:bold; color:#fff;
  text-shadow:1px 1px 0 #000; }
.sw-title { font-size:17px; font-weight:bold; margin-bottom:8px; color:#ffe8a0; }
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
    for (const [label, w, h] of [['小世界 1200×400', 1200, 400], ['中世界 2100×700', 2100, 700], ['大世界 4200×1200', 4200, 1200]] as const) {
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
    // 快捷栏
    this.hotbarEl = el('div');
    this.hotbarEl.style.cssText = 'pointer-events:auto; position:fixed; bottom:12px; left:50%; transform:translateX(-50%); display:flex; gap:5px;';
    for (let i = 0; i < 10; i++) {
      this.hotbarEl.appendChild(this.makeSlotEl(i, 'inv'));
    }
    this.root.appendChild(this.hotbarEl);
    this.refreshHotbar();

    // Tooltip
    this.tooltip = el('div', 'sw-tooltip');
    this.tooltip.style.display = 'none';
    this.root.appendChild(this.tooltip);

    // 背包入口按钮（#12）
    const bag = el('button', 'sw-btn', '🎒 背包 (E)');
    bag.style.cssText = 'pointer-events:auto; position:fixed; right:14px; bottom:14px; width:auto; margin:0; font-size:14px; z-index:11;';
    bag.onclick = (ev) => {
      ev.stopPropagation();
      if (this.invPanel.style.display === 'block') this.closeInventory();
      else this.openInventory();
    };
    this.root.appendChild(bag);

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
      this.onSlotClick(i, where, e.button === 2);
    });
    s.addEventListener('mouseenter', () => this.showTooltipFor(i, where));
    s.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    return s;
  }

  private slotContent(where: 'inv' | 'chest', i: number): { id: number; stack: number } | null {
    if (where === 'inv') return this.game.player.inv.slots[i];
    return this.openChest?.items[i] ?? null;
  }

  /** 拾取物品时光标换成物品图（放下还原） */
  private updateCursor() {
    if (this.heldStack) {
      const url = iconUrl(this.game, this.heldStack.id);
      if (url) {
        document.body.style.cursor = `url("${url}") 16 16, auto`;
        return;
      }
    }
    document.body.style.cursor = '';
  }

  private onSlotClick(i: number, where: 'inv' | 'chest', rightClick: boolean) {
    const game = this.game;
    if (where === 'inv') {
      const inv = game.player.inv;
      if (this.openChest && this.heldStack === null) {
        // 背包打开且开着宝箱：shift 不做，直接点击拿放
      }
      if (this.heldStack) {
        // 放下（配饰位校验：只有配饰能进）
        if (isAccessorySlotIdx(i) && !isAccessoryItem(this.heldStack.id)) {
          this.refreshAll();
          return;
        }
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
        } else {
          inv.slots[i] = this.heldStack;
          this.heldStack = cur;
        }
        this.refreshAll();
        return;
      }
      if (rightClick) {
        // 右键：拆半到手上 / 放回一个
        const cur = inv.slots[i];
        if (cur) {
          this.heldStack = { id: cur.id, stack: Math.ceil(cur.stack / 2) };
          cur.stack -= this.heldStack.stack;
          if (cur.stack <= 0) inv.slots[i] = null;
        }
        this.refreshAll();
        return;
      }
      if (!this.invPanel.style.display || this.invPanel.style.display === 'none') {
        inv.selected = i;
        this.refreshHotbar();
      } else {
        const cur = inv.slots[i];
        if (cur) {
          this.heldStack = cur;
          inv.slots[i] = null;
        }
        this.refreshAll();
      }
      return;
    }
    // chest
    const chest = this.openChest;
    if (!chest) return;
    if (this.heldStack) {
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
    } else {
      const cur = chest.items[i];
      if (cur) {
        chest.items[i] = null;
        this.heldStack = cur;
      }
    }
    this.refreshAll();
  }

  private showTooltipFor(i: number, where: 'inv' | 'chest') {
    const s = this.slotContent(where, i);
    if (!s) { this.tooltip.style.display = 'none'; return; }
    const def = ITEM_DEFS[s.id];
    let html = `<b style="color:#ffe8a0">${def.name}</b> ×${s.stack}`;
    if (def.tool?.damage) html += `<br>伤害 ${def.tool.damage}`;
    if (def.tool?.power && def.tool.type !== 'sword') html += `<br>${def.tool.type === 'pick' ? '镐力' : '斧力'} ${def.tool.power}`;
    if (def.heal) html += `<br>回复 ${def.heal} 生命`;
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
    this.game.input.uiBlocking = false;
  }

  private buildInventoryPanel() {
    this.invPanel = el('div', 'sw-panel');
    this.invPanel.style.cssText = 'position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); display:none; max-height:88vh; overflow:auto;';
    this.invPanel.appendChild(el('div', 'sw-title', '背包'));
    const grid = el('div');
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(5,48px); gap:5px; margin-bottom:8px;';
    for (let i = 10; i < ACCESSORY_START; i++) {
      grid.appendChild(this.makeSlotEl(i, 'inv'));
    }
    this.invPanel.appendChild(grid);
    // 配饰栏（40-44，只有配饰可放入）
    this.invPanel.appendChild(el('div', 'sw-title', '配饰'));
    const acc = el('div');
    acc.style.cssText = 'display:flex; gap:5px; margin-bottom:10px;';
    for (let i = ACCESSORY_START; i < INV_SIZE; i++) {
      acc.appendChild(this.makeSlotEl(i, 'inv'));
    }
    this.invPanel.appendChild(acc);
    // 合成区
    this.invPanel.appendChild(el('div', 'sw-title', '合成'));
    const stations = el('div', '', '');
    stations.style.cssText = 'font-size:12px; color:#8ad0a0; margin-bottom:6px;';
    stations.dataset.role = 'stations';
    this.invPanel.appendChild(stations);
    this.craftListEl = el('div');
    this.craftListEl.style.cssText = 'max-height:260px; overflow-y:auto; width:340px;';
    this.invPanel.appendChild(this.craftListEl);
    this.root.appendChild(this.invPanel);
  }

  /** Buff 状态栏（常驻格 + 秒级倒计时，移植自 Maples BuffBar） */
  private buildBuffBar() {
    this.buffBar = el('div');
    this.buffBar.style.cssText = 'pointer-events:auto; position:fixed; top:44px; left:14px; display:flex; gap:4px;';
    this.root.appendChild(this.buffBar);
    this.buffBlocks.clear();
    for (const t of [BuffType.Agility, BuffType.Ironskin, BuffType.Resistance, BuffType.Thorns, BuffType.Regen]) {
      const block = el('div', 'sw-buff');
      block.style.display = 'none';
      const icon = el('img') as HTMLImageElement;
      icon.draggable = false;
      icon.style.cssText = 'width:28px; height:28px; image-rendering:pixelated;';
      block.appendChild(icon);
      const time = el('span', '', '');
      time.style.cssText = 'position:absolute; right:2px; bottom:0; font-size:11px; font-weight:bold; color:#fff; text-shadow:1px 1px 0 #000;';
      block.appendChild(time);
      this.buffBar.appendChild(block);
      this.buffBlocks.set(t, { block, icon, time });
    }
  }

  buffBar: HTMLElement | null = null;
  buffBlocks = new Map<BuffType, { block: HTMLElement; icon: HTMLImageElement; time: HTMLElement }>();

  /** 每秒左右调用一次（由 Game 经 callbacks 驱动） */
  refreshBuffs() {
    if (!this.game || !this.buffBar) return;
    const buffs = this.game.player.buffs;
    for (const [t, ui] of this.buffBlocks) {
      const left = buffs.active.get(t);
      if (left === undefined) {
        ui.block.style.display = 'none';
        continue;
      }
      ui.block.style.display = 'flex';
      ui.block.title = `${BUFF_DEFS[t].name}：${BUFF_DEFS[t].desc}`;
      const iconId = this.buffIconItem.get(t);
      if (iconId && !ui.icon.src) ui.icon.src = iconUrl(this.game, iconId);
      const s = Math.ceil(left);
      ui.time.textContent = s >= 60 ? `${Math.floor(s / 60)}m${s % 60}` : String(s);
    }
  }

  // Buff → 显示用物品图标（药水图标即 Buff 图标）
  buffIconItem = new Map<BuffType, number>();

  private buildChestPanel() {
    this.chestPanel = el('div', 'sw-panel');
    this.chestPanel.style.cssText = 'position:fixed; left:50%; top:16%; transform:translateX(-50%); display:none;';
    this.chestPanel.appendChild(el('div', 'sw-title', '宝箱'));
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
    this.updateCursor();
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
      stationsEl.textContent = `可用合成站：${[...stations].map((s) => ({ hand: '徒手', workbench: '🛠 工作台', furnace: '🔥 熔炉', anvil: '⚒ 铁砧' } as Record<string, string>)[s] ?? s).join('、')}`;
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
      const label = el('span', '', `${outDef.name}${r.count > 1 ? ` ×${r.count}` : ''}`);
      row.appendChild(label);
      const mats = el('span', '', r.inputs.map(([k, n]) => {
        const have = game.player.inv.countOf(game.itemId(k));
        return ` ${ITEM_DEFS[game.itemId(k)].name} ${have}/${n}`;
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

  showPause(handlers: { onResume: () => void; onSave: () => void; onQuit: () => void }) {
    const panel = el('div', 'sw-panel');
    panel.style.cssText = 'pointer-events:auto; position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:280px;';
    panel.appendChild(el('div', 'sw-title', '已暂停'));
    const bRes = el('button', 'sw-btn', '继续游戏');
    bRes.onclick = () => { panel.remove(); handlers.onResume(); };
    const bSave = el('button', 'sw-btn', '保存存档');
    bSave.onclick = () => handlers.onSave();
    const bQuit = el('button', 'sw-btn', '回到主菜单');
    bQuit.onclick = () => { panel.remove(); handlers.onQuit(); };
    panel.append(bRes, bSave, bQuit);
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
      [BuffType.Regen, 'regen_potion'],
    ];
    for (const [t, key] of map) this.buffIconItem.set(t, ITEM_BY_KEY[key]);
  }
}
