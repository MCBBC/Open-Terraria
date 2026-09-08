// 角色列表（DOM 版 1:1 原版 UICharacterSelect/UICharacterListItem 结构）：
//  容器 80%(max 650) 居中 + 标题面板 + 列表面板(滚动) + 底部 Back/New 双钮
//  （UICharacterSelect.cs:38-82）；行 = 娃娃(PlayerBackground 背板 + 行走动画) +
//  底缘图标钮 Play/Favorite/Rename + Delete 右下 + 悬停标签。原版行内【有】名字
//  文本（DrawSelf :324-331 DrawBorderString(_data.Name)+生命/魔法/难度/时长四面板）
//  ——R24 勘误：头注曾断言"原版行内无名字文本"，系旧版全量扫描漏了 DrawSelf 段。
//  收藏防删（UICharacterListItem.cs:114-116）：仅 !IsFavorite 才挂 Delete 处理器，
//  收藏行悬停删除钮显 UI.CannotDeleteFavorited（本仓禁用态+悬停标签，简化登记：
//  原版另有 Yes/No 确认页 UICharacterSelect.DeleteConfirmation）。
import { CharacterStore, type CharacterMeta } from '../save/CharacterStore';
import { type Appearance, DIFFICULTY_INFO, validateAppearance } from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame } from '../player/PaperDoll';
import { parsePlr, exportPlr } from '../save/PlrImport';
import type { SaveData } from '../save/serialize';
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
  opacity: 0.9;
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
/* 行高 126:边12+info(顶15+名框~40(pixel 字体实际行盒)+隙3+副16≈74)+钮区(底6,高24
   →顶96)——126-96=30 即副行与按钮的间距;112 档内容底(74)距钮区顶(82)仅 8px,
   字体行盒再涨一格就贴字(用户实测),原版 96 无文本行不适用 */
