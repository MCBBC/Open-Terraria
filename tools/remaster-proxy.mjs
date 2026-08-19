// 素材重制工作台 OpenAI 本地代理(dev 工具,独立进程,零依赖)。
// 为什么不浏览器直连:api.openai.com 的 CORS 支持不稳定(2025-10/2026-01 两度
// 移除 Access-Control-Allow-Origin 头),本地代理自加 CORS 头一劳永逸;
// 也不走 vite.config.ts proxy(CLAUDE.md:改它会让所有并行会话的 vite 重启)。
//
//   启动:cd game && npm run remaster-proxy     (默认 127.0.0.1:5210)
//   端口:REMASTER_PROXY_PORT=5211 npm run remaster-proxy
//   路由:GET  /health                          → {ok:true}
//        POST /v1/images/edits                 → 转发 api.openai.com(multipart 原样 pipe)
//        POST /v1/images/generations           → 同上
//   鉴权:请求头 Authorization: Bearer … 优先透传;缺省回落 env OPENAI_API_KEY。
//        key 只经内存转发,永不落日志。gpt-image-2 高质量档耗时 1-2 分钟 → 300s 超时。
import { createServer } from 'node:http';
import { request as httpsRequest2 } from 'node:https';

const PORT = Number(process.env.REMASTER_PROXY_PORT || 5210);
const HOST = '127.0.0.1';
const UPSTREAM = 'api.openai.com';
const TIMEOUT_MS = 300_000;

let nReq = 0, nOk = 0, nErr = 0;

const server = createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, upstream: UPSTREAM, requests: nReq, ok: nOk, errors: nErr }));
  }
  const isImages = req.method === 'POST' && /^\/v1\/images\/(edits|generations)$/.test(req.url ?? '');
  if (!isImages) {
    res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not found(仅 /health 与 /v1/images/*)' }));
  }

  const id = ++nReq;
  const started = Date.now();
  const auth = req.headers['authorization'];
  if (!auth && !process.env.OPENAI_API_KEY) {
    nErr++;
    res.writeHead(401, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      error: '无 API key:请在工作台设置里填写(经 Authorization 头转发),或以 OPENAI_API_KEY 环境变量启动本代理',
    }));
  }

  // multipart 原样 pipe(不解析);content-length 透传保 body 完整
  const upReq = httpsRequest2({
    hostname: UPSTREAM,
    path: req.url,
    method: 'POST',
    headers: {
      // 上游要 Authorization;浏览器同源外的头我们自己加
      Authorization: auth ?? `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': req.headers['content-type'] ?? '',
      ...(req.headers['content-length'] != null ? { 'Content-Length': req.headers['content-length'] } : {}),
    },
    timeout: TIMEOUT_MS,
  }, (upRes) => {
    nOk++;
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[#${id}] ${req.url} → ${upRes.statusCode} (${secs}s)`);
    res.writeHead(upRes.statusCode ?? 502, {
      ...cors,
      'Content-Type': upRes.headers['content-type'] ?? 'application/json',
      ...(upRes.headers['content-length'] != null ? { 'Content-Length': upRes.headers['content-length'] } : {}),
    });
    upRes.pipe(res);
  });
  upReq.on('timeout', () => {
    nErr++;
    console.error(`[#${id}] 上游超时(>${TIMEOUT_MS / 1000}s)`);
    upReq.destroy(new Error('upstream timeout'));
  });
  upReq.on('error', (err) => {
    nErr++;
    console.error(`[#${id}] 上游错误:${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: `upstream: ${err.message}` }));
  });
  req.pipe(upReq);
});

server.headersTimeout = TIMEOUT_MS + 30_000;
server.requestTimeout = TIMEOUT_MS + 30_000;
server.listen(PORT, HOST, () => {
  console.log(`[remaster-proxy] http://${HOST}:${PORT} → https://${UPSTREAM}`);
  console.log(`[remaster-proxy] 鉴权:请求头 Authorization 优先,回落 env OPENAI_API_KEY`);
  if (!process.env.OPENAI_API_KEY) console.log(`[remaster-proxy] 提示:未设 OPENAI_API_KEY,请在工作台 UI 里填 key`);
});
