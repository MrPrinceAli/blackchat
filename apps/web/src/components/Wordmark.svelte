<script lang="ts">
  // Logo wordmark: "blackch" tegas, "at" melebur jadi piksel (gema efek lebur, PRD §10.4; D-023).
  // Satu SVG (teks + sel) agar posisinya selalu sejajar; warna mengikuti currentColor.
  // Dekoratif: nama aplikasi untuk pembaca layar diberikan oleh elemen induk.
  import { WORDMARK } from '../lib/wordmark';

  let { size = 32 }: { size?: number } = $props();

  const { top, bottom, width } = WORDMARK;
  const height = bottom - top;
</script>

<svg
  class="wordmark"
  viewBox={`0 ${top} ${width} ${height}`}
  width={(size * width) / 100}
  height={(size * height) / 100}
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  <text x="0" y="0">{WORDMARK.crisp}</text>
  {#each WORDMARK.cells as [x, y, side, opacity], i (i)}
    <rect {x} {y} width={side} height={side} {opacity} />
  {/each}
</svg>

<style>
  .wordmark {
    display: block;
    flex: none;
    overflow: visible;
  }
  text {
    font-family: var(--font-ui);
    font-size: 100px;
    font-weight: 700;
    letter-spacing: 0;
  }
</style>
