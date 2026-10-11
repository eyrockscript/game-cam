# Game Cam

Juegos de movimiento controlados con tu cuerpo frente a la cámara. Usa TensorFlow.js (MoveNet MultiPose Lightning) para detectar hasta 6 personas. Es una PWA instalable que funciona totalmente sin conexión: el modelo y la tipografía están incluidos en el build y se guardan en caché tras la primera carga.

Requisitos: Node 22+ y pnpm 10 (`packageManager: pnpm@10.0.0`).

## Desarrollo

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm icons   # regenera los íconos de public/ desde brand/icon.svg
```

## Instalar en el teléfono

La cámara solo funciona con HTTPS (o `localhost`), así que hay que servir `dist/` una vez desde un hosting estático con HTTPS. Tras abrirlo una vez con conexión, queda en caché y ya no depende del servidor.

- Android (Chrome): menú ⋮ → Instalar app.
- iPhone (Safari): Compartir → Agregar a inicio.

## Desplegar gratis en Cloudflare Pages

```bash
pnpm build
pnpm dlx wrangler pages deploy dist --project-name game-cam
```
