// Journey 研究献祭面板（CreativePowers ItemSacrifices 的 DOM 近似入口）。
// 原版语义：仅旅程角色开放（Main.gameModeInfo / JourneyMode UI）；研究面板按物品
// 列出 have/need，点献祭累计（ItemsSacrificedUnlocksTracker.RegisterItemSacrifice
// :115-143 幂等早退+钳 9999）。本面板列出背包内物品 + 全局进度（event 45 半数门由
// Research.checkResearchAchievement 消费）。
// 偏差登记：原版是背包内每物品的研究按钮（CreativeUIState UISacrificeDialog /
// ItemSacrificesUITab），此处为整包列表近似——献祭语义与计数 1:1，布局近似。
import type { Game } from '../core/Game';
import { Lang } from '../i18n/Lang';
import { ITEM_DEFS } from '../data/items';

/** 内部 item id → 原版 id（UI 侧轻量版 = Shimmer.vanillaIdOfItem 的 vid/键前缀链） */
function vidOf(id: number): number {
  const d = ITEM_DEFS[id];
  if (!d) return -1;
  if (d.vid != null) return d.vid;
  const m = /^vi_(\d+)_/.exec(d.key);
  return m ? +m[1] : -1;
}

const CSS = `
.sw-res-panel { pointer-events:auto; position:fixed; left:50%; top:50%;
  transform:translate(-50%,-50%); width:min(420px, 90vw); max-height:80vh;
  background:rgba(33,43,79,0.9); border:2px solid #7d92d6; border-radius:6px;
  color:#e8ecf8; padding:12px; display:flex; flex-direction:column;
  box-shadow:0 0 0 2px rgba(10,14,30,0.8), 0 6px 28px rgba(0,0,0,0.65);
  font-size:13px; z-index:130; }
.sw-res-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.sw-res-head .sw-title { flex:1; margin-bottom:0; font-size:15px; }
.sw-res-prog { font-size:12px; color:#9fb0dd; margin-bottom:6px; }
.sw-res-list { overflow-y:auto; display:flex; flex-direction:column; gap:3px; }
.sw-res-row { display:flex; align-items:center; gap:8px; padding:4px 6px;
  background:rgba(20,26,52,0.55); border-radius:4px; }
.sw-res-row.done { border-left:3px solid #8de08d; }
.sw-res-row .nm { flex:1; min-width:0; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; }
.sw-res-row .bar { width:90px; height:8px; background:#1a1f3a; border-radius:4px;
  border:1px solid #444c7a; overflow:hidden; flex:none; }
.sw-res-row .bar .fill { height:100%; background:linear-gradient(90deg,#6a8ae0,#8ad0e0); }
.sw-res-row .num { font-size:11px; color:#9fb0dd; width:64px; text-align:right; flex:none; }
.sw-res-row button { flex:none; margin:0; padding:3px 10px; width:auto; font-size:12px;
  background:linear-gradient(#4a3a6a,#3a2a5a); color:#fff; border:1px solid #6a5a8a;
  border-radius:4px; cursor:pointer; }
`;

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

let panel: HTMLElement | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function openResearchPanel(game: Game): void {
  ensureCss();
  if (panel) { closeResearchPanel(); return; }
  const r = game.research;
  const inv = game.player.inv;

  panel = el('div', 'sw-res-panel');
  const head = el('div', 'sw-res-head');
  head.appendChild(el('div', 'sw-title', Lang.text('LegacyInterface.112') !== 'LegacyInterface.112'
    ? Lang.text('LegacyInterface.112') : '研究'));   // Journey UI 研究
  const closeBtn = el('button', 'sw-btn', '✕');
  closeBtn.style.cssText = 'margin:0; padding:4px 10px; width:auto; font-size:12px; flex:none;';
  closeBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); closeResearchPanel(); });
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const prog = el('div', 'sw-res-prog');
  panel.appendChild(prog);
  const list = el('div', 'sw-res-list');
  panel.appendChild(list);

  const render = () => {
    // 全局进度（CountFullyResearchedItems）
    const done = r.completedCount();
    const total = r.totalItems();
    prog.textContent = `${Lang.text('Mods.SandboxWorld.Research.Progress')} ${done} / ${total}`;
    list.textContent = '';
    // 背包内可研究物品（去重聚堆）
    const seen = new Map<number, number>();
    for (const s of inv.slots) {
      if (!s) continue;
      const vid = vidOf(s.id);
      if (vid <= 0 || !r.tryGetSacrificeNumbers(vid)) continue;
      seen.set(vid, (seen.get(vid) ?? 0) + s.stack);
    }
    if (!seen.size) {
      list.appendChild(el('div', '', Lang.text('Mods.SandboxWorld.Research.Empty')));
      return;
    }
    for (const [vid, stack] of seen) {
      const info = r.tryGetSacrificeNumbers(vid)!;
      const doneItem = info.have >= info.need;
      const row = el('div', 'sw-res-row' + (doneItem ? ' done' : ''));
      const nm = el('div', 'nm', Lang.itemName(vid) ?? `#${vid}`);
      row.appendChild(nm);
      const bar = el('div', 'bar');
      const fill = el('div', 'fill');
      fill.style.width = `${Math.min(100, Math.round((info.have / info.need) * 100))}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('div', 'num', doneItem ? '✓' : `${Math.min(info.have, info.need)}/${info.need}`));
      if (!doneItem) {
        // 背包按原版 id 扣除（Player.ConsumeItem 顺序扫描语义的 UI 侧等价）：
        // 从 slots 找到首个匹配 vid 的堆扣 1，返回是否成功
        const consumeOne = (): boolean => {
          for (let i = 0; i < inv.slots.length; i++) {
            const s = inv.slots[i];
            if (s && vidOf(s.id) === vid) {
              s.stack--;
              if (s.stack <= 0) inv.slots[i] = null;
              return true;
            }
          }
          return false;
        };
        const b1 = el('button', '', Lang.text('Mods.SandboxWorld.Research.Sacrifice'));
        b1.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          // RegisterItemSacrifice：扣 1 + 计数（幂等早退在内核侧）
          if (consumeOne()) {
            r.sacrifice(vid, 1);
            game.cb.onInventoryChanged?.();
          }
          render();
        });
        const bAll = el('button', '', Lang.text('Mods.SandboxWorld.Research.SacrificeAll'));
        bAll.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          let n = 0;
          while (n < stack && consumeOne()) { r.sacrifice(vid, 1); n++; }
          if (n > 0) game.cb.onInventoryChanged?.();
          render();
        });
        row.appendChild(b1);
        row.appendChild(bAll);
      }
      list.appendChild(row);
    }
  };
  render();

  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  (document.querySelector('.sw-root') ?? document.body).appendChild(panel);
  escHandler = (e) => { if (e.code === 'Escape') closeResearchPanel(); };
  window.addEventListener('keydown', escHandler);
  game.sfx.play('menuTick', 0.6);
}

export function closeResearchPanel(): void {
  panel?.remove();
  panel = null;
  if (escHandler) { window.removeEventListener('keydown', escHandler); escHandler = null; }
}
