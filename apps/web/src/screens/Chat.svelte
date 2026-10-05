<script lang="ts">
  import Composer from '../components/Composer.svelte';
  import ContextMenu from '../components/ContextMenu.svelte';
  import SecretBubble from '../components/SecretBubble.svelte';
  import { noContextMenu } from '../lib/guard';
  import { navigate } from '../lib/router.svelte';
  import { sample, type SampleMessage } from '../lib/sample';
  import { strings } from '../lib/strings';

  let messages = $state<SampleMessage[]>(sample.messages.map((m) => ({ ...m })));
  let menu = $state<{ x: number; y: number; id: string } | null>(null);
  let headerMenu = $state(false);
  let counter = 0;

  function remove(id: string) {
    messages = messages.filter((m) => m.id !== id);
  }

  function send(text: string) {
    messages = [...messages, { id: `local-${++counter}`, mine: true, text, status: 'delivered' }];
  }
</script>

<main class="screen chat">
  <header class="top">
    <button
      class="icon"
      type="button"
      aria-label={strings.chat.back}
      onclick={() => navigate('home')}>←</button
    >
    <span class="peer code">@{sample.peer}</span>
    <button class="timer code" type="button" aria-label={strings.timer.propose}
      >⧗ {strings.timer.seconds(sample.ttl)}</button
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
      <button class="button" type="button" onclick={() => (headerMenu = false)}
        >{strings.chat.block(sample.peer)}</button
      >
    </div>
  {/if}

  <section class="messages" aria-live="polite" use:noContextMenu>
    {#each messages as m (m.id)}
      <SecretBubble
        text={m.text}
        mine={m.mine}
        status={m.status}
        ttl={sample.ttl}
        remainingMs={m.remainingMs ?? sample.ttl * 1000}
        watermark={sample.watermark}
        onGone={() => remove(m.id)}
        onMenu={(x, y) => (menu = { x, y, id: m.id })}
      />
    {/each}
  </section>

  <Composer onSend={send} />

  {#if menu}
    {@const target = menu.id}
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={[{ label: strings.chat.retract, onSelect: () => remove(target) }]}
      onClose={() => (menu = null)}
    />
  {/if}
</main>

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
  .icon,
  .timer {
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
  .messages {
    flex: 1;
    display: grid;
    align-content: start;
    gap: var(--space-4);
    padding: var(--space-4) 0;
    overflow-y: auto;
  }
</style>
