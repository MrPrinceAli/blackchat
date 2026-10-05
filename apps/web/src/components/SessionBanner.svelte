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
  .banner {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 200;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-4);
    border-top: 1px solid var(--fg);
    background: var(--bg);
  }
  .quiet {
    border-top-color: var(--line);
    font-size: var(--step--1);
  }
</style>
