// 角色列表（DOM 版 1:1 原版 UICharacterSelect/UICharacterListItem 结构）：
//  容器 80%(max 650) 居中 + 标题面板 + 列表面板(滚动) + 底部 Back/New 双钮
//  （UICharacterSelect.cs:38-82）；行 = 娃娃(PlayerBackground 背板 + 行走动画) +
//  底缘图标钮 Play/Rename/Copy + Delete 右下 + 悬停标签——★原版行内无名字文本
//  （UICharacterListItem 全量 Append 扫描定谳），识别靠娃娃外观。
import { CharacterStore, type CharacterMeta } from '../save/CharacterStore';
import { type Appearance, DIFFICULTY_INFO } from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame } from '../player/PaperDoll';
import { Lang } from '../i18n/Lang';
import { ensureVanillaKit } from './vanillaKit';

export interface CharSelectFlow {
  /** id = CharacterMeta.id（流程层硬核消亡回写角色存档用；旧调用方可忽略） */
  onPlay(a: Appearance, id?: number): void;
  onNew(): void;
  onBack(): void;
}

const CSS = `
.sw-vsel {
  /* 95% 微半透(2026-08-24 用户要求"只要一点点")——世界/角色选择面板同族 */
  opacity: 0.95;
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(80%, 650px); max-height: 86vh; z-index: 20;
  display: flex; flex-direction: column;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  color: #fff; cursor: auto;
}
.sw-vsel-title {
  align-self: center; padding: 8px 26px; margin-bottom: 14px;
  font-size: 20px; white-space: nowrap;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
}
.sw-vsel-panel { position: relative; flex: 0 1 auto; min-height: 120px; padding: 5px; }
.sw-vsel-list {
  height: 100%; max-height: 52vh; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: 5px;
  scrollbar-width: thin; scrollbar-color: #ffe745 #2c396a;
}
.sw-vsel-list::-webkit-scrollbar { width: 12px; }
.sw-vsel-list::-webkit-scrollbar-track { background: #1c2444; }
.sw-vsel-list::-webkit-scrollbar-thumb { background: #ffe745; border: 2px solid #2c396a; }
.sw-vsel-empty { color: #cfd6f4; text-align: center; padding: 48px 0; font-size: 15px;
  text-shadow: 1px 1px 0 #000; }
/* 行高 112:边12+info(顶15+名21+隙3+副16=55→内容底67)+钮区(底6,高24→顶66)
   ——96 档副行与钮区重叠 13px(实测 _row-rect),原版 96 无文本行不适用 */
.sw-vitem { position: relative; height: 112px; flex-shrink: 0; padding: 6px; display: block; }
.sw-vitem.dead { opacity: 0.45; }
.sw-vitem-doll {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  width: 66px; height: 66px;
  image-rendering: pixelated; pointer-events: none;
}
.sw-vitem-info { position: absolute; left: 104px; top: 15px; right: 56px; pointer-events: none; }
.sw-vitem-info .name { font-size: 17px; line-height: 1.25;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-vitem-info .sub { font-size: 12px; color: #cfd6f4; margin-top: 3px;
  text-shadow: 1px 1px 0 #000; }
.sw-vitem-btns { position: absolute; left: 104px; bottom: 6px; display: flex; gap: 2px;
  align-items: flex-end; }
.sw-vitem-btns img, .sw-vitem-del img {
  width: 24px; height: 24px; image-rendering: pixelated; cursor: pointer;
  opacity: 0.8;
}
.sw-vitem-btns img:hover, .sw-vitem-del img:hover { opacity: 1; transform: scale(1.08); }
.sw-vitem-del { position: absolute; right: 8px; bottom: 4px; }
.sw-vitem-label { position: absolute; left: 182px; bottom: 7px; font-size: 13px;
  color: #ffe; text-shadow: 1px 1px 0 #000; pointer-events: none; }
.sw-vitem-del-label { position: absolute; right: 38px; bottom: 7px; font-size: 13px;
  color: #ffe; text-shadow: 1px 1px 0 #000; pointer-events: none; }
.sw-vsel-footer { display: flex; gap: 10px; margin-top: 14px; }
.sw-vsel-footer .sw-vbtn { flex: 1; height: 50px; font-size: 17px; }
/* 世界行图标（60×58 原版 Icon* 贴图,左区与娃娃位同构） */
.sw-vitem-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  width: 60px; height: 58px; image-rendering: pixelated; pointer-events: none;
}
`;

