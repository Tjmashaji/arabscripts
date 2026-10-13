// usage: node render.mjs <builddir> <scenes.json> <out.mp4|--stills t1,t2,...> [fps]
import { createRequire } from 'module'; import fs from 'fs'; import { spawn } from 'child_process';
const require = createRequire(process.argv[1].replace('scripts/render.mjs','build/package.json'));
const { chromium } = require('playwright-core');
const [dir, scenesFile, out, fpsArg] = process.argv.slice(2); const fps = +(fpsArg||30);
const tl = JSON.parse(fs.readFileSync(`${dir}/timeline.json`)); const spec = JSON.parse(fs.readFileSync(scenesFile));
const resolve = v => typeof v === 'number' ? v : v === 'end' ? tl.total : v.endsWith('.end') ? tl.clips.find(c=>c.key===v.slice(0,-4)).end : tl.clips.find(c=>c.key===v).start;
const scenes = spec.scenes.map(s => ({...s, a: resolve(s.a), b: resolve(s.b), opts: s.opts && Object.fromEntries(Object.entries(s.opts).map(([k,v])=>[k, k.endsWith('At')?resolve(v):v]))}));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args:['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + process.argv[1].replace('scripts/render.mjs','build/stage.html'));
await page.evaluate(([tl, sc, o]) => window.setup(tl, sc, o), [tl, scenes, spec.opts||{}]);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.render(0)); await page.waitForTimeout(300);
if (out === '--stills') {
  for (const t of process.argv[6].split(',').map(Number)) { await page.evaluate(t => window.render(t), t); await page.screenshot({ path: `${dir}/still_${t}.png` }); }
} else {
  const ff = spawn('ffmpeg', ['-y','-v','error','-f','image2pipe','-framerate',String(fps),'-i','-','-i',`${dir}/audio.wav`,
    '-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','20','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart', out], { stdio: ['pipe','inherit','inherit'] });
  const N = Math.ceil(tl.total * fps);
  for (let i = 0; i < N; i++) { await page.evaluate(t => window.render(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 }); if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`${i}/${N} `); }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log('\ndone', out);
}
await browser.close();
