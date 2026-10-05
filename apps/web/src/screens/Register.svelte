<script lang="ts">
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let username = $state('');
  let password = $state('');
  let repeat = $state('');
</script>

<main class="screen">
  <button
    class="back"
    type="button"
    onclick={() => navigate('welcome')}
    aria-label={strings.chat.back}>←</button
  >
  <h1>{strings.register.title}</h1>
  <form
    class="form"
    onsubmit={(event) => {
      event.preventDefault();
      navigate('home');
    }}
  >
    <div class="field">
      <label for="reg-username">{strings.register.username}</label>
      <input
        id="reg-username"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        maxlength="20"
        bind:value={username}
      />
      <span class="hint">{strings.register.usernameHint}</span>
    </div>
    <div class="field">
      <label for="reg-password">{strings.register.password}</label>
      <input id="reg-password" type="password" autocomplete="new-password" bind:value={password} />
      <span class="hint">{strings.register.passwordHint}</span>
    </div>
    <div class="field">
      <label for="reg-repeat">{strings.register.repeatPassword}</label>
      <input id="reg-repeat" type="password" autocomplete="new-password" bind:value={repeat} />
    </div>
    <button class="button primary" type="submit">{strings.register.submit}</button>
    <p class="hint">{strings.register.warning}</p>
  </form>
</main>

<style>
  .form {
    display: grid;
    gap: var(--space-4);
  }
</style>
