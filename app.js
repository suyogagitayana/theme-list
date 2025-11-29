const API_URL = 'https://api.wordpress.org/themes/info/1.2/';
const LIMIT = 60;
let allThemes = [];
let isFetching = false;
let currentView = 'list';
let currentSort = 'api_position';

const app = document.getElementById('app');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const sortSelect = document.getElementById('sort-select');
const listViewContainer = document.getElementById('list-view-container');
const gridViewContainer = document.getElementById('grid-view-container');
const listItems = document.getElementById('list-items');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const themeCount = document.getElementById('theme-count');
const resultsTitle = document.getElementById('results-title');
const statusText = document.getElementById('status-text');

window.onload = () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
        updateDarkModeIcon();
    }

    executeSearch('');
    updateViewButtons();
};

function switchView(view) {
    currentView = view;
    updateViewButtons();
    renderThemes();
}

function updateViewButtons() {
    const listBtn = document.getElementById('view-list-btn');
    const gridBtn = document.getElementById('view-grid-btn');

    if (currentView === 'list') {
        listBtn.classList.add('bg-white', 'shadow-sm', 'text-indigo-600', 'dark:bg-slate-600', 'dark:text-indigo-400');
        listBtn.classList.remove('text-slate-500', 'dark:text-slate-400');

        gridBtn.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600', 'dark:bg-slate-600', 'dark:text-indigo-400');
        gridBtn.classList.add('text-slate-500', 'dark:text-slate-400');
    } else {
        gridBtn.classList.add('bg-white', 'shadow-sm', 'text-indigo-600', 'dark:bg-slate-600', 'dark:text-indigo-400');
        gridBtn.classList.remove('text-slate-500', 'dark:text-slate-400');

        listBtn.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600', 'dark:bg-slate-600', 'dark:text-indigo-400');
        listBtn.classList.add('text-slate-500', 'dark:text-slate-400');
    }

    if (!isFetching) {
        if (currentView === 'list') {
            if (listViewContainer) listViewContainer.classList.remove('hidden');
            if (gridViewContainer) gridViewContainer.classList.add('hidden');
        } else {
            if (listViewContainer) listViewContainer.classList.add('hidden');
            if (gridViewContainer) gridViewContainer.classList.remove('hidden');
        }
    }
}

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('moon-icon').style.display = isDark ? 'block' : 'none';
    document.getElementById('sun-icon').style.display = isDark ? 'none' : 'block';
}

async function executeSearch(query) {
    if (isFetching) return;
    isFetching = true;

    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    listViewContainer.classList.add('hidden');
    gridViewContainer.classList.add('hidden');
    searchButton.disabled = true;
    searchButton.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Searching...';

    const isSearch = query.length > 0;
    resultsTitle.textContent = isSearch ? `Results for "${query}"` : 'Popular Themes';
    statusText.textContent = isSearch ? 'Searching directory...' : 'Top rated themes';

    const params = new URLSearchParams({
        'action': 'query_themes',
        'request[page]': 1,
        'request[per_page]': LIMIT,
        ...(isSearch ? { 'request[search]': query } : { 'request[browse]': 'popular' }),
        'request[fields][active_installs]': true,
        'request[fields][downloaded]': true,
        'request[fields][slug]': true,
        'request[fields][name]': true,
        'request[fields][last_updated]': true,
        'request[fields][screenshot_url]': true,
        'request[fields][version]': true,
        'request[fields][rating]': true,
        'request[fields][num_ratings]': true,
    });

    try {
        console.log('Fetching themes from:', `${API_URL}?${params.toString()}`);
        const res = await fetch(`${API_URL}?${params.toString()}`);

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log('API Response:', data);

        if (data && data.themes) {
            allThemes = data.themes;
        } else {
            console.warn('Unexpected API response structure:', data);
            allThemes = [];
        }

        sortThemes();

    } catch (err) {
        console.error('Fetch error:', err);
        statusText.textContent = `Error: ${err.message}`;
        statusText.classList.add('text-red-500');
        alert(`Failed to fetch themes: ${err.message}`);
    } finally {
        isFetching = false;
        if (loadingState) loadingState.classList.add('hidden');
        if (searchButton) {
            searchButton.disabled = false;
            searchButton.innerHTML = '<span>Search</span>';
        }

        if (allThemes.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            if (themeCount) themeCount.textContent = '0 Themes';
        } else {
            if (currentView === 'list') {
                if (listViewContainer) listViewContainer.classList.remove('hidden');
            } else {
                if (gridViewContainer) gridViewContainer.classList.remove('hidden');
            }
        }
    }
}