export function ensureStyle() {
  ensureVanillaKit();
  if (!document.getElementById('sw-list-style')) {
    const style = document.createElement('style');
    style.id = 'sw-list-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

const BTN_SRC = (n: string): string => `sprites/vanilla-ui/${n}.png`;

export class CharSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;
  private raf = 0;
  private time = 0;
  private items: Array<{ meta: CharacterMeta; appearance: Appearance; canvas: HTMLCanvasElement }> = [];

  constructor(parent: HTMLElement, private store: CharacterStore, private flow: CharSelectFlow) {
    ensureStyle();
    this.panel = document.createElement('div');
    this.panel.className = 'sw-vsel';
    this.panel.innerHTML = `
      <div class="sw-vsel-title sw-vbtn">${Lang.text('UI.SelectPlayer')}</div>
      <div class="sw-vsel-panel sw-vpanel"><div class="sw-vsel-list"></div></div>
      <div class="sw-vsel-footer">
        <button class="sw-vbtn" data-act="back">${Lang.text('UI.Back')}</button>
        <button class="sw-vbtn" data-act="new">${Lang.text('UI.New')}</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-vsel-list')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    parent.appendChild(this.panel);
    void this.reload();
    this.loop();
    this.unsubLang = Lang.onChange(() => {
      (this.panel.querySelector('.sw-vsel-title') as HTMLElement).textContent = Lang.text('UI.SelectPlayer');
      (this.panel.querySelector('[data-act=back]') as HTMLElement).textContent = Lang.text('UI.Back');
      (this.panel.querySelector('[data-act=new]') as HTMLElement).textContent = Lang.text('UI.New');
      void this.reload();
    });
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

  private async reload() {
    await this.store.ensureLoaded();
    this.body.innerHTML = '';
    this.items = [];
    for (const meta of this.store.list()) {
      const appearance = await this.store.get(meta.id);
      if (!appearance) continue;
      const el = document.createElement('div');
      el.className = 'sw-vitem sw-vpanel-item';
      const a = appearance;
      // 硬核角色已消亡（hardcoreDead 标记；原版死亡即删 .plr 档）：灰显 + 禁止进入
      const dead = !!a.hardcoreDead;
      if (dead) el.classList.add('dead');
      // 娃娃（PlayerBackground 背板 + 行走动画；UICharacter.cs:97-107 hasBackPanel）
      const doll = document.createElement('canvas');
      doll.className = 'sw-vitem-doll';
      doll.width = 66; doll.height = 66;
      const dctx = doll.getContext('2d')!;
      dctx.imageSmoothingEnabled = false;
      const bg = new Image();
      bg.src = BTN_SRC('UI_PlayerBackground');
      bg.addEventListener('load', () => dctx.drawImage(bg, 3, 4));
      // 信息（悬停行时显示名字——原版行内无名字文本，识别靠娃娃；此处仅 title 提示）
      const dc = DIFFICULTY_INFO[a.difficulty]?.color ?? { r: 255, g: 255, b: 255 };
      // 信息块（名字=难度色 + 难度/消亡副行；★用户定策:行内显示名字,偏离原版
      //  无名字行——原版识别靠娃娃,本仓按用户要求补文本区）
      const info = document.createElement('div');
      info.className = 'sw-vitem-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'name';
      nameEl.textContent = a.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed');
      nameEl.style.color = `rgb(${dc.r},${dc.g},${dc.b})`;
      const subEl = document.createElement('div');
      subEl.className = 'sub';
      subEl.textContent = a.hardcoreDead
        ? Lang.text('Mods.SandboxWorld.CharSelect.HardcoreDead')
        : DIFFICULTY_INFO[a.difficulty]?.label ?? '';
      info.append(nameEl, subEl);
      // 操作钮（底缘行：Play/Rename/Copy；Delete 右下——UICharacterListItem.cs:73-121）
      const btns = document.createElement('div');
      btns.className = 'sw-vitem-btns';
      this.iconBtn(btns, 'UI_ButtonPlay', Lang.text('UI.Play'), () => {
        if (dead) return;
        this.close(() => this.flow.onPlay(a, meta.id));
      });
      this.iconBtn(btns, 'UI_ButtonRename', Lang.text('UI.Rename'), async () => {
        const name2 = prompt(Lang.text('Mods.SandboxWorld.CharSelect.RenamePrompt'),
          a.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed'));
        if (name2 == null) return;
        a.name = name2.slice(0, 20);
        await this.store.update(meta.id, a);
        await this.reload();
      });
      this.iconBtn(btns, 'UI_CharCreation_Copy', Lang.text('Mods.SandboxWorld.WorldSelect.Copy'), async () => {
        await this.store.copy(meta.id);
        await this.reload();
      });
      const del = document.createElement('div');
      del.className = 'sw-vitem-del';
      this.iconBtn(del, 'UI_ButtonDelete', Lang.text('UI.Delete'), async () => {
        if (!confirm(Lang.text('Mods.SandboxWorld.CharSelect.ConfirmDelete',
          a.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed')))) return;
        await this.store.delete(meta.id);
        await this.reload();
      });
      const label = document.createElement('div');
      label.className = 'sw-vitem-label';
      const delLabel = document.createElement('div');
      delLabel.className = 'sw-vitem-del-label';
      el.append(doll, info, btns, del, label, delLabel);
      // 整行点击/双击 = 进入（图标钮已 stopPropagation；硬核消亡禁入）
      const enter = () => {
        if (dead) return;
        this.close(() => this.flow.onPlay(a, meta.id));
      };
      el.addEventListener('click', enter);
      el.addEventListener('dblclick', enter);
      this.body.appendChild(el);
      this.items.push({ meta, appearance: a, canvas: doll });
    }
    if (!this.items.length) {
      const empty = document.createElement('div');
      empty.className = 'sw-vsel-empty';
      empty.textContent = Lang.text('Mods.SandboxWorld.CharSelect.Empty');
      this.body.appendChild(empty);
    }
  }

  /** 行走动画预览（娃娃居中于 PlayerBackground 背板） */
  private loop = () => {
    this.time += 1 / 60;
    for (const it of this.items) {
      const doll = compositePaperDoll(it.appearance);
      if (!doll) continue;
      const ctx = it.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 66, 66);
      const f = dollFrame(doll, walkFrame(this.time));
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 13, 5, 40, 56);
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
