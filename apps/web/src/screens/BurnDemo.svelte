<script lang="ts">
  // Halaman demo efek lebur, hanya di build dev (import.meta.env.DEV).
  import SecretBubble from '../components/SecretBubble.svelte';
  import { navigate } from '../lib/router.svelte';

  let round = $state(0);
  const texts = [
    'jam 8 di tempat biasa',
    'pesan panjang yang terbungkus beberapa baris supaya efeknya terlihat di area yang lebih tinggi',
  ];
</script>

<main class="screen">
  <button class="back" type="button" onclick={() => navigate('welcome')} aria-label="Kembali"
    >←</button
  >
  <h1>Demo lebur</h1>
  {#key round}
    <div class="list">
      {#each texts as text, i (i)}
        <SecretBubble
          {text}
          mine={i % 2 === 1}
          status="opened"
          ttl={3}
          remainingMs={1500 + i * 700}
          watermark="DEMO42"
        />
      {/each}
    </div>
  {/key}
  <button class="button" type="button" onclick={() => round++}>Ulangi</button>
</main>

<style>
  .list {
    display: grid;
    gap: var(--space-4);
  }
</style>
