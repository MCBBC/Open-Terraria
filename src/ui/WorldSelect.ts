// 世界存档列表（DOM 版 1:1 原版 UIWorldSelect/UIWorldListItem 结构）：
//  容器/标题/列表面板/底部双钮同 UICharacterSelect；行 = 图标位 + 信息 +
//  底缘图标钮 Play/Favorite/Copy + Delete 右下 + 悬停标签。
//  行首世界图标 = 原版 GetSeedIcon 映射 1:1（AWorldListItem.cs:186-201）：
//  "Icon"+(困难?"Hallow":"")+(腐化?"Corruption":"Crimson")+秘密种子后缀
//  （HasCorruption 默认 true=每个世界必有邪恶，无中性森林图标——46 张全集恰配）；
//  多秘密种子原版 UICyclingImage 轮播，此处取首匹配（轮播登记未接）。
import { WorldStore, type WorldMeta } from '../save/WorldStore';
import { ensureStyle } from './CharSelect';
import { Lang } from '../i18n/Lang';
import { parseSeed } from '../world/gen/SeedEasterEggs';

export interface WorldSelectFlow {
  onPlay(meta: WorldMeta): void;
  onNew(): void;
  onBack(): void;
  /** 导入世界（.wld / 本仓 .json 存档）——只落库进列表，不进入世界 */
  onImport(file: File): Promise<void>;
}

const SIZE_LABEL = (m: WorldMeta) => Lang.text(m.w >= 8400 ? 'UI.WorldSizeLarge' : m.w >= 6400 ? 'UI.WorldSizeMedium' : 'UI.WorldSizeSmall');
const DIFF_LABEL = () => [Lang.text('UI.Normal'), Lang.text('GameUI.Expert'), Lang.text('UI.Master'), Lang.text('UI.Creative')];

const BTN_SRC = (n: string): string => `sprites/vanilla-ui/${n}.png`;

/** 触屏(无 hover)设备:行标签无法悬停唤出,构建时预填主行动文案(与 CharSelect
 *  的 TOUCH_LABELS 同源断点 hover:none+pointer:coarse,桌面恒 false 零差异) */
const TOUCH_LABELS = typeof matchMedia === 'function'
  && matchMedia('(hover: none) and (pointer: coarse)').matches;

/** 世界图标贴图名（AWorldListItem.GetSeedIcon :186-201 1:1）：
 *  "Icon"+(困难?"Hallow":"")+(腐化?"Corruption":"Crimson")+秘密种子后缀；
 *  drunk=CorruptionCrimson(evilVariants:false)、skyblock 无前后缀变体。
 *  多秘密种子原版轮播（UICyclingImage）——取 vanilla 优先序首匹配（登记未轮播） */
export function worldIconName(m: WorldMeta): string {
  const f = parseSeed(m.seed).flags;
  const hard = m.hardMode ? 'Hallow' : '';
  const evil = m.evil === 1 ? 'Crimson' : 'Corruption';
  let seed = '';
  let evilVariants = true;
  if (f.drunkWorld) {
    // 原版 GetSeedIcon("CorruptionCrimson", evilVariants:false)（AWorldListItem.cs:133）
    // ——drunk 图标名【不含邪恶段】，"CorruptionCrimson" 即完整后缀；此前 evil 段
    // 照拼 → UI_IconCorruptionCorruptionCrimson 404（2026-08-24 用户报）
    seed = 'CorruptionCrimson';
    evilVariants = false;
  } else if (f.getGoodWorld) seed = 'FTW';
  else if (f.notTheBees) seed = 'NotTheBees';
  else if (f.tenthAnniversary) seed = 'Anniversary';
  else if (f.theConstant) seed = 'DontStarve';
  else if (f.remix) seed = 'Remix';
  else if (f.noTraps) seed = 'Traps';
  else if (f.skyblock) return 'UI_IconSkyblock';
  return `UI_Icon${hard}${evilVariants ? evil : ''}${seed}`;
}

/** 完整种子串（WorldFileData.GetFullSeedText 1:1）：
 *  "{尺寸}.{难度+1}.{邪恶}.{秘密种子和}.{seed文本}"——原版种子按钮复制的就是它，
 *  粘贴进世界创建即可复现同参数世界（WorldGen.cs:11095 TryApplyingCopiedSeed）。
 *  尺寸 1/2/3 = 4200×1200/6400×1800/8400×2400；邪恶 1 腐化 2 猩红；
 *  种子和 = drunk1/bees2/ftw4/anniv8/dontstarve16/remix32/notraps64/skyblock256
 *  （WorldFileData.GetSerializedSeedsSum；zenith 128 未接） */
