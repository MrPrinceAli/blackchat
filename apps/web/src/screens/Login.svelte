<script lang="ts">
  import { AccountError, login } from '../lib/account';
  import { app } from '../lib/app-state.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await login(username.trim(), password);
      password = '';
    } catch (e) {
      error =
        e instanceof AccountError && e.code === 'rate_limited'
          ? strings.login.rateLimited(e.retryAfterSeconds ?? 30)
          : e instanceof AccountError && e.code === 'network'
            ? strings.session.reconnecting
            : strings.login.error;
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
  <h1>{strings.login.title}</h1>
  {#if app.notice}<p class="notice" role="status">{app.notice}</p>{/if}
  <form class="form" onsubmit={submit} novalidate>
    <div class="field">
      <label for="login-username">{strings.login.username}</label>
      <input
        id="login-username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        bind:value={username}
        disabled={busy}
      />
    </div>
    <div class="field">
      <label for="login-password">{strings.login.password}</label>
      <input
        id="login-password"
        type="password"
        autocomplete="current-password"
        bind:value={password}
        disabled={busy}
      />
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="button primary" type="submit" disabled={busy}
      >{busy ? strings.login.working : strings.login.submit}</button
    >
  </form>
</main>

<style>
  .form {
    display: grid;
    gap: var(--space-4);
  }
  .error,
  .notice {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--fg);
  }
</style>
