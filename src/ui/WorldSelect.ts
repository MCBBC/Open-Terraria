// 世界存档列表（DOM 版，替代 VUI UIWorldSelectState）
import { WorldStore, type WorldMeta } from '../save/WorldStore';
import { ensureStyle } from './CharSelect';

export interface WorldSelectFlow {
  onPlay(meta: WorldMeta): void;
  onNew(): void;
  onBack(): void;
}

const SIZE_LABEL = (m: WorldMeta) => (m.w >= 8400 ? '大' : m.w >= 6400 ? '中' : '小');
const DIFF_LABEL = ['经典', '专家', '大师', '旅程'];

export class WorldSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement, private store: WorldStore, private flow: WorldSelectFlow) {
    ensureStyle();
    this.panel = document.createElement('div');
    this.panel.className = 'sw-list-panel';
    this.panel.innerHTML = `
      <div class="sw-list-title">选择世界</div>
      <div class="sw-list-body"></div>
      <div class="sw-list-footer">
        <button data-act="back">返回</button>
        <button data-act="new" class="primary">新建世界</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-list-body')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    parent.appendChild(this.panel);
    void this.reload();
  }

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
      name.textContent = (meta.favorite ? '★ ' : '') + (meta.name || '未命名世界');
      if (meta.favorite) name.style.color = '#ffd76e';
      const sub = document.createElement('div');
      sub.className = 'sub';
      const mins = Math.floor(meta.playTimeMs / 60000);
      sub.textContent = `${SIZE_LABEL(meta)} · ${meta.w}×${meta.h} · ${DIFF_LABEL[meta.difficulty] ?? '?'} · 游玩 ${mins} 分钟`;
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
      mk('进入', true, () => this.close(() => this.flow.onPlay(m)));
      mk(meta.favorite ? '取消收藏' : '收藏', false, async () => {
        await this.store.setFavorite(m.id, !m.favorite);
        await this.reload();
      });
      mk('复制', false, async () => { await this.store.duplicate(m); await this.reload(); });
      mk('删除', false, async () => {
        if (!confirm(`确定删除世界「${m.name}」？不可撤销。`)) return;
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
      empty.textContent = '还没有世界，点击下方「新建世界」创建';
      this.body.appendChild(empty);
    }
  }

  close(fn?: () => void) {
    this.panel.remove();
    fn?.();
  }
}
