<script lang="ts">
  // Logo dalam tile berbingkai (gaya ikon aplikasi), untuk layar masuk/daftar/hangus.
  import Logo from './Logo.svelte';

  let { size = 64 }: { size?: number } = $props();
</script>

<span class="tile" style:--size={`${size}px`} aria-hidden="true">
  <Logo size={Math.round(size * 0.62)} animated />
</span>

<style>
  .tile {
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border: 1px solid var(--line-strong);
    border-radius: calc(var(--size) * 0.24);
    background: var(--surface);
    /* Mark sedikit ke kiri secara optik: geser agar seimbang dengan piksel lepas di kanan atas. */
    padding-left: calc(var(--size) * 0.04);
  }
</style>
