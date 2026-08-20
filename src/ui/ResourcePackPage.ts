// 设置·资源包页（M13）——UIResourcePackSelectionMenu + UIResourcePackInfoMenu 的
// DOM 复刻：可用/已启用双列（计数入题）、行内 启用/禁用·信息·前移/后移·卸载、
// 上传 zip、信息子页（名称/作者/版本/简介/返回）。
// 交互语义对齐反编译：
//   - 启用 = 置顶优先 + 立即生效（CreatePackToggleButton.OnLeftClick :200-207 每击
//     即 ResetAllContentBasedRenderTargets；本仓=立即注入/撤销+重烘）；
//   - 调序 tooltip = UI.OffsetTexturePackPriorityUp/Down（原版"向前移动"=offset+1
//     =优先级↑=列表下移——本页 ↑ 即 offset+1，语义以 tooltip 为准）；
//   - 列题 = UI.Available/EnabledResourcePacksTitle（{Amount} 命名占位）。
// 行视觉参照 UIResourcePack.cs（图标+名称+作者 0.7 缩放）；Web 增项：上传/卸载。
import { Lang } from '../i18n/Lang';
import { getResourcePacks, type ResourcePackManager } from '../resources/ResourcePackManager';
import { enabledSorted, disabledSorted, type PackRow } from '../resources/ResourcePackList';
import { ResourcePackError } from '../resources/ResourcePackZip';

export const RESOURCE_PACK_PAGE_CSS = `
.sw-rp-wrap { display: flex; flex-direction: column; gap: 10px; min-height: 240px; }
.sw-rp-cols { display: flex; gap: 10px; flex: 1; min-height: 0; }
.sw-rp-col { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; padding: 6px; }
.sw-rp-col-title { color: #ffe8a0; font-size: 13px; text-align: center; margin-bottom: 2px; }
.sw-rp-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; max-height: 44vh; }
.sw-rp-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  background: rgba(26,40,89,.8); border: 1px solid rgba(13,20,44,.8); border-radius: 4px; }
.sw-rp-row:hover { background: rgb(46,60,119); }
.sw-rp-icon, .sw-rp-icon-ph { width: 40px; height: 40px; flex: none; }
.sw-rp-icon { object-fit: contain; image-rendering: pixelated;
  border: 1px solid #3a4680; border-radius: 3px; }
.sw-rp-icon-ph { display: flex; align-items: center; justify-content: center;
  color: #5a6390; font-size: 18px; background: #141a36;
  border: 1px solid #3a4680; border-radius: 3px; }
.sw-rp-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sw-rp-name { color: #e8e8f4; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw-rp-author { color: #8a90b8; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw-rp-btns { display: flex; gap: 3px; flex: none; }
.sw-rp-btns button { background: #232c52; color: #e8e8f4; border: 1px solid #3a4680;
  border-radius: 3px; padding: 3px 7px; cursor: pointer; font-family: inherit; font-size: 12px; }
.sw-rp-btns button:hover { background: #4a5aa0; }
.sw-rp-btns button.on { color: #9fe6a0; }
.sw-rp-btns button.del:hover { background: #6a3050; }
.sw-rp-toolbar { display: flex; gap: 8px; align-items: center; }
.sw-rp-toolbar button { background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6;
  border-radius: 4px; padding: 6px 12px; cursor: pointer; font-family: inherit; }
.sw-rp-toolbar button:hover { background: #4a5aa0; }
.sw-rp-toolbar button:disabled { opacity: .5; cursor: default; }
.sw-rp-err { color: #ff9a9a; font-size: 12px; white-space: pre-wrap; }
.sw-rp-empty { color: #8a90b8; font-size: 12px; text-align: center; padding: 12px 4px; }
.sw-rp-info-head { display: flex; flex-direction: column; gap: 6px; align-items: center; margin: 6px 0 4px; }
.sw-rp-info-name { color: #ffe8a0; font-size: 16px; text-shadow: 1px 1px 0 #000; }
.sw-rp-info-meta { display: flex; gap: 16px; width: 100%; justify-content: space-between; }
.sw-rp-info-author { color: #c8d0f0; font-size: 12px; }
.sw-rp-info-version { color: #b8c0d8; font-size: 12px; }
.sw-rp-info-desc { color: #c8d0f0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-y: auto; max-height: 42vh; }
.sw-rp-divider { height: 1px; background: linear-gradient(90deg, transparent, #5964c9, transparent); margin: 2px 0 10px; }
.sw-rp-back { align-self: center; margin-top: 10px; }
`;

