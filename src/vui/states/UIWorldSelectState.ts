// 移植 UIWorldSelect.cs：世界列表（收藏/最近优先）+ 底部 新建/收藏/删除/复制/返回。
import { UIState } from '../core/UIState';
import { UIPanel } from '../elements/UIPanel';
import { UITextPanel } from '../elements/UITextPanel';
import { UIText } from '../elements/UIText';
import { UIList } from '../elements/UIList';
import { UIScrollbar } from '../elements/UIScrollbar';
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb } from '../draw/UISpriteBatch';
import { Lang } from '../../i18n/Lang';
import { WorldStore, type WorldMeta } from '../../save/WorldStore';

export interface WorldSelectFlow {
  onPlay(meta: WorldMeta): void;
  onNew(): void;
  onBack(): void;
}

const SIZE_LABEL = ['', '小', '中', '大'];
function sizeLabel(m: WorldMeta): string {
  const idx = m.w >= 8400 ? 3 : m.w >= 6400 ? 2 : 1;
  return SIZE_LABEL[idx];
}

/** 世界列表项：名字 + 尺寸/难度/游玩时间 + 收藏星 */
class WorldListItem extends UIElement {
  private nameText: UIText;
  private subText: UIText;

  constructor(public meta: WorldMeta, public selected: boolean, onClick: () => void, onDoubleClick: () => void) {
    super();
    this.width = StyleDimension.fromPixels(480);
    this.height = StyleDimension.fromPixels(60);
    this.onClick(onClick);
    this.onDoubleClick(onDoubleClick);

    this.nameText = new UIText(meta.name || '未命名世界', 1);
    this.nameText.left = StyleDimension.fromPixels(12);
    this.nameText.top = StyleDimension.fromPixels(6);
    this.nameText.setTextColor(meta.favorite ? rgb(255, 220, 100) : rgb(255, 255, 255));
    this.append(this.nameText);

    const mins = Math.floor(meta.playTimeMs / 60000);
    this.subText = new UIText(`${sizeLabel(meta)} · ${meta.w}×${meta.h} · 游玩 ${mins} 分钟`, 0.7);
    this.subText.left = StyleDimension.fromPixels(12);
    this.subText.top = StyleDimension.fromPixels(30);
    this.subText.setTextColor(rgb(190, 190, 210));
    this.append(this.subText);
  }

  protected drawSelf(batch: UISpriteBatch): void {
    if (!this.selected) return;
    const d = this.getDimensions();
    batch.fillRect(d.x, d.y + 2, d.width, d.height - 4, rgb(255, 255, 255, 24));
  }
}

export class UIWorldSelectState extends UIState {
  private list: UIList;
  private items = new Map<number, { item: WorldListItem; meta: WorldMeta }>();
  private selectedId: number | null = null;

  constructor(private store: WorldStore, private flow: WorldSelectFlow) {
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
    scrollbar.left = StyleDimension.fromPixels(480);
    this.list.setScrollbar(scrollbar);
    panel.append(scrollbar);
    panel.append(this.list);

    const mk = (label: string, fn: () => void, x: number): UITextPanel => {
      const b = new UITextPanel(label, 0.85);
      b.top = StyleDimension.fromPixels(360);
      b.left = StyleDimension.fromPixels(x);
      b.minWidth = StyleDimension.fromPixels(88);
      b.onClick(fn);
      panel.append(b);
      return b;
    };
    mk(Lang.has('UI.NewWorld') ? Lang.text('UI.NewWorld') : '新建世界', () => flow.onNew(), 16);
    mk('收藏', () => this.doFavorite(), 112);
    mk('删除', () => this.doDelete(), 208);
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
      const item = new WorldListItem(meta, false,
        () => this.select(meta.id),
        () => {
          this.select(meta.id);
          const m = this.items.get(meta.id)?.meta;
          if (m) this.flow.onPlay(m);
        });
      this.list.add(item);
      this.items.set(meta.id, { item, meta });
    }
  }

  private select(id: number) {
    this.selectedId = id;
    for (const [iid, v] of this.items) v.item.selected = iid === id;
  }

  private async doFavorite() {
    if (this.selectedId == null) return;
    const v = this.items.get(this.selectedId);
    if (!v) return;
    await this.store.setFavorite(this.selectedId, !v.meta.favorite);
    await this.reload();
  }

  private async doDelete() {
    if (this.selectedId == null) return;
    const v = this.items.get(this.selectedId);
    if (!v) return;
    if (!confirm(`确定要删除世界「${v.meta.name}」吗？此操作不可撤销。`)) return;
    await this.store.delete(this.selectedId);
    await this.reload();
  }

  private async doCopy() {
    if (this.selectedId == null) return;
    const v = this.items.get(this.selectedId);
    if (!v) return;
    await this.store.duplicate(v.meta);
    await this.reload();
  }
}
