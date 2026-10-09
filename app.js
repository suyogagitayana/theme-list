'use strict';

const API_URL = 'https://api.wordpress.org/themes/info/1.2/';
const PAGE_SIZE = 18;
const $ = (id) => document.getElementById(id);
const browseLabels = { popular: 'Popular themes', new: 'Newest themes', updated: 'Recently updated themes', featured: 'Featured themes', saved: 'Saved themes' };
const fallbackFeatures = {
  Layout: ['grid-layout', 'one-column', 'two-columns', 'left-sidebar', 'right-sidebar', 'wide-blocks'],
  Features: ['full-site-editing', 'accessibility-ready', 'block-patterns', 'custom-colors', 'custom-logo', 'featured-images', 'style-variations', 'translation-ready'],
  Subject: ['blog', 'e-commerce', 'education', 'news', 'photography', 'portfolio']
};
let features = fallbackFeatures;
let themes = [];
let total = 0;
let pages = 1;
let loading = false;
let requestController;
let detailController;
let detailToken = 0;
const detailCache = new Map();
const compared = new Map();

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const validSlug = (value) => typeof value === 'string' && value.length <= 200 && /^[a-z0-9][a-z0-9-]*$/.test(value);
const storedThemes = readStorage('theme-explorer-saved', []);
const saved = new Map(normalizeThemes(storedThemes, 100).map(t => [t.slug, t]));
let state;

// Decode API HTML as inert text, then escape it before placing it in our markup.
function plain(value) {
  const doc = new DOMParser().parseFromString(String(value ?? ''), 'text/html');
  return doc.body.textContent.trim();
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
const text = (value) => escapeHTML(plain(value));
const screenshotHosts = ['ts.w.org', 'themes.svn.wordpress.org', 'i0.wp.com', 'i1.wp.com', 'i2.wp.com'];
function safeURL(value, fallback = '', allowedHosts = []) {
  try {
    if (typeof value !== 'string' || value.length > 2048) return fallback;
    const url = new URL(String(value).startsWith('//') ? `https:${value}` : value);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname) && !url.username && !url.password && !url.port ? url.href : fallback;
  } catch { return fallback; }
}
const directoryURL = (theme) => `https://wordpress.org/themes/${encodeURIComponent(theme.slug)}/`;
const previewURL = (theme) => safeURL(theme.preview_url, `https://wp-themes.com/${encodeURIComponent(theme.slug)}/`, ['wp-themes.com']);
function screenshotURL(theme) { return safeURL(theme.screenshot_url, '', screenshotHosts); }
function authorName(theme) {
  return plain(typeof theme.author === 'object' && theme.author ? theme.author.display_name || theme.author.user_nicename : theme.author) || 'Theme author';
}
function authorUsername(theme) { return typeof theme.author === 'object' && theme.author ? theme.author.user_nicename || '' : ''; }
function tagKeys(theme) {
  const tags = Array.isArray(theme.tags) ? theme.tags : theme.tags && typeof theme.tags === 'object' ? Object.keys(theme.tags) : [];
  return [...new Set(tags.filter(validSlug))].slice(0, 60);
}
function labelTag(tag) {
  const labels = { 'full-site-editing': 'Block themes', 'e-commerce': 'E-commerce', 'rtl-language-support': 'RTL language support', 'block-patterns': 'Block editor patterns', 'block-styles': 'Block editor styles' };
  return Object.hasOwn(labels, tag) ? labels[tag] : tag.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}
function normalizeTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validSlug(value.slug)) return null;
  const string = (field, max = 500) => typeof value[field] === 'string' ? value[field].slice(0, max) : '';
  const count = (field) => {
    const candidate = value[field];
    if (typeof candidate !== 'number' && typeof candidate !== 'string') return undefined;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(Math.floor(parsed), Number.MAX_SAFE_INTEGER) : undefined;
  };
  const author = value.author && typeof value.author === 'object' && !Array.isArray(value.author)
    ? { display_name: typeof value.author.display_name === 'string' ? value.author.display_name.slice(0, 500) : '', user_nicename: typeof value.author.user_nicename === 'string' ? value.author.user_nicename.slice(0, 200) : '' }
    : typeof value.author === 'string' ? value.author.slice(0, 500) : '';
  return {
    slug: value.slug, name: string('name') || value.slug, author, tags: tagKeys(value),
    description: string('description', 64000), version: string('version', 100), last_updated: string('last_updated', 100),
    requires: string('requires', 100), requires_php: string('requires_php', 100), tested: string('tested', 100),
    preview_url: string('preview_url', 2048), screenshot_url: string('screenshot_url', 2048), download_link: string('download_link', 2048),
    active_installs: count('active_installs'), downloaded: count('downloaded'), num_ratings: count('num_ratings'), rating: Math.min(100, count('rating') || 0)
  };
}
function normalizeThemes(items, limit) {
  return Array.isArray(items) ? items.slice(0, limit).map(normalizeTheme).filter(Boolean) : [];
}
function number(value) { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0); }
function installs(theme) { return theme.active_installs == null ? 'Not reported' : `${number(theme.active_installs)}+`; }
function date(value) {
  if (!value) return 'Not reported';
  const parsed = new Date(String(value).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? 'Not reported' : parsed.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function rating(theme) {
  return Number(theme.num_ratings) > 0 ? `${(Number(theme.rating || 0) / 20).toFixed(1)} / 5 (${number(theme.num_ratings)} reviews)` : 'No reviews yet';
}
function announce(message) { $('announcement').textContent = message; }

function readState() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || readStorage('theme-explorer-view', 'grid');
  return {
    q: (params.get('q') || '').slice(0, 200),
    browse: Object.hasOwn(browseLabels, params.get('browse')) ? params.get('browse') : 'popular',
    tags: [...new Set((params.get('tags') || '').split(',').filter(validSlug))].slice(0, 40),
    author: (params.get('author') || '').slice(0, 100),
    page: Math.min(100000, Math.max(1, parseInt(params.get('page'), 10) || 1)),
    sort: ['directory', 'installs', 'rating', 'updated', 'name'].includes(params.get('sort')) ? params.get('sort') : 'directory',
    view: view === 'list' ? 'list' : 'grid'
  };
}
function syncURL(replace = false) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.browse !== 'popular') params.set('browse', state.browse);
  if (state.tags.length) params.set('tags', state.tags.join(','));
  if (state.author) params.set('author', state.author);
  if (state.page > 1) params.set('page', state.page);
  if (state.sort !== 'directory') params.set('sort', state.sort);
  if (state.view !== 'grid') params.set('view', state.view);
  const url = `${location.pathname}${params.size ? '?' + params : ''}${location.hash}`;
  if (url !== location.pathname + location.search + location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
function navigate(changes, scroll = false) {
  state = { ...state, page: 1, ...changes };
  syncURL(); syncControls(); loadThemes();
  if (scroll) {
    $('results').scrollIntoView({ behavior: 'instant', block: 'start' });
    $('results').focus({ preventScroll: true });
  }
}
function syncControls() {
  $('search-input').value = state.q;
  $('author-input').value = state.author;
  $('sort-select').value = state.sort;
  document.querySelectorAll('[data-browse]').forEach(button => button.setAttribute('aria-pressed', button.dataset.browse === state.browse));
  ['grid', 'list'].forEach(view => $(`view-${view}`).setAttribute('aria-pressed', state.view === view));
  $('theme-results').classList.toggle('theme-list', state.view === 'list');
  $('saved-count').textContent = saved.size;
  const count = state.tags.length + (state.author ? 1 : 0);
  $('filter-count').hidden = !count;
  $('filter-count').textContent = count;
  document.querySelectorAll('input[name="feature"]').forEach(input => { input.checked = state.tags.includes(input.value); });
  const chips = state.tags.map(tag => `<button class="filter-chip" data-remove-tag="${escapeHTML(tag)}" aria-label="Remove ${escapeHTML(labelTag(tag))} filter">${escapeHTML(labelTag(tag))} <span aria-hidden="true">×</span></button>`);
  if (state.author) chips.push(`<button class="filter-chip" data-remove-author aria-label="Remove author filter">Author: ${escapeHTML(state.author)} <span aria-hidden="true">×</span></button>`);
  if (state.q) chips.unshift(`<button class="filter-chip" data-remove-query aria-label="Clear search">Search: ${escapeHTML(state.q)} <span aria-hidden="true">×</span></button>`);
  $('active-filters').innerHTML = chips.join('');
  $('active-filters').hidden = !chips.length;
  $('results-title').textContent = state.browse === 'saved' ? 'Saved themes' : state.q ? `Results for “${state.q}”` : state.tags.length || state.author ? 'Matching themes' : browseLabels[state.browse];
  document.title = state.q ? `${state.q} — WordPress themes | Theme Explorer` : state.tags.length ? `${state.tags.map(labelTag).join(', ')} — Theme Explorer` : 'Theme Explorer — Find your next WordPress theme';
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
  robots.content = location.search ? 'noindex,follow' : 'index,follow';
}

function renderFeatures() {
  // Include tags from shared URLs even if the API's feature list changes.
  const groups = Object.fromEntries(Object.entries(features).map(([group, tags]) => [group, [...tags]]));
  const known = Object.values(groups).flat();
  const extra = state.tags.filter(tag => !known.includes(tag));
  if (extra.length) groups.Other = extra;
  $('feature-groups').innerHTML = Object.entries(groups).map(([group, tags]) => `<fieldset><legend>${escapeHTML(group)}</legend><div class="feature-options">${tags.map(tag => `<label><input name="feature" type="checkbox" value="${escapeHTML(tag)}" ${state.tags.includes(tag) ? 'checked' : ''}>${escapeHTML(labelTag(tag))}</label>`).join('')}</div></fieldset>`).join('');
}
async function fetchAPI(action, args, signal) {
  const params = new URLSearchParams({ action });
  Object.entries(args).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => params.append(`request[${key}][]`, item));
    else params.set(`request[${key}]`, value);
  });
  if (action !== 'feature_list') {
    ['description', 'tags', 'rating', 'num_ratings', 'active_installs', 'last_updated', 'downloaded', 'download_link', 'requires', 'requires_php', 'tested'].forEach(field => params.set(`request[fields][${field}]`, 'true'));
  }
  const response = await fetch(`${API_URL}?${params}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`Directory returned ${response.status}`);
  const data = await response.json();
  if (!data || data.error) throw new Error('Invalid directory response');
  return data;
}
async function loadFeatures() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const data = await fetchAPI('feature_list', {}, controller.signal);
    const entries = Object.entries(data).filter(([, tags]) => Array.isArray(tags) && tags.every(validSlug));
    if (!entries.length) throw new Error('No feature groups');
    // Preserve filter selections made while the feature request was in flight.
    const draft = [...document.querySelectorAll('input[name="feature"]:checked')].map(input => input.value);
    features = Object.fromEntries(entries);
    renderFeatures();
    document.querySelectorAll('input[name="feature"]').forEach(input => { input.checked = draft.includes(input.value); });
  } catch { $('feature-status').hidden = false; } finally { clearTimeout(timeout); }
}
function setLoading(value) {
  loading = value;
  $('loading-state').hidden = !value;
  $('theme-results').hidden = value;
  $('theme-results').setAttribute('aria-busy', String(value));
  $('error-state').hidden = true;
  $('empty-state').hidden = true;
  $('pagination').hidden = true;
  if (value) $('status-text').textContent = 'Loading themes…';
}
async function loadThemes() {
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  setLoading(true);
  if (state.browse === 'saved') {
    themes = [...saved.values()].filter(theme => {
      const query = state.q.toLowerCase();
      return (!query || `${plain(theme.name)} ${plain(theme.description)} ${authorName(theme)} ${tagKeys(theme).join(' ')}`.toLowerCase().includes(query)) && state.tags.every(tag => tagKeys(theme).includes(tag)) && (!state.author || authorUsername(theme).toLowerCase() === state.author.toLowerCase());
    });
    total = themes.length; pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, pages); syncURL(true);
    // Sort the whole local shortlist before pagination.
    themes = sortedThemes(themes).slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    setLoading(false); renderThemes(); return;
  }
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const args = { page: state.page, per_page: PAGE_SIZE, browse: state.browse };
    if (state.q) args.search = state.q;
    if (state.tags.length) args.tag = state.tags;
    if (state.author) args.author = state.author;
    const data = await fetchAPI('query_themes', args, controller.signal);
    if (controller !== requestController) return;
    if (!Array.isArray(data.themes) || !data.info) throw new Error('Invalid theme list');
    themes = normalizeThemes(data.themes, PAGE_SIZE);
    total = Math.max(0, Number(data.info.results) || 0);
    pages = Math.max(1, Number(data.info.pages) || 1);
    if (state.page > pages) { state.page = pages; syncURL(true); loadThemes(); return; }
    setLoading(false); renderThemes();
  } catch (error) {
    if (controller !== requestController) return;
    themes = []; setLoading(false);
    $('theme-results').replaceChildren();
    $('error-state').hidden = false;
    $('error-message').textContent = error.name === 'AbortError' ? 'WordPress.org is taking a while to respond. Try again in a moment.' : 'Check your connection and try again. We’ve kept your search and filters.';
    $('status-text').textContent = 'Themes couldn’t be loaded';
  } finally { clearTimeout(timeout); }
}
function sortedThemes(items) {
  const copy = [...items];
  const sorters = {
    installs: (a, b) => (Number(b.active_installs) || 0) - (Number(a.active_installs) || 0),
    rating: (a, b) => (Number(b.num_ratings) > 0 ? Number(b.rating) || 0 : -1) - (Number(a.num_ratings) > 0 ? Number(a.rating) || 0 : -1) || (Number(b.num_ratings) || 0) - (Number(a.num_ratings) || 0),
    updated: (a, b) => String(b.last_updated || '').localeCompare(String(a.last_updated || '')),
    name: (a, b) => plain(a.name).localeCompare(plain(b.name))
  };
  return sorters[state.sort] ? copy.sort(sorters[state.sort]) : copy;
}
function imageMarkup(theme, className = '', eager = false) {
  const url = screenshotURL(theme);
  return url ? `<img src="${escapeHTML(url)}" alt="${text(theme.name)} theme screenshot" width="600" height="450" class="${className}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : `<div class="image-fallback"><span aria-hidden="true">t.</span>Preview unavailable</div>`;
}
function saveIcon(isSaved) {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z" stroke-linejoin="round"/></svg>`;
}
function attachImageFallbacks(container) {
  container.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
    const fallback = document.createElement('div'); fallback.className = 'image-fallback';
    fallback.innerHTML = '<span aria-hidden="true">t.</span>Preview unavailable';
    img.replaceWith(fallback);
  }, { once: true }));
}
function renderThemes() {
  if (loading) return;
  const start = total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  $('status-text').textContent = total ? `${start}–${Math.min(start + themes.length - 1, total)} of ${total.toLocaleString('en')} ${state.browse === 'saved' ? 'saved themes · stored on this browser' : 'themes'}` : '0 themes';
  $('theme-results').innerHTML = sortedThemes(themes).map((theme, index) => {
    const slug = escapeHTML(theme.slug);
    const isSaved = saved.has(theme.slug);
    return `<article class="theme-card"><div class="theme-preview"><button class="preview-button" data-details="${slug}" aria-label="View ${text(theme.name)} details">${imageMarkup(theme, '', index < 3)}</button><button class="save-button" data-save="${slug}" aria-label="${isSaved ? 'Unsave' : 'Save'} ${text(theme.name)}" aria-pressed="${isSaved}" title="${isSaved ? 'Remove from saved themes' : 'Save theme'}">${saveIcon(isSaved)}</button></div><div class="card-body"><div class="card-heading"><h3><button class="theme-name" data-details="${slug}">${text(theme.name)}</button></h3><span class="rating" aria-label="${escapeHTML(rating(theme))}">${Number(theme.num_ratings) > 0 ? `<span class="star" aria-hidden="true">★</span>${(Number(theme.rating || 0) / 20).toFixed(1)}<small>(${number(theme.num_ratings)})</small>` : '<small>No reviews</small>'}</span></div><p class="author">by ${escapeHTML(authorName(theme))}</p><div class="theme-stats"><span><strong>${installs(theme)}</strong> active installs</span><span>Updated ${date(theme.last_updated)}</span></div><div class="card-bottom"><span class="theme-type">${tagKeys(theme).includes('full-site-editing') ? 'Block theme' : 'Classic theme'}</span><div class="card-links"><button data-details="${slug}">Details</button><a href="${escapeHTML(previewURL(theme))}" target="_blank" rel="noopener noreferrer" aria-label="Preview ${text(theme.name)} in a new tab">Preview ↗</a></div></div><label class="compare-option"><input type="checkbox" data-compare="${slug}" ${compared.has(theme.slug) ? 'checked' : ''}> Compare<span class="sr-only"> ${text(theme.name)}</span></label></div></article>`;
  }).join('');
  attachImageFallbacks($('theme-results'));
  $('theme-results').hidden = !themes.length;
  $('empty-state').hidden = !!themes.length;
  $('empty-title').textContent = state.browse === 'saved' && !saved.size ? 'No saved themes yet' : 'No themes found';
  $('empty-copy').textContent = state.browse === 'saved' && !saved.size ? 'See something you like? Click the bookmark on a theme to save it here.' : 'Try a different search or remove a filter.';
  $('pagination').hidden = pages <= 1 || !total;
  $('page-info').textContent = `Page ${state.page.toLocaleString('en')} of ${pages.toLocaleString('en')}`;
  $('previous-page').disabled = state.page <= 1;
  $('next-page').disabled = state.page >= pages;
}
function findTheme(slug) { return themes.find(theme => theme.slug === slug) || saved.get(slug) || compared.get(slug); }
function toggleSave(slug) {
  const theme = findTheme(slug);
  if (!theme) return;
  if (saved.has(slug)) { saved.delete(slug); announce(`${plain(theme.name)} removed from saved themes.`); }
  else {
    if (saved.size >= 100) { announce('You’ve saved 100 themes. Remove one to make room for another.'); return; }
    saved.set(slug, theme); announce(`${plain(theme.name)} saved.`);
  }
  if (!writeStorage('theme-explorer-saved', [...saved.values()])) announce('Your browser couldn’t save this list. It will be lost when you close or reload the page.');
  syncControls();
  if (state.browse === 'saved') loadThemes(); else renderThemes();
}
function updateCompareBar() {
  $('compare-bar').hidden = !compared.size;
  $('compare-summary').textContent = `${compared.size} of 3 selected`;
  $('compare-open').disabled = compared.size < 2;
}
function toggleCompare(input) {
  const slug = input.dataset.compare;
  if (input.checked) {
    if (compared.size >= 3) { input.checked = false; announce('You can compare up to three themes. Clear a selection to add another.'); return; }
    const theme = findTheme(slug); if (theme) compared.set(slug, theme);
  } else compared.delete(slug);
  updateCompareBar();
}

