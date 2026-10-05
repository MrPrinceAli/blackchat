<script lang="ts">
  import { MESSAGE, type Ttl } from '@blackchat/protocol';
  import { strings } from '../lib/strings';

  let { value = $bindable(5), label = strings.home.chooseTimer }: { value?: Ttl; label?: string } =
    $props();
</script>

<fieldset class="picker">
  <legend>{label}</legend>
  <div class="options">
    {#each MESSAGE.TTL_OPTIONS as ttl (ttl)}
      <label class="option" class:selected={value === ttl}>
        <input type="radio" name="ttl" value={ttl} bind:group={value} class="visually-hidden" />
        <span class="code">{strings.timer.seconds(ttl)}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .picker {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: var(--space-2);
    font-size: var(--step--1);
    color: var(--muted);
  }
  /* Satu pil tersegmentasi: pilihan aktif dibalik warnanya. */
  .options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-control);
  }
  .option {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    border-radius: var(--radius-control);
    font-size: var(--step--1);
    cursor: pointer;
    transition:
      background-color var(--dur-2) var(--ease-out),
      color var(--dur-2) var(--ease-out);
  }
  .option:hover:not(.selected) {
    background: var(--tint-2);
  }
  .option.selected {
    background: var(--fg);
    color: var(--bg);
  }
  .option:has(input:focus-visible) {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }
</style>
