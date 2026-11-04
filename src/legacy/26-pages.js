// Builds the information pages (Terms, Privacy, About, Contact, How to pay an invoice, Roadmap).
// They are normal app pages: navigate('terms') shows page-terms, like every other page.
import { INFO_PAGES } from './info-pages.js';

function buildPages() {
  const content = document.querySelector('.content');
  if (!content) return;
  for (const [id, p] of Object.entries(INFO_PAGES)) {
    if (document.getElementById('page-' + id)) continue;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-' + id;
    page.innerHTML = `<div style="max-width:820px;display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;margin-bottom:6px;line-height:1.2">${p.title}</div>
        <div style="font-size:13px;color:var(--text2)">${p.summary}</div>
      </div>
      ${p.sections().join('')}
      <div><button type="button" class="btn btn-ghost btn-sm" onclick="navigate('home')">Back to dashboard</button></div>
    </div>`;
    content.appendChild(page);
  }
}

document.addEventListener('DOMContentLoaded', buildPages);
