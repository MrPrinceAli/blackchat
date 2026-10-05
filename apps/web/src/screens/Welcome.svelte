<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let { onBurnDemo }: { onBurnDemo?: (() => void) | undefined } = $props();
</script>

<main class="screen welcome">
  <h1 class="brand">{strings.appName}</h1>
  <div class="tagline">
    <p>{strings.welcome.taglineMessages}</p>
    <p>{strings.welcome.taglineAccount}</p>
  </div>
  <div class="actions">
    <button class="button primary" type="button" onclick={() => navigate('register')}
      >{strings.welcome.createAccount}</button
    >
    <button class="button" type="button" onclick={() => navigate('login')}
      >{strings.welcome.signIn}</button
    >
  </div>
  <p class="hint">{strings.welcome.incognitoHint}</p>
  {#if import.meta.env.DEV && onBurnDemo}
    <button class="button" type="button" onclick={onBurnDemo}>Demo lebur (dev)</button>
  {/if}
</main>

<style>
  .welcome {
    justify-content: center;
    gap: var(--space-8);
  }
  .brand {
    font-size: var(--step-3);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .tagline {
    font-size: var(--step-1);
  }
  .actions {
    display: grid;
    gap: var(--space-3);
  }
</style>
