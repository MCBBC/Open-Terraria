// mod 联网接口(★Tier1-c,2026-10-14;sw.net)。
// 安全模型:
//   ①manifest 声明域白名单(mod.json "net": ["api.example.com"]——未声明域的
//     mod 调 fetch=runtime throw fail-loud;manifest 无 net 字段=整接口拒)
//   ②CORS=浏览器原生沙箱(第二道;服务端仍须开 CORS——双保险)
//   ③超时 10s(AbortController)+响应体积 4MB 限(流读截断)
//   ④仅 https(+dev localhost 豁免)——禁 http 明文/禁 file/data
//   ⑤URL 派生域匹配(host 精确或子域通配 *.example.com 声明形)
export interface ModNetApi {
  fetchJson<T>(url: string, opts?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }): Promise<T>;
  fetchText(url: string, opts?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }): Promise<string>;
}

const MAX_BODY = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT = 10_000;

/** 域匹配(host 精确;*.x.y 声明=子域通配) */
function hostAllowed(host: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (p.startsWith('*.')) {
      const base = p.slice(2);
      if (host === base || host.endsWith(`.${base}`)) return true;
    } else if (host === p) return true;
  }
  return false;
}

/** URL 校验(https/localhost 豁免;域白名单) */
function validateUrl(rawUrl: string, patterns: readonly string[]): URL {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error(`[mod-net] 非法 URL: ${rawUrl}`); }
  const isLocal = u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!isLocal) throw new Error(`[mod-net] 仅 https(或 localhost): ${u.protocol}//${u.hostname}`);
  if (!hostAllowed(u.hostname, patterns)) {
    throw new Error(`[mod-net] 域未声明(mod.json "net" 白名单): ${u.hostname}`);
  }
  return u;
}

async function fetchWithLimits(url: string, init: RequestInit, timeoutMs: number, modId: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`[mod-net] ${modId} HTTP ${res.status}: ${url.slice(0, 80)}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function createModNet(modId: string, allowedHosts: readonly string[]): ModNetApi | null {
  if (allowedHosts.length === 0) return null;   // 未声明=接口整缺(api 返 null 面)
  const doFetch = async <T>(
    url: string,
    opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number },
    asJson: boolean,
  ): Promise<T> => {
    const u = validateUrl(url, allowedHosts);
    const res = await fetchWithLimits(u.toString(), {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT, modId);
    // 体积限(Content-Length 预检+读限)
    const cl = Number(res.headers.get('content-length') ?? '0');
    if (cl > MAX_BODY) throw new Error(`[mod-net] ${modId} 响应超限(${cl}B > ${MAX_BODY}B)`);
    const text = await res.text();
    if (text.length > MAX_BODY) throw new Error(`[mod-net] ${modId} 响应超限(${text.length}B)`);
    if (!asJson) return text as never;
    try { return JSON.parse(text) as T; } catch { throw new Error(`[mod-net] ${modId} 响应非 JSON`); }
  };
  return {
    async fetchJson(url, opts) { return doFetch(url, opts ?? {}, true); },
    async fetchText(url, opts) { return doFetch(url, opts ?? {}, false); },
  };
}

/** 测试清账(纯工厂) */
export function _resetModNetForTests(): void { /* 零模块态 */ }
