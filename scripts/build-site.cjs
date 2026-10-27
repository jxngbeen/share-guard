'use strict';
// Package only the reviewed website, detector and extension. Never the repository root.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist', 'site');
const extension = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid extension version');
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.mkdirSync(path.join(out, 'downloads'), { recursive: true });
for (const file of ['styles.css', 'legal.css', 'app.js', 'motion.js', 'terms.html', 'privacy.html']) fs.copyFileSync(path.join(root, 'website', file), path.join(out, file));
const html = fs.readFileSync(path.join(root, 'website', 'index.html'), 'utf8');
if (!html.includes(`share-guard-v${version}.zip`)) throw new Error('Update website download/version references');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(extension, 'detector.js'), path.join(out, 'detector.js'));
// One reviewed theme is shared by the real extension and website demo.
fs.copyFileSync(path.join(extension, 'popup.css'), path.join(out, 'popup.css'));
for (const file of ['mark.svg', 'wordmark.svg']) if (!fs.readFileSync(path.join(extension, 'icons', file)).equals(fs.readFileSync(path.join(root, 'brand', file)))) throw new Error('Popup logo must match brand assets');
for (const file of ['mark.svg', 'wordmark.svg', 'icon.svg', 'icon-180.png']) fs.copyFileSync(path.join(root, 'brand', file), path.join(out, 'assets', file));
// Explicit allowlist prevents private material and unrelated development files entering the ZIP.
const files = ['manifest.json', 'background.js', 'content.js', 'detector.js', 'editors.js', 'naver.js', 'popup.html', 'popup.css', 'popup.js', 'icons/mark.svg', 'icons/wordmark.svg', ...Object.values(manifest.icons)];
for (const file of files) if (!fs.statSync(path.join(extension, file)).isFile()) throw new Error(`Missing: ${file}`);
const archive = path.join(out, 'downloads', `share-guard-v${version}.zip`);
fs.rmSync(archive, { force: true });
execFileSync('zip', ['-X', '-q', archive, ...files], { cwd: extension });
console.log(`Built site: ${out}\nExtension: v${version}, ${files.length} files`);
