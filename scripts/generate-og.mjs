import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#101112" />
  <circle cx="1000" cy="150" r="280" fill="none" stroke="#8a6d00" stroke-width="1.5" opacity="0.18" />
  <circle cx="1000" cy="150" r="190" fill="none" stroke="#2a2d2f" stroke-width="1.5" opacity="0.25" />
  <circle cx="1000" cy="150" r="110" fill="none" stroke="#8a6d00" stroke-width="1.5" opacity="0.2" />

  <text x="90" y="150" font-family="Arial, sans-serif" font-size="16" letter-spacing="2" fill="#E3B200">
    ИНТЕРНЕТ-МАРКЕТОЛОГ
  </text>

  <text x="88" y="270" font-family="Arial, sans-serif" font-size="64" fill="#ffffff" font-weight="400">
    Ярополов Павел
  </text>

  <text x="90" y="330" font-family="Arial, sans-serif" font-size="30" fill="#8b9095">
    Яндекс.Директ и сайты для бизнеса в Ярославле
  </text>

  <rect x="90" y="480" width="2" height="60" fill="#E3B200" />
  <text x="120" y="505" font-family="Arial, sans-serif" font-size="20" fill="#ffffff">67 регионов</text>
  <text x="120" y="530" font-family="Arial, sans-serif" font-size="14" fill="#5c6165">бюджет свыше 1 000 000 руб. в месяц</text>

  <rect x="0" y="624" width="1200" height="6" fill="#E3B200" />
</svg>
`;

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
mkdirSync(publicDir, { recursive: true });

await sharp(Buffer.from(svg))
  .png()
  .toFile(fileURLToPath(new URL('../public/og-cover.png', import.meta.url)));

console.log('OG cover generated at public/og-cover.png');
