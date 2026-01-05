#!/usr/bin/env node
/**
 * NERVBOX WRAPPED 2025 - PNG Generator
 * Generates Instagram Story format images from HTML slides
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SLIDES_DIR = path.join(__dirname, 'templates', 'slides');
const STYLES_DIR = path.join(__dirname, 'styles');
const OUTPUT_DIR = path.join(__dirname, 'output');

const VIEWPORT = {
  width: 1080,
  height: 1920,
  deviceScaleFactor: 1
};

// Slide configuration
const SLIDES = [
  '01-intro',
  '02-stats',
  '03-sound-of-the-year',
  '04-charts',
  '05-peak-times',
  '06-sound-koenige',
  '07-speed-demon',
  '08-nachteulen',
  '09-high-roller',
  '10-wall-of-shame',
  '11-achievement-hunters',
  '12-content-creators',
  '13-grosszuegigkeit',
  '14-first-blood',
  '15-the-awards',
  '16-timeline',
  '17-fun-facts',
  '18-danke'
];

async function loadCSS() {
  const variables = fs.readFileSync(path.join(STYLES_DIR, 'variables.css'), 'utf-8');
  const typography = fs.readFileSync(path.join(STYLES_DIR, 'typography.css'), 'utf-8');
  const components = fs.readFileSync(path.join(STYLES_DIR, 'components.css'), 'utf-8');
  return { variables, typography, components };
}

function createHTML(slideContent, css) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>NERVBOX WRAPPED 2025</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${css.variables}
    ${css.typography}
    ${css.components}
  </style>
</head>
<body>
  ${slideContent}
</body>
</html>`;
}

async function generateSlide(browser, slideName, css, outputDir) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Load slide content
  const slideFile = path.join(SLIDES_DIR, `${slideName}.html`);
  if (!fs.existsSync(slideFile)) {
    console.error(`  ✗ Slide not found: ${slideName}`);
    await page.close();
    return false;
  }

  const slideContent = fs.readFileSync(slideFile, 'utf-8');
  const fullHTML = createHTML(slideContent, css);

  // Set content and wait for fonts
  await page.setContent(fullHTML, { waitUntil: 'networkidle0' });

  // Wait for fonts to load
  await page.evaluate(() => {
    return document.fonts.ready;
  });

  // Additional wait for any CSS animations to settle
  await new Promise(resolve => setTimeout(resolve, 500));

  // Screenshot
  const outputPath = path.join(outputDir, `${slideName}.png`);
  await page.screenshot({
    path: outputPath,
    type: 'png',
    fullPage: false,
    clip: {
      x: 0,
      y: 0,
      width: VIEWPORT.width,
      height: VIEWPORT.height
    }
  });

  await page.close();
  console.log(`  ✓ ${slideName}.png`);
  return true;
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     NERVBOX WRAPPED 2025 Generator     ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('📂 Loading CSS...');
  const css = await loadCSS();
  console.log('  ✓ CSS loaded\n');

  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('  ✓ Browser ready\n');

  console.log(`📸 Generating ${SLIDES.length} slides...`);
  let successCount = 0;

  for (const slide of SLIDES) {
    const success = await generateSlide(browser, slide, css, OUTPUT_DIR);
    if (success) successCount++;
  }

  await browser.close();

  console.log('\n════════════════════════════════════════');
  console.log(`✨ Done! Generated ${successCount}/${SLIDES.length} slides`);
  console.log(`📁 Output: ${OUTPUT_DIR}`);
  console.log('════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
