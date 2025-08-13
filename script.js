/* Riggs TV – main script
 *
 * This file handles loading IPTV data from the iptv‑org API, rendering an
 * interactive 3‑D globe of the Americas via Globe.gl and Three.js, and
 * presenting lists of countries and channels.  It also manages favourites,
 * categories, random channel selection and local time display using Luxon.
 *
 * All variables are module‑level to simplify reuse across helper functions.
 */

// Cached data arrays
let regionCountries = [];
let countries = [];
let channels = [];
let feeds = [];
let streams = [];
let categories = [];
let timezones = [];

// Favourite channel IDs are stored under the key "riggs_favorites"
let favorites = JSON.parse(localStorage.getItem('riggs_favorites')) || [];

// Currently selected country or category
let selectedCountry = null;
let selectedCategory = null;

// Video.js player instance
let player = null;

// Reference to the globe instance so we can update it later if needed
let globeInstance;

// Interval ID for updating the local time display
let localTimeIntervalId = null;

/* Approximate centroid coordinates for each American country.  These values
 * correspond roughly to the geographic centres or capital cities of each
 * territory.  Countries without a defined centroid will not receive a globe
 * marker.
 */
const COUNTRY_COORDS = {
  AG: { lat: 17.0608, lng: -61.7964 }, // Antigua and Barbuda
  AI: { lat: 18.2206, lng: -63.0686 }, // Anguilla
  AR: { lat: -34.6037, lng: -58.3816 }, // Argentina (Buenos Aires)
  AW: { lat: 12.5211, lng: -69.9683 }, // Aruba
  BB: { lat: 13.1939, lng: -59.5432 }, // Barbados
  BL: { lat: 17.9, lng: -62.8333 }, // Saint Barthélemy
  BM: { lat: 32.3078, lng: -64.7505 }, // Bermuda
  BO: { lat: -16.2902, lng: -63.5887 }, // Bolivia
  BR: { lat: -15.7939, lng: -47.8828 }, // Brazil (Brasilia)
  BS: { lat: 25.0258, lng: -78.0359 }, // Bahamas
  BV: { lat: -54.4208, lng: 3.3464 }, // Bouvet Island
  BZ: { lat: 17.5046, lng: -88.1962 }, // Belize
  CA: { lat: 56.1304, lng: -106.3468 }, // Canada
  CL: { lat: -33.4489, lng: -70.6693 }, // Chile
  CO: { lat: 4.5709, lng: -74.2973 }, // Colombia
  CR: { lat: 9.7489, lng: -83.7534 }, // Costa Rica
  CU: { lat: 21.5218, lng: -77.7812 }, // Cuba
  CW: { lat: 12.1696, lng: -68.99 }, // Curaçao
  DM: { lat: 15.4149, lng: -61.3709 }, // Dominica
  DO: { lat: 18.7357, lng: -70.1627 }, // Dominican Republic
  EC: { lat: -1.8312, lng: -78.1834 }, // Ecuador
  FK: { lat: -51.7963, lng: -59.5236 }, // Falkland Islands
  GD: { lat: 12.1165, lng: -61.6790 }, // Grenada
  GF: { lat: 3.9339, lng: -53.1258 }, // French Guiana
  GL: { lat: 64.1835, lng: -51.7216 }, // Greenland
  GP: { lat: 16.265, lng: -61.551 }, // Guadeloupe
  GS: { lat: -54.4069, lng: -36.5879 }, // South Georgia and South Sandwich Islands
  GT: { lat: 14.6349, lng: -90.5069 }, // Guatemala
  GY: { lat: 4.8604, lng: -58.9302 }, // Guyana
  HN: { lat: 15.199, lng: -86.2419 }, // Honduras
  HT: { lat: 18.9712, lng: -72.2852 }, // Haiti
  JM: { lat: 18.1096, lng: -77.2975 }, // Jamaica
  KN: { lat: 17.3578, lng: -62.7829 }, // Saint Kitts and Nevis
  KY: { lat: 19.3133, lng: -81.2546 }, // Cayman Islands
  LC: { lat: 13.9094, lng: -60.9789 }, // Saint Lucia
  MF: { lat: 18.0708, lng: -63.0501 }, // Saint Martin (French)
  MQ: { lat: 14.6415, lng: -61.0242 }, // Martinique
  MS: { lat: 16.7425, lng: -62.1874 }, // Montserrat
  MX: { lat: 23.6345, lng: -102.5528 }, // Mexico
  NI: { lat: 12.8654, lng: -85.2072 }, // Nicaragua
  PA: { lat: 8.5379, lng: -80.7821 }, // Panama
  PE: { lat: -9.1899, lng: -75.0151 }, // Peru
  PM: { lat: 46.9419, lng: -56.2711 }, // Saint Pierre and Miquelon
  PR: { lat: 18.2208, lng: -66.5901 }, // Puerto Rico
  PY: { lat: -23.4425, lng: -58.4438 }, // Paraguay
  SR: { lat: 3.9193, lng: -56.0278 }, // Suriname
  SV: { lat: 13.7942, lng: -88.8965 }, // El Salvador
  SX: { lat: 18.0425, lng: -63.0548 }, // Sint Maarten (Dutch)
  TC: { lat: 21.694, lng: -71.7979 }, // Turks and Caicos Islands
  TT: { lat: 10.6918, lng: -61.2225 }, // Trinidad and Tobago
  US: { lat: 37.0902, lng: -95.7129 }, // United States
  UY: { lat: -32.5228, lng: -55.7658 }, // Uruguay
  VC: { lat: 12.9843, lng: -61.2872 }, // Saint Vincent and the Grenadines
  VE: { lat: 6.4238, lng: -66.5897 }, // Venezuela
  VG: { lat: 18.4207, lng: -64.6400 }, // British Virgin Islands
  VI: { lat: 18.3358, lng: -64.8963 }, // U.S. Virgin Islands
};

