// 联机面板 v3：中央服务器房间制（docs/multiplayer-design.md §房间）。
// lobby HTTP（:lobbyPort）= 房间列表/建房/码校验；WS（lobbyPort-1）/<房间码>?token=。
// 房主：选存档建房（勾选公开性 + 破坏保护 + 物品保护）→ 得 6 位房间码 → 进房。
// 其他玩家：房间列表点击加入，或输房间码进非公开房。
// 文案 = Mods.SandboxWorld.MP.*（自制联机 UI,原版无对应键）
import { Lang } from '../i18n/Lang';
const T = (k: string, ...a: (string | number)[]) => Lang.text(`Mods.SandboxWorld.MP.${k}`, ...a);
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface SaveEntry { id: number; name: string; json: string | null }

export interface MultiplayerSelectCallbacks {
  /** 加入房间（完整 ws URL：ws://host:wsPort/<房间码>[?token=...]） */
  onJoinRoom: (url: string, hostToken: string) => void;
  /** 列出可开房的存档槽位（name + 存档 JSON 字符串） */
  listSaves: () => Promise<SaveEntry[]>;
  /** 角色列表（加入房间使用的角色） */
  listCharacters: () => Promise<Array<{ id: number; name: string }>>;
  /** 选中角色（进游戏后应用外观并补发 SyncPlayer） */
  onPickCharacter: (id: number) => void | Promise<void>;
  onBack: () => void;
}

export interface RoomListItem {
  code: string; name: string; online: number; maxPlayers: number; w: number; h: number;
  protectTiles: boolean; protectItems: boolean;
}

const DEFAULT_SERVER = '127.0.0.1:7778'; // lobby 端口（WS = lobby-1）

/** 地址 → { httpBase, wsBase }（lobby 端口约定：WS 在 lobby-1） */
function serverBase(addr: string): { httpBase: string; wsBase: string } | null {
  const a = addr.trim();
  if (!a) return null;
  const m = a.match(/^(\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d+))?$/i);
  if (!m) return null;
  const lobbyPort = m[2] ? parseInt(m[2], 10) : 7778;
  return { httpBase: `http://${m[1]}:${lobbyPort}`, wsBase: `ws://${m[1]}:${lobbyPort - 1}` };
}

export class MultiplayerSelect {
  root: HTMLElement;
  private roomList = el('div');
  private codeInput: HTMLInputElement;
  private createName: HTMLInputElement;
  private createPublic: HTMLInputElement;
  private createTiles: HTMLInputElement;
  private createItems: HTMLInputElement;
  private createPvp: HTMLInputElement;
  private saveSel: HTMLSelectElement;
  private createdInfo = el('div');
  private hostCode = '';
  private hostToken = '';
  private saves: SaveEntry[] = [];
  private status = (elm: HTMLElement, text: string, color = '#8b98bd') => {
    elm.textContent = text;
    elm.style.color = color;
  };

