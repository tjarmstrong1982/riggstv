/* global Globe, topojson, luxon, videojs */

// Elements
const sidebar = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburger');
const sidebarClose = document.getElementById('sidebar-close');
const categoryListEl = document.getElementById('category-list');
const countryHeaderEl = document.getElementById('country-header');
const channelListEl = document.getElementById('channel-list');
const infoPanelEl = document.getElementById('info-panel');
const videoOverlay = document.getElementById('video-overlay');
const closeVideoBtn = document.getElementById('close-video');
const favoriteBtn = document.getElementById('favorite-toggle');

// Constants
const REGION_CODE = 'AMER';

// Data caches
let regionCountries = [];
let countries = [];
let channels = [];
let feeds = [];
let streams = [];
let categories = [];
let favorites = JSON.parse(localStorage.getItem('riggs_favorites') || '[]');
let player;

// Toggle sidebar visibility
hamburger.addEventListener('click', () => {
  sidebar.classList.add('visible');
});
sidebarClose.addEventListener('click', () => {
  sidebar.classList.remove('visible');
});

closeVideoBtn.addEventListener('click', () => {
  videoOverlay.classList.add('hidden');
  if (player) {
    player.pause();
    player.reset();
  }
});

// Load data from IPTV API
async function loadData() {
  try {
    const [regionList, countryList, channelList, feedList, streamList, categoryList] =
      await Promise.all([
        fetch('https://iptv-org.github.io/api/regions.json').then(r => r.json()),
        fetch('https://iptv-org.github.io/api/countries.json').then(r => r.json()),
        fetch('https://iptv-org.github.io/api/channels.json').then(r => r.json()),
        fetch('https://iptv-org.github.io/api/feeds.json').then(r => r.json()),
        fetch('https://iptv-org.github.io/api/streams.json').then(r => r.json()),
        fetch('https://iptv-org.github.io/api/categories.json').then(r => r.json()),
      ]);

    const region = regionList.find(r => r.code === REGION_CODE);
    regionCountries = region ? region.countries : [];
    countries = countryList;
    channels = channelList;
    feeds = feedList;
    streams = streamList;
    categories = categoryList;

    populateCategoryList();
    populateCountryList();
    initGlobe();
  } catch (err) {
    console.error('Failed to load data', err);
  }
}

function populateCategoryList() {
  categories.forEach(cat => {
    // Skip NSFW category
    if (cat.id === 'xxx') return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'link-button';
    btn.textContent = cat.name;
    btn.addEventListener('click', () => filterByCategory(cat.id));
    li.appendChild(btn);
    categoryListEl.appendChild(li);
  });
}

function populateCountryList() {
  // Clear header and list
  countryHeaderEl.textContent = 'Select a country';
  channelListEl.innerHTML = '';
  // Build list of countries in region
  regionCountries.forEach(code => {
    const country = countries.find(c => c.code === code);
    if (!country) return;
    const item = document.createElement('div');
    item.className = 'country-item channel-item';
    item.textContent = country.name;
    item.addEventListener('click', () => selectCountry(code));
    channelListEl.appendChild(item);
  });
}

function selectCountry(code) {
  const country = countries.find(c => c.code === code);
  if (!country) return;
  // Update header with country name and local time
  const now = luxon.DateTime.now().setZone(getTimezoneForCountry(code));
  countryHeaderEl.innerHTML = `<h3>${country.name}</h3><p>${now.toFormat('DDD t')}</p>`;
  // Filter channels by country
  const countryChannels = channels.filter(ch => ch.country === code && !ch.is_nsfw);
  // Sort alphabetically
  countryChannels.sort((a, b) => a.name.localeCompare(b.name));
  renderChannelList(countryChannels);
}

function getTimezoneForCountry(code) {
  // Find first feed for country to get timezone; fallback to UTC
  const feed = feeds.find(f => f.broadcast_area && f.broadcast_area.some(a => a.startsWith('c/' + code)));
  if (feed && feed.timezones && feed.timezones.length) return feed.timezones[0];
  return 'UTC';
}

function renderChannelList(channelArray) {
  channelListEl.innerHTML = '';
  if (!channelArray.length) {
    channelListEl.textContent = 'No channels available';
    return;
  }
  channelArray.forEach(ch => {
    const item = document.createElement('div');
    item.className = 'channel-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'channel-name';
    nameSpan.textContent = ch.name;
    item.appendChild(nameSpan);
    // Languages
    const langSpan = document.createElement('span');
    langSpan.className = 'channel-lang';
    langSpan.textContent = (ch.categories && ch.categories[0]) || 'general';
    item.appendChild(langSpan);
    // Favorite star
    const favStar = document.createElement('button');
    favStar.className = 'icon-button';
    favStar.innerHTML = favorites.includes(ch.id) ? '★' : '☆';
    favStar.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(ch.id, favStar);
    });
    item.appendChild(favStar);
    // Click to open video
    item.addEventListener('click', () => openChannel(ch));
    channelListEl.appendChild(item);
  });
}

