// Mods 管理面板(2026-10-04 P0;2026-10-13 v2 重构=资源包页同款视觉):
// 卡体 modal + 图标行(icon.png dataURL)+ 启停 checkbox + ⚙ config 折叠面板 +
// 卸载 + 导入 .swmod + 重载生效。启停/安装/卸载都改注册表但【不热更注册表】——
// mod 注册发生在启动链,变更后需 reload 生效(与 tModLoader " mods 改动后重启" 同哲学)。
// ★v2 用户实报:旧面板布局怪(checkbox/卸载叠在名字上)、无图标——.swmod 现支持
//   包根 icon.png(pack.ts 提取 dataURL,store 行持久化)。
import { ModStore, type ModRow } from './store';
import { readModPack } from './pack';
import { getModLoadResult } from './loader';
import { loadModConfigValues, type ModConfigState } from './config';
import { buildModConfigRows } from './configUi';
import { proceduralModIcon } from './icons';
import { Lang } from '../i18n/Lang';

let panel: HTMLElement | null = null;

const CSS = `
#sw-mods-panel { position: fixed; inset: 0; z-index: 9000; background: rgba(4,6,14,.82);
  display: flex; align-items: center; justify-content: center;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif; }
#sw-mods-panel .card { position: relative; width: min(680px, 92vw); max-height: 82vh; overflow-y: auto;
  background: #241a4e; border: 2px solid #7d92d6; box-shadow: 0 0 0 2px #0a0e1e;
  border-radius: 6px; padding: 20px 24px; color: #e8e8f4; }
#sw-mods-panel h3 { margin: 0 0 12px; font-size: 17px; letter-spacing: 2px; color: #ffd76e;
  text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000; }
#sw-mods-panel .sw-modal-close { position: absolute; top: 10px; right: 14px; padding: 5px 12px;
  border-radius: 3px; border: 1px solid #7d92d6; background: #3a2a5a; color: #fff;
  cursor: pointer; font-family: inherit; font-size: 13px; }
#sw-mods-panel .sw-modal-close:hover { background: #4a5aa0; }
#sw-mods-panel .toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
#sw-mods-panel .toolbar button { background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6;
  border-radius: 4px; padding: 6px 12px; cursor: pointer; font-family: inherit; font-size: 13px; }
#sw-mods-panel .toolbar button:hover { background: #4a5aa0; }
#sw-mods-panel .cols { display: flex; flex-direction: column; gap: 8px; }
#sw-mods-panel .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; padding: 8px 10px; }
#sw-mods-panel .row:hover { background: #232c5c; }
#sw-mods-panel .icon, #sw-mods-panel .icon-ph { width: 44px; height: 44px; flex: none;
  object-fit: contain; image-rendering: pixelated; border: 1px solid #3a4680;
  border-radius: 3px; background: #141a36; }
#sw-mods-panel .icon-ph { display: flex; align-items: center; justify-content: center;
  color: #5a6390; font-size: 20px; }
#sw-mods-panel .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
#sw-mods-panel .name { color: #e8e8f4; font-size: 13px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
#sw-mods-panel .sub { color: #8a90b8; font-size: 11px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
#sw-mods-panel .btns { display: flex; gap: 3px; flex: none; align-items: center; }
#sw-mods-panel .btns button { background: #232c52; color: #e8e8f4; border: 1px solid #3a4680;
  border-radius: 3px; padding: 3px 7px; cursor: pointer; font-family: inherit; font-size: 12px; }
#sw-mods-panel .btns button:hover { background: #4a5aa0; }
#sw-mods-panel .btns button.del:hover { background: #6a3050; }
#sw-mods-panel .btns input[type=checkbox] { accent-color: #ffd76e; width: 16px; height: 16px;
  cursor: pointer; }
#sw-mods-panel .cfg { width: 100%; display: flex; flex-direction: column; gap: 4px;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; padding: 8px 10px; }
#sw-mods-panel .cfg-title { color: #ffe8a0; font-size: 12px; }
#sw-mods-panel .cfgrow { display: flex; align-items: center; gap: 8px; }
#sw-mods-panel .cfgrow label { flex: 1; font-size: 12px; color: #b8b8cc; }
#sw-mods-panel .cfgrow input[type=text], #sw-mods-panel .cfgrow input[type=number] {
  width: 90px; background: #15151f; color: #e8e8f0; border: 1px solid #44445a;
  border-radius: 3px; padding: 2px 6px; }
#sw-mods-panel .errs { margin-top: 10px; font-size: 12px; color: #ff9a9a;
  white-space: pre-wrap; }
#sw-mods-panel .hint { margin-top: 8px; font-size: 12px; color: #8fd08f; }
#sw-mods-panel .empty { color: #8a90b8; padding: 14px 0; text-align: center; }
`;

/** ★D11(2026-10-14):热重载尝试(菜单态=无 __swGame;游戏内=false 回退提示)。
 *  成功=hint 更新「已生效」;失败/游戏内=false 由调用方回退 ReloadToApply 文案。 */
