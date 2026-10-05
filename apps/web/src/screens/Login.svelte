<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let username = $state('');
  let password = $state('');
</script>

<main class="screen">
  <button
    class="back"
    type="button"
    onclick={() => navigate('welcome')}
    aria-label={strings.chat.back}>←</button
  >
  <h1>{strings.login.title}</h1>
  <form
    class="form"
    onsubmit={(event) => {
      event.preventDefault();
      navigate('home');
    }}
  >
    <div class="field">
      <label for="login-username">{strings.login.username}</label>
      <input
        id="login-username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        bind:value={username}
      />
    </div>
    <div class="field">
      <label for="login-password">{strings.login.password}</label>
      <input
        id="login-password"
        type="password"
        autocomplete="current-password"
        bind:value={password}
      />
    </div>
    <button class="button primary" type="submit">{strings.login.submit}</button>
  </form>
</main>

<style>
  .form {
    display: grid;
    gap: var(--space-4);
  }
</style>
