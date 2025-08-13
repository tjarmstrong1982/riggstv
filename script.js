// Cached data arrays
let regionCountries = [];
let countries = [];
let channels = [];
let feeds = [];
let streams = [];
let categories = [];
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let player;

// Approximate centroids for North and South American countries
const COUNTRY_COORDS = {
  US: { lat: 37.6, lng: -95.7 },
  CA: { lat: 56.1, lng: -106.3 },
  MX: { lat: 23.6, lng: -102.5 },
  BR: { lat: -14.2, lng: -51.9 },
  AR: { lat: -34.6, lng: -64.3 },
  CO: { lat: 4.6, lng: -74.1 },
  // add other countries...
};

// Array to hold marker data for the globe
let markersData = [];

// Build markers based on channels and country coordinates
function buildMarkers() {
  markersData = channels
    .filter(ch => COUNTRY_COORDS[ch.country])
    .map(ch => ({
      lat: COUNTRY_COORDS[ch.country].lat,
      lng: COUNTRY_COORDS[ch.country].lng,
      size: 0.3,
      color: 'yellow',
      channelId: ch.id,
    }));
}

// Load IPTV data and initialize
async function loadData() {
  const [regionsData, countriesData, channelsData, feedsData, streamsData, categoriesData] = await Promise.all([
    fetch('https://iptv-org.github.io/api/regions.json').then(res => res.json()),
    fetch('https://iptv-org.github.io/api/countries.json').then(res => res.json()),
    fetch('https://iptv-org.github.io/api/channels.json').then(res => res.json()),
    fetch('https://iptv-org.github.io/api/feeds.json').then(res => res.json()),
    fetch('https://iptv-org.github.io/api/streams.json').then(res => res.json()),
    fetch('https://iptv-org.github.io/api/categories.json').then(res => res.json()),
  ]);

  // Filter to AMER region only
  regionCountries = regionsData.find(r => r.code === 'AMER').countries;
  countries = countriesData.filter(c => regionCountries.includes(c.code));
  channels = channelsData.filter(ch => regionCountries.includes(ch.country));
  feeds = feedsData;
  streams = streamsData;
  categories = categoriesData;

  buildMarkers();
  populateCategoryList();
  populateCountryList();
  initGlobe();
}

// Initialize the globe with markers
function initGlobe() {
  const myGlobe = Globe()(document.getElementById('globe'))
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .pointsData(markersData)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointRadius(d => d.size)
    .pointColor(d => d.color)
    .onPointClick(d => {
      const channel = channels.find(ch => ch.id === d.channelId);
      if (channel) selectCountry(channel.country) && openChannel(channel);
    })
    .polygonsData(countries)
    .polygonStrokeColor(() => '#313131')
    .polygonAltitude(0.01)
    .polygonCapColor(() => '#0f3d33')
    .polygonSideColor(() => '#0f3d33');

  myGlobe.controls().autoRotate = true;
  myGlobe.controls().autoRotateSpeed = 0.3;
}

// ... (rest of your existing functions like populateCountryList, selectCountry, etc.)

// Override openChannel to match stream by channel ID first
function openChannel(channel) {
  const stream =
    streams.find(s => s.channel === channel.id) ||
    streams.find(s => s.feed === channel.id) ||
    streams.find(s => s.title.toLowerCase().includes(channel.name.toLowerCase()));

  if (stream && stream.url) {
    const videoEl = document.getElementById('video-player');
    videoEl.src = stream.url;
    document.getElementById('video-overlay').style.display = 'block';
    player = videojs(videoEl, {}, () => {
      player.play();
    });
  } else {
    alert('No working streams found for this channel.');
  }
}

loadData();
