<script lang="ts">
  import { AccountError, checkUsername, register } from '../lib/account';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let username = $state('');
  let password = $state('');
  let repeat = $state('');
  let availability = $state<'available' | 'taken' | 'invalid' | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Validasi username langsung (PRD §10.3), dengan jeda agar tidak membebani rate limit lookup.
  $effect(() => {
    const value = username;
    availability = null;
    if (value.length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const result = await checkUsername(value);
        if (value === username) availability = result;
      } catch {
        availability = null;
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  function message(e: unknown): string {
    if (!(e instanceof AccountError)) return strings.register.errors.generic;
    const map: Partial<Record<AccountError['code'], string>> = {
      username_format: strings.register.errors.usernameFormat,
      too_short: strings.register.errors.tooShort,
      same_as_username: strings.register.errors.sameAsUsername,
      common: strings.register.errors.common,
      mismatch: strings.register.errors.mismatch,
      taken: strings.register.errors.taken,
      rate_limited: strings.register.errors.rateLimited,
    };
    return map[e.code] ?? strings.register.errors.generic;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await register(username, password, repeat);
      password = '';
      repeat = '';
    } catch (e) {
      error = message(e);
    } finally {
      busy = false;
    }
  }
</script>

<main class="screen">
  <button
    class="back"
    type="button"
    onclick={() => navigate('welcome')}
    aria-label={strings.chat.back}
    disabled={busy}>←</button
  >
  <h1>{strings.register.title}</h1>
  <form class="form" onsubmit={submit} novalidate>
    <div class="field">
      <label for="reg-username">{strings.register.username}</label>
      <input
        id="reg-username"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        maxlength="20"
        bind:value={username}
        aria-describedby="reg-username-status"
        disabled={busy}
      />
      <span class="hint" id="reg-username-status" role="status">
        {#if availability === 'available'}{strings.register.available}
        {:else if availability === 'taken'}{strings.register.taken}
        {:else if availability === 'invalid'}{strings.register.errors.usernameFormat}
        {:else}{strings.register.usernameHint}{/if}
      </span>
    </div>
    <div class="field">
      <label for="reg-password">{strings.register.password}</label>
      <input
        id="reg-password"
        type="password"
        autocomplete="new-password"
        bind:value={password}
        disabled={busy}
      />
      <span class="hint">{strings.register.passwordHint}</span>
    </div>
    <div class="field">
      <label for="reg-repeat">{strings.register.repeatPassword}</label>
      <input
        id="reg-repeat"
        type="password"
        autocomplete="new-password"
        bind:value={repeat}
        disabled={busy}
      />
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="button primary" type="submit" disabled={busy}>
      {busy ? strings.register.securing : strings.register.submit}
    </button>
    <p class="hint">{strings.register.warning}</p>
  </form>
</main>

<style>
  .form {
    display: grid;
    gap: var(--space-4);
  }
  .error {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--fg);
  }
</style>
