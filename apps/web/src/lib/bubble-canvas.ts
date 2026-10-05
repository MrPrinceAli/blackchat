// Gambar bubble teks ke canvas tepat sebelum lebur, supaya BurnFx punya piksel untuk dipecah.
// Teks digambar dengan fillText (bukan HTML), jadi tidak ada risiko injeksi.

export interface BubbleStyle {
  width: number;
  height: number;
  /** Warna latar (blok solid pesan sendiri) atau null untuk pesan masuk bergaris 1px. */
  fill: string | null;
  stroke: string | null;
  color: string;
  font: string;
  lineHeight: number;
  padding: number;
}

/** Pecah teks menjadi baris yang muat di `maxWidth`; kata yang lebih lebar dari satu baris dipotong per karakter. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.split(/(\s+)/).filter((t) => t !== '')) {
      if (measure(line + token) <= maxWidth) {
        line += token;
        continue;
      }
      if (/^\s+$/.test(token)) {
        lines.push(line);
        line = '';
        continue;
      }
      if (line !== '') {
        lines.push(line.trimEnd());
        line = '';
      }
      for (const char of token) {
        if (line !== '' && measure(line + char) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function renderBubble(
  text: string,
  style: BubbleStyle,
  ratio = globalThis.devicePixelRatio || 1,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(style.width * ratio));
  canvas.height = Math.max(1, Math.round(style.height * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(ratio, ratio);
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fillRect(0, 0, style.width, style.height);
  }
  if (style.stroke) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, style.width - 1, style.height - 1);
  }
  ctx.fillStyle = style.color;
  ctx.font = style.font;
  ctx.textBaseline = 'top';
  const lines = wrapText(text, style.width - style.padding * 2, (s) => ctx.measureText(s).width);
  lines.forEach((line, i) =>
    ctx.fillText(line, style.padding, style.padding + i * style.lineHeight),
  );
  return canvas;
}
