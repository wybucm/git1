// 极简 CDP 客户端：启动 headless_shell，开启 BeginFrame 控制，逐帧确定性渲染
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export const SHELL = process.env.HEADLESS_SHELL ||
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

export async function launch({ width = 1920, height = 1080, port = 9333 } = {}) {
  const proc = spawn(SHELL, [
    `--remote-debugging-port=${port}`,
    '--deterministic-mode',
    '--enable-begin-frame-control',
    '--run-all-compositor-stages-before-draw',
    '--disable-new-content-rendering-timeout',
    '--disable-threaded-animation',
    '--disable-threaded-scrolling',
    '--disable-checker-imaging',
    '--disable-image-animation-resync',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--font-render-hinting=none',
    '--force-color-profile=srgb',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(100);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch {}
  }
  if (!wsUrl) throw new Error('浏览器启动失败');
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) listeners.forEach(fn => fn(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', {
    url: 'about:blank', width, height, browserContextId, enableBeginFrameControl: true,
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  listeners.push(m => {
    if (m.method === 'Runtime.consoleAPICalled') console.error('[page]', m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console.error('[page-exc]', JSON.stringify(m.params.exceptionDetails).slice(0, 800));
  });
  const evaluate = async expr => {
    const r = await page('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  };
  return {
    page, evaluate, listeners,
    async navigate(url, ticks = 0) {
      await page('Page.navigate', { url });
      // 加载期间也需要送帧，否则页面不会推进
      for (let i = 0; i < 400; i++) {
        await page('HeadlessExperimental.beginFrame', { frameTimeTicks: ticks + i, noDisplayUpdates: true }).catch(() => {});
        const r = await page('Runtime.evaluate', { expression: 'document.readyState + "|" + location.href', returnByValue: true });
        if (r.result.value === 'complete|' + url) return ticks + i + 1;
        await sleep(20);
      }
      throw new Error('页面加载超时');
    },
    beginFrame: params => page('HeadlessExperimental.beginFrame', params),
    close() { try { ws.close(); } catch {} proc.kill('SIGKILL'); },
  };
}
