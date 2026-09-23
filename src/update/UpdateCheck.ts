// 部署更新探针(2026-09-07):SW 文档走 SWR(回缓存保离线),新部署后页面常驻旧
// bundle 到下一次刷新——此前「要多刷新一两次才是最新」。本模块定期 no-store fetch
// 构建链落盘的 /build-id.txt(内容=首屏 chunk 文件名,每次部署变;_headers 精确
// no-cache),与运行中 bundle 比对,发现新版本回调一次(横幅提示,点击→自动存档
// +reload 一次到位)。fetch 带 ?t= cache-bust:即使 SW 对未知路径有回退策略,
// 每次查询串不同也不会命中旧缓存条目。
let running: string | null = null;
let stopped = false;

/** 运行中页面加载的首屏主 chunk 文件名(index-*.js;vite hash=部署版本指纹) */
export function runningBundle(): string | null {
  if (running !== null) return running;
  for (const s of document.querySelectorAll('script[src]')) {
    const src = (s as HTMLScriptElement).getAttribute('src') ?? '';
    const m = src.match(/assets\/(index-[A-Za-z0-9_-]+\.js)$/);
    if (m) {
      running = m[1] ?? null;
      return running;
    }
  }
  return null;
}

export interface UpdateCheckOptions {
  /** 首查延迟 ms(避开启动关键路径与资产暖窗)。缺省 15s */
  firstDelayMs?: number;
  /** 轮询间隔 ms。缺省 5 分钟 */
  intervalMs?: number;
  /** 追加查询串(测试注入/防串扰)。生产勿用 */
  querySuffix?: string;
}

export function startUpdateCheck(onNewVersion: (version: string, bundle: string) => void, opts: UpdateCheckOptions = {}): void {
  const cur = runningBundle();
  if (!cur) return;   // 非 index 主包形态(dev 裸模块/异常产物)不探针
  const firstDelayMs = opts.firstDelayMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 5 * 60 * 1000;
  const check = async (): Promise<void> => {
    if (stopped) return;
    try {
      const r = await fetch(`/build-id.txt?t=${Date.now()}${opts.querySuffix ?? ''}`, { cache: 'no-store' });
      if (!r.ok) return;
      // 文件格式:`<数字版本> <bundle 名>`(gen-sw-twa 写入);容错纯 bundle(无版本段)
      // ★防御(2026-09-07 用户实报「v<!DOCTYPE」):CF Pages 无 404.html 时启用 SPA
      //  回退,未同步边缘/旧 SW 的 /build-id.txt 404 会被回退成 index.html——内容
      //  必须形如 index-*.js 才认,否则静默忽略等下轮(探针自愈:边缘同步后自正)
      const parts = (await r.text()).trim().split(/\s+/);
      const bundle = parts[1] ?? parts[0] ?? '';
      // ★2026-09-23:版本段允许预发布后缀(0.1.35-beta;用户令测试版一律带 -beta,
      //   bump-version.mjs 自动补缀)——旧纯三段式正则把 -beta 判非版本,横幅回退
      //   显示 bundle 指纹短码(用户实报「vBvemkH」根因)
      const version = parts[1] && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(parts[0] ?? '') ? parts[0]! : '';
      if (/^index-[A-Za-z0-9_-]+\.js$/.test(bundle) && bundle !== cur) {
        stopped = true;
        onNewVersion(version || bundle, bundle);
      }
    } catch { /* 离线/SW 拦截失败:静默,下轮再试 */ }
  };
  setTimeout(() => { void check(); }, firstDelayMs);
  const iv = setInterval(() => {
    if (stopped) { clearInterval(iv); return; }
    void check();
  }, intervalMs);
  document.addEventListener('visibilitychange', () => {
    if (!stopped && !document.hidden) void check();
  });
}
