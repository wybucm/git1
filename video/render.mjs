// 逐帧确定性渲染：导演页 → JPEG 帧 → ffmpeg(H.264)
// 用法：node render.mjs [--out out/video.mp4] [--from 0] [--to 58] [--stills 5.5,12,16] [--no-video]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => {
  const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(' ') || true];
}));
const OUT = path.resolve(HERE, args.out || 'out/video.mp4');
const FROM = +(args.from ?? 0), TO_ARG = args.to != null ? +args.to : null;
const STILLS = (args.stills ? String(args.stills).split(',').map(Number) : []);
const NO_VIDEO = !!args['no-video'];
fs.mkdirSync(path.join(HERE, 'out/stills'), { recursive: true });

const FFMPEG = process.env.FFMPEG || execSync(`python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim();

// 静态文件服务器（iframe 需要同源才能被导演页脚本驱动）
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/video/director.html`;

const b = await launch({ port: 9300 + Math.floor(Math.random() * 500) });
let ticks = await b.navigate(url, 1000);
// 等待字体与 iframe 就绪
await b.evaluate(`DIRECTOR.ready.then(() => Promise.all([document.fonts.ready, document.getElementById('app').contentDocument.fonts.ready])).then(() => 1)`);
for (let i = 0; i < 10; i++) await b.beginFrame({ frameTimeTicks: ticks++, noDisplayUpdates: true });

const { FPS, DURATION } = await b.evaluate('({FPS: DIRECTOR.FPS, DURATION: DIRECTOR.DURATION})');
const TO = TO_ARG ?? DURATION;
const N = Math.round(Math.min(DURATION, Math.max(TO, ...STILLS.map(x => x + 1 / FPS))) * FPS);

// 合成器动画（如带 will-change 的拖拽幽灵）按 BeginFrame 的 frameTimeTicks 计时，
// 必须和页面的虚拟时钟同一时间基准，否则过渡会瞬间结束。这里测出 performance.now() 的单调时钟原点。
const mono = () => Number(process.hrtime.bigint()) / 1e6;
const m0 = mono(); const pn = await b.evaluate('performance.now()'); const m1 = mono();
const ORIGIN = (m0 + m1) / 2 - pn;

// 虚拟时间：暂停，每帧按“速度坡度”推进
let waiter = null;
b.listeners.push(m => { if (m.method === 'Emulation.virtualTimeBudgetExpired' && waiter) { const w = waiter; waiter = null; w(); } });
await b.page('Emulation.setVirtualTimePolicy', { policy: 'pause' });
const advance = ms => new Promise(res => { waiter = res; b.page('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms }); });

let ff = null;
if (!NO_VIDEO) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', OUT],
    { stdio: ['pipe', 'inherit', 'inherit'] });
}
const write = buf => new Promise(res => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', res); else res(); });

let last = null, vms = 0;
const t0 = Date.now();
const stillFrames = new Set(STILLS.map(s => Math.round(s * FPS)));
for (let i = 0; i < N; i++) {
  const t = i / FPS;
  const { rate, now } = await b.evaluate(`DIRECTOR.frame(${t})`);
  const capture = (t >= FROM - 1e-9 && t < TO) || stillFrames.has(i);
  const r = await b.beginFrame({ frameTimeTicks: Math.max(ticks, ORIGIN + now), interval: 1000 / FPS, ...(capture ? { screenshot: { format: 'jpeg', quality: 94 } } : { noDisplayUpdates: false }) });
  if (capture) {
    const buf = r.screenshotData ? Buffer.from(r.screenshotData, 'base64') : last;
    if (!r.screenshotData) console.error(`frame ${i}: no damage, reusing previous`);
    last = buf;
    if (stillFrames.has(i) && buf) fs.writeFileSync(path.join(HERE, `out/stills/t${t.toFixed(2)}.jpg`), buf);
    if (ff && t >= FROM - 1e-9 && t < TO && buf) await write(buf);
  }
  const step = 1000 / FPS * rate;
  vms += step;
  ticks = Math.max(ticks, ORIGIN + now) + 1e-3;
  await advance(step);
  if (i % 300 === 0) console.error(`frame ${i}/${N}  t=${t.toFixed(2)}s  rate=${rate.toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
}
const cues = await b.evaluate('DIRECTOR.cues');
if (N === Math.round(DURATION * FPS)) fs.writeFileSync(path.join(HERE, 'out/cues.json'), JSON.stringify({ duration: DURATION, fps: FPS, cues }, null, 1));
if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
b.close(); server.close();
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${cues.length} cues`);