type View = { kind: 'main' } | { kind: 'info'; id: string };

/** vanilla UpdateTitles：FormatWith(new { Amount = list.Count })（命名占位非 {0}） */
function amountTitle(key: string, n: number): string {
  return Lang.text(key).replace('{Amount}', String(n));
}

/** 构建资源包页根节点（SettingsPanel 的 packs 分栏内容） */
export function buildResourcePackPage(): HTMLElement {
  const mgr = getResourcePacks();
  const root = document.createElement('div');
  root.className = 'sw-rp-wrap';
  let view: View = { kind: 'main' };

  const render = (): void => {
    root.innerHTML = '';
    root.append(view.kind === 'main'
      ? buildMain(mgr, (v) => { view = v; render(); })
      : buildInfo(mgr, view.id, render));
  };
  render();
  // 首帧用当前行(启动已恢复),异步补拉后有行则重绘（面板先于 applyInstalled 的窗口）
  void mgr.refreshRows().then(() => {
    if (mgr.rows.length) render();
  });
  return root;
}

function buildMain(mgr: ResourcePackManager, go: (v: View) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sw-rp-wrap';

  // ---- 工具条：上传 ----
  const bar = document.createElement('div');
  bar.className = 'sw-rp-toolbar';
  const upload = document.createElement('button');
  upload.textContent = Lang.text('Mods.SandboxWorld.ResourcePacks.Upload');
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.zip';
  file.style.display = 'none';
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    upload.disabled = true;
    let errMsg: string | null = null;
    try {
      await mgr.importPack(f);
    } catch (e) {
      errMsg = e instanceof ResourcePackError
        ? Lang.text('Mods.SandboxWorld.ResourcePacks.ImportFailed', (e as Error).message)
        : `${(e as Error).message}`;
    } finally {
      upload.disabled = false;
    }
    if (errMsg) {
      const err = document.createElement('div');
      err.className = 'sw-rp-err';
      err.textContent = errMsg;
      wrap.append(err);
      return;
    }
    go({ kind: 'main' });   // 重绘主列
  });
  bar.append(upload, file);
  wrap.append(bar);

  // ---- 双列 ----
  const cols = document.createElement('div');
  cols.className = 'sw-rp-cols';
  const mkCol = (rows: PackRow[], enabledCol: boolean): HTMLElement => {
    const col = document.createElement('div');
    col.className = 'sw-rp-col';
    const h = document.createElement('div');
    h.className = 'sw-rp-col-title';
    h.textContent = amountTitle(enabledCol ? 'UI.EnabledResourcePacksTitle' : 'UI.AvailableResourcePacksTitle', rows.length);
    col.append(h);
    const list = document.createElement('div');
    list.className = 'sw-rp-list';
    if (rows.length === 0) {
      const e = document.createElement('div');
      e.className = 'sw-rp-empty';
      e.textContent = Lang.text('Mods.SandboxWorld.ResourcePacks.Empty');
      list.append(e);
    } else {
      for (const row of rows) list.append(mkRow(mgr, row, go));
    }
    col.append(list);
    return col;
  };
  cols.append(
    mkCol(disabledSorted(mgr.rows), false),
    mkCol(enabledSorted(mgr.rows), true),
  );
  wrap.append(cols);

  const hint = document.createElement('div');
  hint.className = 'sw-set-hint';
  hint.textContent = Lang.text('Mods.SandboxWorld.ResourcePacks.Hint');
  wrap.append(hint);
  return wrap;
}

