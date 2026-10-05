<script lang="ts">
  import type { Ttl } from '@blackchat/protocol';
  import Composer from '../components/Composer.svelte';
  import ContextMenu, { type MenuItem } from '../components/ContextMenu.svelte';
  import SecretBubble, { type BubbleStatus } from '../components/SecretBubble.svelte';
  import Icon from '../components/Icon.svelte';
  import TimerPicker from '../components/TimerPicker.svelte';
  import { app } from '../lib/app-state.svelte';
  import {
    answerTtl,
    blockPeer,
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
  let confirmBlock = $state(false);
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
      <button
        class="icon-button"
        type="button"
        aria-label={strings.chat.back}
        onclick={() => closeRoom()}><Icon name="back" /></button
      >
      <div class="who">
        <span class="avatar code" aria-hidden="true"
          >{room.entry.peer.peerUsername.slice(0, 1)}</span
        >
        <span class="who-text">
          <span class="peer code">@{room.entry.peer.peerUsername}</span>
          <span class="sub" aria-hidden="true"
            >{room.verified ? strings.chat.statusVerified : strings.chat.statusEncrypted}</span
          >
        </span>
      </div>
      <button
        class="timer code"
        type="button"
        aria-label={`${strings.timer.label(room.ttl)}. ${strings.timer.propose}`}
        aria-expanded={proposing}
        onclick={() => {
          proposal = room.ttl === 3 ? 5 : 3;
          proposing = !proposing;
        }}><Icon name="hourglass" size={14} />{strings.timer.seconds(room.ttl)}</button
      >
      <button
        class="icon-button"
        class:verified={room.verified}
        type="button"
        aria-label={room.verified ? strings.chat.verified : strings.chat.verify}
        onclick={() => navigate('verify')}><Icon name="shield" /></button
      >
      <button
        class="icon-button"
        type="button"
        aria-label={strings.chat.menu}
        aria-expanded={headerMenu}
        onclick={() => (headerMenu = !headerMenu)}><Icon name="more" /></button
      >
    </header>
    {#if headerMenu}
      <div class="header-menu">
        {#if confirmBlock}
          <div
            class="panel"
            role="alertdialog"
            aria-label={strings.chat.block(room.entry.peer.peerUsername)}
          >
            <p>{strings.chat.blockConfirm(room.entry.peer.peerUsername)}</p>
            <div class="row">
              <button class="button primary" type="button" onclick={() => void blockPeer()}
                >{strings.chat.blockAction}</button
              >
              <button class="button" type="button" onclick={() => (confirmBlock = false)}
                >{strings.chat.cancel}</button
              >
            </div>
          </div>
        {:else}
          <button class="button" type="button" onclick={() => (confirmBlock = true)}>
            {strings.chat.block(room.entry.peer.peerUsername)}
          </button>
        {/if}
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

    <p class="e2e-note" aria-hidden="true">
      <Icon name="lock" size={13} />{strings.chat.e2eNote(room.ttl)}
    </p>

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
  }
  .top {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto 44px 44px;
    align-items: center;
    gap: var(--space-1);
    margin: 0 calc(-1 * var(--space-2));
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding-left: var(--space-1);
  }
  .avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-bubble);
    font-size: var(--step--1);
  }
  .who-text {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .peer {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--step--1);
    font-weight: 600;
  }
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--step--2);
    color: var(--muted);
  }
  .timer {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-control);
    background: transparent;
    font-size: var(--step--2);
    white-space: nowrap;
    transition:
      background-color var(--dur-1) var(--ease-out),
      border-color var(--dur-1) var(--ease-out);
  }
  .timer:hover,
  .timer[aria-expanded='true'] {
    border-color: var(--fg);
    background: var(--tint-1);
  }
  .verified {
    background: var(--fg);
    color: var(--bg);
  }
  .verified:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 86%, var(--bg));
  }
  @media (max-width: 420px) {
    .avatar {
      display: none;
    }
  }
  .header-menu {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--line);
    animation: enter var(--dur-2) var(--ease-out) both;
  }
  .panel {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-card);
    background: var(--surface);
    animation: enter var(--dur-2) var(--ease-out) both;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .notice {
    margin-top: var(--space-3);
  }
  .e2e-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: var(--space-4) auto 0;
    padding: 5px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    font-size: var(--step--2);
    color: var(--muted);
    text-align: center;
  }
  .messages {
    flex: 1;
    display: grid;
    align-content: start;
    gap: var(--space-4);
    padding: var(--space-5) 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
</style>
