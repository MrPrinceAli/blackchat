<script lang="ts">
  // Bubble teks rahasia (PRD §7.1, §10.2). Teks selalu dirender sebagai text node, tidak pernah HTML (PRD §7.6).
  import { MESSAGE } from '@blackchat/protocol';
  import { renderBubble } from '../lib/bubble-canvas';
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
  } = $props();

  type Phase = 'live' | 'burning' | 'burned';
  let phase = $state<Phase>('live');
  let left = $state(0);
  let element = $state<HTMLDivElement>();
  let burn = $state<{ source: HTMLCanvasElement; width: number; height: number } | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | undefined;

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
    const source = renderBubble(text ?? '', {
      width: rect.width,
      height: rect.height,
      fill: transparent(css.backgroundColor) ? null : css.backgroundColor,
      stroke: mine ? null : css.borderTopColor,
      color: css.color,
      font: `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`,
      lineHeight: parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.5,
      padding: parseFloat(css.paddingLeft) || 12,
    });
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
          <p class="text">{text}</p>
        </div>
      {:else}
        <div class="bubble" bind:this={element}>
          <p class="text">{text}</p>
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
        <p class="meta muted">{strings.chat.sending}</p>
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
