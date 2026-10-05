<script lang="ts">
  import type { Ttl } from '@blackchat/protocol';
  import Composer from '../components/Composer.svelte';
  import ContextMenu, { type MenuItem } from '../components/ContextMenu.svelte';
  import SecretBubble, { type BubbleStatus } from '../components/SecretBubble.svelte';
  import TimerPicker from '../components/TimerPicker.svelte';
  import { app } from '../lib/app-state.svelte';
  import {
    answerTtl,
    chat,
    closeRoom,
    markSeen,
    proposeTtl,
    queueFront,
    removeMessage,
    retractMessage,
    loadImage,
    sendImage,
    sendText,
    type ChatMessage,
  } from '../lib/chat.svelte';
  import { noContextMenu } from '../lib/guard';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let headerMenu = $state(false);
  let menu = $state<{ x: number; y: number; msgId: string } | null>(null);
  let proposing = $state(false);
  let proposal = $state<Ttl>(3);

  const front = $derived(queueFront(chat.messages));
  const watermark = $derived(app.userId.slice(-6));

  /** Status tampilan (PRD §7.1): pesan masuk di belakang antrean disensor "Menunggu giliran". */
  function displayStatus(m: ChatMessage): BubbleStatus {
    if (m.status === 'retracted') return 'retracted';
    if (m.mine) return m.status;
    if (m.status === 'opened') return 'opened';
    return m.msgId === front ? 'delivered' : 'queued';
  }

  /** Menu konteks pesan sendiri (PRD §7.4): satu item "Batalkan pesan", dengan keterangan jika sudah dilihat. */
  function menuItems(msgId: string): MenuItem[] {
    const message = chat.messages.find((m) => m.msgId === msgId);
    if (!message) return [];
    return [
      {
        label: strings.chat.retract,
        ...(message.status === 'opened' ? { note: strings.chat.retractSeen } : {}),
        onSelect: () => void retractMessage(msgId),
      },
    ];
  }

  /** Pesan sendiri bisa dibatalkan selama belum melebur, termasuk gambar yang masih diunggah (PRD §7.4). */
  function openMenu(m: ChatMessage, x: number, y: number) {
    const uploading =
      m.kind === 'image' && m.status === 'sending' && m.seq !== Number.MAX_SAFE_INTEGER;
    if (m.mine && (m.status === 'delivered' || m.status === 'opened' || uploading))
      menu = { x, y, msgId: m.msgId };
  }

  function attach(file: File, caption: string) {
    void sendImage(file, caption);
  }

  /** Drag & drop gambar ke area chat (PRD §7.5). */
  function onDrop(event: DragEvent) {
    const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    attach(file, '');
  }

  async function submitProposal() {
    proposing = false;
    await proposeTtl(proposal);
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
      <button
        class="timer code"
        type="button"
        aria-label={`${strings.timer.label(room.ttl)}. ${strings.timer.propose}`}
        aria-expanded={proposing}
        onclick={() => {
          proposal = room.ttl === 3 ? 5 : 3;
          proposing = !proposing;
        }}>⧗ {strings.timer.seconds(room.ttl)}</button
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
    {#if proposing}
      <section class="panel" aria-label={strings.timer.propose}>
        <TimerPicker bind:value={proposal} label={strings.timer.propose} />
        <div class="row">
          <button
            class="button primary"
            type="button"
            onclick={submitProposal}
            disabled={proposal === room.ttl}
          >
            {strings.timer.submit}
          </button>
          <button class="button" type="button" onclick={() => (proposing = false)}
            >{strings.timer.cancel}</button
          >
        </div>
      </section>
    {/if}
    {#if room.pendingTtl && !room.pendingTtl.mine}
      <div class="panel" role="alert">
        <p>{strings.timer.proposal(room.entry.peer.peerUsername, room.pendingTtl.ttl)}</p>
        <div class="row">
          <button class="button primary" type="button" onclick={() => void answerTtl(true)}
            >{strings.timer.accept}</button
          >
          <button class="button" type="button" onclick={() => void answerTtl(false)}
            >{strings.timer.reject}</button
          >
        </div>
      </div>
    {:else if room.pendingTtl?.mine}
      <p class="notice" role="status">{strings.timer.waiting(room.pendingTtl.ttl)}</p>
    {/if}
    {#if chat.chatNotice}<p class="notice" role="status">{chat.chatNotice}</p>{/if}

    <section
      class="messages"
      role="log"
      aria-live="polite"
      use:noContextMenu
      ondragover={(event) => event.preventDefault()}
      ondrop={onDrop}
    >
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
          onMenu={(x, y) => openMenu(m, x, y)}
          image={m.image
            ? { w: m.image.w, h: m.image.h, load: () => loadImage(m.msgId) }
            : undefined}
          upload={m.upload}
        />
      {/each}
    </section>

    <Composer onSend={send} onAttach={attach} />

    {#if menu}
      <ContextMenu
        x={menu.x}
        y={menu.y}
        items={menuItems(menu.msgId)}
        onClose={() => (menu = null)}
      />
    {/if}
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
  .panel {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--line);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .timer {
    border: 0;
    background: transparent;
    min-height: 44px;
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
