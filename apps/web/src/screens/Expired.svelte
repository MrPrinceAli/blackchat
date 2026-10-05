<script lang="ts">
  import Wordmark from '../components/Wordmark.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';
</script>

<main class="screen expired">
  <div class="body">
    <Wordmark size={48} />
    <p class="eyebrow">{strings.expired.eyebrow}</p>
    <p class="message">{strings.expired.message}</p>
    <button class="button primary" type="button" onclick={() => navigate('register')}
      >{strings.expired.createNew}</button
    >
  </div>
</main>

<style>
  .expired {
    justify-content: center;
  }
  .body {
    display: grid;
    justify-items: start;
    gap: var(--space-5);
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
  }
  .message {
    font-size: var(--step-2);
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.03em;
  }
  .button {
    width: 100%;
  }
</style>
