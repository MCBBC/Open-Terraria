// CDP 抓挂死进程的调用栈：Debugger.pause → paused 事件 callFrames
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:9229/4a0fc908-06d4-4970-ac8b-174190b18549', { perMessageDeflate: false });
let id = 1;
const send = (method) => { ws.send(JSON.stringify({ id: id++, method })); };
ws.on('open', () => {
  send('Debugger.enable');
  setTimeout(() => send('Debugger.pause'), 300);
});
ws.on('message', (data) => {
  const m = JSON.parse(data);
  if (m.method === 'Debugger.paused') {
    console.log('=== 挂死点调用栈（多次采样合并见多次运行）===');
    for (const f of m.params.callFrames.slice(0, 12)) {
      console.log(`${f.functionName || '(anon)'}  @  ${f.url.split('/').slice(-2).join('/')}:${f.location.lineNumber + 1}`);
    }
    send('Debugger.resume');
    setTimeout(() => { ws.close(); process.exit(0); }, 300);
  }
});
setTimeout(() => { console.log('TIMEOUT: no paused event'); process.exit(1); }, 8000);
