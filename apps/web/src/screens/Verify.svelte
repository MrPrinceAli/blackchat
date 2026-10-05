<script lang="ts">
  // Safety number + QR (PRD §4.4). Status terverifikasi disimpan di blob kontak terenkripsi (PRD §4.8).
  import { base64urlDecode } from '@blackchat/protocol';
  import qrcode from 'qrcode-generator';
  import { onMount } from 'svelte';
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
    class="back"
    type="button"
    onclick={() => navigate(room ? 'chat' : 'home')}
    aria-label={strings.chat.back}>←</button
  >
  <h1>{strings.verify.title}</h1>
  {#if room}
    <p class="muted">{strings.verify.description(room.entry.peer.peerUsername)}</p>
    <ol class="digits code" aria-label="Safety number">
      {#each groups as group, i (i)}
        <li>{group}</li>
      {/each}
    </ol>
    <div class="qr-frame" role="img" aria-label="QR safety number">
      <canvas class="qr" bind:this={canvas} aria-hidden="true"></canvas>
    </div>
    <button class="button primary" type="button" disabled={room.verified || busy} onclick={mark}>
      {room.verified ? strings.verify.verified : strings.verify.mark}
    </button>
  {/if}
</main>

<style>
  .digits {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    font-size: var(--step-1);
  }
  /* Layar sempit: 3 kolom (12 grup = 4 baris) agar tidak meluber di 320 px (PRD §10.7). */
  @media (max-width: 420px) {
    .digits {
      grid-template-columns: repeat(3, 1fr);
      font-size: var(--step-0);
    }
  }
  .qr {
    width: 180px;
    height: 180px;
    image-rendering: pixelated;
    border: 1px solid var(--line);
  }
</style>
