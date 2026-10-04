// Mods 管理面板(2026-10-04,P0):标题菜单入口,列出已装 mod/启停/导入 .swmod/卸载。
// 自包含 DOM 面板(openAssetDiagPanel 同款模式;零 flow 耦合)。
// 启停/安装/卸载都改注册表但【不热更注册表】——mod 注册发生在启动链,变更后
// 需 reload 生效(面板提供重载钮;与 tModLoader " mods 改动后重启" 同哲学)。
import { ModStore, type ModRow } from './store';
import { readModPack } from './pack';
import { getModLoadResult } from './loader';
import { loadModConfigValues, type ModConfigState } from './config';
import { Lang } from '../i18n/Lang';

let panel: HTMLElement | null = null;

export function openModsPanel(): void {
  if (panel?.isConnected) return;
  const store = new ModStore();
  panel = document.createElement('div');
  panel.id = 'sw-mods-panel';
  panel.innerHTML = `
    <style>
      #sw-mods-panel { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,.72);
        display: flex; align-items: center; justify-content: center; }
      #sw-mods-panel .box { width: min(560px, 92vw); max-height: 80vh; overflow: auto;
        background: #1d1d26; border: 2px solid #56566a; border-radius: 6px; color: #e8e8f0;
        font: 14px/1.55 system-ui, sans-serif; padding: 18px 20px; }
      #sw-mods-panel h3 { margin: 0 0 10px; font-size: 17px; letter-spacing: 1px; }
      #sw-mods-panel .row { display: flex; align-items: center; gap: 10px; padding: 8px 6px;
        border-bottom: 1px solid #33334a; }
      #sw-mods-panel .row .meta { flex: 1; min-width: 0; }
      #sw-mods-panel .row .name { font-weight: 600; }
      #sw-mods-panel .row .sub { font-size: 12px; color: #9a9ab0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      #sw-mods-panel .row button, #sw-mods-panel .actions button { cursor: pointer; }
      #sw-mods-panel .actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
      #sw-mods-panel .errs { margin-top: 10px; font-size: 12px; color: #ff9a9a;
        white-space: pre-wrap; }
      #sw-mods-panel .hint { margin-top: 8px; font-size: 12px; color: #8fd08f; }
      #sw-mods-panel .cfg { padding: 6px 10px; background: #26263a; border-radius: 4px; margin: 6px 0; }
      #sw-mods-panel .cfgrow { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
      #sw-mods-panel .cfgrow label { flex: 1; font-size: 12px; color: #b8b8cc; }
      #sw-mods-panel .cfgrow input[type=text], #sw-mods-panel .cfgrow input[type=number] {
        width: 90px; background: #15151f; color: #e8e8f0; border: 1px solid #44445a;
        border-radius: 3px; padding: 2px 6px; }
      #sw-mods-panel .empty { color: #9a9ab0; padding: 14px 0; text-align: center; }
      #sw-mods-panel .close { position: absolute; top: 8px; right: 12px; cursor: pointer;
        font-size: 20px; color: #c9c9dd; }
    </style>
    <div class="box" style="position:relative">
      <span class="close" data-act="close">×</span>
      <h3 data-t="title"></h3>
      <div data-list></div>
      <div class="actions">
        <button data-act="import"></button>
        <button data-act="reload"></button>
        <button data-act="close2"></button>
      </div>
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
  (root.querySelector('[data-act=close2]') as HTMLElement).textContent = text('Mods.SandboxWorld.ModsPanel.Close');

  const close = (): void => { root.remove(); panel = null; };
  root.querySelector('[data-act=close]')?.addEventListener('click', close);
  root.querySelector('[data-act=close2]')?.addEventListener('click', close);
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
    listEl.textContent = '';
    if (rows.length === 0) {
      listEl.innerHTML = `<div class="empty">${text('Mods.SandboxWorld.ModsPanel.Empty')}</div>`;
      return;
    }
    for (const row of rows) listEl.appendChild(rowEl(row));
  };

  // ---- 配置编辑(P2):声明式 config 表 → 内联控件;变更即持久化(重载后生效面
  //      由 mod 自身读取语义决定——sw.config.get 恒读最新值) ----
  const configStates = new Map<string, ModConfigState>();
  const attachConfig = (root: HTMLElement, row: ModRow): void => {
    const manifest = getModLoadResult()?.loaded.find((l) => l.manifest.id === row.id)?.manifest;
    const cfg = manifest?.config;
    if (!cfg || Object.keys(cfg).length === 0) return;
    void loadModConfigValues(row.id, cfg).then((state) => {
      configStates.set(row.id, state);
      const block = document.createElement('div');
      block.className = 'cfg';
      for (const [k, e] of Object.entries(cfg)) {
        const line = document.createElement('div');
        line.className = 'cfgrow';
        const label = document.createElement('label');
        label.textContent = e.label ?? k;
        let input: HTMLInputElement;
        if (e.type === 'bool') {
          input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = state.get(k) === true;
          input.addEventListener('change', () => state.set(k, input.checked));
        } else if (e.type === 'number') {
          input = document.createElement('input');
          input.type = 'number';
          input.value = String(state.get(k));
          if (e.min !== undefined) input.min = String(e.min);
          if (e.max !== undefined) input.max = String(e.max);
          input.addEventListener('change', () => state.set(k, Number(input.value)));
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = String(state.get(k));
          input.addEventListener('change', () => state.set(k, input.value));
        }
        line.appendChild(label);
        line.appendChild(input);
        block.appendChild(line);
      }
      root.appendChild(block);
    }).catch(() => { /* 配置读坏=跳过编辑区 */ });
  };

  const rowEl = (row: ModRow): HTMLElement => {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `
      <input type="checkbox" ${row.enabled ? 'checked' : ''} data-act="toggle">
      <div class="meta">
        <div class="name"></div>
        <div class="sub"></div>
      </div>
      <button data-act="uninstall"></button>
    `;
    (div.querySelector('.name') as HTMLElement).textContent = row.name;
    (div.querySelector('.sub') as HTMLElement).textContent =
      `v${row.version}${row.author ? ` · ${row.author}` : ''} · ${row.id}`;
    (div.querySelector('[data-act=uninstall]') as HTMLElement).textContent = text('Mods.SandboxWorld.ModsPanel.Uninstall');
    div.querySelector('[data-act=toggle]')?.addEventListener('change', async (e) => {
      await store.setEnabled(row.id, (e.target as HTMLInputElement).checked);
      hintEl.textContent = text('Mods.SandboxWorld.ModsPanel.ReloadToApply');
    });
    attachConfig(div, row);
    div.querySelector('[data-act=uninstall]')?.addEventListener('click', async () => {
      await store.remove(row.id);
      hintEl.textContent = text('Mods.SandboxWorld.ModsPanel.ReloadToApply');
      void refresh();
    });
    return div;
  };

  // 导入 .swmod(zip)
  (root.querySelector('[data-act=import]') as HTMLElement).addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.swmod,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pack = readModPack(bytes);
        await store.install(pack.manifest, bytes);
        hintEl.textContent = `${text('Mods.SandboxWorld.ModsPanel.Installed')}: ${pack.manifest.name} v${pack.manifest.version} — ${text('Mods.SandboxWorld.ModsPanel.ReloadToApply')}`;
        void refresh();
      } catch (e) {
        errsEl.textContent = `${text('Mods.SandboxWorld.ModsPanel.InstallFail')}: ${(e as Error).message}`;
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
