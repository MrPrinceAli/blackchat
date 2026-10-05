<script lang="ts">
  import type { Ttl } from '@blackchat/protocol';
  import AccountClock from '../components/AccountClock.svelte';
  import TimerPicker from '../components/TimerPicker.svelte';
  import { end } from '../lib/account';
  import { app } from '../lib/app-state.svelte';
  import {
    chat,
    openRoom,
    sortedRooms,
    startConversation,
    StartConversationError,
  } from '../lib/chat.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let query = $state('');
  let picking = $state<string | null>(null);
  let ttl = $state<Ttl>(5);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const rooms = $derived(sortedRooms(chat.rooms));

  function search(event: SubmitEvent) {
    event.preventDefault();
    const username = query.trim().toLowerCase();
    error = null;
    if (username.length === 0) return;
    // Percakapan yang sudah ada langsung dibuka.
    const existing = chat.rooms.find((r) => r.peer.peerUsername === username);
    if (existing) {
      void open(existing.inboxRoomId).then(() => {
        // Room lama dilupakan karena lawan sudah tidak ada / berganti kunci: tawarkan percakapan baru.
        if (!chat.open && !chat.rooms.some((r) => r.inboxRoomId === existing.inboxRoomId))
          picking = username;
      });
      return;
    }
    picking = username;
  }

  async function start() {
    if (!picking || busy) return;
    busy = true;
    error = null;
    try {
      await startConversation(picking, ttl);
      query = '';
      picking = null;
    } catch (e) {
      const code = e instanceof StartConversationError ? e.code : 'generic';
      error =
        code === 'not_found'
          ? strings.errors.usernameNotFound
          : code === 'self'
            ? strings.home.self
            : code === 'invalid'
              ? strings.home.invalidPeer
              : strings.home.startFailed;
    } finally {
      busy = false;
    }
  }

  async function open(inboxRoomId: string) {
    if (busy) return;
    busy = true;
    try {
      await openRoom(inboxRoomId);
    } catch {
      error = strings.home.startFailed;
    } finally {
      busy = false;
    }
  }
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

  <form class="search" onsubmit={search}>
    <label class="visually-hidden" for="search">{strings.home.searchLabel}</label>
    <input
      id="search"
      placeholder={strings.home.searchPlaceholder}
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      maxlength="20"
      bind:value={query}
      disabled={busy}
    />
    <button class="icon" type="submit" aria-label={strings.home.search} disabled={busy}>+</button>
  </form>

  {#if picking}
    <section class="picker" aria-label={strings.home.start}>
      <p class="code">@{picking}</p>
      <TimerPicker bind:value={ttl} />
      <button class="button primary" type="button" onclick={start} disabled={busy}
        >{strings.home.start}</button
      >
    </section>
  {/if}

  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  {#if chat.notice}<p class="notice" role="status">{chat.notice}</p>{/if}

  {#if rooms.length === 0}
    <p class="muted">{chat.loading ? strings.home.loading : strings.home.empty}</p>
  {:else}
    <ul class="rooms">
      {#each rooms as room (room.inboxRoomId)}
        <li>
          <button type="button" class="room" onclick={() => open(room.inboxRoomId)} disabled={busy}>
            <span class="code">@{room.peer.peerUsername}</span>
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
  .notice {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--fg);
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
