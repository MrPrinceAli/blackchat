<script lang="ts">
  import { MESSAGE } from '@blackchat/protocol';
  import { strings } from '../lib/strings';

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
    {disabled}>⊕</button
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
    >↑</button
  >
</form>

<style>
  .composer {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    gap: var(--space-2);
    align-items: end;
    padding: var(--space-3) 0;
    border-top: 1px solid var(--line);
  }
  textarea {
    resize: none;
    min-height: 44px;
    max-height: 160px;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: 22px;
    background: transparent;
    field-sizing: content;
  }
  textarea:focus-visible {
    border-color: var(--fg);
  }
  .icon {
    width: 44px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    background: transparent;
    font-size: var(--step-1);
    line-height: 1;
  }
  .send:not(:disabled) {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }
  .icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
