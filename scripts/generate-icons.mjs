// Generates every app icon in public/ from the PilaPH logo defined below.
// Run with `npm run icons` after changing the logo; the output files are committed.
// sharp is installed temporarily by that script (`--no-save`), so it never ends
// up in package.json or the Docker image.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const NAVY = '#0F172A'; // app background / theme_color
const EMERALD = '#10B981';
const WHITE = '#F8FAFC';

// The logo: a queue ticket ("pila") with a dotted perforation and three people
// in line, the first one ("now serving") highlighted. Drawn on a 512x512 grid.
// Holes are cut with a mask so the logo works on any background.
const TICKET =
    'M104 136H408A40 40 0 0 1 448 176V220A36 36 0 0 0 448 292V336A40 40 0 0 1 408 376' +
    'H104A40 40 0 0 1 64 336V292A36 36 0 0 0 64 220V176A40 40 0 0 1 104 136Z';

function logo({ ticketColor, servingColor }) {
    // servingColor null = cut the first dot out too (single-colour badge).
    return `
  <defs>
    <mask id="pilaph-cutouts">
      <rect width="512" height="512" fill="#fff"/>
      <path d="M168 168V344" stroke="#000" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 25.14"/>
      ${servingColor ? '' : '<circle cx="222" cy="256" r="26" fill="#000"/>'}
      <circle cx="290" cy="256" r="26" fill="#000"/>
      <circle cx="358" cy="256" r="26" fill="#000"/>
    </mask>
  </defs>
  <path d="${TICKET}" fill="${ticketColor}" mask="url(#pilaph-cutouts)"/>
  ${servingColor ? `<circle cx="222" cy="256" r="26" fill="${servingColor}"/>` : ''}`;
}

// Places the logo on an optional background, scaled around the centre.
function iconSvg({
    background,
    rounded,
    scale,
    ticketColor = EMERALD,
    servingColor = WHITE,
}) {
    const offset = 256 - 256 * scale;
    const bg = background
        ? `<rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="${background}"/>`
        : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${bg}
  <g transform="translate(${offset} ${offset}) scale(${scale})">${logo({ ticketColor, servingColor })}
  </g>
</svg>
`;
}

const VARIANTS = {
    // Browser tabs, desktop installs, Android "any" icons: rounded navy tile.
    any: iconSvg({ background: NAVY, rounded: true, scale: 1 }),
    // Android adaptive icons: full-bleed, logo inside the 80% safe zone.
    maskable: iconSvg({ background: NAVY, rounded: false, scale: 0.78 }),
    // iPhone/iPad home screen: full-bleed square; iOS rounds the corners itself.
    apple: iconSvg({ background: NAVY, rounded: false, scale: 0.88 }),
    // Android notification badge: only the alpha channel is used, so plain white.
    badge: iconSvg({
        background: null,
        rounded: false,
        scale: 1.2,
        ticketColor: '#FFFFFF',
        servingColor: null,
    }),
};

// Render straight at the target size (crisper than scaling a large image down).
function renderPng(svg, size, { opaque = false } = {}) {
    let image = sharp(Buffer.from(svg), { density: (72 * size) / 512 }).resize(
        size,
        size,
    );
    if (opaque) image = image.flatten({ background: NAVY });
    return image.png({ compressionLevel: 9 }).toBuffer();
}

// .ico with PNG-encoded entries, supported by every current browser.
function buildIco(pngs) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    let offset = 6 + 16 * pngs.length;
    const entries = pngs.map(({ size, data }) => {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size >= 256 ? 0 : size, 0);
        entry.writeUInt8(size >= 256 ? 0 : size, 1);
        entry.writeUInt16LE(1, 4); // colour planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(data.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += data.length;
        return entry;
    });
    return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const out = (name) => new URL(`../public/${name}`, import.meta.url);

writeFileSync(out('favicon.svg'), VARIANTS.any);
writeFileSync(
    out('favicon.ico'),
    buildIco(
        await Promise.all(
            [16, 32, 48].map(async (size) => ({
                size,
                data: await renderPng(VARIANTS.any, size),
            })),
        ),
    ),
);
for (const size of [64, 192, 512]) {
    writeFileSync(
        out(`pwa-${size}x${size}.png`),
        await renderPng(VARIANTS.any, size),
    );
}
for (const size of [192, 512]) {
    writeFileSync(
        out(`pwa-maskable-${size}x${size}.png`),
        await renderPng(VARIANTS.maskable, size),
    );
}
writeFileSync(
    out('apple-touch-icon.png'),
    await renderPng(VARIANTS.apple, 180, { opaque: true }),
);
writeFileSync(out('badge-96x96.png'), await renderPng(VARIANTS.badge, 96));

console.log('Icons written to public/');
