<script lang="ts">
  // Sisa umur akun (PRD §10.3). Menghitung mundur dari remainingMs server dengan performance.now() (PRD §13.3).
  import { ACCOUNT } from '@blackchat/protocol';
  import { accountWarning, formatAccountClock } from '../lib/clock';
  import { strings } from '../lib/strings';

  let {
    remainingMs,
    onExpire,
    showWarning = false,
    bar = false,
  }: {
    remainingMs: number;
    onExpire?: () => void;
    showWarning?: boolean;
    bar?: boolean;
  } = $props();

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
{#if bar}
  <!-- Sisa umur dari 72 jam: menyusut seperti garis lebur pesan (dekoratif). -->
  <span class="life" aria-hidden="true"
    ><i style:transform={`scaleX(${Math.min(1, left / ACCOUNT.LIFETIME_MS)})`}></i></span
  >
{/if}
{#if warning}
  <p class="warning" role="status">{warning}</p>
{/if}

<style>
  .clock {
    font-size: var(--step--1);
  }
  .life {
    display: block;
    height: 2px;
    background: var(--line);
    overflow: hidden;
  }
  .life i {
    display: block;
    height: 100%;
    background: var(--fg);
    transform-origin: left center;
    transition: transform 1s linear;
  }
  .warning {
    font-size: var(--step--1);
    padding-top: var(--space-2);
  }
</style>
