<script lang="ts">
  import { MESSAGE } from '@blackchat/protocol';
  import { strings } from '../lib/strings';
  import Icon from './Icon.svelte';

  let {
    onSend,
    onAttach,
    disabled = false,
  }: {
    onSend?: (text: string) => void;
    /** Gambar dipilih/ditempel; teks yang sedang diketik menjadi caption (PRD §7.5). */
    onAttach?: (file: File, caption: string) => void;
    disabled?: boolean;
  } = $props();

  let text = $state('');
  let fileInput: HTMLInputElement;
  const canSend = $derived(!disabled && text.trim().length > 0);

  function send() {
    if (!canSend) return;
    onSend?.(text);
    text = '';
  }

  function attach(file: File | undefined | null) {
    if (!file) return;
    onAttach?.(file, text);
    text = '';
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function onPaste(event: ClipboardEvent) {
    const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    attach(file);
  }
</script>

<form
  class="composer"
  onsubmit={(event) => {
    event.preventDefault();
    send();
  }}
>
  <input
    bind:this={fileInput}
    class="visually-hidden"
    type="file"
    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
    tabindex="-1"
    aria-hidden="true"
    onchange={() => {
      attach(fileInput.files?.[0]);
      fileInput.value = '';
    }}
  />
  <button
    type="button"
    class="icon"
    aria-label={strings.chat.attach}
    onclick={() => fileInput.click()}
    {disabled}><Icon name="attach" size={22} /></button
  >
  <label class="visually-hidden" for="composer-text">{strings.chat.composerLabel}</label>
  <textarea
    id="composer-text"
    rows="1"
    maxlength={MESSAGE.TEXT_MAX_CHARS}
    placeholder={strings.chat.composerPlaceholder}
    bind:value={text}
    onkeydown={onKeydown}
    onpaste={onPaste}
    {disabled}></textarea>
  <button type="submit" class="icon send" aria-label={strings.chat.send} disabled={!canSend}
    ><Icon name="send" size={20} /></button
  >
</form>

<style>
  /* Dock pengetik: satu kapsul berisi lampiran, teks, dan kirim. */
  .composer {
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    gap: var(--space-1);
    align-items: end;
    margin: var(--space-3) calc(-1 * var(--space-1))
      max(var(--space-3), env(safe-area-inset-bottom));
    padding: 5px;
    border: 1px solid var(--line-strong);
    border-radius: 26px;
    background: var(--glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: border-color var(--dur-1) var(--ease-out);
  }
  .composer:focus-within {
    border-color: var(--fg);
  }
  textarea {
    resize: none;
    min-height: 40px;
    max-height: 160px;
    padding: 9px var(--space-2);
    border: 0;
    background: transparent;
    field-sizing: content;
    line-height: 1.4;
  }
  textarea:focus-visible {
    outline: none;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
    transition:
      background-color var(--dur-1) var(--ease-out),
      color var(--dur-1) var(--ease-out),
      transform var(--dur-1) var(--ease-out);
  }
  .icon:hover:not(:disabled) {
    color: var(--fg);
    background: var(--tint-2);
  }
  .send:not(:disabled) {
    background: var(--fg);
    color: var(--bg);
  }
  .send:not(:disabled):hover {
    background: color-mix(in srgb, var(--fg) 86%, var(--bg));
    color: var(--bg);
  }
  .icon:active:not(:disabled) {
    transform: scale(0.92);
  }
  .icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
