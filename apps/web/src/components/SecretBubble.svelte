<script lang="ts">
  // Bubble rahasia teks atau gambar (PRD §7.1, §7.5, §10.2). Teks selalu text node, tidak pernah HTML (PRD §7.6).
  // Gambar digambar ke <canvas> (bukan <img>) agar tidak bisa diseret atau disimpan lewat menu.
  import { MESSAGE } from '@blackchat/protocol';
  import { renderBubble, renderImageBubble, type BubbleStyle } from '../lib/bubble-canvas';
  import { displaySize } from '../lib/images';
  import { seen } from '../lib/visibility';
  import { strings } from '../lib/strings';
  import BurnFx from './BurnFx.svelte';
  import Watermark from './Watermark.svelte';

  export type BubbleStatus = 'sending' | 'delivered' | 'queued' | 'opened' | 'retracted';

  let {
    text,
    mine,
    status,
    ttl,
    remainingMs = ttl * 1000,
    watermark,
    onGone,
    onMenu,
    onSeen,
    image,
    upload,
  }: {
    text: string | null;
    mine: boolean;
    status: BubbleStatus;
    ttl: number;
    remainingMs?: number;
    watermark: string;
    /** Bubble selesai ditampilkan (setelah lebur + "Dilebur" 3 dtk, atau dibatalkan). */
    onGone?: () => void;
    /** Minta menu konteks di posisi layar ini (hanya pesan sendiri). */
    onMenu?: (x: number, y: number) => void;
    /** Pesan masuk terdepan benar-benar dilihat (PRD §7.2). */
    onSeen?: () => void;
    /** Pesan gambar: ukuran asli dan pemuat bitmap (unduh + dekripsi). Teks = caption. */
    image?: { w: number; h: number; load: () => Promise<ImageBitmap> } | undefined;
    /** Progres upload gambar sendiri. */
    upload?: { done: number; total: number } | undefined;
  } = $props();

  type Phase = 'live' | 'burning' | 'burned';
  let phase = $state<Phase>('live');
  let left = $state(0);
  let element = $state<HTMLDivElement>();
  let burn = $state<{ source: HTMLCanvasElement; width: number; height: number } | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let imageCanvas = $state<HTMLCanvasElement>();
  let captionElement = $state<HTMLParagraphElement>();
  let drawn = $state(false);
  let loading = false;
  let failed = $state(false);
  let size = $state({ width: 0, height: 0 });

  // Gambar baru diunduh saat bubble tampil (bukan saat masih antre). Timer baru bisa mulai setelah tergambar.
  $effect(() => {
    if (!image || !imageCanvas || drawn || loading || status === 'queued' || status === 'retracted')
      return;
    loading = true;
    const canvas = imageCanvas;
    const maxWidth = Math.min(480, innerWidth * 0.85) - 32;
    size = displaySize(image.w, image.h, maxWidth, innerHeight);
    image
      .load()
      .then((bitmap) => {
        const ratio = devicePixelRatio || 1;
        canvas.width = Math.round(size.width * ratio);
        canvas.height = Math.round(size.height * ratio);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        drawn = true;
      })
      .catch(() => {
        failed = true;
        setTimeout(() => onGone?.(), MESSAGE.TOMBSTONE_MS);
      });
  });

  const seconds = $derived(Math.ceil(left / 1000));
  const progress = $derived(Math.max(0, Math.min(1, left / (ttl * 1000))));

  // Hitung mundur lokal dari remainingMs (PRD §13.3); timer tidak bisa dihentikan setelah mulai.
  $effect(() => {
    if (status !== 'opened' || phase !== 'live') return;
    const base = remainingMs;
    const started = performance.now();
    left = base;
    const timer = setInterval(() => {
      left = Math.max(0, base - (performance.now() - started));
      if (left === 0) {
        clearInterval(timer);
        startBurn();
      }
    }, 100);
    return () => clearInterval(timer);
  });

  $effect(() => {
    if (status !== 'retracted') return;
    if (mine) {
      onGone?.();
      return;
    }
    const timer = setTimeout(() => onGone?.(), MESSAGE.TOMBSTONE_MS);
    return () => clearTimeout(timer);
  });

  function startBurn() {
    if (!element || phase !== 'live') return;
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    const transparent = (c: string) => c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
    const style: BubbleStyle = {
      width: rect.width,
      height: rect.height,
      fill: transparent(css.backgroundColor) ? null : css.backgroundColor,
      stroke: mine ? null : css.borderTopColor,
      color: css.color,
      font: `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`,
      lineHeight: parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.5,
      padding: parseFloat(css.paddingLeft) || 12,
    };
    let source: HTMLCanvasElement;
    if (image && imageCanvas && drawn) {
      const box = imageCanvas.getBoundingClientRect();
      const captionY = captionElement ? captionElement.getBoundingClientRect().top - rect.top : 0;
      source = renderImageBubble(
        imageCanvas,
        { x: box.left - rect.left, y: box.top - rect.top, width: box.width, height: box.height },
        text,
        captionY,
        style,
      );
      // Piksel gambar asli dibuang begitu efek lebur punya salinannya (PRD §7.5).
      imageCanvas.getContext('2d')?.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    } else source = renderBubble(text ?? '', style);
    burn = { source, width: rect.width, height: rect.height };
    phase = 'burning';
  }

  function burned() {
    burn = null;
    phase = 'burned';
    setTimeout(() => onGone?.(), MESSAGE.TOMBSTONE_MS);
  }

  function openMenu(event: MouseEvent) {
    event.preventDefault();
    if (mine && phase === 'live' && status !== 'retracted') onMenu?.(event.clientX, event.clientY);
  }

  function onPointerDown(event: PointerEvent) {
    if (!mine || event.pointerType === 'mouse') return;
    pressTimer = setTimeout(() => onMenu?.(event.clientX, event.clientY), MESSAGE.LONG_PRESS_MS);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
  }

  function onKeydown(event: KeyboardEvent) {
    if (!mine || !element) return;
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      onMenu?.(rect.left, rect.bottom);
    }
  }
