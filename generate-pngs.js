const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function generatePNG(width, height, r, g, b) {
  // CRC32 table & function
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crcVal = crc32(buf.slice(4, 8 + len));
    buf.writeUInt32BE(crcVal, 8 + len);
    return buf;
  }

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw Image Data (Filter 0 + RGBA)
  const lineSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * lineSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * lineSize;
    rawData[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      
      // Draw stylized icon background & cricket bat / ball graphics
      const dx = x - width / 2;
      const dy = y - height / 2;
      const distSq = dx * dx + dy * dy;
      const maxR = width / 2;

      // Circle background gradient
      if (distSq < (maxR * 0.9) * (maxR * 0.9)) {
        // Center ball/bat details
        if (Math.abs(dx + dy) < width * 0.15 && distSq < (maxR * 0.5) * (maxR * 0.5)) {
          // Yellow Bat detail
          rawData[pxOffset] = 245;
          rawData[pxOffset + 1] = 194;
          rawData[pxOffset + 2] = 66;
          rawData[pxOffset + 3] = 255;
        } else if (Math.hypot(dx - maxR * 0.2, dy + maxR * 0.2) < maxR * 0.25) {
          // Red Cricket Ball
          rawData[pxOffset] = 234;
          rawData[pxOffset + 1] = 67;
          rawData[pxOffset + 2] = 53;
          rawData[pxOffset + 3] = 255;
        } else {
          // Green Field
          rawData[pxOffset] = 52;
          rawData[pxOffset + 1] = 168;
          rawData[pxOffset + 2] = 83;
          rawData[pxOffset + 3] = 255;
        }
      } else {
        // Blue Google Brand background
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = 255;
      }
    }
  }

  const idatCompressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', idatCompressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Write PNG files
fs.writeFileSync(path.join(__dirname, 'icon-192.png'), generatePNG(192, 192, 66, 133, 244));
fs.writeFileSync(path.join(__dirname, 'icon-512.png'), generatePNG(512, 512, 66, 133, 244));
fs.writeFileSync(path.join(__dirname, 'maskable-icon-512.png'), generatePNG(512, 512, 66, 133, 244));

console.log('Generated PNG icons icon-192.png, icon-512.png, maskable-icon-512.png successfully.');
