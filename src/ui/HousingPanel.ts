// 住房面板（原版背包房屋界面：DrawInterface_33_Housing 侧列 NPC 头像 + "?"查询器，
// Main.cs:44662-44688 点击世界 = PerformHousingCheck / TryMovingNPC）。
// DOM 版：背包内"住房"按钮开本面板；面板列出在场城镇 NPC（含已入住家坐标）+
// "查询"切换按钮；选中头像/查询器 → game.housingMode 激活，下一次世界点击由
// Game.updateUse 首拍拦截执行查询/分配（原版 mouseNPC 光标语义）；右键/Esc 取消。
import type { Game } from '../core/Game';
import type { TownNPC } from '../entities/TownNPC';
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';

export interface HousingEntry {
  key: string;
  name: string;
  vanillaId: number;
  home: { x: number; y: number } | null;
}

export class HousingPanel {
  readonly root: HTMLDivElement;
  private selected: { kind: 'query' } | { kind: 'assign'; npcKey: string } | null = null;
  private listEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private onCursor: (m: { kind: 'query' } | { kind: 'assign'; npcKey: string } | null) => void;
  private onClosed: () => void;

  constructor(
    game: Game,
    entries: HousingEntry[],
    onCursor: (m: { kind: 'query' } | { kind: 'assign'; npcKey: string } | null) => void,
    onClosed: () => void,
  ) {
    this.onCursor = onCursor;
    this.onClosed = onClosed;
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;right:16px;top:80px;width:240px;max-height:70vh;overflow:auto;'
      + 'background:rgba(28,24,38,0.94);border:2px solid #8a7ca8;border-radius:8px;'
      + 'padding:10px;z-index:60;font-size:13px;color:#e8e4f0;';
    this.root.className = 'sw-panel';   // Input 窗口级 mousedown 的 UI 过滤器认这个类
    const title = document.createElement('div');
    title.textContent = Lang.text('LegacyInterface.22');   // 原版房屋面板标题键
    title.style.cssText = 'font-weight:bold;margin-bottom:6px;color:#ffd070;';
    this.root.appendChild(title);

    // "?" 查询器（原版鼠标顶部放大镜房屋查询按钮）
    const qBtn = document.createElement('button');
    qBtn.textContent = Lang.text('Mods.SandboxWorld.Housing.Query');
    qBtn.style.cssText = 'margin:0 0 8px 0;padding:4px 10px;width:100%;';
    qBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.pick(this.selected?.kind === 'query' ? null : { kind: 'query' });
    });
    this.root.appendChild(qBtn);
    this.queryBtn = qBtn;

    this.listEl = document.createElement('div');
    this.root.appendChild(this.listEl);

    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText = 'margin-top:8px;color:#b8b0c8;font-size:12px;';
    this.root.appendChild(this.hintEl);

    const close = document.createElement('button');
    close.textContent = Lang.text('Mods.SandboxWorld.UI.Close');
    close.style.cssText = 'margin:8px 0 0 0;padding:4px 10px;width:100%;';
    close.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.destroy();
    });
    this.root.appendChild(close);

    // NPC 头像行
    for (const en of entries) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:4px 6px;margin:2px 0;'
        + 'border-radius:4px;cursor:pointer;background:rgba(255,255,255,0.04);';
      row.dataset.npc = en.key;
      const dot = document.createElement('div');
      dot.style.cssText =
        'width:22px;height:22px;flex:none;border-radius:3px;'
        + `background:${en.home ? '#5a9e5a' : '#9e5a5a'};text-align:center;line-height:22px;`
        + 'font-size:11px;color:#fff;';
      dot.textContent = en.name.slice(0, 1);
      row.appendChild(dot);
      const label = document.createElement('div');
      label.style.flex = '1';
      label.textContent = en.name;
      row.appendChild(label);
      const status = document.createElement('div');
      status.style.cssText = 'font-size:11px;color:#b8b0c8;';
      status.textContent = en.home ? `(${en.home.x}, ${en.home.y})` : Lang.text('Mods.SandboxWorld.Housing.Homeless');
      row.appendChild(status);
      row.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.pick(this.selected?.kind === 'assign' && this.selected.npcKey === en.key
          ? null : { kind: 'assign', npcKey: en.key });
      });
      this.listEl.appendChild(row);
    }
    this.updateHint();
    void game;
  }

  private queryBtn: HTMLButtonElement;

  private pick(m: { kind: 'query' } | { kind: 'assign'; npcKey: string } | null): void {
    this.selected = m;
    UISfx.sfx.play('menuTick', 0.8);
    this.onCursor(m);
    this.updateHint();
  }

  private updateHint(): void {
    this.queryBtn.style.outline = this.selected?.kind === 'query' ? '2px solid #ffd070' : 'none';
    for (const row of Array.from(this.listEl.children) as HTMLElement[]) {
      row.style.outline = this.selected?.kind === 'assign' && this.selected.npcKey === row.dataset.npc
        ? '2px solid #ffd070' : 'none';
    }
    this.hintEl.textContent = this.selected
      ? Lang.text(this.selected.kind === 'query'
        ? 'Mods.SandboxWorld.Housing.HintQuery' : 'Mods.SandboxWorld.Housing.HintAssign')
      : Lang.text('Mods.SandboxWorld.Housing.HintIdle');
  }

  /** 外部同步（Game 单发后置 null → 面板清除高亮并自我了断） */
  cursorChanged(m: { kind: 'query' } | { kind: 'assign'; npcKey: string } | null): void {
    if (!m) { this.destroy(); return; }
    this.selected = m;
    this.updateHint();
  }

  destroy(): void {
    this.onCursor(null);
    this.onClosed();
    this.root.remove();
  }

  /** 城镇 NPC 快照（UI 侧无 Game 类型耦合的入口） */
  static entriesOf(npcs: TownNPC[]): HousingEntry[] {
    return npcs
      .filter((n) => !n.dead && !n.bound)
      .map((n) => ({ key: n.npcKey, name: Lang.npcName(n.vanillaId) ?? n.npcKey, vanillaId: n.vanillaId, home: n.home ? { ...n.home } : null }));
  }
}
