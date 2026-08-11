// 局域网自动发现（浏览器侧）：无 UDP 原生 API → WebRTC 拿本机 IP + /24 网段 HTTP 扫描。
// 原理：
//  1) RTCPeerConnection 收集 ICE host candidate——非安全上下文（朋友从 http://192.168.x.x 访问）
//     下 candidate 暴露真实 IPv4（secure context 会被 mDNS 混淆成 .local，但那通常是房主
//     自己 localhost 访问，本就不需要发现——场景恰好互补）
//  2) 对本机所在 /24 网段并发 fetch http://<ip>:7778/lan（服务器 CORS + PNA 头已开），
//     响应 magic=1010 即为我们的服务器
export interface LanServer {
  ip: string;
  port: number;
  name: string;
  online: number;
  max: number;
  w: number;
  h: number;
}

/** 从 WebRTC ICE host candidate 提取本机局域网 IPv4（192.168/10/172.16-31） */
export async function getLocalIpv4(timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ip: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { pc.close(); } catch { /* 忽略 */ }
      resolve(ip);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
    } catch {
      finish(null);
      return;
    }
    // data channel 触发 candidate 收集
    pc.createDataChannel('sw-lan');
    pc.onicecandidate = (e) => {
      if (!e.candidate) { finish(null); return; }
      // host candidate: "candidate:... typ host ..."，从中提取 IPv4
      const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (!m) return;
      const ip = m[1];
      const a = parseInt(ip.split('.')[0], 10);
      const isLan = a === 10 || a === 192 || (a === 172 && parseInt(ip.split('.')[1], 10) >= 16 && parseInt(ip.split('.')[1], 10) <= 31);
      if (isLan) finish(ip);
    };
    void pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => finish(null));
  });
}

/** 扫描本机所在 /24 网段的服务器（:7778/lan）。knownIp 可跳过候选（如本机 IP），返回发现列表 */
export async function scanLan(localIp: string, excludeIps: string[] = [], port = 7778): Promise<LanServer[]> {
  const prefix = localIp.split('.').slice(0, 3).join('.');
  const targets: string[] = [];
  for (let n = 1; n <= 254; n++) {
    const ip = `${prefix}.${n}`;
    if (excludeIps.includes(ip)) continue;
    targets.push(ip);
  }
  const found: LanServer[] = [];
  const probe = async (ip: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 400);
      const r = await fetch(`http://${ip}:${port}/lan`, { signal: ctrl.signal, mode: 'cors' });
      clearTimeout(t);
      if (!r.ok) return;
      const info = await r.json() as Partial<LanServer> & { magic?: number };
      if (info.magic !== 1010) return;
      found.push({
        ip, port: info.port ?? 7777, name: info.name ?? '联机世界',
        online: info.online ?? 0, max: info.max ?? 255, w: info.w ?? 0, h: info.h ?? 0,
      });
    } catch { /* 无服务器/超时——正常 */ }
  };
  // 分批并发（32/批）防连接数爆炸
  for (let i = 0; i < targets.length; i += 32) {
    await Promise.all(targets.slice(i, i + 32).map(probe));
  }
  return found;
}

/** 一键发现：自动取本机 IP → 扫描。取不到时依次 fallback：
 *  1) 本机服务器的 /lan 端点（房主本机运行着 server → lanIps 即网段线索）
 *  2) 手动指定网段前缀（"192.168.1"）
 * manualPrefix 手动指定网段（"192.168.1"）时的 fallback */
export async function discoverServers(manualPrefix?: string): Promise<{ localIp: string | null; servers: LanServer[] }> {
  if (manualPrefix) {
    return { localIp: `${manualPrefix}.1`, servers: await scanLan(`${manualPrefix}.1`) };
  }
  let localIp = await getLocalIpv4();
  if (!localIp) {
    // secure context（localhost/https）下 WebRTC 被 mDNS 混淆 → 问本机服务器。
    // 房主场景本机就跑着 server，lanIps 直接给出可用网段；扫描也能命中自己（供复制 IP）
    try {
      const r = await fetch('http://127.0.0.1:7778/lan');
      const info = await r.json() as { lanIps?: string[] };
      localIp = info.lanIps?.[0] ?? null;
    } catch { /* 本机无服务器 */ }
  }
  if (!localIp) return { localIp: null, servers: [] };
  return { localIp, servers: await scanLan(localIp) };
}
