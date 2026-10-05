<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';
</script>

<main class="screen expired">
  <p class="message">{strings.expired.message}</p>
  <button class="button primary" type="button" onclick={() => navigate('register')}
    >{strings.expired.createNew}</button
  >
</main>

<style>
  .expired {
    justify-content: center;
    gap: var(--space-8);
  }
  .message {
    font-size: var(--step-1);
  }
</style>
