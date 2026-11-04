// Applies the page-text corrections listed in content-patches.js once the page is ready.
import { applyContentPatches } from './content-patches.js';

document.addEventListener('DOMContentLoaded', () => applyContentPatches());