</script>

{#snippet content()}
  {#if image}
    {#if failed}
      <p class="text muted">{strings.chat.imageFailed}</p>
    {:else}
      <div class="image-frame" role="img" aria-label={strings.chat.imageAlt}>
        <canvas
          class="image"
          bind:this={imageCanvas}
          aria-hidden="true"
          style:width={`${size.width}px`}
          style:height={`${size.height}px`}
        ></canvas>
      </div>
    {/if}
    {#if text}<p class="text caption" bind:this={captionElement}>{text}</p>{/if}
  {:else}
    <p class="text">{text}</p>
  {/if}
{/snippet}

<div class="row" class:mine>
  {#if status === 'retracted' && !mine}
    <p class="tombstone muted">{strings.chat.retracted}</p>
  {:else if phase === 'burned'}
    <p class="tombstone muted">{strings.chat.burned}</p>
  {:else if phase === 'burning' && burn}
    <BurnFx source={burn.source} width={burn.width} height={burn.height} onDone={burned} />
  {:else if status === 'queued'}
    <div class="bubble censored" aria-label={strings.chat.queued}>
      <span class="bars" aria-hidden="true"></span>
      <span class="label muted">{strings.chat.queued}</span>
    </div>
  {:else}
    <!-- Garis hitung mundur selebar bubble: keduanya dalam satu tumpukan selebar isi. -->
    <div class="stack">
      {#if mine}
        <div
          class="bubble mine"
          bind:this={element}
          tabindex="0"
          role="button"
          aria-haspopup="menu"
          oncontextmenu={openMenu}
          onpointerdown={onPointerDown}
          onpointerup={cancelPress}
          onpointerleave={cancelPress}
          onpointercancel={cancelPress}
          onkeydown={onKeydown}
        >
          {@render content()}
        </div>
      {:else}
        <div
          class="bubble"
          bind:this={element}
          use:seen={{
            enabled: status === 'delivered' && phase === 'live' && (!image || drawn),
            onSeen: () => onSeen?.(),
          }}
        >
          {@render content()}
          <Watermark mark={watermark} />
        </div>
      {/if}
      {#if status === 'opened'}
        <div class="countdown" role="timer" aria-label={strings.chat.secondsLeft(seconds)}>
          <span class="line" style:transform={`scaleX(${progress})`}></span>
          <span class="code seconds">{seconds}</span>
        </div>
      {:else if mine && status === 'delivered'}
        <p class="meta muted">{strings.chat.notOpened}</p>
      {:else if mine && status === 'sending'}
        <p class="meta muted">
          {upload ? strings.chat.uploading(upload.done, upload.total) : strings.chat.sending}
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .row {
    display: grid;
    justify-items: start;
    gap: var(--space-1);
    max-width: 100%;
  }
  .row.mine {
    justify-items: end;
  }
  .stack {
    display: grid;
    gap: var(--space-1);
    max-width: min(85%, 480px);
  }
  .row.mine .stack {
    justify-items: end;
  }
  .bubble {
    position: relative;
    max-width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--fg);
    border-radius: var(--radius-bubble);
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .bubble.mine {
    background: var(--fg);
    color: var(--bg);
  }
  .text {
    white-space: pre-wrap;
  }
  .image {
    display: block;
    max-width: 100%;
    pointer-events: none;
  }
  .caption {
    margin-top: var(--space-2);
  }
  .censored {
    display: grid;
    gap: var(--space-2);
    min-width: 180px;
    border-color: var(--line);
  }
  .bars {
    display: block;
    height: 12px;
    background: var(--fg);
  }
  .label,
  .meta {
    font-size: var(--step--1);
  }
  .countdown {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    /* Selebar bubble juga di sisi kanan (pesan sendiri), di mana tumpukan rata kanan. */
    justify-self: stretch;
  }
  .line {
    flex: 1;
    height: 1px;
    background: var(--fg);
    transform-origin: left center;
  }
  .seconds {
    font-size: var(--step--1);
  }
  .tombstone {
    font-size: var(--step--1);
    padding: var(--space-2) 0;
  }
</style>