function toggleFavorite(channelId, starEl) {
  const idx = favorites.indexOf(channelId);
  if (idx === -1) {
    favorites.push(channelId);
  } else {
    favorites.splice(idx, 1);
  }
  localStorage.setItem('riggs_favorites', JSON.stringify(favorites));
  if (starEl) starEl.innerHTML = favorites.includes(channelId) ? '★' : '☆';
}

function openChannel(channel) {
  // Attempt to find a stream URL for the channel
  let streamUrl = null;
  // First, find any stream with channel id or feed id matching
  // find feed ids for this channel
  const chFeeds = feeds.filter(f => f.channel === channel.id);
  for (const feed of chFeeds) {
    // match streams by feed id
    const s = streams.find(str => str.feed === feed.id);
    if (s) { streamUrl = s.url; break; }
  }
  // If still not found, try match by channel name
  if (!streamUrl) {
    const lower = channel.name.toLowerCase();
    const s = streams.find(str => str.title && str.title.toLowerCase().includes(lower));
    if (s) streamUrl = s.url;
  }
  if (!streamUrl) {
    alert('No stream available for this channel.');
    return;
  }
  // Initialize player if needed
  if (!player) {
    player = videojs('video-player');
  }
  player.src({ src: streamUrl, type: 'application/x-mpegURL' });
  // Set favorite star on overlay
  updateOverlayFavorite(channel.id);
  // Show overlay
  videoOverlay.classList.remove('hidden');
}

function updateOverlayFavorite(channelId) {
  favoriteBtn.innerHTML = favorites.includes(channelId) ? '★' : '☆';
  favoriteBtn.onclick = () => {
    const isFav = favorites.includes(channelId);
    toggleFavorite(channelId);
    favoriteBtn.innerHTML = !isFav ? '★' : '☆';
  };
}

function filterByCategory(categoryId) {
  // Find channels that include this category and are in allowed region
  const filtered = channels.filter(ch => ch.categories && ch.categories.includes(categoryId) && regionCountries.includes(ch.country));
  renderChannelList(filtered);
  countryHeaderEl.innerHTML = `<h3>${categories.find(c => c.id === categoryId).name}</h3>`;
}

async function initGlobe() {
  // Load world polygons
  const world = await fetch('https://unpkg.com/world-atlas@2/countries-110m.json').then(res => res.json());
  const land = topojson.feature(world, world.objects.countries).features;
  // Build globe
  const container = document.getElementById('globe-container');
  const myGlobe = Globe()(container)
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
    .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
    .polygonsData(land)
    .polygonCapColor(feat => {
      return regionCountries.includes(countryCodeFromNumeric(feat.id)) ? 'rgba(90, 150, 255, 0.6)' : 'rgba(100, 100, 100, 0.3)';
    })
    .polygonSideColor(() => 'rgba(0, 100, 200, 0.15)')
    .polygonStrokeColor(() => '#111')
    .onPolygonClick((feat) => {
      const code = countryCodeFromNumeric(feat.id);
      if (regionCountries.includes(code)) selectCountry(code);
    });

  // Auto rotate for a nice effect
  myGlobe.controls().autoRotate = true;
  myGlobe.controls().autoRotateSpeed = 0.5;
}

// Map numeric country code to alpha-2 using a small lookup. Values taken from ISO 3166.
// For brevity, only include Americas region codes used in regionCountries.
const NUMERIC_TO_ALPHA = {
  28: 'AG', 660: 'AI', 32: 'AR', 533: 'AW', 44: 'BS', 52: 'BB', 60: 'BM', 68: 'BO',
  76: 'BR', 92: 'BZ', 124: 'CA', 152: 'CL', 170: 'CO', 188: 'CR', 192: 'CU', 212: 'DM',
  214: 'DO', 218: 'EC', 222: 'SV', 238: 'FK', 308: 'GD', 312: 'GP', 316: 'GU', 320: 'GT',
  324: 'GN', 328: 'GY', 332: 'HT', 340: 'HN', 388: 'JM', 474: 'LC', 478: 'MR', 500: 'MS',
  484: 'MX', 558: 'NI', 604: 'PE', 591: 'PA', 600: 'PY', 630: 'PR', 632: 'QA', 659: 'VC',
  662: 'LC', 670: 'SV', 740: 'SR', 780: 'TT', 840: 'US', 858: 'UY', 862: 'VE',
  328: 'GY', 192: 'CU', 214: 'DO', 218: 'EC', 222: 'SV', 308: 'GD', 320: 'GT', 324: 'GN',
  332: 'HT', 340: 'HN', 388: 'JM', 388: 'JM', 328: 'GY', 340: 'HN', 308: 'GD', 214: 'DO',
  300: 'GL', 304: 'GL', 304: 'GL', 239: 'GS', 740: 'SR', 764: 'TH', 780: 'TT', 850: 'VI',
  666: 'MF', 670: 'SV'
};

function countryCodeFromNumeric(num) {
  return NUMERIC_TO_ALPHA[num] || null;
}

// Initialize video player overlay
document.addEventListener('DOMContentLoaded', () => {
  loadData();
});
