import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 7788 });
let count = 0;
wss.on('connection', (ws, req) => {
  count++;
  console.log(`连接 #${count} from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
  ws.on('message', d => {
    try {
      const m = JSON.parse(d);
      if (m.op === 'hello') console.log(`  #${count} hello: mod=${m.mod} v=${m.v}`);
    } catch {}
  });
});
setTimeout(() => { console.log(`总计 ${count} 个连接`); process.exit(0); }, 5000);
