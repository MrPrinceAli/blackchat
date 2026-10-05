<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import { sample } from '../lib/sample';
  import { strings } from '../lib/strings';
  import { readTheme, saveTheme, type ThemePreference } from '../lib/theme';

  let theme = $state<ThemePreference>(readTheme());
  let confirming = $state(false);
  let typed = $state('');

  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: strings.settings.themeSystem },
    { value: 'dark', label: strings.settings.themeDark },
    { value: 'light', label: strings.settings.themeLight },
  ];

  $effect(() => saveTheme(theme));
</script>

<main class="screen">
  <button class="back" type="button" onclick={() => navigate('home')} aria-label={strings.chat.back}
    >←</button
  >
  <h1>{strings.settings.title}</h1>

  <fieldset class="group">
    <legend>{strings.settings.theme}</legend>
    {#each options as option (option.value)}
      <label class="choice">
        <input type="radio" name="theme" value={option.value} bind:group={theme} />
        {option.label}
      </label>
    {/each}
  </fieldset>

  <div class="actions">
    <button class="button" type="button">{strings.settings.changePassword}</button>
    <button class="button" type="button" onclick={() => navigate('welcome')}
      >{strings.settings.signOut}</button
    >
    {#if confirming}
      <div class="field">
        <label for="confirm-delete">{strings.settings.deleteConfirm(sample.username)}</label>
        <input id="confirm-delete" autocomplete="off" autocapitalize="none" bind:value={typed} />
      </div>
      <button
        class="button primary"
        type="button"
        disabled={typed !== sample.username}
        onclick={() => navigate('welcome')}
      >
        {strings.settings.deleteNow}
      </button>
    {:else}
      <button class="button" type="button" onclick={() => (confirming = true)}
        >{strings.settings.deleteNow}</button
      >
    {/if}
  </div>
</main>

<style>
  .group {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-2);
  }
  legend {
    padding: 0;
    margin-bottom: var(--space-2);
  }
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
  }
  .choice input {
    accent-color: var(--fg);
    width: 18px;
    height: 18px;
  }
  .actions {
    display: grid;
    gap: var(--space-3);
  }
</style>
