<script lang="ts">
  // Safety number (PRD §4.4). Status terverifikasi disimpan di blob kontak terenkripsi mulai W11.
  import { base64urlDecode } from '@blackchat/protocol';
  import { activeSession } from '../lib/account';
  import { chat } from '../lib/chat.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let verified = $state(false);

  const room = chat.open;
  const session = activeSession();
  const groups =
    room && session
      ? session.crypto.safetyNumber(
          session.identity.edPk,
          base64urlDecode(room.entry.peer.peerEdPk),
        )
      : [];
</script>

<main class="screen">
  <button
    class="back"
    type="button"
    onclick={() => navigate(room ? 'chat' : 'home')}
    aria-label={strings.chat.back}>←</button
  >
  <h1>{strings.verify.title}</h1>
  {#if room}
    <p class="muted">{strings.verify.description(room.entry.peer.peerUsername)}</p>
    <ol class="digits code" aria-label="Safety number">
      {#each groups as group, i (i)}
        <li>{group}</li>
      {/each}
    </ol>
    <button
      class="button primary"
      type="button"
      disabled={verified}
      onclick={() => (verified = true)}
    >
      {verified ? strings.verify.verified : strings.verify.mark}
    </button>
  {/if}
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
</style>
