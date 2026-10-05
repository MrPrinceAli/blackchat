<script lang="ts">
  // Pilihan bahasa EN | ID (D-024): dua tombol bertanda aria-pressed dalam satu pil.
  import { locale, setLang } from '../lib/i18n.svelte';
  import { strings } from '../lib/strings';
  import type { Lang } from '../lib/theme';

  const options: { value: Lang; short: string }[] = [
    { value: 'en', short: 'EN' },
    { value: 'id', short: 'ID' },
  ];
</script>

<div class="lang" role="group" aria-label={strings.language.label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class="code"
      aria-pressed={locale.current === option.value}
      aria-label={strings.language[option.value]}
      lang={option.value}
      onclick={() => setLang(option.value)}>{option.short}</button
    >
  {/each}
</div>

<style>
  .lang {
    display: inline-flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-control);
  }
  button {
    min-width: 34px;
    min-height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
    font-size: var(--step--2);
    letter-spacing: 0.04em;
    transition:
      background-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out);
  }
  button:hover:not([aria-pressed='true']) {
    color: var(--fg);
    background: var(--tint-2);
  }
  button[aria-pressed='true'] {
    background: var(--fg);
    color: var(--bg);
  }
</style>
