<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { AccountError, changePassword, deleteAccount, end } from '../lib/account';
  import { app } from '../lib/app-state.svelte';
  import { purgeAllRooms } from '../lib/chat.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';
  import { readTheme, saveTheme, type ThemePreference } from '../lib/theme';

  let theme = $state<ThemePreference>(readTheme());
  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: strings.settings.themeSystem },
    { value: 'dark', label: strings.settings.themeDark },
    { value: 'light', label: strings.settings.themeLight },
  ];
  $effect(() => saveTheme(theme));

  // Ganti password (PRD §4.3).
  let changing = $state(false);
  let current = $state('');
  let next = $state('');
  let repeat = $state('');
  let passwordBusy = $state(false);
  let passwordMessage = $state<string | null>(null);

  async function submitPassword(event: SubmitEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    passwordBusy = true;
    passwordMessage = null;
    try {
      await changePassword(current, next, repeat);
      current = next = repeat = '';
      changing = false;
      passwordMessage = strings.settings.passwordChanged;
    } catch (e) {
      const code = e instanceof AccountError ? e.code : 'generic';
      const map: Partial<Record<AccountError['code'], string>> = {
        credentials: strings.settings.wrongPassword,
        too_short: strings.register.errors.tooShort,
        same_as_username: strings.register.errors.sameAsUsername,
        common: strings.register.errors.common,
        mismatch: strings.register.errors.mismatch,
      };
      passwordMessage = map[code] ?? strings.register.errors.generic;
    } finally {
      passwordBusy = false;
    }
  }

  // Hapus akun sekarang (PRD §5.2, §10.3): ketik username → purge setiap room → DELETE.
  let confirming = $state(false);
  let typed = $state('');
  let deleting = $state<{ done: number; total: number } | null>(null);
  let deleteError = $state<string | null>(null);

  async function remove() {
    if (typed !== app.username || deleting) return;
    deleting = { done: 0, total: 0 };
    deleteError = null;
    try {
      await purgeAllRooms((done, total) => (deleting = { done, total }));
      await deleteAccount();
    } catch {
      deleteError = strings.settings.deleteFailed;
      deleting = null;
    }
  }
</script>

<main class="screen settings">
  <button
    class="icon-button back"
    type="button"
    onclick={() => navigate('home')}
    aria-label={strings.chat.back}
    disabled={deleting !== null}><Icon name="back" /></button
  >
  <h1>{strings.settings.title}</h1>

  <section class="section">
    <h2 class="eyebrow">{strings.settings.sectionDisplay}</h2>
    <fieldset class="segmented">
      <legend class="visually-hidden">{strings.settings.theme}</legend>
      {#each options as option (option.value)}
        <label class="segment" class:selected={theme === option.value}>
          <input
            class="visually-hidden"
            type="radio"
            name="theme"
            value={option.value}
            bind:group={theme}
          />
          {option.label}
        </label>
      {/each}
    </fieldset>
  </section>

  <section class="section">
    <h2 class="eyebrow">{strings.settings.sectionAccount}</h2>
    <div class="card stack">
      {#if changing}
        <form class="stack" onsubmit={submitPassword} novalidate>
          <div class="field">
            <label for="pw-current">{strings.settings.currentPassword}</label>
            <input
              id="pw-current"
              type="password"
              autocomplete="current-password"
              bind:value={current}
              disabled={passwordBusy}
            />
          </div>
          <div class="field">
            <label for="pw-next">{strings.settings.newPassword}</label>
            <input
              id="pw-next"
              type="password"
              autocomplete="new-password"
              bind:value={next}
              disabled={passwordBusy}
            />
          </div>
          <div class="field">
            <label for="pw-repeat">{strings.register.repeatPassword}</label>
            <input
              id="pw-repeat"
              type="password"
              autocomplete="new-password"
              bind:value={repeat}
              disabled={passwordBusy}
            />
          </div>
          <button
            class="button primary"
            class:busy={passwordBusy}
            type="submit"
            disabled={passwordBusy}
          >
            {passwordBusy ? strings.register.securing : strings.settings.changePassword}
          </button>
        </form>
      {:else}
        <button class="button" type="button" onclick={() => (changing = true)}
          >{strings.settings.changePassword}</button
        >
      {/if}
      {#if passwordMessage}<p class="notice" role="status">{passwordMessage}</p>{/if}

      <button
        class="button"
        type="button"
        onclick={() => void end('logout')}
        disabled={deleting !== null}
      >
        {strings.settings.signOut}
      </button>
    </div>
  </section>

  <section class="section">
    <h2 class="eyebrow">{strings.settings.sectionDanger}</h2>
    <div class="card stack danger-zone">
      <p class="hint">{strings.settings.dangerNote}</p>
      {#if deleting}
        <p class="notice" role="status">
          {strings.settings.deleting} <span class="code">{deleting.done}/{deleting.total}</span>
        </p>
      {:else if confirming}
        <div class="field">
          <label for="confirm-delete">{strings.settings.deleteConfirm(app.username)}</label>
          <input
            id="confirm-delete"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            bind:value={typed}
          />
        </div>
        <button
          class="button primary"
          type="button"
          disabled={typed !== app.username}
          onclick={remove}
        >
          {strings.settings.deleteNow}
        </button>
      {:else}
        <button class="button danger" type="button" onclick={() => (confirming = true)}
          >{strings.settings.deleteNow}</button
        >
      {/if}
      {#if deleteError}<p class="notice" role="alert">{deleteError}</p>{/if}
    </div>
  </section>
</main>

<style>
  .settings {
    gap: var(--space-6);
  }
  .section {
    display: grid;
    gap: var(--space-3);
  }
  h2.eyebrow {
    font-weight: 400;
  }
  .stack {
    display: grid;
    gap: var(--space-3);
  }
  .card .field input {
    background: var(--bg);
  }
  /* Kontrol tersegmentasi untuk tema: satu pil berisi tiga pilihan. */
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-control);
  }
  .segment {
    display: grid;
    place-items: center;
    min-height: 40px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-control);
    font-size: var(--step--1);
    text-align: center;
    cursor: pointer;
    transition:
      background-color var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }
  .segment:hover:not(.selected) {
    background: var(--tint-2);
  }
  .segment.selected {
    background: var(--fg);
    color: var(--bg);
  }
  .segment:has(input:focus-visible) {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }
  .danger-zone {
    border-style: dashed;
    border-color: var(--line-strong);
  }
</style>
