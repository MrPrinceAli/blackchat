<script lang="ts">
  // Safety number + QR (PRD §4.4). Status terverifikasi disimpan di blob kontak terenkripsi (PRD §4.8).
  import { base64urlDecode } from '@blackchat/protocol';
  import qrcode from 'qrcode-generator';
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { activeSession } from '../lib/account';
  import { chat, markVerified } from '../lib/chat.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  const room = chat.open;
  const session = activeSession();
  const groups =
    room && session
      ? session.crypto.safetyNumber(
          session.identity.edPk,
          base64urlDecode(room.entry.peer.peerEdPk),
        )
      : [];
  let canvas = $state<HTMLCanvasElement>();
  let busy = $state(false);

  // QR digambar ke canvas modul per modul (tanpa HTML/SVG string).
  onMount(() => {
    if (!canvas || groups.length === 0) return;
    const qr = qrcode(0, 'M');
    qr.addData(groups.join(''), 'Numeric');
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 2;
    const scale = 4;
    const size = (count + quiet * 2) * scale;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
  });

  async function mark() {
    busy = true;
    try {
      await markVerified();
    } finally {
      busy = false;
    }
  }
</script>

<main class="screen">
  <button
    class="icon-button back"
    type="button"
    onclick={() => navigate(room ? 'chat' : 'home')}
    aria-label={strings.chat.back}><Icon name="back" /></button
  >
  <h1>{strings.verify.title}</h1>
  {#if room}
    <p class="muted">{strings.verify.description(room.entry.peer.peerUsername)}</p>
    <section class="card number">
      <span class="eyebrow">{strings.verify.numberLabel}</span>
      <ol class="digits code" aria-label="Safety number">
        {#each groups as group, i (i)}
          <li>{group}</li>
        {/each}
      </ol>
    </section>
    <section class="card qr-card">
      <div class="qr-frame" role="img" aria-label="QR safety number">
        <canvas class="qr" bind:this={canvas} aria-hidden="true"></canvas>
      </div>
      <span class="hint">{strings.verify.qrLabel(room.entry.peer.peerUsername)}</span>
    </section>
    <button class="button primary" type="button" disabled={room.verified || busy} onclick={mark}>
      <Icon name="shield" size={18} />
      {room.verified ? strings.verify.verified : strings.verify.mark}
    </button>
  {/if}
</main>

<style>
  .number {
    gap: var(--space-3);
  }
  .digits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid var(--line);
    border-left: 1px solid var(--line);
    font-size: var(--step-0);
    letter-spacing: 0.04em;
  }
  .digits li {
    padding: var(--space-3) 0;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    text-align: center;
  }
  /* Layar sempit: 3 kolom (12 grup = 4 baris) agar tidak meluber di 320 px (PRD §10.7). */
  @media (max-width: 420px) {
    .digits {
      grid-template-columns: repeat(3, 1fr);
      font-size: var(--step--1);
    }
  }
  .qr-card {
    justify-items: center;
    padding: var(--space-6) var(--space-5);
  }
  /* Bingkai potong di keempat sudut QR. */
  .qr-frame {
    position: relative;
    padding: var(--space-3);
  }
  .qr-frame::before {
    content: '';
    position: absolute;
    inset: 0;
    --c: var(--fg);
    --t: 14px;
    background:
      linear-gradient(var(--c), var(--c)) top left / var(--t) 1px,
      linear-gradient(var(--c), var(--c)) top left / 1px var(--t),
      linear-gradient(var(--c), var(--c)) top right / var(--t) 1px,
      linear-gradient(var(--c), var(--c)) top right / 1px var(--t),
      linear-gradient(var(--c), var(--c)) bottom left / var(--t) 1px,
      linear-gradient(var(--c), var(--c)) bottom left / 1px var(--t),
      linear-gradient(var(--c), var(--c)) bottom right / var(--t) 1px,
      linear-gradient(var(--c), var(--c)) bottom right / 1px var(--t);
    background-repeat: no-repeat;
  }
  .qr {
    display: block;
    width: 172px;
    height: 172px;
    image-rendering: pixelated;
  }
</style>
