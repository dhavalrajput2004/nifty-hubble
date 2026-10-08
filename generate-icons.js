const fs = require('fs');
const path = require('path');
const { createCanvas } = (() => {
  try { return require('canvas'); } catch (e) { return { createCanvas: null }; }
})();

function createSVGIcon(size, isMaskable = false) {
  const bg = '#4285f4';
  const padding = isMaskable ? size * 0.15 : 0;
  const contentSize = size - (padding * 2);
  const scale = contentSize / 512;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg}" rx="${isMaskable ? 0 : size * 0.2}"/>
    <g transform="translate(${padding}, ${padding}) scale(${scale})">
      <!-- Cricket Bat & Ball Icon -->
      <circle cx="256" cy="256" r="200" fill="#34a853" opacity="0.3"/>
      <!-- Pitch line -->
      <rect x="196" y="70" width="120" height="372" fill="#e2c97a" rx="10"/>
      <!-- Stumps -->
      <rect x="226" y="100" width="10" height="60" fill="#f0d58c"/>
      <rect x="251" y="100" width="10" height="60" fill="#f0d58c"/>
      <rect x="276" y="100" width="10" height="60" fill="#f0d58c"/>
      <!-- Ball -->
      <circle cx="340" cy="200" r="32" fill="#ea4335"/>
      <circle cx="330" cy="190" r="8" fill="#f48070"/>
      <!-- Bat -->
      <g transform="translate(180, 240) rotate(-35)">
        <rect x="0" y="0" width="24" height="60" fill="#f2e2b8" rx="5"/>
        <rect x="-8" y="60" width="40" height="130" fill="#c48a3c" rx="8"/>
      </g>
      <!-- Emoji / Text -->
      <text x="256" y="440" font-family="sans-serif" font-size="48" font-weight="bold" fill="#ffffff" text-anchor="middle">CRICKET</text>
    </g>
  </svg>`;
}

// Write SVG icons
fs.writeFileSync(path.join(__dirname, 'icon.svg'), createSVGIcon(512));
fs.writeFileSync(path.join(__dirname, 'icon-maskable.svg'), createSVGIcon(512, true));

console.log('Generated SVG icons successfully.');
