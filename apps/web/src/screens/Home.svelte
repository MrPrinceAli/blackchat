<script lang="ts">
  import type { Ttl } from '@blackchat/protocol';
  import AccountClock from '../components/AccountClock.svelte';
  import TimerPicker from '../components/TimerPicker.svelte';
  import { end } from '../lib/account';
  import { app } from '../lib/app-state.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  // Daftar percakapan diisi dari relay di W8.
  const rooms: { username: string; unread: number }[] = [];

  let query = $state('');
  let picking = $state(false);
  let ttl = $state<Ttl>(5);
</script>

<main class="screen">
  <header class="top">
    <span class="brand">{strings.appName} <span class="me code muted">@{app.username}</span></span>
    <AccountClock remainingMs={app.remainingMs} onExpire={() => void end('expired')} showWarning />
    <button
      class="icon"
      type="button"
      aria-label={strings.home.settings}
      onclick={() => navigate('settings')}>⚙</button
    >
  </header>

  <form
    class="search"
    onsubmit={(event) => {
      event.preventDefault();
      if (query.trim()) picking = true;
    }}
  >
    <label class="visually-hidden" for="search">{strings.home.searchLabel}</label>
    <input
      id="search"
      placeholder={strings.home.searchPlaceholder}
      autocomplete="off"
      autocapitalize="none"
      bind:value={query}
    />
    <button class="icon" type="submit" aria-label={strings.home.search}>+</button>
  </form>

  {#if picking}
    <section class="picker">
      <TimerPicker bind:value={ttl} />
      <button class="button primary" type="button" onclick={() => navigate('chat')}
        >{strings.home.start}</button
      >
    </section>
  {/if}

  {#if rooms.length === 0}
    <p class="muted">{strings.home.empty}</p>
  {:else}
    <ul class="rooms">
      {#each rooms as room (room.username)}
        <li>
          <button type="button" class="room" onclick={() => navigate('chat')}>
            <span class="code">@{room.username}</span>
            {#if room.unread > 0}
              <span class="unread" aria-label={strings.home.unread(room.unread)}>
                <span class="square" aria-hidden="true"></span><span class="code"
                  >{room.unread}</span
                >
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .brand {
    flex: 1;
    font-weight: 600;
  }
  .me {
    font-weight: 400;
    font-size: var(--step--1);
  }
  .icon {
    width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
    font-size: var(--step-1);
  }
  .search {
    display: grid;
    grid-template-columns: 1fr 44px;
    gap: var(--space-2);
  }
  .search input {
    min-height: 44px;
    padding: 0 var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: transparent;
  }
  .search .icon {
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
  }
  .picker {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--line);
  }
  .rooms {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .room {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-height: 56px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    text-align: left;
  }
  .unread {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .square {
    width: 10px;
    height: 10px;
    background: var(--fg);
  }
</style>
