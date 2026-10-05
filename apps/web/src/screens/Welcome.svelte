<script lang="ts">
  import Icon, { type IconName } from '../components/Icon.svelte';
  import LangToggle from '../components/LangToggle.svelte';
  import SecretBubble from '../components/SecretBubble.svelte';
  import Wordmark from '../components/Wordmark.svelte';
  import { navigate } from '../lib/router.svelte';
  import { strings } from '../lib/strings';

  let { onBurnDemo }: { onBurnDemo?: (() => void) | undefined } = $props();

  const preview = $derived(strings.welcome.preview);
  const stackIcons: IconName[] = ['exchange', 'signature', 'lock', 'hash'];
  // Pratinjau berulang: pesan menghitung mundur, melebur (BurnFx asli), lalu mulai lagi.
  let round = $state(0);
</script>

<main class="screen welcome">
  <header class="masthead">
    <span class="eyebrow">{strings.welcome.eyebrow}</span>
    <div class="masthead-end">
      <span class="eyebrow edition">{strings.welcome.edition}</span>
      <LangToggle />
    </div>
  </header>

  <div class="layout">
    <section class="hero">
      <h1 class="brand" aria-label={strings.appName}><Wordmark size={120} /></h1>
      <p class="tagline">
        <span>{strings.welcome.taglineMessages}</span>
        <span class="muted">{strings.welcome.taglineAccount}</span>
      </p>
      <ul class="specs" aria-label={strings.welcome.eyebrow}>
        {#each strings.welcome.specs as spec (spec)}
          <li class="code">{spec}</li>
        {/each}
      </ul>
      <div class="actions">
        <button class="button primary" type="button" onclick={() => navigate('register')}>
          {strings.welcome.createAccount}<span class="arrow"
            ><Icon name="arrowRight" size={18} /></span
          >
        </button>
        <button class="button" type="button" onclick={() => navigate('login')}
          >{strings.welcome.signIn}</button
        >
      </div>
      <p class="hint">{strings.welcome.incognitoHint}</p>
      {#if import.meta.env.DEV && onBurnDemo}
        <button class="button" type="button" onclick={onBurnDemo}>Demo lebur (dev)</button>
      {/if}
    </section>

    <!-- Dekoratif: tidak bisa difokus dan tidak dibacakan pembaca layar. -->
    <div class="showcase" aria-hidden="true" inert>
      <div class="window-bar">
        <span class="lights"><i></i><i></i><i></i></span>
        <span class="code peer">{preview.peer}</span>
        <span class="code ttl"><Icon name="hourglass" size={14} />{strings.timer.seconds(5)}</span>
      </div>
      <div class="thread">
        {#key round}
          <SecretBubble
            text={preview.message}
            mine={false}
            status="opened"
            ttl={5}
            watermark={preview.watermark}
            onGone={() => round++}
          />
        {/key}
        <SecretBubble
          text={preview.reply}
          mine
          status="delivered"
          ttl={5}
          watermark={preview.watermark}
        />
      </div>
      <div class="window-foot">
        <Icon name="lock" size={14} />
        <span>{preview.footer}</span>
      </div>
    </div>
  </div>

  <footer class="foot">
    <ul class="stack" aria-label={strings.welcome.stackLabel}>
      {#each strings.welcome.stack as item, i (item.name)}
        <li>
          <span class="glyph" aria-hidden="true"
            ><Icon name={stackIcons[i] ?? 'lock'} size={14} /></span
          >
          <span class="code name">{item.name}</span>
          <span class="role">{item.role}</span>
        </li>
      {/each}
    </ul>
  </footer>
</main>

<style>
  .welcome {
    justify-content: space-between;
    gap: var(--space-8);
  }
  .masthead {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding-top: var(--space-2);
  }
  .masthead {
    align-items: center;
  }
  .masthead-end {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .masthead .eyebrow {
    white-space: nowrap;
  }
  @media (max-width: 479px) {
    .edition {
      display: none;
    }
  }
  /* Layar sangat sempit: label dekoratif kiri mengalah pada toggle bahasa. */
  @media (max-width: 400px) {
    .masthead > .eyebrow {
      display: none;
    }
    .masthead {
      justify-content: flex-end;
    }
  }
  /* Lampu indikator merah (satu-satunya warna, D-023): berdenyut pelan dengan cincin yang memudar. */
  .edition::before {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--signal);
    outline: 1px solid var(--signal);
    outline-offset: 0;
    animation: pulse 2.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0% {
      outline-offset: 0;
      outline-color: var(--signal);
    }
    60% {
      opacity: 0.55;
      outline-offset: 5px;
      outline-color: transparent;
    }
    100% {
      outline-offset: 5px;
      outline-color: transparent;
    }
  }

  .layout {
    display: grid;
    gap: var(--space-12);
    align-items: center;
  }
  .hero {
    display: grid;
    justify-items: start;
    gap: var(--space-6);
  }
  .brand {
    width: 100%;
    margin: var(--space-6) 0 var(--space-2);
    line-height: 0;
  }
  /* Wordmark mengikuti lebar kolom (maks 560 px), tinggi proporsional. */
  .brand :global(.wordmark) {
    width: min(100%, 560px);
    height: auto;
  }
  .tagline {
    display: grid;
    font-size: var(--step-1);
    line-height: 1.35;
    letter-spacing: -0.01em;
  }
  .specs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .specs li {
    padding: 5px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    font-size: var(--step--2);
    color: var(--muted);
  }
  .actions {
    display: grid;
    gap: var(--space-3);
    width: 100%;
  }

  /* Jendela pratinjau: seperti potongan layar chat sungguhan. */
  .showcase {
    display: grid;
    border: 1px solid var(--line);
    border-radius: var(--radius-card);
    background: var(--surface);
    overflow: hidden;
  }
  .window-bar,
  .window-foot {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    font-size: var(--step--1);
  }
  .window-bar {
    border-bottom: 1px solid var(--line);
  }
  .lights {
    display: inline-flex;
    gap: 5px;
  }
  .lights i {
    width: 7px;
    height: 7px;
    border: 1px solid var(--line-strong);
  }
  .peer {
    flex: 1;
  }
  .ttl {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--muted);
  }
  .thread {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-height: 196px;
    padding: var(--space-5) var(--space-4);
    background-image: radial-gradient(var(--dot) 1px, transparent 1.2px);
    background-size: 18px 18px;
  }
  .window-foot {
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: var(--step--2);
  }

  .foot {
    padding-top: var(--space-5);
    border-top: 1px solid var(--line);
  }
  .stack {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-3) var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stack li {
    display: grid;
    grid-template-columns: 26px 1fr;
    column-gap: var(--space-3);
    align-items: center;
    min-width: 0;
  }
  .glyph {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    color: var(--fg);
  }
  .name {
    font-size: var(--step--2);
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .role {
    font-size: var(--step--2);
    color: var(--muted);
  }

  @media (min-width: 900px) {
    .welcome {
      max-width: 1040px;
    }
    .layout {
      grid-template-columns: 1.1fr 0.9fr;
      gap: var(--space-12);
    }
    .actions {
      grid-template-columns: 1fr 1fr;
      max-width: 440px;
    }
  }
</style>