async function tryHotReload(hintEl: HTMLElement): Promise<boolean> {
  const w = window as unknown as { __swGame?: unknown };
  if (w.__swGame) return false;   // 游戏内:teardown 会悬空活实体引用,回退提示
  try {
    const { hotReloadMods } = await import('./hotReload');
    const atlas = (window as unknown as { __swAtlas?: unknown }).__swAtlas;
    if (!atlas) return false;
    const r = await hotReloadMods(atlas);
    if (r.ok) {
      hintEl.textContent = `${Lang.text('Mods.SandboxWorld.ModsPanel.HotReloaded')}${r.counts ? ` (${r.counts.items} items)` : ''}`;
      return true;
    }
    // ★R-C-F4(2026-10-14):失败=阻断弹窗(旧=console.warn+小字提示,用户错过
    //  → 缺 mod 进世界 → autosave 洗档不可逆)。确认后仍回退 reload 文案。
    console.warn('[mods] 热重载失败:', r.errors.join('; '));
    window.alert(`Mod 热重载失败:\n${r.errors.slice(0, 3).join('\n')}\n\n请刷新页面后再进入存档(避免 mod 内容丢失)。`);
    return false;
  } catch (err) {
    console.warn('[mods] 热重载异常:', err);
    return false;
  }
}

