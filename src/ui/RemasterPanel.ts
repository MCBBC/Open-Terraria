// 素材包管理面板(BestiaryPanel DOM 模式;标题菜单「素材包」入口)。
// 局部覆盖热补丁的安装/启停/卸载界面——工作台(public/remaster.html)导出的
// zip 在此导入,导入即应用(RemasterRuntime 注入 vimages/uiimages/弹幕/Buff +
// tile/wall 消费登记重烘)。不改原版素材文件,卸载即回原版。
import { Lang } from '../i18n/Lang';
import type { RemasterManager } from '../remaster/RemasterManager';

const CSS = `
.sw-rmp { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center;
  justify-content: center; background: rgba(4,6,14,.82);
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif; }
.sw-rmp .panel { width: min(620px, 92vw); max-height: 80vh; overflow-y: auto; color: #e8ecf8;
  background: #241a4e; border: 2px solid #7d92d6; box-shadow: 0 0 0 2px #0a0e1e;
  padding: 22px 26px 18px; }
.sw-rmp h2 { margin: 0 0 6px; font-size: 18px; letter-spacing: 3px; color: #ffd76e;
  text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000; }
.sw-rmp .sub { font-size: 12px; color: #9fb0e0; margin-bottom: 14px; }
.sw-rmp .row { display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border: 1px solid #3a2f5e; background: #1a1440; margin-bottom: 8px; }
.sw-rmp .row .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sw-rmp .row .meta { font-size: 11px; color: #9fb0e0; }
.sw-rmp .row.off { opacity: .55; }
.sw-rmp button { padding: 5px 12px; border-radius: 3px; border: 1px solid #7d92d6;
  background: #3a2a5a; color: #fff; cursor: pointer; font-family: inherit; font-size: 12px; }
.sw-rmp button:hover { background: #4a3a7a; }
.sw-rmp .empty { color: #9fb0e0; font-size: 13px; padding: 18px 0; text-align: center;
  white-space: pre-line; }
.sw-rmp .bar { display: flex; gap: 10px; margin-top: 12px; justify-content: flex-end; }
.sw-rmp .busy { color: #ffd76e; font-size: 12px; margin-right: auto; }
.sw-rmp input[type=checkbox] { accent-color: #ffd76e; }
`;

let styleEl: HTMLStyleElement | null = null;
function ensureStyle(): void {
  if (styleEl || typeof document === 'undefined') return;
  styleEl = document.createElement('style');
  styleEl.id = 'sw-rmp-style';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

export class RemasterPanel {
  private root: HTMLElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private parent: HTMLElement,
    private manager: RemasterManager,
    private cb: { onToast?: (msg: string) => void; onClose?: () => void } = {},
  ) {}

  /** 打开(幂等:已开则刷新)。 */
  async open(): Promise<void> {
    if (document.querySelector('.sw-rmp')) { await this.refresh(); return; }
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'sw-rmp';
    root.innerHTML = `
      <div class="panel">
        <h2>${Lang.text('Mods.SandboxWorld.Remaster.Title')}</h2>
        <div class="sub">${Lang.text('Mods.SandboxWorld.Remaster.Sub')}</div>
        <div class="list"></div>
        <div class="bar">
          <span class="busy"></span>
          <button class="import">${Lang.text('Mods.SandboxWorld.Remaster.Import')}</button>
          <button class="close">${Lang.text('Mods.SandboxWorld.Remaster.Close')}</button>
        </div>
      </div>`;
    this.parent.appendChild(root);
    this.root = root;
    // 点击遮罩关闭(面板内点击不冒泡)
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    root.querySelector('.close')!.addEventListener('click', () => this.close());
    root.querySelector('.import')!.addEventListener('click', () => this.pickZip());
    // Esc 关闭(capture 拦截,防暂停链二次消费——BestiaryPanel 惯例)
    this.onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); this.close(); }
    };
    window.addEventListener('keydown', this.onKey, true);
    await this.refresh();
  }

  close(): void {
    if (this.onKey) { window.removeEventListener('keydown', this.onKey, true); this.onKey = null; }
    this.root?.remove();
    this.root = null;
    this.cb.onClose?.();
  }

  private async refresh(): Promise<void> {
    const list = this.root?.querySelector('.list');
    if (!list) return;
    const installed = await this.manager.list();
    list.replaceChildren();
    if (!installed.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = Lang.text('Mods.SandboxWorld.Remaster.Empty');
      list.appendChild(empty);
      return;
    }
    for (const m of installed) {
      const row = document.createElement('div');
      row.className = 'row' + (m.enabled ? '' : ' off');
      const lb = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = m.enabled;
      cb.addEventListener('change', async () => {
        this.busy(Lang.text('Mods.SandboxWorld.Remaster.Applying'));
        await this.manager.setEnabled(m.id, cb.checked);
        this.busy('');
        await this.refresh();
        this.cb.onToast?.(Lang.text('Mods.SandboxWorld.Remaster.Toggled', m.name));
      });
      lb.appendChild(cb);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.innerHTML = `<div>${m.name}</div><div class="meta">${Lang.text('Mods.SandboxWorld.Remaster.InstalledAt', new Date(m.addedAt).toLocaleString())}</div>`;
      const del = document.createElement('button');
      del.textContent = Lang.text('Mods.SandboxWorld.Remaster.Uninstall');
      del.addEventListener('click', async () => {
        this.busy(Lang.text('Mods.SandboxWorld.Remaster.Applying'));
        await this.manager.remove(m.id);
        this.busy('');
        await this.refresh();
        this.cb.onToast?.(Lang.text('Mods.SandboxWorld.Remaster.Uninstalled', m.name));
      });
      row.append(lb, nm, del);
      list.appendChild(row);
    }
  }

  private busy(msg: string): void {
    const el = this.root?.querySelector('.busy') as HTMLElement | null;
    if (el) el.textContent = msg;
  }

  private pickZip(): void {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.zip';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      this.busy(Lang.text('Mods.SandboxWorld.Remaster.Importing'));
      try {
        const r = await this.manager.importZip(f);
        this.busy('');
        const n = r.apply.applied.length;
        this.cb.onToast?.(Lang.text('Mods.SandboxWorld.Remaster.Imported', r.meta.name, n));
        if (r.versionMismatch) this.cb.onToast?.(Lang.text('Mods.SandboxWorld.Remaster.VersionMismatch'));
        await this.refresh();
      } catch (err) {
        this.busy('');
        this.cb.onToast?.(Lang.text('Mods.SandboxWorld.Remaster.ImportFailed', (err as Error).message));
      }
    };
    inp.click();
  }
}

/** 单例挂载(标题菜单入口调用;manager 由 main.ts 创建)。 */
let panel: RemasterPanel | null = null;
let panelMgr: RemasterManager | null = null;
export function openRemasterPanel(parent: HTMLElement, manager: RemasterManager, cb?: { onToast?: (msg: string) => void }): void {
  if (!panel || panelMgr !== manager) {
    panel = new RemasterPanel(parent, manager, cb);
    panelMgr = manager;
  }
  void panel.open();
}
