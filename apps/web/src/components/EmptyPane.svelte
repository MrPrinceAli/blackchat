<script lang="ts">
  // Panel kanan desktop saat belum ada percakapan terbuka (D-023).
  import { strings } from '../lib/strings';
  import Wordmark from './Wordmark.svelte';
</script>

<main class="empty-pane" aria-label={strings.pane.title}>
  <div class="mark" aria-hidden="true"><Wordmark size={92} /></div>
  <div class="copy">
    <span class="eyebrow">{strings.pane.eyebrow}</span>
    <h2>{strings.pane.title}</h2>
    <p class="muted">{strings.pane.body}</p>
  </div>
  <dl class="keys">
    {#each strings.pane.shortcuts as [key, action] (key)}
      <div>
        <dt class="code">{key}</dt>
        <dd>{action}</dd>
      </div>
    {/each}
  </dl>
</main>

<style>
  .empty-pane {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--space-8);
    width: 100%;
    min-height: 100dvh;
    padding: var(--space-12);
    text-align: center;
    animation: enter var(--dur-3) var(--ease-out) both;
  }
  .mark {
    color: var(--line-strong);
  }
  .copy {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    max-width: 420px;
  }
  h2 {
    font-size: var(--step-2);
    font-weight: 600;
    letter-spacing: -0.03em;
  }
  .keys {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2) var(--space-6);
    margin: 0;
    padding: var(--space-4) var(--space-5);
    border: 1px dashed var(--line);
    border-radius: var(--radius-card);
    text-align: left;
  }
  .keys div {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    font-size: var(--step--1);
  }
  dt {
    flex: none;
    padding: 1px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    font-size: var(--step--2);
  }
  dd {
    margin: 0;
    color: var(--muted);
  }
</style>
