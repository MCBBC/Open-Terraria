// 游戏内模组设置面板(2026-10-13 用户令):暂停菜单「模组设置」入口 → 双栏 modal
// ——左栏=已启用 mod 列表(图标+名),右栏=选中 mod 的声明式配置编辑。
// ★实时生效语义(用户明令"游戏中修改mod的配置需要实时生效"):编辑【活实例】
//   (loader 装载相位注册的 ModConfigState=mod entry 持有的 sw.config 本体)——
//   逐拍/逐发读 config 的 mod 立刻感知;set 内建 kvSet 持久化,重载不丢。
//   仅"装载期只读一次"的 mod 属例外(值已烘焙,重载后随 kv 生效——提示行如实标注)。
// 暂停菜单保持在场(面板关闭=回暂停菜单);Esc/E 捕获拦截仿 BestiaryPanel
// (防全局 Esc 链同时关暂停菜单/开背包);打开期 uiBlocking=true 阻断世界输入。
import { getModLoadResult } from './loader';
import { getLiveModConfig, loadModConfigValues, type ModConfigState } from './config';
import { buildModConfigRows } from './configUi';
import { proceduralModIcon } from './icons';
import { ModStore } from './store';
import { Lang } from '../i18n/Lang';

let panel: HTMLElement | null = null;

const CSS = `
#sw-mod-settings { position: fixed; inset: 0; z-index: 9100; background: rgba(4,6,14,.82);
  display: flex; align-items: center; justify-content: center;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif; }
#sw-mod-settings .card { position: relative; width: min(760px, 94vw); height: min(560px, 82vh);
  display: flex; flex-direction: column;
  background: #241a4e; border: 2px solid #7d92d6; box-shadow: 0 0 0 2px #0a0e1e;
  border-radius: 6px; padding: 16px 20px; color: #e8e8f4; box-sizing: border-box; }
#sw-mod-settings h3 { margin: 0 0 10px; font-size: 17px; letter-spacing: 2px; color: #ffd76e;
  text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000; }
#sw-mod-settings .sw-modal-close { position: absolute; top: 10px; right: 14px; padding: 5px 12px;
  border-radius: 3px; border: 1px solid #7d92d6; background: #3a2a5a; color: #fff;
  cursor: pointer; font-family: inherit; font-size: 13px; }
#sw-mod-settings .sw-modal-close:hover { background: #4a5aa0; }
#sw-mod-settings .cols { flex: 1; min-height: 0; display: flex; gap: 10px; }
#sw-mod-settings .list { width: 218px; flex: none; overflow-y: auto; display: flex;
  flex-direction: column; gap: 6px; padding-right: 2px; }
#sw-mod-settings .mrow { display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; cursor: pointer; }
#sw-mod-settings .mrow:hover { background: #232c5c; }
#sw-mod-settings .mrow.sel { border-color: #ffd76e; background: #2a3160; }
#sw-mod-settings .mrow img, #sw-mod-settings .mrow .ph { width: 30px; height: 30px; flex: none;
  object-fit: contain; image-rendering: pixelated; border: 1px solid #3a4680;
  border-radius: 3px; background: #141a36; }
#sw-mod-settings .mrow .ph { display: flex; align-items: center; justify-content: center;
  color: #5a6390; font-size: 15px; }
#sw-mod-settings .mrow .nm { min-width: 0; font-size: 12px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
#sw-mod-settings .detail { flex: 1; min-width: 0; overflow-y: auto; display: flex;
  flex-direction: column; gap: 8px; }
#sw-mod-settings .dname { font-size: 14px; color: #ffe8a0; }
#sw-mod-settings .dsub { font-size: 11px; color: #8a90b8; }
#sw-mod-settings .nocfg { color: #8a90b8; font-size: 12px; padding: 18px 0; text-align: center; }
#sw-mod-settings .cfgrow label { flex: 1; font-size: 12px; color: #b8b8cc; }
#sw-mod-settings .cfgrow input[type=text], #sw-mod-settings .cfgrow input[type=number] {
  width: 110px; background: #15151f; color: #e8e8f0; border: 1px solid #44445a;
  border-radius: 3px; padding: 2px 6px; }
#sw-mod-settings .hint { margin-top: 8px; font-size: 11px; color: #8fd08f; flex: none; }
`;

/** 打开游戏内模组设置(暂停菜单入口;单例)。openGame 传现役 Game——
 *  打开期 uiBlocking=true 阻断世界输入,关闭还原。 */
