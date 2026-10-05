<script lang="ts">
  // Menu konteks (PRD §10.5): panel 1px, dibuka klik kanan / tekan lama / Shift+F10, ditutup Esc atau klik di luar.
  import { onMount } from 'svelte';

  export interface MenuItem {
    label: string;
    note?: string;
    onSelect: () => void;
  }

  let { x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void } =
    $props();

  let panel: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);

  onMount(() => {
    const rect = panel.getBoundingClientRect();
    left = Math.max(8, Math.min(x, innerWidth - rect.width - 8));
    top = Math.max(8, Math.min(y, innerHeight - rect.height - 8));
    panel.querySelector<HTMLButtonElement>('button')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('pointerdown', onPointer, true);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('pointerdown', onPointer, true);
      removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="menu" role="menu" bind:this={panel} style:left={`${left}px`} style:top={`${top}px`}>
  {#each items as item (item.label)}
    <button
      type="button"
      role="menuitem"
      onclick={() => {
        item.onSelect();
        onClose();
      }}
    >
      <span>{item.label}</span>
      {#if item.note}<span class="note">{item.note}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 100;
    min-width: 200px;
    max-width: 280px;
    padding: 4px;
    border: 1px solid var(--fg);
    border-radius: var(--radius-card);
    /* Latar solid: teks di bawah menu tidak boleh tembus (keterbacaan). */
    background: var(--bg);
    transform-origin: top left;
    animation: pop var(--dur-2) var(--ease-spring) both;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.94);
    }
  }
  button {
    display: grid;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 0;
    border-radius: 3px;
    background: transparent;
    text-align: left;
  }
  button:hover,
  button:focus-visible {
    background: var(--fg);
    color: var(--bg);
    outline: none;
  }
  .note {
    font-size: var(--step--1);
    opacity: 0.8;
  }
</style>
