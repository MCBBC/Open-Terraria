// IIII245 一次性诊断:J5 全后代树杀 CLI 端到端——场景 spawn detached 孤儿
// (sleep 300,模拟 vitest 池 worker/python heredoc 这类无端口孙代),
// CLI 正常收尾时它必须被后代树清扫带走(盘上 ps 复核由外层 shell 做)。
import { spawn } from 'node:child_process';
const orphan = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' });
orphan.unref();
console.log(`III245-ORPHAN-PID=${orphan.pid}`);
await new Promise((r) => setTimeout(r, 300));
process.exit(0);
