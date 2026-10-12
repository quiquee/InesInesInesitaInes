// Dibuja un QR (corrección de errores alta) con el emblema del personaje en el centro.
import qrcode from '../vendor/qrcode.mjs';

export function drawQr(canvas, text, { emoji = '🎂', color = '#ff4d6d', label = '' } = {}) {
  const qr = qrcode(0, 'H');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 4;
  const size = 360;
  const cell = size / (count + margin * 2);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#2b2d42';
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(
          Math.floor((c + margin) * cell),
          Math.floor((r + margin) * cell),
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }
  // Emblema central: ocupa ~22% del ancho (el nivel H tolera hasta un 30% de daño).
  const badge = size * 0.22;
  const cx = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cx, badge / 2 + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cx, badge / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${Math.round(badge * 0.55)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, cx, cx + 2);
  if (label) canvas.setAttribute('aria-label', label);
}