.sw-vitem { position: relative; height: 126px; flex-shrink: 0; padding: 6px; display: block; }
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
.sw-vitem-label { font-size: 13px;
  color: #ffe; text-shadow: 1px 1px 0 #000; pointer-events: none; }
/* 流内态（label 已 append 进 .sw-vitem-btns）：跟随末钮右缘 */
.sw-vitem-btns .sw-vitem-label { align-self: center; margin-left: 6px; white-space: nowrap; }
.sw-vitem-del-label { position: absolute; right: 38px; bottom: 7px; font-size: 13px;
  color: #ffe; text-shadow: 1px 1px 0 #000; pointer-events: none; }
.sw-vsel-footer { display: flex; gap: 10px; margin-top: 14px; }
.sw-vsel-footer .sw-vbtn { flex: 1; height: 50px; font-size: 17px; }
/* 世界行图标（原版 Icon* 贴图,左区与娃娃位同构）——★宽度用 auto 随贴图原生尺寸:
 * 1457 起 IconHallowCorruption/IconHallowCrimson 官方改版 60→59 宽(TSV 14837/14845),
 * 钉死 60px 会把 59 宽件最近邻拉伸一列(IIIII216c);高度仍钉 58(两代同高) */
.sw-vitem-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  width: auto; height: 58px; image-rendering: pixelated; pointer-events: none;
}
/* ---- 手机适配(2026-08-25,加法式覆盖,桌面 1280×800 全不命中)----
   A 竖屏窄(max-width:560):面板吃满宽度、行内长名/副行省略号(换行会压按钮行);
   B 矮横屏(max-height:500):压 footer 钮高;C 触控(hover:none+coarse):
   图标钮外包 .sw-vico 扩触控热区(margin 抵消 → 视觉零位移)。
   ★list 上限必须用视口 calc 硬帽、不能靠 flex 撑满:.sw-vsel 高度=auto+max-height
   钳制,非 definite → panel 的 flex 后高度对 list 的 height:100%/stretch 均不可
   用,list 保持内容高直冲屏底、footer 被顶出屏(2026-08-25 真机实报,实测 list
   931px 溢出 panel 639px;base 的 max-height:52vh 视口帽曾兼职此保险) */
@media (max-width: 560px) {
  .sw-vsel { width: min(94vw, 650px); max-height: 92vh; max-height: 92dvh; }
  .sw-vsel-panel { flex: 1 1 auto; display: flex; min-height: 120px; }
  .sw-vsel-list { max-height: calc(92vh - 170px); max-height: calc(92dvh - 170px);
    flex: 1 1 auto; min-height: 0; overscroll-behavior: contain; }
  .sw-vsel-footer { margin-top: 10px; }
  .sw-vsel-footer .sw-vbtn { height: 46px; }
  .sw-vitem-info { overflow: hidden; right: 44px; }   /* 右缘收窄(删除钮 32px 足够)给长名/副行多点空间 */
  .sw-vitem-info .name, .sw-vitem-info .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@media (max-height: 500px) {
  .sw-vsel { max-height: 94vh; }
  .sw-vsel-title { margin-bottom: 8px; }
  .sw-vsel-panel { flex: 1 1 auto; display: flex; }
  .sw-vsel-list { max-height: calc(94vh - 150px);
    flex: 1 1 auto; min-height: 0; overscroll-behavior: contain; }
  .sw-vsel-footer { margin-top: 8px; }
  .sw-vsel-footer .sw-vbtn { height: 40px; }
}
@media (hover: none) and (pointer: coarse) {
  .sw-vico { display: inline-flex; padding: 6px; margin: -6px; }
}
`;

export function ensureStyle() {
  ensureVanillaKit();
  // 每次调用都刷新内容(★HMR/迭代期 getElementById 守卫只建不更,旧 <style>
  // 驻留会吞掉 CSS 变更——手机适配断点全靠这份表,与 TitleMenu 同款修法)
  let style = document.getElementById('sw-list-style') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'sw-list-style';
    document.head.appendChild(style);
  }
  style.textContent = CSS;
}

const BTN_SRC = (n: string): string => `sprites/vanilla-ui/${n}.png`;

/** 触屏(无 hover)设备:行标签无法悬停唤出,构建时预填主行动文案。
 *  与 CSS C 档断点同源(hover:none+pointer:coarse),桌面恒 false 零差异 */
const TOUCH_LABELS = typeof matchMedia === 'function'
  && matchMedia('(hover: none) and (pointer: coarse)').matches;

export class CharSelectPanel {
  private panel: HTMLElement;
  private body: HTMLElement;
  private raf = 0;
  private time = 0;
  private closed = false;   // ★close 防重入（同 WorldSelectPanel——行 click+dblclick 双挂）
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
        <button class="sw-vbtn" data-act="import">${Lang.text('Mods.SandboxWorld.CharSelect.ImportBtn')}</button>
        <button class="sw-vbtn" data-act="new">${Lang.text('UI.New')}</button>
      </div>
    `;
    this.body = this.panel.querySelector('.sw-vsel-list')!;
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onBack));
    this.panel.querySelector('[data-act=new]')!.addEventListener('click', () => this.close(flow.onNew));
    this.panel.querySelector('[data-act=import]')!.addEventListener('click', () => this.pickImportFile());
    // 隐藏文件选择器(导入通道:.sbchar.json 自有档 / .plr 原版档,见 onImportFile)
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,.plr';
    file.style.display = 'none';
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';   // 同文件重选仍触发 change
      if (f) void this.onImportFile(f);
    });
    this.panel.appendChild(file);
    this.importInput = file;
    parent.appendChild(this.panel);
    void this.reload();
    this.loop();
    this.unsubLang = Lang.onChange(() => {
      (this.panel.querySelector('.sw-vsel-title') as HTMLElement).textContent = Lang.text('UI.SelectPlayer');
      (this.panel.querySelector('[data-act=back]') as HTMLElement).textContent = Lang.text('UI.Back');
      (this.panel.querySelector('[data-act=new]') as HTMLElement).textContent = Lang.text('UI.New');
      (this.panel.querySelector('[data-act=import]') as HTMLElement).textContent = Lang.text('Mods.SandboxWorld.CharSelect.ImportBtn');
      void this.reload();
    });
  }

  private importInput: HTMLInputElement | null = null;

  private pickImportFile(): void {
    this.importInput?.click();
  }

  /** 导入分流(2026-09-05):自有 JSON 档(magic=sandboxworld.character)或原版 .plr。
   *  判据:扩展名 .plr → 原版二进制;.json 或首字节 '{' → 自有 JSON;其余按 .plr 试 */
  private async onImportFile(f: File): Promise<void> {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const isJson = /\.json$/i.test(f.name) || buf[0] === 0x7b;
      let appearance: Appearance;
      let playerState: SaveData['player'] | null = null;
      if (isJson) {
        const j = JSON.parse(new TextDecoder('utf-8').decode(buf)) as {
          magic?: string; appearance?: Partial<Appearance>; playerState?: SaveData['player'];
        };
        if (j?.magic !== 'sandboxworld.character' || !j.appearance) {
          throw new Error(Lang.text('Mods.SandboxWorld.CharSelect.ImportNotExport'));
        }
        appearance = validateAppearance(j.appearance);
        playerState = j.playerState ?? null;
      } else {
        const parsed = parsePlr(buf);
        appearance = parsed.appearance;
        playerState = parsed.playerState;
      }
      const meta = await this.store.create(appearance);
      if (playerState) await this.store.setState(meta.id, playerState);
      await this.reload();
      alert(Lang.text('Mods.SandboxWorld.CharSelect.ImportOk', appearance.name || `#${meta.id}`));
    } catch (e) {
      alert(Lang.text('Mods.SandboxWorld.CharSelect.ImportFail', String(e instanceof Error ? e.message : e).slice(0, 120)));
    }
  }

  /** 导出为原版 .plr 档(325 格式 AES 加密,原版游戏可直接读;外观+随身态全套。
   *  旅程研究不随档——creativeTracker 写空表,见 exportPlr 注) */
  private async exportCharacter(meta: CharacterMeta): Promise<void> {
    const a = await this.store.get(meta.id);
    if (!a) return;
    const st = await this.store.getState(meta.id);
    let bytes: Uint8Array;
    try {
      bytes = exportPlr(a, st ?? emptyPlayerState(a));
    } catch (e) {
      alert(Lang.text('Mods.SandboxWorld.CharSelect.ImportFail', String(e instanceof Error ? e.message : e).slice(0, 120)));
      return;
    }
    const safe = (a.name || `character${meta.id}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const aEl = document.createElement('a');
    aEl.href = url;
    aEl.download = `${safe}.plr`;
    aEl.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private unsubLang: (() => void) | null = null;

  private iconBtn(parent: HTMLElement, src: string, label: string, fn: () => void, back?: string): void {
    // 24px 图标外包 .sw-vico 触控热区层(C 档 padding 6/margin -6 → 36² 热区,
    // 桌面无样式盒尺寸=img 几何零变化);click 挂热区层,img 点击冒泡仍触发。
    // back=裸图标(如捏人 Copy 20×20 无底框)时以原版按钮底贴图打底(UI_ButtonBacking),
    // 与自带底框的 Button 家族(Play/Rename 等 22×22)视觉同形
    const wrap = document.createElement('span');
    wrap.className = 'sw-vico';
    const img = document.createElement('img');
    img.src = BTN_SRC(src);
    if (back) {
      img.style.backgroundImage = `url(${BTN_SRC(back)})`;
      img.style.backgroundSize = '100% 100%';
      img.style.backgroundPosition = 'center';
      img.style.backgroundRepeat = 'no-repeat';
    }
    img.title = label;
    img.addEventListener('mouseenter', () => { this.setLabel(wrap, label, false); });
    img.addEventListener('mouseleave', () => { this.setLabel(wrap, '', false); });
    wrap.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    wrap.appendChild(img);
    parent.appendChild(wrap);
  }

  private setLabel(from: HTMLElement, text: string, del: boolean): void {
    // 标签挂在各自行内——按钮就近锚所在 .sw-vitem 行内取
    // （曾查整个 panel：多行恒中第一行,hover 其它行文字串进首行,2026-08-26 用户报）
    const el = from.closest('.sw-vitem')?.querySelector(del ? '.sw-vitem-del-label' : '.sw-vitem-label');
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
      // 收藏钮（原版 UICharacterListItem.cs:80 收藏钮；本行无复制钮——复制是
      // 世界列表种子钮的误植，2026-08-24 用户对齐指正）
      this.iconBtn(btns, meta.favorite ? 'UI_ButtonFavoriteActive' : 'UI_ButtonFavoriteInactive',
        meta.favorite ? Lang.text('UI.Unfavorite') : Lang.text('UI.Favorite'), async () => {
          await this.store.setFavorite(meta.id, !meta.favorite);
          await this.reload();
        });
      this.iconBtn(btns, 'UI_ButtonRename', Lang.text('UI.Rename'), async () => {
        const name2 = prompt(Lang.text('Mods.SandboxWorld.CharSelect.RenamePrompt'),
          a.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed'));
        if (name2 == null) return;
        a.name = name2.slice(0, 20);
        await this.store.update(meta.id, a);
        await this.reload();
      });
      // 导出钮(2026-09-05 用户需求):下载原版 .plr 档(外观+随身态全套,原版游戏可读)。
      // 图标借捏人复制钮 UI_CharCreation_Copy(复制/导出语义;原版无导出钮)
      this.iconBtn(btns, 'UI_CharCreation_Copy', Lang.text('Mods.SandboxWorld.CharSelect.Export'), () => {
        void this.exportCharacter(meta);
      }, 'UI_ButtonBacking');
      // 删除钮（收藏防删，UICharacterListItem.cs:114-116 原版仅 !IsFavorite 挂
      // 处理器：收藏行禁用态 + 悬停显 UI.CannotDeleteFavorited）
      const del = document.createElement('div');
      del.className = 'sw-vitem-del';
      const delLabelKey = meta.favorite
        ? () => Lang.text('UI.CannotDeleteFavorited')
        : () => Lang.text('UI.Delete');
      const delFn: (() => void) | null = meta.favorite ? null : async () => {
        if (!confirm(Lang.text('Mods.SandboxWorld.CharSelect.ConfirmDelete',
          a.name || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed')))) return;
        await this.store.delete(meta.id);
        await this.reload();
      };
      this.iconBtn(del, 'UI_ButtonDelete', delLabelKey(), () => {
        if (delFn) void delFn();
      });
      // 收藏行删除钮禁用态（原版不挂处理器 = 点了没反应；这里再压透明度提示）
      if (meta.favorite) {
        const img = del.querySelector('img');
        if (img) { img.style.opacity = '0.35'; img.style.cursor = 'not-allowed'; }
      }
      const label = document.createElement('div');
      label.className = 'sw-vitem-label';
      if (TOUCH_LABELS) label.textContent = Lang.text('UI.Play');
      const delLabel = document.createElement('div');
      delLabel.className = 'sw-vitem-del-label';
      btns.append(label); // 同 WorldSelect：标签入按钮流（见彼处注）
      el.append(doll, info, btns, del, delLabel);
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
    // ★防重入门（2026-08-25）：行 click+dblclick 双挂，双击时 dblclick 派发到已
    //   拆离行 → 二次 close 重跑 fn → showWorldSelect 连建两层世界列表（像素级
    //   重叠），点顶层进游戏后底层浮在加载页/游戏画面上（用户报偶发竞态）。
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.unsubLang?.();
    this.panel.remove();
    fn?.();
  }
}

/** 无随身态角色的缺省 playerState(新角色/从未进过世界=原版全新 .plr 初始形) */
function emptyPlayerState(a: Appearance): SaveData['player'] {
  return {
    hp: 100, x: 0, y: 0,
    inventory: Array.from({ length: 58 }, () => null),
    selected: 0,
    baseMaxHp: 100, baseMaxMana: 20, mana: 20,
    banks: [[], [], [], []],
    armor: Array.from({ length: 20 }, () => null),
    dye: Array.from({ length: 10 }, () => null),
    miscEquips: Array.from({ length: 5 }, () => null),
    miscDyes: Array.from({ length: 5 }, () => null),
    buffs: [],
    hideInfo: Array.from({ length: 13 }, () => false),
    hideVisibleAccessory: Array.from({ length: 10 }, () => false),
  } as SaveData['player'];
}
