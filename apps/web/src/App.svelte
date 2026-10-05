<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyPane from './components/EmptyPane.svelte';
  import SessionBanner from './components/SessionBanner.svelte';
  import { restore } from './lib/account';
  import { app } from './lib/app-state.svelte';
  import { chat } from './lib/chat.svelte';
  import { installGuard } from './lib/guard';
  import { navigate, router } from './lib/router.svelte';
  import BurnDemo from './screens/BurnDemo.svelte';
  import Chat from './screens/Chat.svelte';
  import Expired from './screens/Expired.svelte';
  import Home from './screens/Home.svelte';
  import Login from './screens/Login.svelte';
  import Register from './screens/Register.svelte';
  import Settings from './screens/Settings.svelte';
  import Verify from './screens/Verify.svelte';
  import Welcome from './screens/Welcome.svelte';

  let concealed = $state(false);

  // Layar lebar: daftar percakapan selalu tampil di kiri, chat/verifikasi/pengaturan di kanan (D-023).
  const wideQuery = matchMedia('(min-width: 960px)');
  let wide = $state(wideQuery.matches);
  const inShell = $derived(wide && ['home', 'chat', 'verify', 'settings'].includes(router.screen));

  onMount(() => {
    void restore();
    const onWide = () => (wide = wideQuery.matches);
    wideQuery.addEventListener('change', onWide);
    const uninstall = installGuard((value) => (concealed = value));
    return () => {
      wideQuery.removeEventListener('change', onWide);
      uninstall();
    };
  });

  const burnDemo = import.meta.env.DEV ? () => navigate('burn-demo') : undefined;
</script>

{#if app.booting}
  <!-- Memulihkan sesi; tidak menampilkan Welcome sesaat sebelum Home (PRD §5.4 langkah 6). -->
{:else if inShell}
  <div class="shell">
    <aside class="sidebar"><Home embedded /></aside>
    <div class="pane">
      {#if router.screen === 'chat'}
        <!-- Kunci per room: state lokal (menu, usulan timer) tidak terbawa saat pindah percakapan. -->
        {#key chat.open?.entry.inboxRoomId}<Chat />{/key}
      {:else if router.screen === 'verify'}
        <Verify />
      {:else if router.screen === 'settings'}
        <Settings />
      {:else}
        <EmptyPane />
      {/if}
    </div>
  </div>
{:else if router.screen === 'welcome'}
  <Welcome onBurnDemo={burnDemo} />
{:else if router.screen === 'register'}
  <Register />
{:else if router.screen === 'login'}
  <Login />
{:else if router.screen === 'home'}
  <Home />
{:else if router.screen === 'chat'}
  <Chat />
{:else if router.screen === 'verify'}
  <Verify />
{:else if router.screen === 'settings'}
  <Settings />
{:else if router.screen === 'expired'}
  <Expired />
{:else if import.meta.env.DEV && router.screen === 'burn-demo'}
  <BurnDemo />
{/if}

<SessionBanner />

{#if concealed}
  <div class="concealed-overlay" aria-hidden="true"></div>
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    height: 100dvh;
  }
  @media (min-width: 1280px) {
    .shell {
      grid-template-columns: 400px minmax(0, 1fr);
    }
  }
  .sidebar {
    height: 100dvh;
    overflow-y: auto;
    border-right: 1px solid var(--line);
    background: var(--surface);
    scrollbar-width: thin;
  }
  .pane {
    display: flex;
    min-width: 0;
    height: 100dvh;
    overflow-y: auto;
  }
  /* Isi panel kanan: chat memakai lebar yang lebih lega dari layar ponsel. */
  .pane :global(.screen) {
    max-width: 880px;
  }
  .pane :global(.screen.chat) {
    padding-left: var(--space-8);
    padding-right: var(--space-8);
  }
  /* Bingkai potong tidak dipakai di shell (bertabrakan dengan sidebar). */
  :global(body:has(.shell)::after) {
    display: none;
  }
</style>