// Marker definitions derived from the filtered countries list.  Each marker
// contains its own position, display colour and associated ISO code.
let markersData = [];

/**
 * Build marker data for all available American countries.  A marker is only
 * created if there is an entry in COUNTRY_COORDS for that ISO code.
 */
function buildMarkers() {
  markersData = countries
    .filter(c => COUNTRY_COORDS[c.code])
    .map(c => ({
      lat: COUNTRY_COORDS[c.code].lat,
      lng: COUNTRY_COORDS[c.code].lng,
      size: 0.35,
      color: 'yellow',
      countryCode: c.code,
    }));
}

/**
 * Load IPTV data from the iptv‑org API and initialise the UI.  All endpoints
 * are fetched in parallel.  Once resolved we filter down to the Americas,
 * discard adult categories and precompute marker data.
 */
async function loadData() {
  try {
    const [
      regionsData,
      countriesData,
      channelsData,
      feedsData,
      streamsData,
      categoriesData,
      timezonesData,
    ] = await Promise.all([
      fetch('https://iptv-org.github.io/api/regions.json').then(res => res.json()),
      fetch('https://iptv-org.github.io/api/countries.json').then(res => res.json()),
      fetch('https://iptv-org.github.io/api/channels.json').then(res => res.json()),
      fetch('https://iptv-org.github.io/api/feeds.json').then(res => res.json()),
      fetch('https://iptv-org.github.io/api/streams.json').then(res => res.json()),
      fetch('https://iptv-org.github.io/api/categories.json').then(res => res.json()),
      fetch('https://iptv-org.github.io/api/timezones.json').then(res => res.json()),
    ]);

    // Derive list of ISO codes belonging to the Americas region
    regionCountries = regionsData.find(r => r.code === 'AMER').countries;

    // Filter down to countries in the Americas
    countries = countriesData.filter(c => regionCountries.includes(c.code));

    // Filter channels by country membership
    channels = channelsData.filter(ch => regionCountries.includes(ch.country));

    // Keep all feeds and streams; we filter on demand
    feeds = feedsData;

    // Reduce streams to those which belong to our channels by channel or feed
    const channelIds = new Set(channels.map(ch => ch.id));
    streams = streamsData.filter(s => {
      return (
        (s.channel && channelIds.has(s.channel)) ||
        (s.feed && channelIds.has(s.feed)) ||
        false
      );
    });

    // Exclude NSFW category
    categories = categoriesData.filter(cat => cat.id !== 'xxx');

    // Store timezones list
    timezones = timezonesData;

    // Compute markers and populate the UI
    buildMarkers();
    populateCategoryList();
    populateCountryList();
    initGlobe();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

/**
 * Initialise the interactive globe using Globe.gl.  The earth and background
 * textures are loaded from the Globe.gl examples CDN.  Point data is bound
 * to our markers array and clicking on a marker selects the associated
 * country.
 */
function initGlobe() {
  const container = document.getElementById('globe-container');
  // If a previous instance exists, remove its canvas to avoid stacking
  container.innerHTML = '';

  globeInstance = Globe()(container)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
    .pointsData(markersData)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointColor(d => d.color)
    .pointRadius(d => d.size)
    .pointAltitude(() => 0.02)
    .onPointClick(d => {
      selectCountry(d.countryCode);
    });

  // Set some sensible controls defaults
  const controls = globeInstance.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
}

/**
 * Populate the country list in the info panel.  Countries are sorted
 * alphabetically by their English names.  Clicking a country entry will
 * select it and scroll to its position.
 */
function populateCountryList() {
  const listEl = document.getElementById('country-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  // Sort by name for consistency
  const sorted = [...countries].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  sorted.forEach(country => {
    const item = document.createElement('div');
    item.className = 'country-item';
    item.dataset.code = country.code;

    // Flag icon
    const flagImg = document.createElement('img');
    flagImg.src = `https://flagcdn.com/16x12/${country.code.toLowerCase()}.png`;
    flagImg.alt = `${country.name} flag`;
    flagImg.width = 16;
    flagImg.height = 12;
    item.appendChild(flagImg);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = country.name;
    nameSpan.style.marginLeft = '0.5rem';
    item.appendChild(nameSpan);

    item.addEventListener('click', () => {
      selectCountry(country.code);
      // Hide sidebar on mobile after selecting a country
      hideSidebar();
    });

    listEl.appendChild(item);
  });
}

/**
 * Highlight the selected country, update the header information and render
 * its channels.  Any existing category filter is cleared.
 */
function selectCountry(code) {
  selectedCountry = code;
  selectedCategory = null;

  // Update selection styles
  document.querySelectorAll('.country-item').forEach(el => {
    el.classList.toggle('active', el.dataset.code === code);
  });

  // Find the country object
  const country = countries.find(c => c.code === code);
  if (!country) return;

  // Update header with country name and clear previous time
  const headerEl = document.getElementById('country-header');
  headerEl.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = country.name;
  headerEl.appendChild(title);
  const timeDiv = document.createElement('div');
  timeDiv.id = 'local-time';
  timeDiv.style.fontSize = '0.85rem';
  timeDiv.style.color = '#8b949e';
  headerEl.appendChild(timeDiv);

  // Render channel list for this country
  const countryChannels = channels
    .filter(ch => ch.country === code)
    .sort((a, b) => a.name.localeCompare(b.name));

  renderChannelList(countryChannels);

  // Start/update local time display
  updateLocalTime(code);
}

/**
 * Render a list of channels into the channel-list element.  Each entry shows
 * the channel name, flag, language(s), categories and a favourite star.
 */
function renderChannelList(channelArray) {
  const listEl = document.getElementById('channel-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  channelArray.forEach(channel => {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.dataset.channelId = channel.id;

    // Left section with flag and name
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';

    const flagImg = document.createElement('img');
    flagImg.src = `https://flagcdn.com/16x12/${channel.country.toLowerCase()}.png`;
    flagImg.alt = `${channel.country} flag`;
    flagImg.width = 16;
    flagImg.height = 12;
    left.appendChild(flagImg);

    const name = document.createElement('span');
    name.className = 'channel-name';
    name.textContent = channel.name;
    name.style.marginLeft = '0.5rem';
    left.appendChild(name);

    item.appendChild(left);

    // Language badges
    if (Array.isArray(channel.languages)) {
      channel.languages.slice(0, 3).forEach(lang => {
        const langSpan = document.createElement('span');
        langSpan.className = 'channel-lang';
        langSpan.textContent = lang.toUpperCase();
        item.appendChild(langSpan);
      });
    }

    // Category badges
    if (Array.isArray(channel.categories)) {
      channel.categories
        .slice(0, 2)
        .forEach(catId => {
          const cat = categories.find(c => c.id === catId);
          if (cat) {
            const catSpan = document.createElement('span');
            catSpan.className = 'channel-lang';
            catSpan.textContent = cat.name;
            item.appendChild(catSpan);
          }
        });
    }

    // Favourite toggle icon
    const favBtn = document.createElement('button');
    favBtn.className = 'favorite';
    favBtn.innerHTML = favorites.includes(channel.id) ? '★' : '☆';
    favBtn.title = 'Toggle favourite';
    favBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      toggleFavorite(channel.id);
      favBtn.innerHTML = favorites.includes(channel.id) ? '★' : '☆';
      favBtn.classList.toggle('favorited', favorites.includes(channel.id));
    });
    item.appendChild(favBtn);

    // Click entire row to play
    item.addEventListener('click', () => {
      openChannel(channel);
    });

    listEl.appendChild(item);
  });
}

