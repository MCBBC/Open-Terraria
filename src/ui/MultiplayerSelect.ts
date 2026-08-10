// 联机面板 v2：一键三步——下载开服脚本 → 选择存档下载 → 运行后显示本机 IP 分享。
// docs/multiplayer-design.md §7 简化流程：脚本自动找 server/worlds/ 最新存档（无则按种子生成）。
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface MultiplayerSelectCallbacks {
  /** 加入游戏（ip 或 ip:port） */
  onJoin: (ip: string) => void;
  /** 列出可开房的存档槽位（name + 导出 JSON 字符串） */
  listSaves: () => Promise<Array<{ id: number; name: string; json: string | null }>>;
  onBack: () => void;
}

/** 开服脚本（bash，放项目根目录运行 `bash 开服.sh`） */
function hostScript(): string {
  return `#!/bin/bash
# SandboxWorld 一键开服：把本文件放到项目根目录（SandboxWorld/）下，运行: bash 开服.sh
cd "$(dirname "$0")/server" 2>/dev/null || { echo "✗ 请把此脚本放到项目根目录(SandboxWorld/) 再运行"; exit 1; }
[ -d node_modules ] || { echo "安装依赖…"; npm install || exit 1; }
# 优先用 worlds/ 里最新的存档；没有则按种子生成新世界
W=$(ls -t worlds/*.json 2>/dev/null | head -1)
if [ -n "$W" ]; then
  echo "▶ 使用存档: $W"
  exec npx tsx src/index.ts --world "$W" "$@"
else
  echo "▶ worlds/ 无存档，按种子生成新世界（可用: bash 开服.sh --seed 名字）"
  exec npx tsx src/index.ts "$@"
fi
`;
}

function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export class MultiplayerSelect {
  root: HTMLElement;

  constructor(cb: MultiplayerSelectCallbacks) {
    this.root = el('div', 'sw-panel');
    this.root.style.cssText =
      'position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); max-width:480px; width:min(480px,96vw); z-index:20; cursor:auto; max-height:92vh; overflow-y:auto;';
    this.root.appendChild(el('h2', undefined, '多人联机'));

    // ---- ① 下载开服脚本 ----
    const s1 = el('div', undefined, '① 房主：下载并运行开服脚本');
    s1.style.cssText = 'margin:12px 0 6px; color:#c9d4ff;';
    this.root.appendChild(s1);
    const scriptBtn = el('button', 'sw-btn', '下载 开服.sh');
    scriptBtn.style.margin = '0 0 6px';
    scriptBtn.onclick = () => download('开服.sh', hostScript());
    this.root.appendChild(scriptBtn);
    const s1tip = el('div', undefined, '把文件放到项目根目录（SandboxWorld/），终端执行 bash 开服.sh');
    s1tip.style.cssText = 'font-size:11px; color:#8b98bd;';
    this.root.appendChild(s1tip);

    // ---- ② 选择存档下载（脚本会自动读取） ----
    const s2 = el('div', undefined, '② 用自己的存档开房（可选）');
    s2.style.cssText = 'margin:14px 0 6px; color:#c9d4ff;';
    this.root.appendChild(s2);
    const saveSel = el('select') as HTMLSelectElement;
    saveSel.style.cssText = 'width:100%; padding:6px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    saveSel.appendChild(el('option', undefined, '不用存档（新世界）'));
    this.root.appendChild(saveSel);
    const saveBtn = el('button', 'sw-btn', '下载选中存档 → 放入 server/worlds/');
    saveBtn.style.margin = '6px 0 0';
    let saves: Array<{ id: number; name: string; json: string | null }> = [];
    saveBtn.onclick = () => {
      const id = parseInt(saveSel.value, 10);
      const sv = saves.find((x) => x.id === id);
      if (!sv?.json) return;
      download(`${sv.name}.json`, sv.json, 'application/json');
    };
    this.root.appendChild(saveBtn);
    void cb.listSaves().then((list) => {
      saves = list.filter((x) => x.json);
      for (const sv of saves) {
        const opt = el('option', undefined, sv.name) as HTMLOptionElement;
        opt.value = String(sv.id);
        saveSel.appendChild(opt);
      }
      if (!saves.length) {
        saveSel.disabled = true;
        saveBtn.disabled = true;
      }
    });

    // ---- ③ 本机 IP（运行脚本后点查询，分享给朋友） ----
    const s3 = el('div', undefined, '③ 本机 IP（运行脚本后点查询，发给其他玩家）');
    s3.style.cssText = 'margin:14px 0 6px; color:#c9d4ff;';
    this.root.appendChild(s3);
    const ipRow = el('div');
    ipRow.style.cssText = 'display:flex; gap:8px; align-items:center;';
    const ipOut = el('code', undefined, '未查询');
    ipOut.style.cssText = 'flex:1; color:#ffd75a; font-size:15px; word-break:break-all;';
    const ipBtn = el('button', 'sw-btn', '查询');
    ipBtn.style.cssText = 'width:auto; margin:0; padding:8px 14px; flex:none;';
    ipBtn.onclick = async () => {
      ipOut.textContent = '查询中…';
      try {
        // 服务器 LAN 发现端点（仅本机脚本启动后可用；:7778/lan 返回 lanIps 列表）
        const r = await fetch('http://127.0.0.1:7778/lan');
        const info = await r.json() as { lanIps?: string[]; port?: number; online?: number };
        const ips = info.lanIps ?? [];
        ipOut.textContent = ips.length
          ? ips.map((ip) => `${ip}:${info.port ?? 7777}`).join('  或  ')
          : `未取到 IP（在线 ${info.online ?? 0} 人）`;
      } catch {
        ipOut.textContent = '未连接到本机服务器（先运行脚本）';
      }
    };
    ipRow.appendChild(ipOut);
    ipRow.appendChild(ipBtn);
    this.root.appendChild(ipRow);

    // ---- 加入游戏 ----
    const s4 = el('div', undefined, '④ 加入游戏（所有玩家，包括房主）');
    s4.style.cssText = 'margin:14px 0 6px; color:#c9d4ff;';
    this.root.appendChild(s4);
    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px;';
    const input = el('input') as HTMLInputElement;
    input.placeholder = '192.168.1.100（房主用 127.0.0.1）';
    input.style.cssText = 'flex:1; padding:8px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    row.appendChild(input);
    const joinBtn = el('button', 'sw-btn', '加入');
    joinBtn.style.cssText = 'width:auto; margin:0; padding:8px 14px; flex:none;';
    joinBtn.onclick = () => {
      const ip = input.value.trim();
      if (!ip) return;
      cb.onJoin(ip);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinBtn.click();
    });
    row.appendChild(joinBtn);
    this.root.appendChild(row);

    const back = el('button', 'sw-btn', '返回');
    back.style.marginTop = '16px';
    back.onclick = cb.onBack;
    this.root.appendChild(back);
  }
}
