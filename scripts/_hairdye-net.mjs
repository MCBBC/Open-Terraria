// msg4 hairDye 中继隔离探针（裸 WS 双假客户端，不进浏览器）：
//  A(房主)/B 经 Hello 入房 → A 发 SyncPlayer{hairDye:9} → 断言 B 收到广播且 JSON 携带 9；
//  再发 {hairDye:0} 覆写 → 断言 B 侧更新（中继非一次性）。
import { WebSocket, Writer, PROTO_MAGIC, PROTO_VER, Msg, makeTinySave, spawnServer } from './_netfake.mjs';

const PORT = 7921, LOBBY = PORT + 1; // http（spawnServer 约定：ws=port / lobby=port+1）
let CODE = '';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const server = spawnServer(PORT, [], null);
await new Promise((r) => setTimeout(r, 900));

const readFrames = (data) => {
  const out = [];
  let p = 0;
  while (p + 3 <= data.length) {
    const len = data.readUInt16LE(p);
    out.push({ id: data[p + 2], buf: data.subarray(p + 3, p + len) });
    if (len < 3) break;
    p += len;
  }
  return out;
};

const mkClient = (name) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${CODE}`);
  const frames = [];
  ws.on('open', () => ws.send(new Writer(Msg.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str(name).str('').finish()));
  ws.on('message', (data) => { for (const f of readFrames(data)) frames.push(f); });
  ws.on('error', () => {});
  setTimeout(() => resolve({ ws, frames }), 1500);
});

try {
  const created = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'hairDye探针', public: false, save: makeTinySave() }),
  }).then((r) => r.json());
  check('建房', !!created.ok && !!created.code, created.error ?? '');
  CODE = created.code;

  const A = await mkClient('A');
  const B = await mkClient('B');
  check('双客户端入房', A.frames.some((f) => f.id === Msg.PlayerSlot) && B.frames.some((f) => f.id === Msg.PlayerSlot));

  // A → SyncPlayer（含 hairDye 9 的外观 JSON）
  A.ws.send(new Writer(Msg.SyncPlayer).u8(0).str('{"name":"A","hair":1,"hairDye":9}').finish());
  await new Promise((r) => setTimeout(r, 600));
  const syncB = B.frames.filter((f) => f.id === Msg.SyncPlayer);
  check('B 收到 msg4 广播', syncB.length >= 1, `frames=${syncB.length}`);

  const parse = (f) => {
    // {u8 slot, str appearance}
    let q = 0;
    const slot = f.buf[q++];
    const n = f.buf.readUInt16LE(q); q += 2;
    return { slot, app: f.buf.toString('utf8', q, q + n) };
  };
  const last = syncB.length ? parse(syncB[syncB.length - 1]) : null;
  check('外观 JSON 携带 hairDye=9', !!last && JSON.parse(last.app).hairDye === 9, last?.app ?? '无帧');

  // 覆写 → hairDye 0（清除剂语义）
  A.ws.send(new Writer(Msg.SyncPlayer).u8(0).str('{"name":"A","hair":1,"hairDye":0}').finish());
  await new Promise((r) => setTimeout(r, 600));
  const last2 = parse(B.frames.filter((f) => f.id === Msg.SyncPlayer).pop());
  check('覆写为中继 hairDye=0（非一次性）', JSON.parse(last2.app).hairDye === 0, last2.app);
} finally {
  try { A?.ws?.close(); } catch {}
  try { B?.ws?.close(); } catch {}
  try { server.kill(); } catch {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