/**
 * Populate the categories list in the sidebar.  Clicking a category filters
 * the channel list to those channels whose categories include the selected id.
 */
function populateCategoryList() {
  const catList = document.getElementById('category-list');
  if (!catList) return;
  catList.innerHTML = '';

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach(cat => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = cat.name;
    btn.className = 'link-button';
    btn.addEventListener('click', () => {
      filterByCategory(cat.id);
      hideSidebar();
    });
    li.appendChild(btn);
    catList.appendChild(li);
  });
}

/**
 * Filter channels by the given category id.  Updates the header and renders
 * all matching channels across the Americas.  Clears the selected country.
 */
function filterByCategory(categoryId) {
  selectedCategory = categoryId;
  selectedCountry = null;

  // Update header
  const cat = categories.find(c => c.id === categoryId);
  const headerEl = document.getElementById('country-header');
  headerEl.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = cat ? `Category: ${cat.name}` : 'Category';
  headerEl.appendChild(title);

  // Clear local time display
  if (localTimeIntervalId) {
    clearInterval(localTimeIntervalId);
    localTimeIntervalId = null;
  }

  // Filter channels
  const filtered = channels.filter(ch =>
    Array.isArray(ch.categories) ? ch.categories.includes(categoryId) : false
  );
  renderChannelList(filtered);
}

