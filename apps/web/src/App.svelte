<script lang="ts">
  import { onMount } from 'svelte';
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

  onMount(() => installGuard((value) => (concealed = value)));

  const burnDemo = import.meta.env.DEV ? () => navigate('burn-demo') : undefined;
</script>

{#if router.screen === 'welcome'}
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

{#if concealed}
  <div class="concealed-overlay" aria-hidden="true"></div>
{/if}
