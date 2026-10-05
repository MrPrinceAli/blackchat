<script lang="ts">
  // Kepala layar masuk/daftar: tombol kembali, nama aplikasi, dan tile logo di atas judul.
  import Icon from './Icon.svelte';
  import { strings } from '../lib/strings';

  let { onBack, disabled = false }: { onBack: () => void; disabled?: boolean } = $props();
</script>

<header class="auth-header">
  <button
    class="icon-button back"
    type="button"
    onclick={onBack}
    aria-label={strings.chat.back}
    {disabled}><Icon name="back" /></button
  >
  <span class="brand code" aria-hidden="true">{strings.appName}</span>
</header>

<style>
  .auth-header {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
  }
  .brand {
    justify-self: center;
    font-size: var(--step--1);
    color: var(--muted);
  }
</style>