export function fullSeedText(m: WorldMeta): string {
  const size = m.w === 4200 && m.h === 1200 ? 1 : m.w === 6400 && m.h === 1800 ? 2 : m.w === 8400 && m.h === 2400 ? 3 : 0;
  const evilNum = m.evil === 0 ? 1 : m.evil === 1 ? 2 : 0;
  const f = parseSeed(m.seed).flags;
  let sum = 0;
  if (f.drunkWorld) sum += 1;
  if (f.notTheBees) sum += 2;
  if (f.getGoodWorld) sum += 4;
  if (f.tenthAnniversary) sum += 8;
  if (f.theConstant) sum += 16;
  if (f.remix) sum += 32;
  if (f.noTraps) sum += 64;
  if (f.skyblock) sum += 256;
  return `${size}.${m.difficulty + 1}.${evilNum}.${sum}.${m.seed}`;
}

/** 剪贴板写入（原版 Platform.Get<IClipboard>().Value；clipboard API 失败回退
 *  隐藏 textarea + execCommand——非安全上下文 http 下 clipboard API 不可用） */
function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyFallback(text));
  } else {
    copyFallback(text);
  }
}
function copyFallback(text: string): void {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* 无剪贴板环境静默 */ }
  ta.remove();
}

export class WorldSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;
  private closed = false;
  private fileInput: HTMLInputElement;
  private importBusy = false;

  constructor(parent: HTMLElement, private store: WorldStore, private flow: WorldSelectFlow) {
    ensureStyle();
    this.panel = document.createElement('div');
    this.panel.className = 'sw-vsel';
    this.panel.innerHTML = `
      <div class="sw-vsel-title sw-vbtn">${Lang.text('UI.SelectWorld')}</div>
      <div class="sw-vsel-panel sw-vpanel"><div class="sw-vsel-list"></div></div>
      <div class="sw-vsel-footer">
        <button class="sw-vbtn" data-act="back">${Lang.text('UI.Back')}</button>
        <button class="sw-vbtn" data-act="import">${Lang.text('Mods.SandboxWorld.WorldSelect.Import')}</button>
        <button class="sw-vbtn" data-act="new">${Lang.text('LegacyMenu.47')}</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-vsel-list')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    // 导入世界（自制,原版无此钮）：.wld / 本仓 .json——file input 走隐藏控件,
    // change 后清 value 允许连选同一文件;导入中按钮进 loading 态(文案+禁用)
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.wld,.json';
    this.fileInput.style.display = 'none';
    this.panel.querySelector('[data-act=import]')!.addEventListener('click', () => {
      if (this.importBusy) return;
      this.fileInput.click();
    });
    this.fileInput.addEventListener('change', () => {
      const f = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (f) void this.runImport(f);
    });
    this.panel.appendChild(this.fileInput);
    this.unsubLang = Lang.onChange(() => { void this.reload(); });
    parent.appendChild(this.panel);
    void this.reload();
  }

  /** 导入 loading 态：按钮转「导入中…」+禁用（防重复选文件），完成后刷新列表。
   *  wld 解析是主线程同步重活——先让 loading 文案绘制（rAF 两拍）再开解析 */
  private async runImport(f: File): Promise<void> {
    if (this.importBusy) return;
    this.importBusy = true;
    const btn = this.panel.querySelector('[data-act=import]') as HTMLButtonElement | null;
    const old = btn?.textContent ?? '';
    if (btn) {
      btn.textContent = Lang.text('Mods.SandboxWorld.WorldSelect.Importing');
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      await this.flow.onImport(f);
      await this.reload();
    } finally {
      this.importBusy = false;
      if (btn && btn.isConnected) {
        btn.textContent = old;
        btn.disabled = false;
        btn.style.opacity = '';
      }
    }
  }

  private unsubLang: (() => void) | null = null;

  private iconBtn(parent: HTMLElement, src: string, label: string, fn: () => void): HTMLElement {
    // 24px 图标外包 .sw-vico 触控热区层(C 档 padding 6/margin -6 → 36² 热区,
    // 桌面无样式盒尺寸=img 几何零变化);click 挂热区层,img 点击冒泡仍触发
    // 返回热区层供点击后改写本行标签(种子钮复制回显)
    const wrap = document.createElement('span');
    wrap.className = 'sw-vico';
    const img = document.createElement('img');
    img.src = BTN_SRC(src);
    img.title = label;
    img.addEventListener('mouseenter', () => { this.setLabel(wrap, label, false); });
    img.addEventListener('mouseleave', () => { this.setLabel(wrap, '', false); });
    wrap.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    wrap.appendChild(img);
    parent.appendChild(wrap);
    return wrap;
  }

  private setLabel(from: HTMLElement, text: string, del: boolean): void {
    // 标签挂在各自行内——按钮就近锚所在 .sw-vitem 行内取
    // （曾查整个 panel：多行恒中第一行,hover 其它行文字串进首行,2026-08-26 用户报）
    const el = from.closest('.sw-vitem')?.querySelector(del ? '.sw-vitem-del-label' : '.sw-vitem-label');
    if (el) el.textContent = text;
  }

  async reload() {
    await this.store.ensureLoaded();
    this.body.innerHTML = '';
    const list = this.store.list();
    for (const meta of list) {
      const el = document.createElement('div');
      el.className = 'sw-vitem sw-vpanel-item';
      const m = meta;
      // 行首世界图标（60×58 原版贴图；UIWorldListItem.cs:68 GetIconElement）
      const icon = document.createElement('img');
      icon.className = 'sw-vitem-icon';
      icon.src = BTN_SRC(worldIconName(m));
      icon.alt = '';
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
      // 原版按钮序（UIWorldListItem.cs:95-158）：Play/Favorite/Seed/Rename/Delete——
      // 种子钮复制完整种子串（SeedButtonClick :127-131），非"复制世界"
      const seedBtn = this.iconBtn(btns, 'UI_ButtonSeed', Lang.text('UI.CopySeed', fullSeedText(m)), () => {
        copyToClipboard(fullSeedText(m));
        this.setLabel(seedBtn, Lang.text('UI.SeedCopied'), false);
      });
      this.iconBtn(btns, 'UI_ButtonRename', Lang.text('UI.Rename'), async () => {
        const name = prompt(Lang.text('UI.Rename'), m.name);
        if (name == null || name.trim() === '') return;
        await this.store.rename(m.id, name.trim());
        await this.reload();
      });
      // 删除钮（收藏防删，UIWorldListItem.cs:151-157 原版仅 !IsFavorite 挂
      // 处理器：收藏行禁用态 + 悬停显 UI.CannotDeleteFavorited）
      const del = document.createElement('div');
      del.className = 'sw-vitem-del';
      const delFn: (() => void) | null = m.favorite ? null : async () => {
        if (!confirm(Lang.text('Mods.SandboxWorld.WorldSelect.ConfirmDelete', m.name))) return;
        await this.store.delete(m.id);
        await this.reload();
      };
      this.iconBtn(del, 'UI_ButtonDelete',
        m.favorite ? Lang.text('UI.CannotDeleteFavorited') : Lang.text('UI.Delete'),
        () => { if (delFn) void delFn(); });
      if (m.favorite) {
        const img = del.querySelector('img');
        if (img) { img.style.opacity = '0.35'; img.style.cursor = 'not-allowed'; }
      }
      const label = document.createElement('div');
      label.className = 'sw-vitem-label';
      if (TOUCH_LABELS) label.textContent = Lang.text('UI.Play');
      const delLabel = document.createElement('div');
      delLabel.className = 'sw-vitem-del-label';
      // 悬停标签入按钮流（跟随末钮）——原钉死 left:182px 是旧 3 钮布局，4 钮后
      // 压住按钮（2026-08-24 用户报）；按钮数角色/世界行不同，钉死必错位
      btns.append(label);
      el.append(icon, info, btns, del, delLabel);
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
    // ★防重入门（2026-08-25 用户报偶发竞态）：行同时挂 click+dblclick → enter，
    //   双击时 dblclick 仍派发到已拆离行 → 二次 close 曾重跑 fn——角色行双击即
    //   连建两层世界列表（像素级重叠），点顶层进游戏后底层浮在加载页/游戏画面上
    //   （DOM z-20 在 VUI 画布之上）；本行双击也会并发跑两次 loadWorldFlow。
    if (this.closed) return;
    this.closed = true;
    this.unsubLang?.();
    this.panel.remove();
    fn?.();
  }
}
