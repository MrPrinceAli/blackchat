<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import { sample } from '../lib/sample';
  import { strings } from '../lib/strings';

  let verified = $state(false);
</script>

<main class="screen">
  <button class="back" type="button" onclick={() => navigate('chat')} aria-label={strings.chat.back}
    >←</button
  >
  <h1>{strings.verify.title}</h1>
  <p class="muted">{strings.verify.description(sample.peer)}</p>
  <ol class="digits code" aria-label="Safety number">
    {#each sample.safetyNumber as group, i (i)}
      <li>{group}</li>
    {/each}
  </ol>
  <div class="qr" aria-hidden="true"></div>
  <button
    class="button primary"
    type="button"
    disabled={verified}
    onclick={() => (verified = true)}
  >
    {verified ? strings.verify.verified : strings.verify.mark}
  </button>
</main>

<style>
  .digits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    font-size: var(--step-1);
  }
  /* Layar sempit: 3 kolom (12 grup = 4 baris) agar tidak meluber di 320 px (PRD §10.7). */
  @media (max-width: 420px) {
    .digits {
      grid-template-columns: repeat(3, 1fr);
      font-size: var(--step-0);
    }
  }
  .qr {
    width: 160px;
    aspect-ratio: 1;
    border: 1px solid var(--line);
  }
</style>
