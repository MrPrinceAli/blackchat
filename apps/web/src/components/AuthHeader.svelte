<script lang="ts">
  // Kepala layar masuk/daftar: tombol kembali (logo wordmark ada di atas judul).
  import Icon from './Icon.svelte';
  import LangToggle from './LangToggle.svelte';
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
  <LangToggle />
</header>

<style>
  .auth-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
</style>
