// Renders an animation page to MP4 (1080 × 1920, 30 fps) by capturing each frame in headless Chrome and piping it to ffmpeg.
//   node render.mjs episode1.html                  → ../exports/episode1.mp4
//   node render.mjs episode1.html --stills 1,3.5,6 → ../exports/stills/episode1-3.5.png … (quick review)
//   add --lang en for the English version             → ../exports/episode1-en.mp4
//   node render.mjs episode1-cover.html --cover        → ../exports/covers/episode1-cover.png
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 30;

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html')) || 'episode1.html';
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'fr';
const name = path.basename(page, '.html') + (lang === 'fr' ? '' : `-${lang}`);
const exportsDir = path.join(here, '..', 'exports');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await tab.goto(`${pathToFileURL(path.join(here, page)).href}?render&lang=${lang}`, { waitUntil: 'networkidle0' });
  await tab.waitForFunction('window.SS && SS.ready === true', { timeout: 30000 });
  const duration = await tab.evaluate(() => SS.duration);
  const svg = await tab.$('#stage');

  if (args.includes('--cover')) {
    mkdirSync(path.join(exportsDir, 'covers'), { recursive: true });
    const file = path.join(exportsDir, 'covers', `${name}.png`);
    await svg.screenshot({ path: file });
    console.log(file);
  } else if (stillsArg) {
    mkdirSync(path.join(exportsDir, 'stills'), { recursive: true });
    for (const t of stillsArg.split(',').map(Number)) {
      await tab.evaluate((t) => SS.seek(t), t);
      const file = path.join(exportsDir, 'stills', `${name}-${t}.png`);
      await svg.screenshot({ path: file });
      console.log(file);
    }
  } else {
    mkdirSync(exportsDir, { recursive: true });
    const out = path.join(exportsDir, `${name}.mp4`);
    const ffmpeg = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));
    const frames = Math.round(duration * FPS);
    for (let i = 0; i < frames; i++) {
      await tab.evaluate((t) => SS.seek(t), i / FPS);
      const png = await svg.screenshot({ type: 'png' });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (i % FPS === 0) process.stdout.write(`\r${name}: ${i}/${frames} frames`);
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`\r${name}: ${frames} frames → ${out}`);
  }
} finally {
  await browser.close();
}
