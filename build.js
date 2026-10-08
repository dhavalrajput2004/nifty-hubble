const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// Create www directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const filesToCopy = [
  'index.html',
  'game.js',
  'manifest.json',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'maskable-icon-512.png',
  'icon.svg',
  'icon-maskable.svg'
];

// Copy root files to www
filesToCopy.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} -> www/${file}`);
  }
});

// Copy .well-known directory if exists
const wellKnownSrc = path.join(srcDir, '.well-known');
const wellKnownDest = path.join(destDir, '.well-known');
if (fs.existsSync(wellKnownSrc)) {
  if (!fs.existsSync(wellKnownDest)) {
    fs.mkdirSync(wellKnownDest, { recursive: true });
  }
  fs.readdirSync(wellKnownSrc).forEach(file => {
    fs.copyFileSync(path.join(wellKnownSrc, file), path.join(wellKnownDest, file));
  });
  console.log('Copied .well-known -> www/.well-known');
}

console.log('Build completed successfully. Web directory (www) is ready for Capacitor!');
