// 联机选择面板：加入游戏（IP 直连）+ 开房间指引（局域网同款 server 进程）。
// docs/multiplayer-design.md §7：LAN 与公网同一 server 进程，客户端输 IP 即可。
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface MultiplayerSelectCallbacks {
  onJoin: (ip: string) => void;
  onBack: () => void;
}

export class MultiplayerSelect {
  root: HTMLElement;

  constructor(cb: MultiplayerSelectCallbacks) {
    this.root = el('div', 'sw-panel');
    this.root.style.cssText = 'max-width:460px;';

    const title = el('h2', undefined, '多人联机');
    this.root.appendChild(title);

    // ---- 加入游戏 ----
    const joinLabel = el('div', undefined, '加入游戏（房主告知 IP）');
    joinLabel.style.cssText = 'margin:12px 0 6px; color:#c9d4ff;';
    this.root.appendChild(joinLabel);

    const row = el('div');
    row.style.cssText = 'display:flex; gap:8px;';
    const input = el('input') as HTMLInputElement;
    input.placeholder = '192.168.1.100 或 域名';
    input.style.cssText = 'flex:1; padding:8px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    row.appendChild(input);
    const joinBtn = el('button', 'sw-btn', '加入');
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

    // ---- 开房间指引 ----
    const hostLabel = el('div', undefined, '创建房间（房主操作）');
    hostLabel.style.cssText = 'margin:16px 0 6px; color:#c9d4ff;';
    this.root.appendChild(hostLabel);

    const steps = el('div');
    steps.style.cssText = 'font-size:12px; line-height:1.9; color:#9aa8cc; background:rgba(10,16,40,0.5); padding:10px; border-radius:4px;';
    steps.innerHTML = [
      '1. 在游戏内"导出存档"（世界列表 → 导出），把 .json 文件交给房主电脑',
      '2. 房主在终端执行：<code>cd server && npm run host -- --world 存档.json</code>',
      '&nbsp;&nbsp;&nbsp;（首次需先 <code>npm install</code>；无存档可用 <code>--seed 种子</code> 自动生成）',
      '3. 服务器启动后显示局域网 IP，把它告诉其他玩家',
      '4. 房主自己也通过上方"加入游戏"连 127.0.0.1 进入',
    ].join('<br>');
    this.root.appendChild(steps);

    // ---- 返回 ----
    const back = el('button', 'sw-btn', '返回');
    back.style.marginTop = '16px';
    back.onclick = cb.onBack;
    this.root.appendChild(back);
  }
}
