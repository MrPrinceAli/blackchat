<script lang="ts">
  // Sisa umur akun (PRD §10.3). Menghitung mundur dari remainingMs server dengan performance.now() (PRD §13.3).
  import { accountWarning, formatAccountClock } from '../lib/clock';
  import { strings } from '../lib/strings';

  let {
    remainingMs,
    onExpire,
    showWarning = false,
  }: { remainingMs: number; onExpire?: () => void; showWarning?: boolean } = $props();

  let left = $state(0);

  $effect(() => {
    const base = remainingMs;
    const started = performance.now();
    left = base;
    const tick = () => {
      left = Math.max(0, base - (performance.now() - started));
      if (left === 0) {
        clearInterval(timer);
        onExpire?.();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  });

  const warning = $derived(showWarning ? accountWarning(left) : null);
</script>

<span class="clock code" role="timer" aria-label={strings.account.clockLabel}
  >{formatAccountClock(left)}</span
>
{#if warning}
  <p class="warning" role="status">{warning}</p>
{/if}

<style>
  .clock {
    font-size: var(--step--1);
  }
  .warning {
    /* Di header flex: turun ke baris sendiri di bawah jam. */
    flex-basis: 100%;
    order: 10;
    font-size: var(--step--1);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--line);
  }
</style>
