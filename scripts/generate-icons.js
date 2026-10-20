import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcPayload = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcPayload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, crcPayload, crcBuf]);
}

function createPng(width, height, pixelFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bits per channel
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const ihdrChunk = writePngChunk('IHDR', ihdr);

  // Raw scanlines: width * 4 + 1 filter byte per line
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const idatChunk = writePngChunk('IDAT', deflated);
  const iendChunk = writePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate DokuScan Icon
// Deep blue #0B192C with cyan camera/document scanner design
function dokuScanPixel(x, y, w, h, isMaskable = false) {
  const nx = x / w;
  const ny = y / h;

  // Background: gradient from #0B192C to #1E3E62
  const bgR = Math.round(11 + 19 * ny);
  const bgG = Math.round(25 + 37 * ny);
  const bgB = Math.round(44 + 54 * ny);

  // Safe zone for maskable vs any
  const centerScale = isMaskable ? 0.72 : 0.85;
  const cx = 0.5;
  const cy = 0.5;
  const dx = (nx - cx) / centerScale + 0.5;
  const dy = (ny - cy) / centerScale + 0.5;

  // Let's draw:
  // 1. Document rectangle: x in [0.25, 0.75], y in [0.20, 0.80], rounded corners
  const inDocX = dx >= 0.26 && dx <= 0.74;
  const inDocY = dy >= 0.20 && dy <= 0.80;

  let r = bgR, g = bgG, b = bgB, a = 255;

  // Subtle rounded corner check for doc
  const docCornerR = 0.06;
  let isDoc = inDocX && inDocY;
  if (isDoc) {
    let cornerDist = 0;
    if (dx < 0.26 + docCornerR && dy < 0.20 + docCornerR) {
      cornerDist = Math.hypot(dx - (0.26 + docCornerR), dy - (0.20 + docCornerR));
      if (cornerDist > docCornerR) isDoc = false;
    } else if (dx > 0.74 - docCornerR && dy < 0.20 + docCornerR) {
      cornerDist = Math.hypot(dx - (0.74 - docCornerR), dy - (0.20 + docCornerR));
      if (cornerDist > docCornerR) isDoc = false;
    } else if (dx < 0.26 + docCornerR && dy > 0.80 - docCornerR) {
      cornerDist = Math.hypot(dx - (0.26 + docCornerR), dy - (0.80 - docCornerR));
      if (cornerDist > docCornerR) isDoc = false;
    } else if (dx > 0.74 - docCornerR && dy > 0.80 - docCornerR) {
      cornerDist = Math.hypot(dx - (0.74 - docCornerR), dy - (0.80 - docCornerR));
      if (cornerDist > docCornerR) isDoc = false;
    }
  }

  if (isDoc) {
    // Document background: White / Light Ice Blue
    r = 241;
    g = 245;
    b = 249;

    // Scan lines / doc rows
    // Row 1
    if (dy >= 0.32 && dy <= 0.35 && dx >= 0.34 && dx <= 0.66) {
      r = 0; g = 141; b = 218; // Primary accent #008DDA
    }
    // Row 2
    if (dy >= 0.40 && dy <= 0.43 && dx >= 0.34 && dx <= 0.66) {
      r = 148; g = 163; b = 184;
    }
    // Row 3
    if (dy >= 0.48 && dy <= 0.51 && dx >= 0.34 && dx <= 0.56) {
      r = 148; g = 163; b = 184;
    }

    // Scanning laser bar in middle (bright cyan beam)
    if (dy >= 0.56 && dy <= 0.58 && dx >= 0.28 && dx <= 0.72) {
      r = 56; g = 189; b = 248; // Cyan beam #38BDF8
    }

    // Camera aperture / lens symbol on bottom right or badge
    const lensCx = 0.58;
    const lensCy = 0.68;
    const lensDist = Math.hypot(dx - lensCx, dy - lensCy);
    if (lensDist <= 0.11) {
      // Outer lens ring
      r = 15; g = 23; b = 42;
      if (lensDist <= 0.08) {
        // Inner lens cyan
        r = 0; g = 141; b = 218;
        if (lensDist <= 0.04) {
          // Iris pupil
          r = 255; g = 255; b = 255;
        }
      }
    }
  }

  // Scanner corner brackets (CamScanner hallmark) around the doc
  const bThick = 0.025;
  const bLen = 0.12;
  // Top-left
  const isTL_H = dy >= 0.15 && dy <= 0.15 + bThick && dx >= 0.20 && dx <= 0.20 + bLen;
  const isTL_V = dx >= 0.20 && dx <= 0.20 + bThick && dy >= 0.15 && dy <= 0.15 + bLen;
  // Top-right
  const isTR_H = dy >= 0.15 && dy <= 0.15 + bThick && dx >= 0.80 - bLen && dx <= 0.80;
  const isTR_V = dx >= 0.80 - bThick && dx <= 0.80 && dy >= 0.15 && dy <= 0.15 + bLen;
  // Bottom-left
  const isBL_H = dy >= 0.85 - bThick && dy <= 0.85 && dx >= 0.20 && dx <= 0.20 + bLen;
  const isBL_V = dx >= 0.20 && dx <= 0.20 + bThick && dy >= 0.85 - bLen && dy <= 0.85;
  // Bottom-right
  const isBR_H = dy >= 0.85 - bThick && dy <= 0.85 && dx >= 0.80 - bLen && dx <= 0.80;
  const isBR_V = dx >= 0.80 - bThick && dx <= 0.80 && dy >= 0.85 - bLen && dy <= 0.85;

  if (isTL_H || isTL_V || isTR_H || isTR_V || isBL_H || isBL_V || isBR_H || isBR_V) {
    r = 56; g = 189; b = 248; // Bright cyan
  }

  return [r, g, b, a];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write 192x192
console.log('Generating icon-192.png...');
const icon192 = createPng(192, 192, (x, y, w, h) => dokuScanPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);

// Write 512x512
console.log('Generating icon-512.png...');
const icon512 = createPng(512, 512, (x, y, w, h) => dokuScanPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);

// Write maskable 512x512 (with padded safe zone)
console.log('Generating icon-maskable-512.png...');
const iconMaskable = createPng(512, 512, (x, y, w, h) => dokuScanPixel(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'icon-maskable-512.png'), iconMaskable);

// Apple touch icon 180x180
console.log('Generating apple-touch-icon.png...');
const appleIcon = createPng(180, 180, (x, y, w, h) => dokuScanPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

// Favicon SVG
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0B192C"/>
  <rect x="25" y="18" width="50" height="64" rx="6" fill="#F1F5F9"/>
  <!-- Scanner corners -->
  <path d="M 20 30 L 20 18 L 32 18" stroke="#38BDF8" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 80 30 L 80 18 L 68 18" stroke="#38BDF8" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 20 70 L 20 82 L 32 82" stroke="#38BDF8" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 80 70 L 80 82 L 68 82" stroke="#38BDF8" stroke-width="4" fill="none" stroke-linecap="round"/>
  <!-- Lines -->
  <rect x="34" y="30" width="32" height="4" rx="2" fill="#008DDA"/>
  <rect x="34" y="40" width="32" height="3" rx="1.5" fill="#94A3B8"/>
  <rect x="34" y="48" width="22" height="3" rx="1.5" fill="#94A3B8"/>
  <!-- Scanner beam -->
  <line x1="26" y1="58" x2="74" y2="58" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>
  <!-- Camera lens badge -->
  <circle cx="58" cy="68" r="9" fill="#0F172A"/>
  <circle cx="58" cy="68" r="6" fill="#008DDA"/>
  <circle cx="58" cy="68" r="3" fill="#FFFFFF"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);

console.log('Icons generated successfully!');
