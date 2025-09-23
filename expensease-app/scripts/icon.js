// scripts/generate-icons.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const SRC = path.resolve(__dirname, '..', 'assets/default', 'icon.png'); // change if needed
const OUT = path.resolve(__dirname, '..', 'assets', '');

if (!fs.existsSync(SRC)) {
  console.error('Source icon not found:', SRC);
  process.exit(1);
}

const iosSizes = [
  20, 29, 40, 60, 76, 83.5, 1024 // 83.5 -> 167 (2x) handled below
];

const iosSpecific = [
  // full list of iOS icons commonly used (size x scale)
  { size: 20, scales: [1,2,3] },
  { size: 29, scales: [1,2,3] },
  { size: 40, scales: [1,2,3] },
  { size: 60, scales: [2,3] }, // 60@2x = 120 etc
  { size: 76, scales: [1,2] },
  { size: 83.5, scales: [2] }, // 83.5@2x => 167
  { size: 1024, scales: [1] }
];

const androidSizes = [48,72,96,144,192,512]; // mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi, Play store


async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function makeIcon(dest, sizePx) {
  // Use sharp to resize and do a light optimization
  return sharp(SRC)
    .resize(Math.round(sizePx), Math.round(sizePx), { fit: 'cover' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);
}

(async () => {
  try {
    // Prepare folders
    const iosOut = path.join(OUT, 'ios');
    const androidOut = path.join(OUT, 'android');
    await ensureDir(iosOut);
    await ensureDir(androidOut);

    const tasks = [];

    // iOS icons
    iosSpecific.forEach(entry => {
      entry.scales.forEach(scale => {
        const sizePx = entry.size * scale;
        // scale 83.5 -> float; round to nearest integer
        const rounded = Math.round(sizePx);
        const fileName = `icon-ios-${entry.size}${scale}x.png`.replace('.', '_');
        const dest = path.join(iosOut, fileName);
        tasks.push(makeIcon(dest, rounded).then(()=>console.log('Created', dest)));
      });
    });

    // Android icons
    // For adaptive icon foreground we just reuse original as foreground (512 recommended)
    androidSizes.forEach(size => {
      const fileName = `icon-android-${size}x${size}.png`;
      const dest = path.join(androidOut, fileName);
      tasks.push(makeIcon(dest, size).then(()=>console.log('Created', dest)));
    });

    // Adaptive icon foreground (512)
    const adaptiveFg = path.join(androidOut, 'adaptive-foreground.png');
    tasks.push(makeIcon(adaptiveFg, 512).then(()=>console.log('Created', adaptiveFg)));

    await Promise.all(tasks);
  } catch (err) {
    console.error('Error generating icons:', err);
    process.exit(1);
  }
})();
