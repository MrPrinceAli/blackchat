<script lang="ts">
  // Watermark samar 6 karakter terakhir userId penerima (PRD §9): menandai foto layar dari kamera lain.
  let { mark }: { mark: string } = $props();
  const cells = Array.from({ length: 6 }, (_, i) => i);
</script>

<div class="watermark" aria-hidden="true">
  {#each cells as cell (cell)}
    <span class="code">{mark}</span>
  {/each}
</div>

<style>
  .watermark {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    align-content: space-around;
    justify-items: center;
    pointer-events: none;
    opacity: 0.08;
    font-size: var(--step--1);
    overflow: hidden;
    transform: rotate(-12deg);
  }
</style>
