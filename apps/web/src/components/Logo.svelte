<script lang="ts">
  // Logo blackchat: gelembung pesan dengan dua baris tersensor; sudut kanan atas melebur jadi piksel
  // (gema efek lebur, PRD §10.4). Murni dekoratif: nama aplikasi selalu ada sebagai teks di dekatnya.
  let { size = 28, animated = false }: { size?: number; animated?: boolean } = $props();
</script>

<svg
  class="logo"
  class:animated
  viewBox="0 0 32 32"
  width={size}
  height={size}
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  <path fill-rule="evenodd" d="M2 7h18v2h2v2h4v12H12l-5 5v-5H2z M6 13h12v2.5H6z M6 17.5h7v2.5H6z" />
  <rect class="p p1" x="22" y="7" width="2" height="2" />
  <rect class="p p2" x="26" y="6" width="2" height="2" />
  <rect class="p p3" x="24" y="3" width="2" height="2" />
  <rect class="p p4" x="28.5" y="2" width="1.5" height="1.5" />
</svg>

<style>
  .logo {
    display: block;
    flex: none;
    overflow: visible;
  }
  .p1 {
    opacity: 0.85;
  }
  .p2 {
    opacity: 0.6;
  }
  .p3 {
    opacity: 0.45;
  }
  .p4 {
    opacity: 0.3;
  }
  /* Piksel terus terlepas ke atas lalu muncul lagi: pelan, tidak mencuri perhatian. */
  .animated .p {
    animation: drift 3.2s var(--ease-out) infinite;
  }
  .animated .p2 {
    animation-delay: 0.5s;
  }
  .animated .p3 {
    animation-delay: 1.1s;
  }
  .animated .p4 {
    animation-delay: 1.7s;
  }
  @keyframes drift {
    0% {
      transform: translate(0, 0);
    }
    70% {
      opacity: 0;
      transform: translate(1.5px, -5px);
    }
    71% {
      opacity: 0;
      transform: translate(0, 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .animated .p {
      animation: none;
    }
  }
</style>
