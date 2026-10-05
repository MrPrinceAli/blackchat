<script lang="ts">
  import AuthHeader from '../components/AuthHeader.svelte';
  import Wordmark from '../components/Wordmark.svelte';
  import { AccountError, checkUsername, register } from '../lib/account';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let username = $state('');
  let password = $state('');
  let repeat = $state('');
  let availability = $state<'available' | 'taken' | 'invalid' | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  // Meter kekuatan visual (bukan validasi): panjang ≥ 10 wajib, makin panjang makin kuat.
  const strength = $derived(
    password.length >= 20 ? 3 : password.length >= 14 ? 2 : password.length >= 10 ? 1 : 0,
  );

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

<main class="screen auth">
  <AuthHeader onBack={() => navigate('welcome')} disabled={busy} />
  <div class="auth-body">
    <div class="auth-intro">
      <span class="auth-mark"><Wordmark size={44} /></span>
      <h1>{strings.register.title}</h1>
      <p class="subtitle">{strings.register.subtitle}</p>
    </div>
    <form class="form-card" onsubmit={submit} novalidate>
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
        <span
          class="hint status"
          class:ok={availability === 'available'}
          class:bad={availability === 'taken' || availability === 'invalid'}
          id="reg-username-status"
          role="status"
        >
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
        <div class="meter" aria-hidden="true" data-level={password ? strength : -1}>
          <i></i><i></i><i></i>
        </div>
        <span class="hint"
          >{password ? strings.register.strength(strength) : strings.register.passwordHint}</span
        >
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
      <button class="button primary" class:busy type="submit" disabled={busy}>
        {busy ? strings.register.securing : strings.register.submit}
      </button>
      <p class="hint warning">{strings.register.warning}</p>
    </form>
    <p class="switch">
      {strings.register.haveAccount}
      <button class="link-button" type="button" onclick={() => navigate('login')} disabled={busy}
        >{strings.register.toLogin}</button
      >
    </p>
  </div>
</main>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .status.ok,
  .status.bad {
    color: var(--fg);
  }
  .status.ok::before,
  .status.bad::before {
    content: '';
    flex: none;
    width: 7px;
    height: 7px;
    border: 1px solid var(--fg);
  }
  .status.ok::before {
    background: var(--fg);
  }
  .meter {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .meter i {
    height: 3px;
    background: var(--line);
    transition: background-color var(--dur-2) var(--ease-out);
  }
  .meter[data-level='0'] i:nth-child(-n + 1) {
    background: var(--line-strong);
  }
  .meter[data-level='1'] i:nth-child(-n + 1),
  .meter[data-level='2'] i:nth-child(-n + 2),
  .meter[data-level='3'] i {
    background: var(--fg);
  }
  .warning {
    padding-top: var(--space-4);
    border-top: 1px dashed var(--line);
  }
</style>
