const path = require('path');
// Gera favicon, ícones do Android e telas de abertura a partir da logo vetorial (frontend/public/aedolia-mark.svg).
// Uso (na raiz do projeto): cd frontend; npm install --no-save sharp; node ..\deploy\gerar-icones.cjs
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), path.join(__dirname, '..', 'frontend')] }));
const fs = require('fs');

const FRONT = path.join(__dirname, '..', 'frontend');
const RES = path.join(FRONT, 'android', 'app', 'src', 'main', 'res');
const OUT = require('os').tmpdir(); // prévias para conferir
const markSrc = fs.readFileSync(path.join(FRONT, 'public', 'aedolia-mark.svg'), 'utf8');
const inner = markSrc.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');

// Logo em (x, y) com lado `size`, na cor `color`
const mark = (x, y, size, color) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 3.25 64 64" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" color="${color}">${inner.replace(/currentColor/g, color)}</svg>`;

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#047857"/></linearGradient></defs>`;

const tile = (size, shape) => {
  const bg = shape === 'circle'
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)"/>`;
  const m = size * 0.74;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${GRAD}${bg}${mark((size - m) / 2, (size - m) / 2 - size * 0.01, m, '#ffffff')}</svg>`;
};

const png = (svg, file) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);

(async () => {
  // Prévia para conferir o desenho (como a logo enviada: cinza sobre claro)
  await png(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#f4f4f4"/>${mark(90, 40, 420, '#4b4b4b')}<text x="300" y="545" font-family="Segoe UI" font-size="86" text-anchor="middle" fill="#4b4b4b">Aedolia</text></svg>`, path.join(OUT, 'preview.png'));
  await png(tile(512, 'square'), path.join(OUT, 'preview-icon.png'));

  // Navegador: aba (SVG), atalho do iPhone e ícone grande
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}<rect width="64" height="64" rx="14" fill="url(#g)"/><g transform="translate(5.44 2.74) scale(0.83)" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/currentColor/g, '#fff')}</g></svg>\n`;
  fs.writeFileSync(path.join(FRONT, 'public', 'favicon.svg'), faviconSvg);
  await png(tile(180, 'square'), path.join(FRONT, 'public', 'apple-touch-icon.png'));
  await png(tile(512, 'square'), path.join(FRONT, 'public', 'icon-512.png'));

  // Android: ícones antigos (quadrado e redondo) e o adaptável (só o desenho; o fundo verde vem do XML)
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = path.join(RES, `mipmap-${d}`);
    await png(tile(Math.round(48 * k), 'square'), path.join(dir, 'ic_launcher.png'));
    await png(tile(Math.round(48 * k), 'circle'), path.join(dir, 'ic_launcher_round.png'));
    const fg = Math.round(108 * k);
    const m = fg * 0.5; // dentro da área segura de 66dp
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="${fg}" height="${fg}">${mark((fg - m) / 2, (fg - m) / 2, m, '#ffffff')}</svg>`, path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Tela de abertura: fundo escuro do app, logo verde e o nome
  const splashes = fs.readdirSync(RES).filter((d) => d.startsWith('drawable')).map((d) => path.join(RES, d, 'splash.png')).filter((f) => fs.existsSync(f));
  for (const f of splashes) {
    const { width, height } = await sharp(f).metadata();
    const s = Math.min(width, height) * 0.3;
    const x = (width - s) / 2;
    const y = height / 2 - s * 0.72;
    const font = s * 0.3;
    await png(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#050505"/>${mark(x, y, s, '#10b981')}<text x="${width / 2}" y="${y + s + font * 1.1}" font-family="Segoe UI Semibold, Segoe UI" font-weight="600" font-size="${font}" text-anchor="middle" fill="#f8fafc">Aedolia</text></svg>`, f);
  }
  console.log('ícones gerados; telas de abertura:', splashes.length);
})();
