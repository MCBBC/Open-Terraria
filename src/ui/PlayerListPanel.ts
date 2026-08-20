// 多人玩家列表面板（背包"多人"按钮弹层）。
// 原版考据：PC 版原版**无**玩家列表面板（多人信息只有 /playing 命令
// ListPlayersCommand :11-18 与服务器控制台；ping 显示原版不存在）。本面板为
// 本仓自有 UI——数据面全部对齐既有联机链：
//   名单/队伍 = ClientNet.players（msg13/14 权威镜像）+ mySlot；
//   RTT = msg203 探针表（net.playerPings，服务器 10s 轮询）+ 本端 Msg.Ping
//   回显差分（net.rttMs）；旧服务器无探针 → 他端显示 "-"（优雅降级）。
// 队伍色 = Main.teamColor（Player.cs:1006-1012 六色）；队伍名 = 原版
// UI.TeamIcon{None,Red,...,Pink}_Active（复用官译，无新键）。
import type { Game } from '../core/Game';
import { Lang } from '../i18n/Lang';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Main.teamColor（Player.cs:1006-1012；与 room.ts 队伍频道色同表） */
const TEAM_RGB: Array<[number, number, number]> = [
  [255, 255, 255], [218, 59, 59], [59, 218, 85], [59, 149, 218], [242, 221, 100], [224, 100, 242],
];
/** 队伍名 Lang 键（原版 UI.TeamIcon*_Active——"无队伍/红队/绿队/…"官译直用） */
const TEAM_KEY = ['None', 'Red', 'Green', 'Blue', 'Yellow', 'Pink'] as const;

interface Row {
  slot: number;
  name: string;
  team: number;
  isHost: boolean;
  isMe: boolean;
  rttMs: number;   // -1 = 未知
}

/** 收集面板行数据（联机态；单机调用方不进面板） */
function collectRows(game: Game): Row[] {
  const net = game.net;
  if (!net) return [];
  const rows: Row[] = [];
  const myName = (game.player as unknown as { appearance?: { name?: string } })?.appearance?.name
    ?? `玩家${net.mySlot}`;   // ClientNet.players 同款兜底名
  const myTeam = Math.max(0, Math.min(5, (game.player as unknown as { team: number }).team ?? 0));
  rows.push({
    slot: net.mySlot,
    name: myName,
    team: myTeam,
    isHost: net.policy.isHost,
    isMe: true,
    rttMs: Number.isFinite(net.rttMs) ? Math.round(net.rttMs) : -1,
  });
  const others = [...net.players.values()]
    .filter((p) => p.active && p.slot !== net.mySlot)
    .sort((a, b) => a.slot - b.slot);
  for (const p of others) {
    rows.push({
      slot: p.slot,
      name: p.name,
      team: Math.max(0, Math.min(5, p.team)),
      isHost: false,
      isMe: false,
      rttMs: net.playerPings.get(p.slot) ?? -1,
    });
  }
  return rows;
}

let openOverlay: HTMLDivElement | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export function closePlayerListPanel(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  openOverlay?.remove();
  openOverlay = null;
}

export function playerListPanelOpen(): boolean {
  return openOverlay !== null;
}

/** 打开面板（重复调用 = 关闭）。开面板期间 1s 轮询刷新（名单/ping 变化） */
export function openPlayerListPanel(game: Game): void {
  if (openOverlay) { closePlayerListPanel(); return; }
  const overlay = el('div') as HTMLDivElement;
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:1200; display:flex; align-items:center; justify-content:center;';
  const panel = el('div');
  panel.style.cssText = 'width:420px; max-height:70vh; background:#2a2a35; border:2px solid #6b6b8a; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:8px;';
  const titleRow = el('div');
  titleRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
  titleRow.appendChild(el('div', 'sw-lbl', Lang.text('Mods.SandboxWorld.PlayerList.Title')));
  const closeBtn = el('button', 'sw-btn');
  closeBtn.textContent = Lang.text('Mods.SandboxWorld.UI.Close');
  closeBtn.style.cssText = 'cursor:pointer;';
  closeBtn.addEventListener('click', () => closePlayerListPanel());
  titleRow.appendChild(closeBtn);
  panel.appendChild(titleRow);

  const sub = el('div');
  sub.style.cssText = 'font-size:12px; color:#9fb0dd;';
  panel.appendChild(sub);

  const list = el('div');
  list.style.cssText = 'overflow-y:auto; display:flex; flex-direction:column; gap:4px;';
  panel.appendChild(list);

  overlay.appendChild(panel);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closePlayerListPanel();
  });
  document.body.appendChild(overlay);
  openOverlay = overlay;

  const render = () => {
    const net = game.net;
    if (!net) { closePlayerListPanel(); return; }
    const rows = collectRows(game);
    sub.textContent = Lang.text('Mods.SandboxWorld.PlayerList.Online',
      String(rows.length), String(net.policy.maxPlayers));
    list.textContent = '';
    for (const r of rows) {
      const item = el('div');
      item.style.cssText = 'display:flex; align-items:center; gap:8px; padding:4px 6px; background:#1a1a22; border-radius:4px; font-size:13px; color:#eee;';
      // 队伍色块（Main.teamColor 芯片 + 悬停队伍名）
      const chip = el('div');
      const [cr, cg, cb] = TEAM_RGB[r.team] ?? TEAM_RGB[0];
      chip.style.cssText = `width:12px; height:12px; border-radius:3px; flex:none; background:rgb(${cr},${cg},${cb}); border:1px solid rgba(255,255,255,0.35);`;
      chip.title = Lang.text(`UI.TeamIcon${TEAM_KEY[r.team] ?? 'None'}_Active`);
      item.appendChild(chip);
      const nameEl = el('div');
      nameEl.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
      const badges: string[] = [];
      if (r.isHost) badges.push(Lang.text('Mods.SandboxWorld.PlayerList.Host'));
      if (r.isMe) badges.push(Lang.text('Mods.SandboxWorld.PlayerList.You'));
      nameEl.textContent = r.name + (badges.length ? `（${badges.join('·')}）` : '');
      item.appendChild(nameEl);
      // Ping（msg203 表；本端 = Msg.Ping 回显差分；未知 "-"）
      const ping = el('div');
      const ms = r.rttMs;
      const good = ms >= 0 && ms < 100, mid = ms >= 100 && ms < 250;
      ping.style.cssText = `flex:none; font-size:12px; color:${ms < 0 ? '#8890a8' : good ? '#7ee787' : mid ? '#f2d16b' : '#f28b66'};`;
      ping.textContent = ms < 0 ? '-' : Lang.text('Mods.SandboxWorld.PlayerList.Ping', String(ms));
      item.appendChild(ping);
      list.appendChild(item);
    }
  };
  render();
  refreshTimer = setInterval(render, 1000);
}
