<script lang="ts">
  // Efek lebur (PRD §10.4): satu-satunya animasi mencolok di aplikasi.
  import { onMount } from 'svelte';
  import { BURN, heightFactor, particleAt, particlesFrom, prefersReducedMotion } from '../lib/burn';

  let {
    source,
    width,
    height,
    onDone,
  }: { source: HTMLCanvasElement; width: number; height: number; onDone?: () => void } = $props();

  let canvas: HTMLCanvasElement;
  let currentHeight = $state(0);
  let opacity = $state(1);

  onMount(() => {
    currentHeight = height;
    const ctx = canvas.getContext('2d');
    const ratio = source.width / width;
    canvas.width = source.width;
    canvas.height = source.height;
    let frame = 0;
    const started = performance.now();
    const finish = () => {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      onDone?.();
    };

    if (!ctx) {
      finish();
      return;
    }

    if (prefersReducedMotion()) {
      ctx.drawImage(source, 0, 0);
      const step = () => {
        const elapsed = performance.now() - started;
        opacity = Math.max(0, 1 - elapsed / BURN.REDUCED_MS);
        if (elapsed >= BURN.REDUCED_MS) return finish();
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    }

    const sourceCtx = source.getContext('2d');
    const pixels = sourceCtx?.getImageData(0, 0, source.width, source.height);
    const cell = Math.max(1, Math.round(BURN.CELL_PX * ratio));
    const particles = pixels ? particlesFrom(pixels, Math.random, cell) : [];
    // Piksel sumber tidak dibutuhkan lagi.
    sourceCtx?.clearRect(0, 0, source.width, source.height);

    const step = () => {
      const elapsed = performance.now() - started;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        const { alpha, dy } = particleAt(p, elapsed);
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
        ctx.fillRect(p.x, p.y + dy * ratio, cell, cell);
      }
      currentHeight = height * heightFactor(elapsed);
      if (elapsed >= BURN.DURATION_MS) return finish();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div
  class="burn"
  style:height={`${currentHeight}px`}
  style:width={`${width}px`}
  style:opacity
  aria-hidden="true"
>
  <canvas bind:this={canvas} style:width={`${width}px`} style:height={`${height}px`}></canvas>
</div>

<style>
  .burn {
    position: relative;
    overflow: visible;
  }
  canvas {
    display: block;
    pointer-events: none;
  }
</style>
