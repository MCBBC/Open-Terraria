// 移植 UICharacterSelect.cs：中央角色列表 + 底部 新建/删除/重命名/复制/返回。
export interface CharacterSelectFlow {
  /** 双击或选中后点击进入下一步（M3 = 世界列表） */
  onSelect(appearance: import('../../player/Appearance').Appearance): void;
  onNew(): void;
  onBack(): void;
}

import { UIState } from '../core/UIState';
import { UIPanel } from '../elements/UIPanel';
import { UITextPanel } from '../elements/UITextPanel';
import { UIList } from '../elements/UIList';
import { UIScrollbar } from '../elements/UIScrollbar';
import { UICharacterListItem } from '../elements/UICharacterListItem';
import { StyleDimension } from '../core/StyleDimension';
import type { Appearance } from '../../player/Appearance';
import type { CharacterStore, CharacterMeta } from '../../save/CharacterStore';

export class UICharacterSelectState extends UIState {
  private list: UIList;
  private items = new Map<number, { item: UICharacterListItem; meta: CharacterMeta; appearance: Appearance }>();
  private selectedId: number | null = null;
  private deleting = false;

  constructor(private store: CharacterStore, private flow: CharacterSelectFlow) {
    super();

    const panel = new UIPanel();
    panel.hAlign = 0.5;
    panel.vAlign = 0.5;
    panel.width = StyleDimension.fromPixels(560);
    panel.height = StyleDimension.fromPixels(460);
    panel.setPadding(16);
    this.append(panel);

    this.list = new UIList();
    this.list.width = StyleDimension.fromPixels(460);
    this.list.height = StyleDimension.fromPixels(320);
    this.list.listPadding = 6;
    this.list.hAlign = 0.5;
    const scrollbar = new UIScrollbar();
    scrollbar.height = StyleDimension.fromPixels(320);
    scrollbar.top = StyleDimension.fromPixels(0);
    scrollbar.left = StyleDimension.fromPixels(480);
    this.list.setScrollbar(scrollbar);
    panel.append(scrollbar);
    panel.append(this.list);

    // 底部按钮列
    const mk = (label: string, fn: () => void, x: number): UITextPanel => {
      const b = new UITextPanel(label, 0.85);
      b.top = StyleDimension.fromPixels(360);
      b.left = StyleDimension.fromPixels(x);
      b.minWidth = StyleDimension.fromPixels(88);
      b.onClick(fn);
      panel.append(b);
      return b;
    };
    mk('新建', () => flow.onNew(), 16);
    mk('删除', () => this.doDelete(), 112);
    mk('重命名', () => this.doRename(), 208);
    mk('复制', () => this.doCopy(), 304);
    mk('返回', () => flow.onBack(), 400);

    void this.reload();
  }

  async reload() {
    await this.store.ensureLoaded();
    for (const [, v] of this.items) this.list.removeItem(v.item);
    this.items.clear();
    this.selectedId = null;
    for (const meta of this.store.list()) {
      const appearance = await this.store.get(meta.id);
      if (!appearance) continue;
      const item = new UICharacterListItem(appearance, false,
        () => this.select(meta.id),
        () => {
          this.select(meta.id);
          const a = this.selectedAppearance();
          if (a) this.flow.onSelect(a);
        });
      this.list.add(item);
      this.items.set(meta.id, { item, meta, appearance });
    }
  }

  private select(id: number) {
    this.selectedId = id;
    for (const [iid, v] of this.items) v.item.selected = iid === id;
  }

  private selectedAppearance(): Appearance | null {
    if (this.selectedId == null) return null;
    return this.items.get(this.selectedId)?.appearance ?? null;
  }

  private async doDelete() {
    if (this.selectedId == null || this.deleting) return;
    this.deleting = true;
    await this.store.delete(this.selectedId);
    this.deleting = false;
    await this.reload();
  }

  private async doRename() {
    if (this.selectedId == null) return;
    const v = this.items.get(this.selectedId);
    if (!v) return;
    const name = prompt('输入新名字：', v.appearance.name);
    if (name == null) return;
    const appearance = { ...v.appearance, name: name.slice(0, 20) };
    await this.store.update(v.meta.id, appearance);
    v.item.setName(appearance.name);
    v.appearance = appearance;
    v.meta.name = appearance.name;
  }

  private async doCopy() {
    if (this.selectedId == null) return;
    await this.store.copy(this.selectedId);
    await this.reload();
  }
}
