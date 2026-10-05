<script lang="ts">
  // Pemberitahuan sesi: akan dikunci, dibuka di tab lain, menyambung ulang (PRD §5.4, §10.6).
  import { stayActive, useHere } from '../lib/account';
  import { app } from '../lib/app-state.svelte';
  import { strings } from '../lib/strings';
</script>

{#if app.connection === 'replaced'}
  <div class="banner" role="alert">
    <p>{strings.session.otherTab}</p>
    <button class="button" type="button" onclick={useHere}>{strings.session.useHere}</button>
  </div>
{:else if app.idleWarning}
  <div class="banner" role="alert">
    <p>{strings.session.lockWarning}</p>
    <button class="button" type="button" onclick={stayActive}>{strings.session.stay}</button>
  </div>
{:else if app.connection === 'reconnecting'}
  <div class="banner quiet" role="status">
    <p>{strings.session.reconnecting}</p>
  </div>
{/if}

<style>
  /* Toast melayang di bawah: kaca buram, garis tegas. */
  .banner {
    position: fixed;
    inset: auto var(--space-4) max(var(--space-4), env(safe-area-inset-bottom)) var(--space-4);
    z-index: 200;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    max-width: calc(var(--content-max) - 2 * var(--space-4));
    margin: 0 auto;
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
    border: 1px solid var(--fg);
    border-radius: var(--radius-field);
    background: var(--glass);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    animation: rise var(--dur-2) var(--ease-out) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
    }
  }
  .quiet {
    justify-content: center;
    padding: var(--space-2) var(--space-4);
    border-color: var(--line-strong);
    border-radius: var(--radius-control);
    font-size: var(--step--1);
  }
  .quiet p::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: var(--space-2);
    background: currentColor;
    animation: blink 1s steps(2, start) infinite;
  }
  @keyframes blink {
    to {
      visibility: hidden;
    }
  }
</style>
