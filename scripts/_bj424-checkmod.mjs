const mods = ['/src/mainFlow.ts', '/src/net/ClientNet.ts', '/src/world/Housing.ts', '/src/render/VanillaLiquidRenderer.ts', '/src/core/Game.ts'];
for (const m of mods) {
  try { await import('http://localhost:5630' + m); console.log('OK', m); }
  catch (e) { console.log('FAIL', m, String(e.message).slice(0, 160)); }
}
