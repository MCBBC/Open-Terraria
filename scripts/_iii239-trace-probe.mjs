import puppeteer from 'puppeteer-core';
const CHROME = process.env.SW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5293';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-dev-shm-usage','--use-gl=angle','--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__swFlow?.newWorld', { timeout: 120000 });
const main = await page.createCDPSession();
const cats = ['toplevel','devtools.timeline','v8','disabled-by-default-devtools.timeline','disabled-by-default-devtools.timeline.frame','disabled-by-default-devtools.timeline.stack'];
async function cycle(label, { separateProfiler = false, waitComplete = 8000 } = {}) {
  const traceSess = main;
  let events = [];
  const onDC = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
  traceSess.on('Tracing.dataCollected', onDC);
  let completeResolved = null;
  const complete = new Promise((res) => {
    completeResolved = res;
    traceSess.once('Tracing.tracingComplete', () => res('event'));
  });
  const t = setTimeout(() => completeResolved('timeout'), waitComplete);
  await traceSess.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'record-continuously', includedCategories: cats, excludedCategories: [] } });
  let profEvents = null;
  if (separateProfiler) {
    const ps = await page.createCDPSession();
    await ps.send('Profiler.enable'); await ps.send('Profiler.setSamplingInterval', { interval: 1000 }); await ps.send('Profiler.start');
    await new Promise((r) => setTimeout(r, 4000));
    const { profile } = await ps.send('Profiler.stop'); profEvents = profile.samples.length;
    await ps.detach();
  } else {
    await new Promise((r) => setTimeout(r, 4000));
  }
  await traceSess.send('Tracing.end');
  const how = await complete;
  clearTimeout(t);
  traceSess.off('Tracing.dataCollected', onDC);
  const cands = new Map();
  for (const e of events) if (e.cat === '__metadata' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') cands.set(e.pid, 1);
  const counts = new Map();
  for (const e of events) if (cands.has(e.pid) && e.cat !== '__metadata') counts.set(e.pid, (counts.get(e.pid) ?? 0) + 1);
  const mainPid = [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const rel = events.filter((e) => e.pid === mainPid && e.cat !== '__metadata' && typeof e.ts === 'number' && e.ts > 0);
  const ts = rel.map((e) => e.ts);
  console.log(label, 'total=' + events.length, 'main=' + rel.length, 'spanMs=' + (ts.length ? ((Math.max(...ts) - Math.min(...ts)) / 1000).toFixed(0) : 'n/a'), 'complete=' + how, 'profSamples=' + profEvents);
}
await cycle('A sep-prof ', { separateProfiler: true });
await cycle('B sep-prof ', { separateProfiler: true });
await cycle('C noprof   ', { separateProfiler: false });
await cycle('D sep-prof ', { separateProfiler: true });
await browser.close();
process.exit(0);
