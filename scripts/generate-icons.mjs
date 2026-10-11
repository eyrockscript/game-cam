import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'brand', 'icon.svg')
const out = join(root, 'public')
const BACKGROUND = '#0f1115'

mkdirSync(out, { recursive: true })
copyFileSync(source, join(out, 'favicon.svg'))

const svg = readFileSync(source)
const render = (size) => sharp(svg, { density: 384 }).resize(size, size)

async function square(size, name) {
  await render(size).png().toFile(join(out, name))
}

// Maskable: artwork scaled into the central 70% safe zone on a full-bleed background.
async function maskable(size, name) {
  const inner = Math.round(size * 0.7)
  const art = await render(inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(join(out, name))
}

// Apple icons must not have transparency: flatten onto the brand background.
async function opaque(size, name) {
  await render(size).flatten({ background: BACKGROUND }).png().toFile(join(out, name))
}

async function ogImage(name) {
  const icon = await render(360).png().toBuffer()
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: BACKGROUND } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(join(out, name))
}

await Promise.all([
  square(16, 'favicon-16x16.png'),
  square(32, 'favicon-32x32.png'),
  opaque(180, 'apple-touch-icon.png'),
  square(192, 'android-chrome-192x192.png'),
  square(512, 'android-chrome-512x512.png'),
  maskable(512, 'maskable-512x512.png'),
  ogImage('og-image.png'),
])
console.log('Icons written to public/')
