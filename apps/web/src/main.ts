import { mount } from 'svelte';
import App from './App.svelte';
import { applyTheme, readTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/base.css';

applyTheme(readTheme());

const target = document.getElementById('app');
if (!target) throw new Error('#app tidak ditemukan');

export default mount(App, { target });
