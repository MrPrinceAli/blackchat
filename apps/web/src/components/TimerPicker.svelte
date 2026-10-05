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
  }
  legend {
    padding: 0;
    margin-bottom: var(--space-2);
  }
  .options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }
  .option {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    cursor: pointer;
  }
  .option.selected {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }
  .option:has(input:focus-visible) {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }
</style>