/** 单行（UIResourcePack 面板：图标+名称+作者 + 按钮组） */
function mkRow(mgr: ResourcePackManager, row: PackRow, go: (v: View) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sw-rp-row';
  const icon = document.createElement(row.iconDataUrl ? 'img' : 'div') as HTMLImageElement | HTMLDivElement;
  icon.className = row.iconDataUrl ? 'sw-rp-icon' : 'sw-rp-icon-ph';
  if (row.iconDataUrl) (icon as HTMLImageElement).src = row.iconDataUrl;
  else icon.textContent = '?';   // 原版默认图标素材未提取(Images/UI/DefaultResourcePackIcon 不在集)——占位

  const mid = document.createElement('div');
  mid.className = 'sw-rp-mid';
  const name = document.createElement('div');
  name.className = 'sw-rp-name';
  name.textContent = row.name;
  const author = document.createElement('div');
  author.className = 'sw-rp-author';
  author.textContent = Lang.text('UI.Author', row.author || '—');   // UIResourcePack.cs:68 同款
  mid.append(name, author);

  const rerender = (): void => go({ kind: 'main' });
  const btns = document.createElement('div');
  btns.className = 'sw-rp-btns';
  const mkBtn = (label: string, title: string, fn: () => void | Promise<void>, cls = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    if (cls) b.classList.add(cls);
    b.addEventListener('click', () => { void fn(); });
    return b;
  };
  // 启用/禁用（GameUI.Enabled/Disabled 文案 + Enable/DisableTexturePack tooltip）
  btns.append(mkBtn(
    Lang.text(row.enabled ? 'GameUI.Disabled' : 'GameUI.Enabled'),
    Lang.text(row.enabled ? 'UI.DisableTexturePack' : 'UI.EnableTexturePack'),
    async () => { await mgr.setEnabled(row.id, !row.enabled); rerender(); },
    row.enabled ? 'on' : '',
  ));
  // 信息（UI.SeeTexturePackInfo）→ 信息子页
  btns.append(mkBtn('ⓘ', Lang.text('UI.SeeTexturePackInfo'), () => go({ kind: 'info', id: row.id })));
  // 调序（仅启用列；↑ = UI.OffsetTexturePackPriorityUp = offset+1 = 优先级↑）
  if (row.enabled) {
    btns.append(
      mkBtn('↓', Lang.text('UI.OffsetTexturePackPriorityDown'), async () => { await mgr.move(row.id, -1); rerender(); }),
      mkBtn('↑', Lang.text('UI.OffsetTexturePackPriorityUp'), async () => { await mgr.move(row.id, 1); rerender(); }),
    );
  }
  // 卸载（Web 增项）
  btns.append(mkBtn('✕', Lang.text('Mods.SandboxWorld.ResourcePacks.Remove'), async () => { await mgr.remove(row.id); rerender(); }, 'del'));

  el.append(icon, mid, btns);
  return el;
}

/** 信息子页（UIResourcePackInfoMenu：金名 / 作者·版本分列 / 分隔线 / 简介滚动区 / 返回） */
function buildInfo(mgr: ResourcePackManager, id: string, back: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sw-rp-wrap';
  const info = mgr.info(id);
  if (!info) {   // 行已被他处卸载：退回主列
    back();
    return wrap;
  }
  const { row, version } = info;
  const head = document.createElement('div');
  head.className = 'sw-rp-info-head';
  const nm = document.createElement('div');
  nm.className = 'sw-rp-info-name';
  nm.textContent = row.name;                       // 金色大字（TextColor.Gold）
  const meta = document.createElement('div');
  meta.className = 'sw-rp-info-meta';
  const au = document.createElement('div');
  au.className = 'sw-rp-info-author';
  au.textContent = Lang.text('UI.Author', row.author || '—');   // 左对齐（HAlign 0）
  const ver = document.createElement('div');
  ver.className = 'sw-rp-info-version';
  ver.textContent = Lang.text('UI.Version', version);           // 右对齐银字（Color.Silver）
  meta.append(au, ver);
  head.append(nm, meta);
  const divider = document.createElement('div');
  divider.className = 'sw-rp-divider';              // Images/UI/Divider
  const desc = document.createElement('div');
  desc.className = 'sw-rp-info-desc';
  desc.textContent = row.description || '—';
  const backBtn = document.createElement('button');
  backBtn.className = 'sw-rp-back sw-set-back';
  backBtn.textContent = Lang.text('LegacyMenu.6');  // 返回
  backBtn.addEventListener('click', back);
  wrap.append(head, divider, desc, backBtn);
  return wrap;
}