  constructor(private cb: MultiplayerSelectCallbacks) {
    this.root = el('div', 'sw-panel');
    this.root.style.cssText =
      'position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); max-width:520px; width:min(520px,96vw); z-index:20; cursor:auto; max-height:92vh; overflow-y:auto;';
    this.root.appendChild(el('h2', undefined, T('Title')));

    // ---- 角色选择（进房使用的角色；外观随 SyncPlayer 同步给其他玩家） ----
    const charSel = el('select') as HTMLSelectElement;
    charSel.style.cssText = 'width:100%; padding:6px; margin-bottom:10px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    charSel.appendChild(el('option', undefined, T('DefaultChar')));
    this.root.appendChild(charSel);
    charSel.addEventListener('change', () => {
      const id = parseInt(charSel.value, 10);
      if (!Number.isNaN(id)) void cb.onPickCharacter(id);
    });
    void cb.listCharacters().then((chars) => {
      let first = -1;
      for (const c of chars) {
        const opt = el('option', undefined, c.name) as HTMLOptionElement;
        opt.value = String(c.id);
        charSel.appendChild(opt);
        if (first < 0) first = c.id;
      }
      // 有角色则默认选中第一个（进房即带外观）
      if (first >= 0) {
        charSel.value = String(first);
        void cb.onPickCharacter(first);
      }
    });

    // ---- 刷新房间(2026-08-25 用户要求:不再暴露服务器地址——lobby 固定 DEFAULT_SERVER;
    //      连不上时房间列表为空,不报错) ----
    const srvRow = el('div');
    srvRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:10px;';
    const srvBtn = el('button', 'sw-btn', T('Refresh')) as HTMLButtonElement;
    srvBtn.style.cssText = 'width:auto; margin:0; padding:8px 12px; flex:none;';
    srvBtn.onclick = () => void this.refreshRooms();
    srvRow.appendChild(srvBtn);
    this.root.appendChild(srvRow);

    // ---- 加入：房间列表 ----
    const sJoin = el('div', undefined, T('JoinSection'));
    sJoin.style.cssText = 'margin:10px 0 6px; color:#c9d4ff;';
    this.root.appendChild(sJoin);
    this.roomList.style.cssText = 'min-height:60px; max-height:220px; overflow-y:auto; background:rgba(10,16,40,0.5); border-radius:4px; padding:4px; margin-bottom:8px;';
    this.root.appendChild(this.roomList);

    // 码加入（非公开房）
    const codeRow = el('div');
    codeRow.style.cssText = 'display:flex; gap:8px;';
    this.codeInput = el('input') as HTMLInputElement;
    this.codeInput.placeholder = T('RoomCodeHint');
    this.codeInput.style.cssText = 'flex:1; padding:8px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    const codeBtn = el('button', 'sw-btn', T('JoinByCode')) as HTMLButtonElement;
    codeBtn.style.cssText = 'width:auto; margin:0; padding:8px 14px; flex:none;';
    codeBtn.onclick = () => void this.joinByCode();
    this.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') codeBtn.click(); });
    codeRow.appendChild(this.codeInput);
    codeRow.appendChild(codeBtn);
    this.root.appendChild(codeRow);

    // ---- 分隔 ----
    const hr = el('hr');
    hr.style.cssText = 'border:none; border-top:1px solid rgba(90,120,220,0.3); margin:14px 0;';
    this.root.appendChild(hr);

    // ---- 建房（房主） ----
    const sHost = el('div', undefined, T('HostSection'));
    sHost.style.cssText = 'margin:0 0 6px; color:#c9d4ff;';
    this.root.appendChild(sHost);

    this.saveSel = el('select') as HTMLSelectElement;
    this.saveSel.style.cssText = 'width:100%; padding:6px; margin-bottom:6px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    this.saveSel.appendChild(el('option', undefined, T('PickSave')));
    this.root.appendChild(this.saveSel);
    void cb.listSaves().then((list) => {
      this.saves = list.filter((x) => x.json);
      for (const sv of this.saves) {
        const opt = el('option', undefined, sv.name) as HTMLOptionElement;
        opt.value = String(sv.id);
        this.saveSel.appendChild(opt);
      }
      if (!this.saves.length) this.saveSel.appendChild(el('option', undefined, T('NoSaves')));
    });

    this.createName = el('input') as HTMLInputElement;
    this.createName.placeholder = T('RoomNameHint');
    this.createName.style.cssText = 'width:100%; box-sizing:border-box; padding:6px; margin-bottom:6px; background:rgba(10,16,40,0.8); color:#fff; border:1px solid #4a5a9a; border-radius:4px;';
    this.root.appendChild(this.createName);

    const mkCheck = (label: string, checked: boolean): HTMLInputElement => {
      const wrap = el('label');
      wrap.style.cssText = 'display:flex; align-items:center; gap:6px; color:#c9d4ff; font-size:13px; margin:2px 0;';
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = checked;
      wrap.appendChild(box);
      wrap.appendChild(el('span', undefined, label));
      this.root.appendChild(wrap);
      return box;
    };
    this.createPublic = mkCheck(T('PublicRoom'), true);
    this.createTiles = mkCheck(T('TileProtect'), false);
    this.createItems = mkCheck(T('ItemProtect'), false);
    this.createPvp = mkCheck(T('PvpAllow'), false);

    const createBtn = el('button', 'sw-btn', T('Create')) as HTMLButtonElement;
    createBtn.style.margin = '8px 0 4px';
    createBtn.onclick = () => void this.createRoom(createBtn);
    this.root.appendChild(createBtn);

    this.createdInfo.style.cssText = 'min-height:18px; font-size:13px; color:#8b98bd; word-break:break-all;';
    this.root.appendChild(this.createdInfo);

    const back = el('button', 'sw-btn', T('Back')) as HTMLButtonElement;
    back.style.marginTop = '14px';
    back.onclick = cb.onBack;
    this.root.appendChild(back);

    void this.refreshRooms();
  }

  // ================= 加入 =================