function sortThemes() {
    const field = sortSelect ? sortSelect.value : 'api_position';
    currentSort = field;

    const query = searchInput ? searchInput.value.trim() : '';
    if (query.length === 0) {
        switch (field) {
            case 'api_position':
                if (resultsTitle) resultsTitle.textContent = 'Popular Themes';
                if (statusText) statusText.textContent = 'Top rated themes';
                break;
            case 'active_installs':
                if (resultsTitle) resultsTitle.textContent = 'Most Popular Themes';
                if (statusText) statusText.textContent = 'Ordered by active installations';
                break;
            case 'last_updated':
                if (resultsTitle) resultsTitle.textContent = 'Latest Themes';
                if (statusText) statusText.textContent = 'Ordered by most recently updated';
                break;
            case 'downloaded':
                if (resultsTitle) resultsTitle.textContent = 'Most Downloaded Themes';
                if (statusText) statusText.textContent = 'Ordered by total downloads';
                break;
        }
    }

    if (field === 'api_position') {
    } else {
        allThemes.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            if (field === 'last_updated') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }

            return (valB || 0) - (valA || 0);
        });
    }
    renderThemes();
}

function renderThemes() {
    if (themeCount) themeCount.textContent = `${allThemes.length} Themes`;

    if (currentView === 'list') {
        renderListView();
    } else {
        renderGridView();
    }
}

function getScreenshotUrl(slug, version) {
    const v = version || '1.0';
    return `https://i0.wp.com/themes.svn.wordpress.org/${slug}/${v}/screenshot.png?w=600&strip=all`;
}

function handleImageError(img) {
    const currentSrc = img.src;
    if (currentSrc.includes('screenshot.png')) {
        img.src = currentSrc.replace('screenshot.png', 'screenshot.jpg');
    } else if (currentSrc.includes('screenshot.jpg')) {
        img.src = 'https://placehold.co/600x450?text=No+Image';
        img.onerror = null;
    } else {
        img.onerror = null;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

function renderListView() {
    if (!listItems) return;
    listItems.innerHTML = '';

    if (!Array.isArray(allThemes)) {
        console.error('allThemes is not an array:', allThemes);
        return;
    }

    allThemes.forEach((theme, index) => {
        const thumb = getScreenshotUrl(theme.slug, theme.version);
        const link = `https://wordpress.org/themes/${theme.slug}/`;

        const row = document.createElement('div');
        row.className = 'grid list-grid-layout gap-4 py-2 px-4 items-center hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors animate-fade-in text-sm';
        row.style.animationDelay = `${index * 30}ms`;

        row.innerHTML = `
            <span class="font-bold text-slate-400">#${index + 1}</span>
            
            <div class="relative group">
                <img src="${thumb}" class="w-12 h-8 object-cover rounded shadow-sm border border-slate-200 dark:border-slate-600" loading="lazy" onerror="handleImageError(this)">
            </div>
            
            <div class="min-w-0">
                <h3 class="font-semibold text-slate-900 dark:text-white truncate" title="${theme.name}">${theme.name}</h3>
                <a href="${link}" target="_blank" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate block">
                    wordpress.org/themes/${theme.slug}
                </a>
            </div>
            
            <span class="text-right text-xs text-slate-600 dark:text-slate-400 font-mono">${theme.version}</span>
            <span class="text-right text-xs text-slate-600 dark:text-slate-400">${formatDate(theme.last_updated)}</span>
            <span class="text-right text-xs font-medium text-slate-700 dark:text-slate-300">${theme.active_installs?.toLocaleString()}+</span>
            <span class="text-right text-xs text-slate-500 dark:text-slate-500">${formatNumber(theme.downloaded)}</span>
        `;
        listItems.appendChild(row);
    });
}

function renderGridView() {
    if (!gridViewContainer) return;
    gridViewContainer.innerHTML = '';

    if (!Array.isArray(allThemes)) {
        console.error('allThemes is not an array:', allThemes);
        return;
    }

    allThemes.forEach((theme, index) => {
        const thumb = getScreenshotUrl(theme.slug, theme.version);
        const link = `https://wordpress.org/themes/${theme.slug}/`;

        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-300 hover:-translate-y-1 animate-fade-in flex flex-col';
        card.style.animationDelay = `${index * 50}ms`;

        card.innerHTML = `
            <div class="relative aspect-[4/3] overflow-hidden group">
                <img src="${thumb}" class="w-full h-full object-cover object-top" loading="lazy" onerror="handleImageError(this)">
                <div class="absolute top-2 right-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                    v${theme.version}
                </div>
            </div>
            
            <div class="p-3 flex-grow flex flex-col">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-white line-clamp-1" title="${theme.name}">${theme.name}</h3>
                </div>
                
                <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-3">
                    <div class="flex items-center gap-1" title="Active Installs">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path></svg>
                        <span>${formatNumber(theme.active_installs)}</span>
                    </div>
                    <div class="flex items-center gap-1" title="Last Updated">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>${formatDate(theme.last_updated)}</span>
                    </div>
                </div>

                <div class="mt-auto pt-2 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                    <a href="${link}" target="_blank" class="flex-1 text-center py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-xs font-medium transition-colors">
                        Details
                    </a>
                </div>
            </div>
        `;
        gridViewContainer.appendChild(card);
    });
}

if (searchButton) {
    searchButton.addEventListener('click', () => {
        if (searchInput) executeSearch(searchInput.value.trim());
    });
}

if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeSearch(searchInput.value.trim());
    });
}

if (sortSelect) {
    sortSelect.addEventListener('change', sortThemes);
}