export function openModSettingsPanel(openGame?: unknown): void {
  if (panel?.isConnected) return;
  const g = openGame as { input?: { uiBlocking?: boolean } } | undefined;
  panel = document.createElement('div');
  panel.id = 'sw-mod-settings';
  panel.innerHTML = `
    <style>${CSS}</style>
    <div class="card">
      <button class="sw-modal-close">✕</button>
      <h3></h3>
      <div class="cols">
        <div class="list" data-list></div>
        <div class="detail" data-detail></div>
      </div>
      <div class="hint" data-hint></div>
    </div>
  `;
  document.body.appendChild(panel);
  const root = panel;
  const listEl = root.querySelector('[data-list]') as HTMLElement;
  const detailEl = root.querySelector('[data-detail]') as HTMLElement;
  const text = (k: string): string => Lang.text(k);

  (root.querySelector('h3') as HTMLElement).textContent = text('Mods.SandboxWorld.ModSettings.Title');
  const hintEl = root.querySelector('.hint') as HTMLElement;

  // 输入隔离(仿 BestiaryPanel):Esc/E 捕获拦截防全局链同时关暂停菜单/开背包
  const inputBlock = (e: KeyboardEvent): void => {
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.code === 'Escape') close();
  };
  const wasBlocking = !!g?.input?.uiBlocking;
  if (g?.input) g.input.uiBlocking = true;
  window.addEventListener('keydown', inputBlock, true);

  const close = (): void => {
    window.removeEventListener('keydown', inputBlock, true);
    if (g?.input && !wasBlocking) g.input.uiBlocking = false;
    root.remove();
    panel = null;
  };
  root.querySelector('.sw-modal-close')?.addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  const loaded = getModLoadResult()?.loaded ?? [];
  let selected: string | null = null;
  /** 真 icon.png dataURL(标题屏同源 store 行;异步取回后回填) */
  const iconUrls = new Map<string, string>();
  void new ModStore().listRows().then((rows) => {
    for (const r of rows) if (r.iconDataUrl) iconUrls.set(r.id, r.iconDataUrl);
    // 回填已渲染行(store 异步晚于首绘)
    for (const el of Array.from(listEl.children) as HTMLElement[]) {
      const id = el.dataset.modId;
      const url = id ? iconUrls.get(id) : undefined;
      const img = el.querySelector('img') as HTMLImageElement | null;
      if (url && img) img.src = url;
    }
  }).catch(() => { /* store 读坏=程序化图标兜底 */ });

  const renderDetail = async (modId: string): Promise<void> => {
    detailEl.textContent = '';
    const entry = loaded.find((l) => l.manifest.id === modId);
    if (!entry) return;
    const name = document.createElement('div');
    name.className = 'dname';
    name.textContent = entry.manifest.name;
    const sub = document.createElement('div');
    sub.className = 'dsub';
    sub.textContent = `v${entry.manifest.version}${entry.manifest.author ? ` · ${entry.manifest.author}` : ''}`;
    detailEl.append(name, sub);
    const cfg = entry.manifest.config;
    if (!cfg || Object.keys(cfg).length === 0) {
      const empty = document.createElement('div');
      empty.className = 'nocfg';
      empty.textContent = text('Mods.SandboxWorld.ModSettings.NoConfig');
      detailEl.appendChild(empty);
      return;
    }
    // ★活实例优先(用户明令实时生效):loader 装载相位注册的 sw.config 本体,
    //   逐拍/逐发读 config 的 mod 立刻感知;未装载成功(脚本失败)回落独立实例
    //   (kv 持久化,重载后生效——提示行如实切换)
    let state: ModConfigState | null = getLiveModConfig(modId);
    hintEl.textContent = text(state
      ? 'Mods.SandboxWorld.ModSettings.LiveHint'
      : 'Mods.SandboxWorld.ModSettings.ReloadHint');
    if (!state) {
      try { state = await loadModConfigValues(modId, cfg); }
      catch { return; /* 配置读坏=空编辑区 */ }
    }
    detailEl.appendChild(buildModConfigRows(state));
  };

  const renderList = (): void => {
    listEl.textContent = '';
    for (const l of loaded) {
      const row = document.createElement('div');
      row.className = 'mrow' + (l.manifest.id === selected ? ' sel' : '');
      row.dataset.modId = l.manifest.id;
      const m = l.manifest;
      const img = document.createElement('img');
      img.draggable = false;
      // 图标=store 行真 dataURL 优先(有 icon.png 的 mod),程序化图标确定性兜底
      // (store 异步晚于首绘 → 回填臂见上)
      img.src = iconUrls.get(m.id) ?? proceduralModIcon(m.id, m.name) ?? '';
      if (!img.src) {
        const ph = document.createElement('div');
        ph.className = 'ph';
        ph.textContent = m.name.charAt(0).toUpperCase();
        row.append(ph);
      } else row.append(img);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = m.name;
      row.append(nm);
      row.addEventListener('click', () => {
        if (selected === m.id) return;
        selected = m.id;
        for (const el of listEl.children) el.classList.remove('sel');
        row.classList.add('sel');
        void renderDetail(m.id);
      });
      listEl.appendChild(row);
    }
  };

  if (loaded.length > 0) {
    selected = loaded[0].manifest.id;
    renderList();
    void renderDetail(selected);
  } else {
    const empty = document.createElement('div');
    empty.className = 'nocfg';
    empty.textContent = text('Mods.SandboxWorld.ModSettings.SelectHint');
    detailEl.appendChild(empty);
  }
}

export function closeModSettingsPanel(): void {
  panel?.remove();
  panel = null;
}