  private joinUrl(code: string, token = ''): string | null {
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return null; }
    return token ? `${base.wsBase}/${code}?token=${encodeURIComponent(token)}` : `${base.wsBase}/${code}`;
  }

  private async refreshRooms() {
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return; }
    this.status(this.roomList, T('Fetching'));
    try {
      const r = await fetch(`${base.httpBase}/rooms`);
      const data = await r.json() as { ok: boolean; rooms: RoomListItem[] };
      if (!data.ok) throw new Error('bad response');
      this.roomList.textContent = '';
      if (!data.rooms.length) {
        this.status(this.roomList, T('NoRooms'));
        return;
      }
      for (const rm of data.rooms) {
        const item = el('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid rgba(90,120,220,0.2); cursor:pointer;';
        item.onmouseenter = () => { item.style.background = 'rgba(60,80,160,0.3)'; };
        item.onmouseleave = () => { item.style.background = ''; };
        const prot = [rm.protectTiles ? '🛡' + T('Shield') : '', rm.protectItems ? '📦' + T('Box') : ''].filter(Boolean).join(' ');
        const left = el('div', undefined, `${rm.name}  ${rm.w}×${rm.h}${prot ? '  ' + prot : ''}`);
        left.style.cssText = 'color:#e8ecf8; font-size:13px;';
        const right = el('div', undefined, `👤${rm.online}/${rm.maxPlayers ?? 255}  [${rm.code}]`);
        right.style.cssText = 'color:#8b98bd; font-size:12px;';
        item.appendChild(left);
        item.appendChild(right);
        item.onclick = () => {
          const url = this.joinUrl(rm.code);
          if (url) this.cb.onJoinRoom(url, '');
        };
        this.roomList.appendChild(item);
      }
    } catch {
      // ★连不上=列表为空(2026-08-25 用户要求:不报错不暴露服务器细节)
      this.status(this.roomList, T('NoRooms'));
    }
  }

  private async joinByCode() {
    const code = this.codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) { this.status(this.roomList, T('BadCode'), '#ff6b6b'); return; }
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.roomList, T('BadAddr'), '#ff6b6b'); return; }
    this.status(this.roomList, T('Checking', code));
    try {
      const r = await fetch(`${base.httpBase}/rooms/${code}`);
      if (!r.ok) throw new Error(await r.json().then((d: { error?: string }) => d.error ?? T('RoomNotFound')).catch(() => T('RoomNotFound')));
      const url = this.joinUrl(code);
      if (url) this.cb.onJoinRoom(url, '');
    } catch (e) {
      this.status(this.roomList, (e as Error).message, '#ff6b6b');
    }
  }

  // ================= 建房 =================

  private async createRoom(btn: HTMLButtonElement) {
    const base = serverBase(DEFAULT_SERVER);
    if (!base) { this.status(this.createdInfo, T('BadAddr'), '#ff6b6b'); return; }
    const id = parseInt(this.saveSel.value, 10);
    const sv = this.saves.find((x) => x.id === id);
    if (!sv?.json) { this.status(this.createdInfo, T('PickSaveFirst'), '#ff6b6b'); return; }
    btn.disabled = true;
    this.status(this.createdInfo, T('Uploading'));
    try {
      const r = await fetch(`${base.httpBase}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.createName.value.trim() || sv.name,
          public: this.createPublic.checked,
          protectTiles: this.createTiles.checked,
          protectItems: this.createItems.checked,
          pvpAllowed: this.createPvp.checked,
          save: sv.json,
        }),
      });
      const data = await r.json() as { ok: boolean; code?: string; hostToken?: string; error?: string };
      if (!data.ok || !data.code || !data.hostToken) throw new Error(data.error ?? T('CreateFail'));
      this.hostCode = data.code;
      this.hostToken = data.hostToken;
      this.status(this.createdInfo, T('RoomCreated', data.code) + (this.createPublic.checked ? '' : T('RoomPrivateNote')), '#7dff8a');
      const enter = el('button', 'sw-btn', T('EnterRoom', data.code)) as HTMLButtonElement;
      enter.style.cssText = 'width:auto; margin:6px 0 0; display:block;';
      enter.onclick = () => {
        const url = this.joinUrl(this.hostCode, this.hostToken);
        if (url) this.cb.onJoinRoom(url, this.hostToken);
      };
      this.createdInfo.appendChild(enter);
      // 建房成功后房间码所在房可能进列表（公开时）——轻刷一次
      void this.refreshRooms();
    } catch (e) {
      this.status(this.createdInfo, T('CreateFailDetail', (e as Error).message), '#ff6b6b');
    } finally {
      btn.disabled = false;
    }
  }
}