export function openModsPanel(): void {
  if (panel?.isConnected) return;
  const store = new ModStore();
  panel = document.createElement('div');
  panel.id = 'sw-mods-panel';
  panel.innerHTML = `
    <style>${CSS}</style>
    <div class="card">
      <button class="sw-modal-close" data-act="close">✕</button>
      <h3 data-t="title"></h3>
      <div class="toolbar">
        <button data-act="import"></button>
        <button data-act="reload"></button>
      </div>
      <div class="cols" data-list></div>
      <div class="errs" data-errs></div>
      <div class="hint" data-hint></div>
    </div>
  `;
  document.body.appendChild(panel);
  const root = panel;
  const listEl = root.querySelector('[data-list]') as HTMLElement;
  const errsEl = root.querySelector('[data-errs]') as HTMLElement;
  const hintEl = root.querySelector('[data-hint]') as HTMLElement;

  const text = (k: string): string => Lang.text(k);

  root.querySelector('[data-t]')!.textContent = text('Mods.SandboxWorld.ModsPanel.Title');
  (root.querySelector('[data-act=import]') as HTMLElement).textContent = text('Mods.SandboxWorld.ModsPanel.Import');
  (root.querySelector('[data-act=reload]') as HTMLElement).textContent = text('Mods.SandboxWorld.ModsPanel.Reload');
  (root.querySelector('[data-act=close]') as HTMLElement).textContent = '✕';

  const close = (): void => { root.remove(); panel = null; };
  root.querySelector('[data-act=close]')?.addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  (root.querySelector('[data-act=reload]') as HTMLElement).addEventListener('click', () => location.reload());

  // 装载错误展示
  const result = getModLoadResult();
  if (result && result.errors.length > 0) {
    errsEl.textContent = `${text('Mods.SandboxWorld.ModsPanel.LoadErrors')}\n` +
      result.errors.map((e) => `${e.modId}: ${e.error}`).join('\n');
  }

  const refresh = async (): Promise<void> => {
    const rows = await store.listRows();
    // ★图标补齐(2026-10-13 用户实报:第三方移植包无 icon.png,占位字母难看)——
    //   已装行缺图标就地程序化生成并回写注册表(一次性;同 id 确定性,刷新不漂移)。
    //   新装包走 pack.ts 同款兜底,此处只管存量行。
    let backfilled = false;
    for (const r of rows) {
      if (r.iconDataUrl) continue;
      const ic = proceduralModIcon(r.id, r.name);
      if (ic) { r.iconDataUrl = ic; backfilled = true; }
    }
    if (backfilled) void store.saveRows(rows).catch(() => { /* 持久化失败=本会话仍有图标 */ });
    listEl.textContent = '';
    if (rows.length === 0) {
      listEl.innerHTML = `<div class="empty">${text('Mods.SandboxWorld.ModsPanel.Empty')}</div>`;
      return;
    }
    for (const row of rows) listEl.appendChild(rowEl(row));
  };

  // ---- 配置编辑(P2/P4 红蓝修正 D-m4):声明式 config 表 → 内联控件;变更落 kv。
  //      ★语义:本面板编辑的是独立实例,entry 已持有的 sw.config 实例【重载后才
  //      感知新值】(与 ReloadToApply 哲学一致;旧注释"恒读最新值"系误导) ----
  const attachConfig = (holder: HTMLElement, row: ModRow): void => {
    const manifest = getModLoadResult()?.loaded.find((l) => l.manifest.id === row.id)?.manifest;
    const cfg = manifest?.config;
    if (!cfg || Object.keys(cfg).length === 0) return;
    void loadModConfigValues(row.id, cfg).then((state) => {
      const block = buildModConfigRows(state as ModConfigState);
      const title = document.createElement('div');
      title.className = 'cfg-title';
      title.textContent = text('Mods.SandboxWorld.ModsPanel.ConfigTitle');
      block.prepend(title);
      holder.appendChild(block);
    }).catch(() => { /* 配置读坏=跳过编辑区 */ });
  };

  const rowEl = (row: ModRow): HTMLElement => {
    const div = document.createElement('div');
    div.className = 'row';
    // 图标(包根 icon.png dataURL;缺省=占位框)
    const icon = row.iconDataUrl
      ? Object.assign(document.createElement('img'), { src: row.iconDataUrl, draggable: false })
      : null;
    if (icon) { icon.className = 'icon'; div.append(icon); }
    else {
      const ph = document.createElement('div');
      ph.className = 'icon-ph';
      ph.textContent = row.name.charAt(0).toUpperCase();
      div.append(ph);
    }
    const mid = document.createElement('div');
    mid.className = 'mid';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = row.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `v${row.version}${row.author ? ` · ${row.author}` : ''} · ${row.id}`;
    mid.append(name, sub);
    div.append(mid);
    // 启停(checkbox;变更=注册表+重载提示,不热更)——★处理态:写入期禁用防连点
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = row.enabled;
    toggle.title = text('Mods.SandboxWorld.ModsPanel.ReloadToApply');
    toggle.addEventListener('change', async (e) => {
      toggle.disabled = true;
      try {
        await store.setEnabled(row.id, (e.target as HTMLInputElement).checked);
        // ★D11(2026-10-14):热重载(菜单态免整页 reload;游戏内回退提示)
        const reloaded = await tryHotReload(hintEl);
        if (!reloaded) hintEl.textContent = text('Mods.SandboxWorld.ModsPanel.ReloadToApply');
      } finally {
        toggle.disabled = false;
      }
    });
    const btns = document.createElement('div');
    btns.className = 'btns';
    btns.append(toggle);
    div.append(btns);
    // ⚙ config 折叠面板(有声明式 config 的 mod 才有)
    const manifest = getModLoadResult()?.loaded.find((l) => l.manifest.id === row.id)?.manifest;
    if (manifest?.config && Object.keys(manifest.config).length > 0) {
      const gear = document.createElement('button');
      gear.textContent = '⚙';
      gear.title = text('Mods.SandboxWorld.ModsPanel.ConfigTitle');
      gear.addEventListener('click', () => {
        const existing = div.querySelector(':scope > .cfg');
        if (existing) { existing.remove(); return; }
        attachConfig(div, row);
      });
      btns.append(gear);
    }
    // 卸载(★处理态:移除+缓存清理期间禁用+省略号,防"以为没点到"连点)
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = text('Mods.SandboxWorld.ModsPanel.Uninstall');
    del.addEventListener('click', async () => {
      if (del.disabled) return;
      del.disabled = true;
      del.textContent = '…';
      try {
        await store.remove(row.id);
        // ★三百十二:SW mod 缓存前缀清理(资源随卸载出库;幂等 best-effort)
        try {
          const { purgeModAssetsCache } = await import('./assets');
          await purgeModAssetsCache(row.id);
        } catch { /* 清理失败不阻断卸载 */ }
        // ★D11:热重载(菜单态;游戏内回退提示)
        const reloaded = await tryHotReload(hintEl);
        if (!reloaded) hintEl.textContent = text('Mods.SandboxWorld.ModsPanel.ReloadToApply');
      } finally {
        // refresh 重建列表会丢弃本行;失败兜底还原按钮态
        del.textContent = '✕';
        del.disabled = false;
      }
      void refresh();
    });
    btns.append(del);
    return div;
  };

  // 导入 .swmod(zip)——★处理态:解析+落库期间按钮禁用+「处理中…」防连点
  let importBusy = false;
  const importBtn = root.querySelector('[data-act=import]') as HTMLElement;
  importBtn.addEventListener('click', () => {
    if (importBusy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.swmod,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || importBusy) return;
      importBusy = true;
      const prevLabel = importBtn.textContent;
      importBtn.setAttribute('aria-busy', 'true');
      (importBtn as HTMLButtonElement).disabled = true;
      importBtn.textContent = text('Mods.SandboxWorld.ModsPanel.Busy');
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pack = readModPack(bytes);
        await store.install(pack.manifest, bytes, pack.iconDataUrl);
        // ★D11:热重载(菜单态)
      if (!(await tryHotReload(hintEl))) {
        hintEl.textContent = `${text('Mods.SandboxWorld.ModsPanel.Installed')}: ${pack.manifest.name} v${pack.manifest.version} — ${text('Mods.SandboxWorld.ModsPanel.ReloadToApply')}`;
      }
        void refresh();
      } catch (e) {
        errsEl.textContent = `${text('Mods.SandboxWorld.ModsPanel.InstallFail')}: ${(e as Error).message}`;
      } finally {
        importBtn.textContent = prevLabel;
        (importBtn as HTMLButtonElement).disabled = false;
        importBtn.removeAttribute('aria-busy');
        importBusy = false;
      }
    };
    input.click();
  });

  void refresh();
}

export function closeModsPanel(): void {
  panel?.remove();
  panel = null;
}
