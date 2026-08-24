// 世界存档列表（DOM 版 1:1 原版 UIWorldSelect/UIWorldListItem 结构）：
//  容器/标题/列表面板/底部双钮同 UICharacterSelect；行 = 图标位 + 信息 +
//  底缘图标钮 Play/Favorite/Copy + Delete 右下 + 悬停标签。
//  ★偏差登记：原版行内为世界缩略图标（UIWorldListItem._worldIcon，世界生成时
//  落盘的 map 快照）——本仓 WorldMeta 无图标数据，以名称/规格文本代替。
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

const BTN_SRC = (n: string): string => `sprites/vanilla-ui/${n}.png`;

export class WorldSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement, private store: WorldStore, private flow: WorldSelectFlow) {
    ensureStyle();
    this.panel = document.createElement('div');
    this.panel.className = 'sw-vsel';
    this.panel.innerHTML = `
      <div class="sw-vsel-title sw-vbtn">${Lang.text('UI.SelectWorld')}</div>
      <div class="sw-vsel-panel sw-vpanel"><div class="sw-vsel-list"></div></div>
      <div class="sw-vsel-footer">
        <button class="sw-vbtn" data-act="back">${Lang.text('UI.Back')}</button>
        <button class="sw-vbtn" data-act="new">${Lang.text('LegacyMenu.47')}</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-vsel-list')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    this.unsubLang = Lang.onChange(() => { void this.reload(); });
    parent.appendChild(this.panel);
    void this.reload();
  }

  private unsubLang: (() => void) | null = null;

  private iconBtn(parent: HTMLElement, src: string, label: string, fn: () => void): void {
    const img = document.createElement('img');
    img.src = BTN_SRC(src);
    img.title = label;
    img.addEventListener('mouseenter', () => { this.setLabel(label, false); });
    img.addEventListener('mouseleave', () => { this.setLabel('', false); });
    img.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    parent.appendChild(img);
  }

  private setLabel(text: string, del: boolean): void {
    const el = this.panel.querySelector(del ? '.sw-vitem-del-label' : '.sw-vitem-label');
    if (el) el.textContent = text;
  }

  async reload() {
    await this.store.ensureLoaded();
    this.body.innerHTML = '';
    const list = this.store.list();
    for (const meta of list) {
      const el = document.createElement('div');
      el.className = 'sw-vitem sw-vpanel-item noicon';
      const m = meta;
      // 信息块（名称 + 规格；★图标位缺数据——见头注偏差登记；布局=行绝对分区
      //  .sw-vitem-info,与角色行同构,按钮区在底缘不再压文本）
      const info = document.createElement('div');
      info.className = 'sw-vitem-info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = (meta.favorite ? '★ ' : '') + (meta.name || Lang.text('Mods.SandboxWorld.WorldSelect.Unnamed'));
      if (meta.favorite) name.style.color = '#ffe745';
      const sub = document.createElement('div');
      sub.className = 'sub';
      const mins = Math.floor(meta.playTimeMs / 60000);
      sub.textContent = `${SIZE_LABEL(meta)} · ${meta.w}×${meta.h} · ${DIFF_LABEL()[meta.difficulty] ?? '?'} · ${Lang.text('Mods.SandboxWorld.WorldSelect.PlayTimeMins', mins)}`;
      info.append(name, sub);
      // 底缘图标钮（Play/Favorite/Copy；Delete 右下——UIWorldListItem.cs:102-158）
      const btns = document.createElement('div');
      btns.className = 'sw-vitem-btns';
      this.iconBtn(btns, 'UI_ButtonPlay', Lang.text('UI.Play'), () => this.close(() => this.flow.onPlay(m)));
      this.iconBtn(btns, meta.favorite ? 'UI_ButtonFavoriteActive' : 'UI_ButtonFavoriteInactive',
        meta.favorite ? Lang.text('UI.Unfavorite') : Lang.text('UI.Favorite'), async () => {
          await this.store.setFavorite(m.id, !m.favorite);
          await this.reload();
        });
      this.iconBtn(btns, 'UI_CharCreation_Copy', Lang.text('Mods.SandboxWorld.WorldSelect.Copy'), async () => {
        await this.store.duplicate(m);
        await this.reload();
      });
      const del = document.createElement('div');
      del.className = 'sw-vitem-del';
      this.iconBtn(del, 'UI_ButtonDelete', Lang.text('UI.Delete'), async () => {
        if (!confirm(Lang.text('Mods.SandboxWorld.WorldSelect.ConfirmDelete', m.name))) return;
        await this.store.delete(m.id);
        await this.reload();
      });
      const label = document.createElement('div');
      label.className = 'sw-vitem-label';
      const delLabel = document.createElement('div');
      delLabel.className = 'sw-vitem-del-label';
      el.append(info, btns, del, label, delLabel);
      // 整行点击/双击 = 进入（图标钮已 stopPropagation）
      const enter = () => this.close(() => this.flow.onPlay(m));
      el.addEventListener('click', enter);
      el.addEventListener('dblclick', enter);
      this.body.appendChild(el);
    }
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'sw-vsel-empty';
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
