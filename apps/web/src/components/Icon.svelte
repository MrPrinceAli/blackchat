<script lang="ts" module>
  // Ikon garis 24×24 (stroke 1.5), dekoratif: nama aksi selalu ada di aria-label tombolnya.
  const PATHS = {
    back: 'M19 12H5m6-6-6 6 6 6',
    settings:
      'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-1.6.06-1.6-.06-1.6 2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.8-1.6L13.8 2h-3.6l-.4 2.3a7.6 7.6 0 0 0-2.8 1.6l-2.4-.9-2 3.4 2 1.6-.06 1.6.06 1.6-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.8 1.6l.4 2.3h3.6l.4-2.3a7.6 7.6 0 0 0 2.8-1.6l2.4.9 2-3.4z',
    search: 'm20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
    arrowRight: 'M5 12h14m-6-6 6 6-6 6',
    send: 'M12 19V5m-6 6 6-6 6 6',
    attach: 'M12 7v10m-5-5h10M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    shield: 'M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2 2 4-4',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    hourglass: 'M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v10h-13z M12 15v2',
    chevron: 'm9 6 6 6-6 6',
    image: 'M4 5h16v14H4zM4 15l4.5-4.5L13 15m-1-1 2.5-2.5L20 17M15.5 8.5h.01',
    exchange: 'M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4',
    signature: 'M14.5 5.5l4 4L9 19H5v-4l9.5-9.5ZM3 22h18',
    hash: 'M10 3 8 21M16 3l-2 18M4 8.5h16M3.5 15.5h16',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width={name === 'more' ? 3 : 1.5}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"><path d={PATHS[name]} /></svg
>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
