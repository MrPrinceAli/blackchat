<script lang="ts">
  import type { Ttl } from '@blackchat/protocol';
  import AccountClock from '../components/AccountClock.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
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

<main class="screen home">
  <header class="top">
    <span class="brand"><Logo size={24} /><span>{strings.appName}</span></span>
    <button
      class="icon-button"
      type="button"
      aria-label={strings.home.settings}
      onclick={() => navigate('settings')}><Icon name="settings" /></button
    >
  </header>

  <section class="identity card">
    <div class="row">
      <span class="eyebrow">{strings.home.signedInAs}</span>
      <span class="eyebrow">{strings.home.expiresIn}</span>
    </div>
    <div class="row values">
      <span class="me code">@{app.username}</span>
      <AccountClock
        remainingMs={app.remainingMs}
        onExpire={() => void end('expired')}
        showWarning
        bar
      />
    </div>
  </section>

  <form class="search" onsubmit={search}>
    <label class="visually-hidden" for="search">{strings.home.searchLabel}</label>
    <span class="search-icon" aria-hidden="true"><Icon name="search" size={18} /></span>
    <input
      id="search"
      class="input"
      placeholder={strings.home.searchPlaceholder}
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      maxlength="20"
      bind:value={query}
      disabled={busy}
    />
    <button class="go" type="submit" aria-label={strings.home.search} disabled={busy}
      ><Icon name="arrowRight" size={18} /></button
    >
  </form>

  {#if picking}
    <section class="picker card" aria-label={strings.home.start}>
      <div class="picker-head">
        <span class="avatar code" aria-hidden="true">{picking.slice(0, 1)}</span>
        <p class="code">@{picking}</p>
      </div>
      <TimerPicker bind:value={ttl} />
      <button class="button primary" class:busy type="button" onclick={start} disabled={busy}
        >{strings.home.start}<span class="arrow"><Icon name="arrowRight" size={18} /></span></button
      >
    </section>
  {/if}

  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  {#if chat.notice}<p class="notice" role="status">{chat.notice}</p>{/if}

  <section class="list">
    <div class="list-head">
      <span class="eyebrow">{strings.home.conversations}</span>
      {#if rooms.length > 0}<span class="eyebrow count code">{rooms.length}</span>{/if}
    </div>
    {#if rooms.length === 0}
      <div class="empty">
        <span class="empty-mark" aria-hidden="true"><Logo size={40} /></span>
        <p class="muted">{chat.loading ? strings.home.loading : strings.home.empty}</p>
      </div>
    {:else}
      <ul class="rooms">
        {#each rooms as room (room.inboxRoomId)}
          <li>
            <button
              type="button"
              class="room"
              class:unread={room.unread > 0}
              onclick={() => open(room.inboxRoomId)}
              disabled={busy}
            >
              <span class="avatar code" aria-hidden="true"
                >{room.peer.peerUsername.slice(0, 1)}</span
              >
              <span class="name code">@{room.peer.peerUsername}</span>
              {#if room.unread > 0}
                <span class="badge" aria-label={strings.home.unread(room.unread)}>
                  <span class="square" aria-hidden="true"></span><span class="code"
                    >{room.unread}</span
                  >
                </span>
              {/if}
              <span class="chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .home {
    gap: var(--space-5);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-right: calc(-1 * var(--space-2));
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
    font-size: var(--step-1);
    letter-spacing: -0.03em;
  }

  .identity {
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
  }
  .values {
    flex-wrap: wrap;
  }
  .values :global(.clock) {
    font-size: var(--step-0);
    font-weight: 500;
  }
  .values :global(.life) {
    flex-basis: 100%;
    margin-top: var(--space-2);
  }
  .values :global(.warning) {
    flex-basis: 100%;
  }
  .me {
    font-size: var(--step-0);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
  }
  .search .input {
    padding-left: 46px;
    padding-right: 56px;
    border-radius: var(--radius-control);
  }
  .search-icon {
    position: absolute;
    left: 18px;
    top: 50%;
    translate: 0 -50%;
    color: var(--muted);
    pointer-events: none;
  }
  .go {
    position: absolute;
    right: 6px;
    top: 50%;
    translate: 0 -50%;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--fg);
    color: var(--bg);
    transition: transform var(--dur-1) var(--ease-out);
  }
  .go:active:not(:disabled) {
    transform: scale(0.94);
  }
  .go:disabled {
    opacity: 0.45;
  }

  .picker {
    animation: enter var(--dur-2) var(--ease-out) both;
  }
  .picker-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .list {
    display: grid;
    gap: var(--space-2);
  }
  .list-head {
    display: flex;
    justify-content: space-between;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--line);
  }
  .count::before {
    display: none;
  }
  .rooms {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .room {
    display: grid;
    grid-template-columns: 40px 1fr auto auto;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 64px;
    padding: var(--space-2) var(--space-2);
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    text-align: left;
    transition: background-color var(--dur-1) var(--ease-out);
  }
  .room:hover:not(:disabled) {
    background: var(--tint-1);
  }
  .room:hover:not(:disabled) .chevron {
    transform: translateX(3px);
    color: var(--fg);
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-bubble);
    font-size: var(--step--1);
    text-transform: lowercase;
  }
  .room.unread .avatar {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--step--1);
  }
  .square {
    width: 8px;
    height: 8px;
    background: var(--fg);
  }
  .chevron {
    color: var(--muted);
    transition:
      transform var(--dur-2) var(--ease-spring),
      color var(--dur-1) var(--ease-out);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    padding: var(--space-12) var(--space-4);
    border: 1px dashed var(--line);
    border-radius: var(--radius-card);
    text-align: center;
  }
  .empty-mark {
    color: var(--line-strong);
  }
</style>
