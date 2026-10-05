<script lang="ts">
  import Composer from '../components/Composer.svelte';
  import SecretBubble, { type BubbleStatus } from '../components/SecretBubble.svelte';
  import { app } from '../lib/app-state.svelte';
  import {
    chat,
    closeRoom,
    markSeen,
    queueFront,
    removeMessage,
    sendText,
    type ChatMessage,
  } from '../lib/chat.svelte';
  import { noContextMenu } from '../lib/guard';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let headerMenu = $state(false);

  const front = $derived(queueFront(chat.messages));
  const watermark = $derived(app.userId.slice(-6));

  /** Status tampilan (PRD §7.1): pesan masuk di belakang antrean disensor "Menunggu giliran". */
  function displayStatus(m: ChatMessage): BubbleStatus {
    if (m.mine) return m.status;
    if (m.status === 'opened') return 'opened';
    return m.msgId === front ? 'delivered' : 'queued';
  }

  async function send(text: string) {
    try {
      await sendText(text);
    } catch {
      // Pesan galat sudah ditampilkan lewat chat.chatNotice.
    }
  }
</script>

{#if chat.open}
  {@const room = chat.open}
  <main class="screen chat">
    <header class="top">
      <button class="icon" type="button" aria-label={strings.chat.back} onclick={() => closeRoom()}
        >←</button
      >
      <span class="peer code">@{room.entry.peer.peerUsername}</span>
      <span class="timer code" aria-label={strings.timer.label(room.ttl)}
        >⧗ {strings.timer.seconds(room.ttl)}</span
      >
      <button
        class="icon"
        type="button"
        aria-label={strings.chat.verify}
        onclick={() => navigate('verify')}>✓</button
      >
      <button
        class="icon"
        type="button"
        aria-label={strings.chat.menu}
        aria-expanded={headerMenu}
        onclick={() => (headerMenu = !headerMenu)}>⋯</button
      >
    </header>
    {#if headerMenu}
      <div class="header-menu">
        <!-- Blokir diaktifkan di W11. -->
        <button class="button" type="button" disabled
          >{strings.chat.block(room.entry.peer.peerUsername)}</button
        >
      </div>
    {/if}
    {#if chat.chatNotice}<p class="notice" role="status">{chat.chatNotice}</p>{/if}

    <section class="messages" aria-live="polite" use:noContextMenu>
      {#each chat.messages as m (m.msgId)}
        <SecretBubble
          text={m.text}
          mine={m.mine}
          status={displayStatus(m)}
          ttl={m.ttl}
          remainingMs={m.remainingMs ?? m.ttl * 1000}
          {watermark}
          onSeen={() => void markSeen(m.msgId)}
          onGone={() => removeMessage(m.msgId)}
        />
      {/each}
    </section>

    <Composer onSend={send} />

    <!-- Menu konteks "Batalkan pesan" diaktifkan di W9. -->
  </main>
{/if}

<style>
  .chat {
    gap: 0;
    padding-bottom: 0;
  }
  .top {
    display: grid;
    grid-template-columns: 44px 1fr auto 44px 44px;
    align-items: center;
    gap: var(--space-1);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  .icon {
    min-width: 44px;
    height: 44px;
    border: 0;
    background: transparent;
  }
  .timer {
    font-size: var(--step--1);
    padding: 0 var(--space-2);
  }
  .peer {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-menu {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--line);
  }
  .notice {
    margin-top: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--fg);
    font-size: var(--step--1);
  }
  .messages {
    flex: 1;
    display: grid;
    align-content: start;
    gap: var(--space-4);
    padding: var(--space-4) 0;
    overflow-y: auto;
  }
</style>