/**
 * Toggle a channel's favourite status.  Updates localStorage and
 * re-renders the favourites list if currently viewing favourites.
 */
function toggleFavorite(channelId) {
  const idx = favorites.indexOf(channelId);
  if (idx >= 0) {
    favorites.splice(idx, 1);
  } else {
    favorites.push(channelId);
  }
  localStorage.setItem('riggs_favorites', JSON.stringify(favorites));

  // If viewing favourites, refresh the list
  if (selectedCategory === 'favorites') {
    showFavorites();
  }
}

/**
 * Open the selected channel in the video overlay.  Searches for a stream in
 * three passes: exact channel ID match, feed ID match, then fuzzy title
 * match.  If a working URL is found it is loaded into Video.js and the
 * overlay is displayed.
 */
function openChannel(channel) {
  if (!channel) return;
  // Candidate streams by priority
  let candidateStreams = [];
  candidateStreams.push(...streams.filter(s => s.channel === channel.id));
  candidateStreams.push(...streams.filter(s => s.feed === channel.id));
  candidateStreams.push(
    ...streams.filter(
      s =>
        s.title &&
        s.title.toLowerCase().includes(channel.name.toLowerCase())
    )
  );

  // Deduplicate candidates and pick the first with a URL
  const seen = new Set();
  let stream = null;
  for (const s of candidateStreams) {
    const key = `${s.channel || ''}-${s.feed || ''}-${s.title || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.url) {
      stream = s;
      break;
    }
  }

  if (!stream) {
    alert('No working streams found for this channel.');
    return;
  }

  // Show overlay
  const overlay = document.getElementById('video-overlay');
  overlay.classList.remove('hidden');

  // Dispose of previous player
  if (player) {
    player.dispose();
  }

  const videoEl = document.getElementById('video-player');
  videoEl.src = stream.url;

  player = videojs(videoEl, { autoplay: true, controls: true }, () => {
    player.play();
  });

  // Update favourite button in overlay
  const favBtn = document.getElementById('favorite-toggle');
  favBtn.innerHTML = favorites.includes(channel.id) ? '★' : '☆';
  favBtn.classList.toggle('favorited', favorites.includes(channel.id));
  favBtn.onclick = e => {
    e.stopPropagation();
    toggleFavorite(channel.id);
    favBtn.innerHTML = favorites.includes(channel.id) ? '★' : '☆';
    favBtn.classList.toggle('favorited', favorites.includes(channel.id));
    // Also update star icons in the list
    document
      .querySelectorAll('.channel-item .favorite')
      .forEach(btn => {
        if (btn.parentElement.dataset.channelId === channel.id) {
          btn.innerHTML = favorites.includes(channel.id) ? '★' : '☆';
          btn.classList.toggle(
            'favorited',
            favorites.includes(channel.id)
          );
        }
      });
  };
}

/**
 * Hide the video overlay and dispose the video player.
 */
function closeVideo() {
  const overlay = document.getElementById('video-overlay');
  overlay.classList.add('hidden');
  if (player) {
    player.dispose();
    player = null;
  }
}

/**
 * Show a list of favourite channels.  The header is updated accordingly.
 */
function showFavorites() {
  selectedCategory = 'favorites';
  selectedCountry = null;

  const headerEl = document.getElementById('country-header');
  headerEl.innerHTML = '<h3>Favourites</h3>';

  if (localTimeIntervalId) {
    clearInterval(localTimeIntervalId);
    localTimeIntervalId = null;
  }

  const favChannels = favorites
    .map(id => channels.find(ch => ch.id === id))
    .filter(Boolean);

  renderChannelList(favChannels);
}

/**
 * Randomly pick a channel from the entire filtered channel list and play it.
 */
function showRandomChannel() {
  if (channels.length === 0) return;
  const random = channels[Math.floor(Math.random() * channels.length)];
  // Ensure any previous state is cleared
  selectedCountry = null;
  selectedCategory = null;
  // Update header
  const headerEl = document.getElementById('country-header');
  headerEl.innerHTML = `<h3>Random: ${random.name}</h3>`;
  if (localTimeIntervalId) {
    clearInterval(localTimeIntervalId);
    localTimeIntervalId = null;
  }
  // Play the random channel
  openChannel(random);
}

/**
 * Compute and update the local time display for the given country code.  The
 * first timezone found for that country in timezones.json is used.  If none
 * is found we fall back to the browser’s current timezone.
 */
function updateLocalTime(countryCode) {
  if (localTimeIntervalId) {
    clearInterval(localTimeIntervalId);
  }

  const tzEntry = timezones.find(tz => tz.countries.includes(countryCode));
  const zone = tzEntry ? tzEntry.id : luxon.DateTime.local().zoneName;

  const timeEl = document.getElementById('local-time');
  if (!timeEl) return;

  function update() {
    const now = luxon.DateTime.now().setZone(zone);
    timeEl.textContent = now.toFormat('HH:mm ZZZZ');
  }

  update();
  localTimeIntervalId = setInterval(update, 60000);
}

/**
 * Toggle the sidebar’s visibility.
 */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('visible');
}

/**
 * Hide the sidebar (used after selecting a menu item on mobile).
 */
function hideSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('visible');
}

/**
 * Wire up event listeners once the DOM has loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Menu toggle
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      toggleSidebar();
    });
  }
  // Sidebar close button
  const sidebarClose = document.getElementById('sidebar-close');
  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      hideSidebar();
    });
  }
  // Random channel menu item
  const randomBtn = document.getElementById('random-channel');
  if (randomBtn) {
    randomBtn.addEventListener('click', () => {
      showRandomChannel();
    });
  }
  // Favourites menu item
  const favBtn = document.getElementById('favorites-view');
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      showFavorites();
      hideSidebar();
    });
  }
  // Close video overlay
  const closeBtn = document.getElementById('close-video');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeVideo();
    });
  }
  // Clicking outside video wrapper should close overlay
  const overlay = document.getElementById('video-overlay');
  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        closeVideo();
      }
    });
  }
  // Load all data
  loadData();
});
