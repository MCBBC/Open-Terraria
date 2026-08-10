// 世界存档列表（DOM 版，替代 VUI UIWorldSelectState）
import { WorldStore, type WorldMeta } from '../save/WorldStore';
import { ensureStyle } from './CharSelect';
import { Lang } from '../i18n/Lang';

export interface WorldSelectFlow {
  onPlay(meta: WorldMeta): void;
  onNew(): void;
  onBack(): void;
}

const SIZE_LABEL = (m: WorldMeta) => Lang.text(m.w >= 8400 ? 'UI.WorldSizeLarge' : m.w >= 6400 ? 'UI.WorldSizeMedium' : 'UI.WorldSizeSmall');
const DIFF_LABEL = () => [Lang.text('UI.Normal'), Lang.text('GameUI.Expert'), Lang.text('UI.Master'), Lang.text('UI.Creative')];

export class WorldSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement, private store: WorldStore, private flow: WorldSelectFlow) {
    ensureStyle();
    this.panel = document.createElement('div');
    this.panel.className = 'sw-list-panel';
    this.panel.innerHTML = `
      <div class="sw-list-title">${Lang.text('UI.SelectWorld')}</div>
      <div class="sw-list-body"></div>
      <div class="sw-list-footer">
        <button data-act="back">${Lang.text('Mods.SandboxWorld.WorldCreation.Back')}</button>
        <button data-act="new" class="primary">${Lang.text('LegacyMenu.47')}</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-list-body')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    this.unsubLang = Lang.onChange(() => { void this.reload(); });
    parent.appendChild(this.panel);
    void this.reload();
  }

  private unsubLang: (() => void) | null = null;

  async reload() {
    await this.store.ensureLoaded();
    this.body.innerHTML = '';
    const list = this.store.list();
    for (const meta of list) {
      const el = document.createElement('div');
      el.className = 'sw-item';
      const info = document.createElement('div');
      info.style.flex = '1';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = (meta.favorite ? '★ ' : '') + (meta.name || Lang.text('Mods.SandboxWorld.WorldSelect.Unnamed'));
      if (meta.favorite) name.style.color = '#ffd76e';
      const sub = document.createElement('div');
      sub.className = 'sub';
      const mins = Math.floor(meta.playTimeMs / 60000);
      sub.textContent = `${SIZE_LABEL(meta)} · ${meta.w}×${meta.h} · ${DIFF_LABEL()[meta.difficulty] ?? '?'} · ${Lang.text('Mods.SandboxWorld.WorldSelect.PlayTimeMins', mins)}`;
      info.append(name, sub);
      const ops = document.createElement('div');
      ops.className = 'ops';
      const mk = (label: string, primary: boolean, fn: () => void) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (primary) b.className = 'primary';
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        ops.appendChild(b);
      };
      const m = meta;
      mk(Lang.text('Mods.SandboxWorld.WorldSelect.Enter'), true, () => this.close(() => this.flow.onPlay(m)));
      mk(meta.favorite ? Lang.text('UI.Unfavorite') : Lang.text('UI.Favorite'), false, async () => {
        await this.store.setFavorite(m.id, !m.favorite);
        await this.reload();
      });
      mk(Lang.text('Mods.SandboxWorld.WorldSelect.Copy'), false, async () => { await this.store.duplicate(m); await this.reload(); });
      mk(Lang.text('UI.Delete'), false, async () => {
        if (!confirm(Lang.text('Mods.SandboxWorld.WorldSelect.ConfirmDelete', m.name))) return;
        await this.store.delete(m.id);
        await this.reload();
      });
      el.append(info, ops);
      // 整行点击/双击 = 进入（操作按钮已 stopPropagation）
      const enter = () => this.close(() => this.flow.onPlay(m));
      el.addEventListener('click', enter);
      el.addEventListener('dblclick', enter);
      this.body.appendChild(el);
    }
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'sw-list-empty';
      empty.textContent = Lang.text('Mods.SandboxWorld.WorldSelect.Empty');
      this.body.appendChild(empty);
    }
  }

  close(fn?: () => void) {
    this.unsubLang?.();
    this.panel.remove();
    fn?.();
  }
}
