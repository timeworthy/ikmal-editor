const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jobs = [
  { source: 'assets/ikmal_languagetool_icon.svg', outputs: ['assets/ikmal_languagetool_icon.png', 'assets/ikmal_languagetool_icon.jpg'], width: 1024, height: 1024 },
  { source: 'assets/ikmal_languagetool_mark.svg', outputs: ['assets/ikmal_languagetool_mark.png', 'assets/ikmal_languagetool_mark.jpg'], width: 1024, height: 1024 },
  { source: 'assets/ikmal_languagetool_banner.svg', outputs: ['assets/ikmal_languagetool_banner.png', 'assets/ikmal_languagetool_banner.jpg', 'assets/social_preview.png'], width: 1280, height: 640 },
];

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1280, height: 1024, webPreferences: { contextIsolation: true } });
  for (const job of jobs) {
    const svg = await fs.readFile(path.join(root, job.source), 'utf8');
    const html = `<style>html,body{margin:0;width:${job.width}px;height:${job.height}px;overflow:hidden;background:#0e1118}svg{display:block;width:100%;height:100%}</style>${svg}`;
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: job.width, height: job.height });
    for (const output of job.outputs) {
      const encoded = output.endsWith('.jpg') ? image.toJPEG(92) : image.toPNG();
      await fs.writeFile(path.join(root, output), encoded);
    }
  }
  window.destroy();
  app.quit();
});