function openDialog() { if (!$('theme-dialog').open) $('theme-dialog').showModal(); }
function renderDetail(theme, pending = false, failed = false) {
  const description = plain(theme.description || 'Open WordPress.org for the full theme description.');
  const descriptionMarkup = description.length > 420
    ? `<p class="dialog-description">${escapeHTML(description.slice(0, 420).replace(/\s+\S*$/, ''))}…</p><details class="full-description"><summary>Read full description</summary><p class="dialog-description">${escapeHTML(description)}</p></details>`
    : `<p class="dialog-description">${escapeHTML(description)}</p>`;
  const stats = [['Active installs', installs(theme)], ['Rating', rating(theme)], ['Last updated', date(theme.last_updated)], ['Version', theme.version || 'Not reported'], ['WordPress', theme.requires ? `${theme.requires}+` : 'Not reported'], ['PHP', theme.requires_php ? `${theme.requires_php}+` : 'Not reported']];
  if (theme.tested) stats.push(['Tested up to WordPress', theme.tested]);
  if (theme.downloaded != null) stats.push(['Total downloads', Number(theme.downloaded).toLocaleString('en')]);
  const downloadURL = safeURL(theme.download_link, '', ['downloads.wordpress.org']);
  const download = downloadURL && new URL(downloadURL).pathname.startsWith('/theme/') && new URL(downloadURL).pathname.endsWith('.zip') ? downloadURL : '';
  $('dialog-content').innerHTML = `<div class="dialog-detail"><div>${imageMarkup(theme, 'detail-image', true)}<div class="detail-actions"><a class="primary-button" href="${escapeHTML(previewURL(theme))}" target="_blank" rel="noopener noreferrer">Live preview ↗</a><a class="secondary-button" href="${escapeHTML(directoryURL(theme))}" target="_blank" rel="noopener noreferrer">WordPress.org ↗</a>${download ? `<a class="secondary-button" href="${escapeHTML(download)}">Download ZIP ↓</a>` : ''}</div><p class="subtle">Install from Appearance → Themes → Add New in your WordPress dashboard, or upload the ZIP.</p></div><div><h2 id="dialog-title">${text(theme.name)}</h2><p class="author">by ${escapeHTML(authorName(theme))}</p>${descriptionMarkup}<dl class="detail-stats">${stats.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl><p class="subtle" role="status">${pending ? 'Loading full details…' : failed ? 'We couldn’t load the full details. You can check them on WordPress.org.' : 'Theme details from WordPress.org.'}</p>${failed ? `<button class="text-button" data-detail-retry="${escapeHTML(theme.slug)}">Retry details</button>` : ''}</div></div><div class="detail-extra"><h3>Features &amp; layout</h3><div class="detail-tags">${tagKeys(theme).map(tag => `<button class="filter-chip" data-detail-tag="${escapeHTML(tag)}">${escapeHTML(labelTag(tag))}</button>`).join('') || '<span class="subtle">No features reported.</span>'}</div><p class="subtle">Click a feature to see other themes that have it.</p></div>`;
  attachImageFallbacks($('dialog-content'));
}
async function openDetails(slug) {
  const theme = findTheme(slug);
  if (!theme) return;
  const token = ++detailToken;
  detailController?.abort();
  const controller = new AbortController(); detailController = controller;
  const cached = detailCache.get(slug);
  renderDetail(cached || theme, !cached); openDialog();
  if (cached) return;
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const details = await fetchAPI('theme_information', { slug }, controller.signal);
    if (!validSlug(details.slug) || details.slug !== slug) throw new Error('Invalid theme details');
    const fullTheme = normalizeTheme({ ...theme, ...details });
    detailCache.set(slug, fullTheme);
    if (saved.has(slug)) { saved.set(slug, fullTheme); writeStorage('theme-explorer-saved', [...saved.values()]); }
    if (compared.has(slug)) compared.set(slug, fullTheme);
    if (token === detailToken && $('theme-dialog').open) renderDetail(fullTheme);
  } catch {
    if (token === detailToken && $('theme-dialog').open) renderDetail(theme, false, true);
  } finally { clearTimeout(timeout); }
}
function renderComparison(items, pending = false, failed = false) {
  const rows = [
    ['Preview', theme => `${imageMarkup(theme)}<a href="${escapeHTML(previewURL(theme))}" target="_blank" rel="noopener noreferrer">Live preview ↗</a>`],
    ['Author', theme => escapeHTML(authorName(theme))], ['Theme type', theme => tagKeys(theme).includes('full-site-editing') ? 'Block theme' : 'Classic theme'],
    ['Active installs', installs], ['Rating', theme => escapeHTML(rating(theme))], ['Updated', theme => date(theme.last_updated)],
    ['Version', theme => text(theme.version || 'Not reported')], ['WordPress required', theme => theme.requires ? `${text(theme.requires)}+` : 'Not reported'], ['PHP required', theme => theme.requires_php ? `${text(theme.requires_php)}+` : 'Not reported'],
    ['Features', theme => tagKeys(theme).map(labelTag).map(escapeHTML).join(', ') || 'Not reported'],
    ['Directory', theme => `<a href="${escapeHTML(directoryURL(theme))}" target="_blank" rel="noopener noreferrer">View on WordPress.org ↗</a>`]
  ];
  $('dialog-content').innerHTML = `<h2 id="dialog-title">Compare themes</h2><p class="subtle" role="status">${pending ? 'Loading compatibility details…' : failed ? 'We couldn’t load every detail. Check WordPress.org for anything missing.' : 'Compare features, requirements, and updates before you choose.'}</p><div class="compare-scroll"><table class="compare-table"><thead><tr><th scope="col"><span class="sr-only">Attribute</span></th>${items.map(theme => `<th scope="col">${text(theme.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, format]) => `<tr><th scope="row">${escapeHTML(label)}</th>${items.map(theme => `<td>${format(theme)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  attachImageFallbacks($('dialog-content'));
}
async function openComparison() {
  if (compared.size < 2) return;
  const token = ++detailToken;
  detailController?.abort();
  const controller = new AbortController(); detailController = controller;
  const items = [...compared.values()];
  renderComparison(items, true); openDialog();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const responses = await Promise.allSettled(items.map(async theme => {
    if (detailCache.has(theme.slug)) return detailCache.get(theme.slug);
    const data = await fetchAPI('theme_information', { slug: theme.slug }, controller.signal);
    if (data.slug !== theme.slug) throw new Error('Invalid details');
    const result = normalizeTheme({ ...theme, ...data }); detailCache.set(theme.slug, result); return result;
  }));
  clearTimeout(timeout);
  if (token !== detailToken || !$('theme-dialog').open) return;
  renderComparison(responses.map((response, i) => response.status === 'fulfilled' ? response.value : items[i]), false, responses.some(response => response.status === 'rejected'));
}

function resetSearch() { navigate({ q: '', browse: 'popular', tags: [], author: '', sort: 'directory' }); }
$('search-form').addEventListener('submit', event => { event.preventDefault(); navigate({ q: $('search-input').value.trim() }); });
document.querySelectorAll('[data-browse]').forEach(button => button.addEventListener('click', () => navigate({ browse: button.dataset.browse })));
document.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => {
  const subjects = features.Subject || fallbackFeatures.Subject;
  navigate({ browse: 'popular', q: '', tags: [...state.tags.filter(tag => !subjects.includes(tag)), button.dataset.subject] });
}));
$('filter-toggle').addEventListener('click', () => {
  const expanded = $('filter-panel').hidden;
  $('filter-panel').hidden = !expanded;
  $('filter-toggle').setAttribute('aria-expanded', String(expanded));
});
$('filter-panel').addEventListener('submit', event => { event.preventDefault(); navigate({ tags: [...document.querySelectorAll('input[name="feature"]:checked')].map(input => input.value), author: $('author-input').value.trim() }); });
$('clear-filters').addEventListener('click', () => navigate({ tags: [], author: '' }));
$('active-filters').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-remove-query')) navigate({ q: '' });
  else if (button.hasAttribute('data-remove-author')) navigate({ author: '' });
  else navigate({ tags: state.tags.filter(tag => tag !== button.dataset.removeTag) });
});
$('sort-select').addEventListener('change', () => {
  state.sort = $('sort-select').value; syncURL(); syncControls();
  if (state.browse === 'saved') loadThemes(); else renderThemes();
});
['grid', 'list'].forEach(view => $(`view-${view}`).addEventListener('click', () => {
  state.view = view; writeStorage('theme-explorer-view', view); syncURL(); syncControls();
}));
$('theme-results').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.details) openDetails(button.dataset.details);
  else if (button.dataset.save) toggleSave(button.dataset.save);
});
$('theme-results').addEventListener('change', event => { if (event.target.matches('[data-compare]')) toggleCompare(event.target); });
$('previous-page').addEventListener('click', () => { if (state.page > 1) navigate({ page: state.page - 1 }, true); });
$('next-page').addEventListener('click', () => { if (state.page < pages) navigate({ page: state.page + 1 }, true); });
$('retry-button').addEventListener('click', loadThemes);
$('reset-search').addEventListener('click', resetSearch);
$('compare-open').addEventListener('click', openComparison);
$('compare-clear').addEventListener('click', () => { compared.clear(); updateCompareBar(); renderThemes(); });
$('dialog-close').addEventListener('click', () => $('theme-dialog').close());
$('theme-dialog').addEventListener('click', event => { if (event.target === $('theme-dialog')) { const rect = $('theme-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('theme-dialog').close(); } });
$('theme-dialog').addEventListener('close', () => { ++detailToken; detailController?.abort(); });
$('dialog-content').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.detailRetry) openDetails(button.dataset.detailRetry);
  if (button.dataset.detailTag) { $('theme-dialog').close(); navigate({ browse: 'popular', q: '', tags: [...new Set([...state.tags, button.dataset.detailTag])] }, true); }
});
window.addEventListener('popstate', () => { state = readState(); renderFeatures(); syncControls(); loadThemes(); });
window.addEventListener('storage', event => {
  if (event.key !== 'theme-explorer-saved') return;
  const items = readStorage('theme-explorer-saved', []); saved.clear();
  normalizeThemes(items, 100).forEach(t => saved.set(t.slug, t));
  syncControls(); if (state.browse === 'saved') loadThemes(); else renderThemes();
});
const media = window.matchMedia('(prefers-color-scheme: dark)');
function applyColorMode(mode) {
  const dark = mode === 'dark' || (mode !== 'light' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  $('color-mode').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#171e1a' : '#f7f8f5';
}
$('color-mode').addEventListener('click', () => { const mode = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; writeStorage('theme-explorer-color', mode); applyColorMode(mode); });
media.addEventListener('change', () => applyColorMode(readStorage('theme-explorer-color', null)));
applyColorMode(readStorage('theme-explorer-color', null));
state = readState();
$('loading-state').innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>').join('');
renderFeatures(); syncControls(); loadThemes(); loadFeatures();
