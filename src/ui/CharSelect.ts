// 角色列表（DOM 版，替代 VUI UICharacterSelectState）：纸娃娃预览 + 名称/难度色 + 管理
import { CharacterStore, type CharacterMeta } from '../save/CharacterStore';
import { type Appearance, DIFFICULTY_INFO } from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame } from '../player/PaperDoll';
import { Lang } from '../i18n/Lang';

export interface CharSelectFlow {
  onPlay(a: Appearance): void;
  onNew(): void;
  onBack(): void;
}

const CSS = `
.sw-list-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 600px; max-width: 96vw; z-index: 20; cursor: auto;
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 14px 16px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-list-title { text-align: center; font-size: 18px; color: #ffe8a0; margin-bottom: 10px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-list-body { max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; padding: 8px; }
.sw-list-empty { color: #8a90b8; text-align: center; padding: 40px 0; }
.sw-item { display: flex; align-items: center; gap: 10px; padding: 6px 8px;
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px; cursor: pointer; }
.sw-item:hover { background: #2c3768; }
.sw-item canvas { width: 44px; height: 58px; image-rendering: pixelated; background: #10142c;
  border-radius: 3px; flex-shrink: 0; }
.sw-item .name { flex: 1; font-size: 15px; }
.sw-item .sub { color: #8a90b8; font-size: 12px; }
.sw-item .ops { display: flex; gap: 6px; }
.sw-item .ops button {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 12px;
}
.sw-item .ops button:hover { background: #4a5aa0; }
.sw-item .ops button.primary { background: #5a6ac0; color: #fff; }
.sw-list-footer { display: flex; justify-content: space-between; margin-top: 12px; }
.sw-list-footer button {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 6px 18px; cursor: pointer; font-family: inherit;
}
.sw-list-footer button:hover { background: #4a5aa0; }
.sw-list-footer .primary { background: #5a6ac0; color: #fff; }
`;

export function ensureStyle() {
  if (!document.getElementById('sw-list-style')) {
    const style = document.createElement('style');
    style.id = 'sw-list-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

export class CharSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;
  private raf = 0;
  private time = 0;
  private items: Array<{ meta: CharacterMeta; appearance: Appearance; canvas: HTMLCanvasElement }> = [];

  constructor(parent: HTMLElement, private store: CharacterStore, private flow: CharSelectFlow) {
    ensureStyle();
    this.panel = document.createElement('div');
    this.panel.className = 'sw-list-panel';
    this.panel.innerHTML = `
      <div class="sw-list-title">${Lang.text('UI.SelectPlayer')}</div>
      <div class="sw-list-body"></div>
      <div class="sw-list-footer">
        <button data-act="back">${Lang.text('UI.Back')}</button>
        <button data-act="new" class="primary">${Lang.text('Mods.SandboxWorld.CharSelect.New')}</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-list-body')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    parent.appendChild(this.panel);
    void this.reload();
    this.loop();
    this.unsubLang = Lang.onChange(() => {
      (this.panel.querySelector('.sw-list-title') as HTMLElement).textContent = Lang.text('UI.SelectPlayer');
      (this.panel.querySelector('[data-act=back]') as HTMLElement).textContent = Lang.text('UI.Back');
      (this.panel.querySelector('[data-act=new]') as HTMLElement).textContent = Lang.text('Mods.SandboxWorld.CharSelect.New');
      void this.reload();
    });
  }

  private unsubLang: (() => void) | null = null;

  private async reload() {
    await this.store.ensureLoaded();
    this.body.innerHTML = '';
    this.items = [];
    for (const meta of this.store.list()) {
      const appearance = await this.store.get(meta.id);
      if (!appearance) continue;
      const el = document.createElement('div');
      el.className = 'sw-item';
      const canvas = document.createElement('canvas');
      canvas.width = 40; canvas.height = 56;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const dc = DIFFICULTY_INFO[appearance.difficulty]?.color ?? { r: 255, g: 255, b: 255 };
      const info = document.createElement('div');
      info.style.flex = '1';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = appearance.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed');
      name.style.color = `rgb(${dc.r},${dc.g},${dc.b})`;
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = DIFFICULTY_INFO[appearance.difficulty]?.label ?? '';
      info.append(name, sub);
      // 操作
      const ops = document.createElement('div');
      ops.className = 'ops';
      const mk = (label: string, primary: boolean, fn: () => void) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (primary) b.className = 'primary';
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        ops.appendChild(b);
      };
      const a = appearance;
      mk(Lang.text('Mods.SandboxWorld.WorldSelect.Enter'), true, () => this.close(() => this.flow.onPlay(a)));
      mk(Lang.text('Mods.SandboxWorld.CharSelect.Rename'), false, async () => {
        const name2 = prompt(Lang.text('Mods.SandboxWorld.CharSelect.RenamePrompt'), a.name);
        if (name2 == null) return;
        a.name = name2.slice(0, 20);
        await this.store.update(meta.id, a);
        await this.reload();
      });
      mk(Lang.text('Mods.SandboxWorld.WorldSelect.Copy'), false, async () => { await this.store.copy(meta.id); await this.reload(); });
      mk(Lang.text('UI.Delete'), false, async () => {
        if (!confirm(Lang.text('Mods.SandboxWorld.CharSelect.ConfirmDelete', a.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed')))) return;
        await this.store.delete(meta.id);
        await this.reload();
      });
      el.append(canvas, info, ops);
      // 整行点击/双击 = 进入（操作按钮已 stopPropagation）
      const enter = () => this.close(() => this.flow.onPlay(a));
      el.addEventListener('click', enter);
      el.addEventListener('dblclick', enter);
      this.body.appendChild(el);
      this.items.push({ meta, appearance, canvas });
    }
    if (!this.items.length) {
      const empty = document.createElement('div');
      empty.className = 'sw-list-empty';
      empty.textContent = Lang.text('Mods.SandboxWorld.CharSelect.Empty');
      this.body.appendChild(empty);
    }
  }

  /** 行走动画预览 */
  private loop = () => {
    this.time += 1 / 60;
    for (const it of this.items) {
      const doll = compositePaperDoll(it.appearance);
      if (!doll) continue;
      const ctx = it.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 40, 56);
      const f = dollFrame(doll, walkFrame(this.time));
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 40, 56);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  close(fn?: () => void) {
    cancelAnimationFrame(this.raf);
    this.unsubLang?.();
    this.panel.remove();
    fn?.();
  }
}
