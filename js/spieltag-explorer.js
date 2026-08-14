// ===== Team + fixture data, loaded from data/*.json =====
let TEAMS = {};
let FIXTURES = {};
let AIRPORTS = [];
let LEAGUE_LOGO = {}; // league code -> competition logo URL, loaded from data/leagues.json

// Small inline-SVG icon set (stroke-based, currentColor) used in place of
// emoji throughout the UI — kept as plain template strings, mirrored in
// index.html for the icons baked into the static markup.
const ICONS = {
  flag: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M5 4h13l-3 4 3 4H5"/></svg>`,
  route: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="6" r="2.2" fill="currentColor" stroke="none"/><circle cx="19" cy="18" r="2.2" fill="currentColor" stroke="none"/><path d="M6.8 7.5C10 11 8 13 12 13s2-2 5.2 1.5" stroke-dasharray="2.2 2.6"/></svg>`,
  calendar: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>`,
  sparkle: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>`,
  globe: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18"/><path d="M12 3c-3 3.5-3 14.5 0 18"/></svg>`,
  plane: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L11 13"/><path d="M21 3l-7 18-4-8-8-4 19-6z"/></svg>`,
  target: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  expand: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/></svg>`,
};

// ===== Watchlist ("My Plan") — persisted in localStorage, drag-orderable,
// multiple named plans so e.g. different people can each have their own =====
const PLANS_STORAGE_KEY = 'scoutingPlans';
const OLD_WATCHLIST_KEY = 'scoutingWatchlist'; // pre-multi-plan format, migrated below

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

let plans = [];
let activePlanId = null;

(function loadPlans(){
  try{
    const saved = JSON.parse(localStorage.getItem(PLANS_STORAGE_KEY) || 'null');
    if(saved && Array.isArray(saved.plans) && saved.plans.length){
      plans = saved.plans;
      activePlanId = saved.activePlanId && plans.some(p => p.id === activePlanId) ? saved.activePlanId : plans[0].id;
      return;
    }
  } catch(e){ /* fall through to migration/default below */ }

  // Migrate the old single-list format if present, otherwise start fresh.
  let migratedItems = [];
  try{ migratedItems = JSON.parse(localStorage.getItem(OLD_WATCHLIST_KEY) || '[]'); } catch(e){ /* ignore */ }
  const first = { id: uid(), name: 'My Plan', items: migratedItems };
  plans = [first];
  activePlanId = first.id;
})();

function activePlan(){ return plans.find(p => p.id === activePlanId) || plans[0]; }
function savePlans(){ localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify({ plans, activePlanId })); }

function watchKeyFor(league, homeCode, matchday){ return `${league}::${homeCode}::${matchday}`; }
function isWatched(key){ return activePlan().items.some(w => w.key === key); }

function addToWatchlist(item){
  if(isWatched(item.key)) return;
  activePlan().items.push(item);
  savePlans();
  renderWatchlist();
  refreshWatchStars();
}
function removeFromWatchlist(key){
  const plan = activePlan();
  plan.items = plan.items.filter(w => w.key !== key);
  savePlans();
  renderWatchlist();
  refreshWatchStars();
}
function toggleWatch(item){
  if(isWatched(item.key)) removeFromWatchlist(item.key);
  else addToWatchlist(item);
}
// After adding/removing, ★/☆ toggles elsewhere on the page (fixture list,
// popups, radius results) need to reflect the new state without a full
// re-render of whatever list they live in.
function refreshWatchStars(){
  document.querySelectorAll('.watch-star[data-key]').forEach(el => {
    el.textContent = isWatched(el.dataset.key) ? '★' : '☆';
  });
}

// ----- Plan management (rename / switch / create / delete) -----
function renderPlanToolbar(){
  const select = document.getElementById('plan-select');
  select.innerHTML = plans.map(p => `<option value="${p.id}" ${p.id===activePlanId?'selected':''}>${p.name} (${p.items.length})</option>`).join('');
  document.getElementById('plan-name-display').textContent = activePlan().name;
}

function switchPlan(id){
  activePlanId = id;
  savePlans();
  renderWatchlist();
  refreshWatchStars();
}

function renamePlan(){
  const plan = activePlan();
  const name = prompt('Rename this plan:', plan.name);
  if(name === null) return;
  const trimmed = name.trim();
  if(!trimmed) return;
  plan.name = trimmed;
  savePlans();
  renderWatchlist();
}

function newPlan(){
  const name = prompt('Name for the new plan (e.g. a person\'s name):', `Plan ${plans.length + 1}`);
  if(name === null) return;
  const trimmed = name.trim();
  if(!trimmed) return;
  const plan = { id: uid(), name: trimmed, items: [] };
  plans.push(plan);
  activePlanId = plan.id;
  savePlans();
  renderWatchlist();
  refreshWatchStars();
}

function deletePlan(){
  if(plans.length <= 1){ alert('You need at least one plan — rename this one instead of deleting it.'); return; }
  const plan = activePlan();
  if(!confirm(`Delete "${plan.name}" and its ${plan.items.length} planned game(s)? This can't be undone.`)) return;
  plans = plans.filter(p => p.id !== plan.id);
  activePlanId = plans[0].id;
  savePlans();
  renderWatchlist();
  refreshWatchStars();
}

let watchDragIndex = null;

function renderWatchlist(){
  renderPlanToolbar();
  const items = activePlan().items;
  const list = document.getElementById('watchlist-list');
  const dropzone = document.getElementById('watchlist-dropzone');
  const countEl = document.getElementById('watchlist-count');
  countEl.textContent = `(${items.length})`;
  dropzone.classList.toggle('empty', items.length === 0);
  list.innerHTML = '';

  items.forEach((w, idx) => {
    const row = document.createElement('div');
    row.className = 'watch-row';
    row.draggable = true;
    row.innerHTML = `
      <span class="rank">${idx + 1}</span>
      <div class="wbody">
        <div class="wteams">${w.homeName} – ${w.awayName}</div>
        <div class="wmeta">${w.city} · ${fmtDate(w.start)} · ${LEAGUE_LABELS[w.league] || w.league}</div>
      </div>
      <span class="wremove" title="Remove">×</span>
    `;
    row.querySelector('.wbody').onclick = () => { map.setView([w.lat, w.lng], 10); };
    row.querySelector('.wremove').onclick = () => removeFromWatchlist(w.key);

    // Drag-to-reorder within the list = set priority.
    row.addEventListener('dragstart', (e) => {
      watchDragIndex = idx;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', w.key); // needed for some browsers to allow the drag
    });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); savePlans(); });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if(watchDragIndex === null || watchDragIndex === idx) return;
      const arr = activePlan().items;
      const [moved] = arr.splice(watchDragIndex, 1);
      arr.splice(idx, 0, moved);
      watchDragIndex = idx;
      renderWatchlist();
    });

    list.appendChild(row);
  });
}

// Drop target for dragging a fixture in from the side list or radius
// results (see the .fixture-item / .radius-result drag wiring below).
(function initWatchlistDropzone(){
  const dropzone = document.getElementById('watchlist-dropzone');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const raw = e.dataTransfer.getData('application/json');
    if(!raw) return;
    try{ addToWatchlist(JSON.parse(raw)); } catch(err){ /* ignore malformed payload */ }
  });
})();

// Wires a draggable source element (a fixture-item or radius-result row) to
// (a) start a drag carrying this fixture's data for the watchlist dropzone,
// and (b) show/toggle a ☆/★ star that adds/removes it directly on click.
function makeWatchable(el, item, starEl){
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(item));
  });
  if(starEl){
    starEl.dataset.key = item.key;
    starEl.textContent = isWatched(item.key) ? '★' : '☆';
    starEl.title = 'Add to / remove from My Plan';
    starEl.onclick = (e) => { e.stopPropagation(); toggleWatch(item); };
  }
}

const LEAGUE_COLOR = {
  epl:"#1c3f95", championship:"#7b2d8e", league_one:"#556b2f",
  la_liga:"#c8102e", la_liga_2:"#e07b13",
  bundesliga:"#2b2b2b", bundesliga_2:"#0c8a8a", liga3_de:"#6a3d9a",
  serie_a:"#008c45", serie_b:"#a8763e",
  ligue_1:"#0055a4", ligue_2:"#c23b6f",
  primeira_liga:"#046a38",
  eredivisie:"#ff8c00", eerste_divisie:"#b5651d",
  pro_league:"#f7c631", challenger_pro_league:"#4a4a8a",
  allsvenskan:"#005293", eliteserien:"#a3123a", superliga:"#c8102e", veikkausliiga:"#003580",
  scottish_prem:"#1a5c38", swiss_super_league:"#b03a2e", austrian_bundesliga:"#2f6f6f",
  super_league_greece:"#003087", super_lig:"#e30a17", ekstraklasa:"#996515",
  czech_first_league:"#11457e", croatian_hnl:"#c65102",
  champions_league:"#0b1f4e", europa_league:"#ff6a13", conference_league:"#00a19a"
};
// UEFA club competitions deliberately have NO entry here — unlike a
// domestic league, a single competition spans many countries, so there's
// no one COUNTRY_TAG to give it. Their clubs carry a "country" field
// directly on the team record instead (data/teams.json) — see
// buildGamePool(). (A code->country lookup keyed only by team code was
// tried and rejected: codes are only unique WITHIN a league, e.g. "PAR"
// is Parma in serie_a but Partizan in conference_league, so a global
// lookup would silently pick the wrong one.)
const COUNTRY_TAG = {
  epl:"ENG", championship:"ENG", league_one:"ENG",
  la_liga:"ESP", la_liga_2:"ESP",
  bundesliga:"GER", bundesliga_2:"GER", liga3_de:"GER",
  serie_a:"ITA", serie_b:"ITA",
  ligue_1:"FRA", ligue_2:"FRA",
  primeira_liga:"POR",
  eredivisie:"NED", eerste_divisie:"NED",
  pro_league:"BEL", challenger_pro_league:"BEL",
  allsvenskan:"SWE", eliteserien:"NOR", superliga:"DEN", veikkausliiga:"FIN",
  scottish_prem:"SCO", swiss_super_league:"SUI", austrian_bundesliga:"AUT",
  super_league_greece:"GRE", super_lig:"TUR", ekstraklasa:"POL",
  czech_first_league:"CZE", croatian_hnl:"CRO"
};
// Canonical league list + display labels, in dropdown order (top flight
// immediately followed by its own lower tiers where we have them).
const LEAGUE_LABELS = {
  epl: "Premier League (ENG)", championship: "Championship (ENG)", league_one: "League One (ENG)",
  la_liga: "La Liga (ESP)", la_liga_2: "LaLiga Hypermotion (ESP)",
  bundesliga: "Bundesliga (GER)", bundesliga_2: "2. Bundesliga (GER)", liga3_de: "3. Liga (GER)",
  serie_a: "Serie A (ITA)", serie_b: "Serie B (ITA)",
  ligue_1: "Ligue 1 (FRA)", ligue_2: "Ligue 2 (FRA)",
  primeira_liga: "Primeira Liga (POR)",
  eredivisie: "Eredivisie (NED)", eerste_divisie: "Eerste Divisie (NED)",
  pro_league: "Pro League (BEL)", challenger_pro_league: "Challenger Pro League (BEL)",
  allsvenskan: "Allsvenskan (SWE)", eliteserien: "Eliteserien (NOR)",
  superliga: "Superliga (DEN)", veikkausliiga: "Veikkausliiga (FIN)",
  scottish_prem: "Premiership (SCO)", swiss_super_league: "Super League (SUI)",
  austrian_bundesliga: "Bundesliga (AUT)", super_league_greece: "Super League (GRE)",
  super_lig: "Süper Lig (TUR)", ekstraklasa: "Ekstraklasa (POL)",
  czech_first_league: "Chance Liga (CZE)", croatian_hnl: "HNL (CRO)",
  champions_league: "UEFA Champions League", europa_league: "UEFA Europa League",
  conference_league: "UEFA Conference League"
};

// ===== Map setup =====
const map = L.map('map', { zoomControl:true }).setView([48, 5], 4);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 19
}).addTo(map);

let currentMarkers = [];

function makeDiamondIcon(color){
  return L.divIcon({
    className:'',
    html:`<div style="width:14px;height:14px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize:[14,14], iconAnchor:[7,14], popupAnchor:[0,-14]
  });
}

// If a club has a logo URL, show it as a circular badge with a league-color
// ring; otherwise fall back to the plain colored diamond. handleLogoError
// swaps a broken/missing image (e.g. a stale hotlinked URL) back to the
// diamond at runtime too.
function handleLogoError(imgEl){
  const color = imgEl.dataset.fallbackColor;
  imgEl.parentElement.outerHTML = `<div style="width:14px;height:14px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`;
}

function makeIcon(color, logoUrl){
  if(!logoUrl) return makeDiamondIcon(color);
  return L.divIcon({
    className:'',
    html:`<div style="width:24px;height:24px;border-radius:50%;background:#fffdf4;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;overflow:hidden;">
      <img src="${logoUrl}" data-fallback-color="${color}" onerror="handleLogoError(this)" style="width:17px;height:17px;object-fit:contain;" />
    </div>`,
    iconSize:[24,24], iconAnchor:[12,24], popupAnchor:[0,-24]
  });
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function fmtHM(totalSeconds){
  const totalMin = Math.round(totalSeconds/60);
  return `${Math.floor(totalMin/60)}h ${totalMin%60}m`;
}

function makeMutedIcon(){
  return L.divIcon({
    className:'',
    html:`<div style="width:9px;height:9px;border-radius:50% 50% 50% 0;background:#a8a89c;transform:rotate(-45deg);border:1px solid #fffdf4;box-shadow:0 1px 2px rgba(0,0,0,0.3); opacity:0.75;"></div>`,
    iconSize:[9,9], iconAnchor:[5,9], popupAnchor:[0,-9]
  });
}

function lightenColor(hex, amount){
  const c = hex.replace('#','');
  const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
  const nr = Math.round(r + (255-r)*amount);
  const ng = Math.round(g + (255-g)*amount);
  const nb = Math.round(b + (255-b)*amount);
  return `rgb(${nr},${ng},${nb})`;
}

function makeLeagueIcon(color, size){
  return L.divIcon({
    className:'',
    html:`<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>`,
    iconSize:[size,size], iconAnchor:[size/2,size], popupAnchor:[0,-size]
  });
}

// ===== Airports (reference layer, toggled on/off) =====
let showAirports = false;
let airportMarkers = [];

function makeAirportIcon(){
  return L.divIcon({
    className:'',
    html:`<div class="airport-icon">${ICONS.plane}</div>`,
    iconSize:[18,18], iconAnchor:[9,9], popupAnchor:[0,-9]
  });
}

function renderAirports(){
  airportMarkers.forEach(m => map.removeLayer(m));
  airportMarkers = [];
  if(!showAirports) return;
  AIRPORTS.forEach(ap => {
    const marker = L.marker([ap.lat, ap.lng], { icon: makeAirportIcon(), zIndexOffset: -1000 });
    const startPoint = { name: `${ap.name} (${ap.iata})`, lat: ap.lat, lng: ap.lng };
    marker.bindPopup(`
      <div class="popup-club">${ap.name} (${ap.iata})</div>
      <div class="popup-meta">${ap.city}</div>
      <div><button class="start-stop-btn" data-start="airport::${ap.iata}">${ICONS.flag} Set as start point</button></div>
    `);
    bindStartButton(marker, `airport::${ap.iata}`, startPoint);
    marker.addTo(map);
    airportMarkers.push(marker);
  });
}

function toggleAirports(){
  showAirports = !showAirports;
  document.getElementById('airports-toggle-btn').classList.toggle('active', showAirports);
  renderAirports();
}

// ===== League picker (multi-select) =====
let selectedLeagues = new Set(['epl']);
let leagueMatchday = {}; // league code -> chosen matchday number

// If a league has a competition logo, show it as a small badge; otherwise
// fall back to the plain color swatch. handleLeagueLogoError swaps a
// broken/missing image back to the swatch at runtime too.
function handleLeagueLogoError(imgEl, color){
  imgEl.outerHTML = `<span class="swatch" style="background:${color}"></span>`;
}

function buildLeaguePanel(){
  const panel = document.getElementById('league-panel');
  panel.innerHTML = Object.keys(LEAGUE_LABELS).map(code => `
    <label class="league-row">
      <input type="checkbox" value="${code}" ${selectedLeagues.has(code) ? 'checked' : ''} onchange="toggleLeague('${code}', this.checked)">
      ${LEAGUE_LOGO[code]
        ? `<img class="league-logo" src="${LEAGUE_LOGO[code]}" alt="" onerror="handleLeagueLogoError(this,'${LEAGUE_COLOR[code]}')">`
        : `<span class="swatch" style="background:${LEAGUE_COLOR[code]}"></span>`}
      ${LEAGUE_LABELS[code]}
    </label>
  `).join('');
  updateLeaguePickerLabel();
}

function toggleLeague(code, checked){
  if(checked) selectedLeagues.add(code); else selectedLeagues.delete(code);
  updateLeaguePickerLabel();
  renderAll();
  // The League picker stays reachable while the Calendar overlay is open
  // (it lives in the header, not #body) — keep the grid in sync instead of
  // leaving it showing the pre-change league selection.
  if(calendarOpen) renderCalendar();
}

function updateLeaguePickerLabel(){
  const label = document.getElementById('league-picker-label');
  const n = selectedLeagues.size;
  if(n === 0) label.textContent = 'Select leagues…';
  else if(n === 1) label.textContent = LEAGUE_LABELS[[...selectedLeagues][0]];
  else label.textContent = `${n} leagues selected`;
}

// Generic open/close for the header dropdowns (Leagues, Plan Route, Radius
// Search) — opening one closes any other that's open, and clicking outside
// a dropdown's own button+panel closes it.
function toggleDropdown(panelId){
  const panel = document.getElementById(panelId);
  const wasOpen = panel.classList.contains('open');
  document.querySelectorAll('.header-dropdown-panel.open').forEach(p => p.classList.remove('open'));
  if(!wasOpen) panel.classList.add('open');
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.header-dropdown-panel.open').forEach(panel => {
    const wrapper = panel.closest('.header-dropdown');
    if(wrapper && !wrapper.contains(e.target)) panel.classList.remove('open');
  });
});

function changeLeagueMatchday(league, md){
  leagueMatchday[league] = parseInt(md, 10);
  renderAll();
}

function renderAll(){
  currentMarkers.forEach(m => map.removeLayer(m));
  currentMarkers = [];

  const bounds = [];
  const orderedSelected = Object.keys(LEAGUE_LABELS).filter(c => selectedLeagues.has(c));

  orderedSelected.forEach(league => {
    if(!(league in leagueMatchday)){
      const mds = [...new Set(FIXTURES[league].map(f => f.matchday))].sort((a,b)=>a-b);
      leagueMatchday[league] = mds[0];
    }
  });

  // Muted grey markers for every league NOT selected, for geographic context —
  // ONE marker per club, not per fixture. Several leagues carry full-season
  // data (e.g. Championship/League One: 46 matchdays), so grouping by
  // fixture would stack dozens of overlapping markers on the same stadium;
  // group by home team instead and show its next fixture in this data
  // window (plus a "+N more" note if it has others).
  Object.keys(FIXTURES).forEach(otherLeague => {
    if(selectedLeagues.has(otherLeague)) return;
    const otherTeams = TEAMS[otherLeague];
    const byTeam = new Map();
    FIXTURES[otherLeague].forEach(f => {
      if(!otherTeams[f.home]) return;
      if(!byTeam.has(f.home)) byTeam.set(f.home, []);
      byTeam.get(f.home).push(f);
    });
    byTeam.forEach((teamFixtures, code) => {
      const h = otherTeams[code];
      teamFixtures.sort((x,y) => new Date(x.start) - new Date(y.start));
      const next = teamFixtures[0];
      const a = otherTeams[next.away];
      const stopKey = `${otherLeague}::${code}`;
      const marker = L.marker([h.lat, h.lng], { icon: makeMutedIcon() });
      const more = teamFixtures.length > 1 ? ` <span style="opacity:0.7;">(+${teamFixtures.length - 1} more this window)</span>` : '';
      marker.bindPopup(`
        <div class="popup-club">${h.name} vs ${a ? a.name : next.away}</div>
        <div class="popup-meta">${h.city} · ${fmtDate(next.start)} · ${COUNTRY_TAG[otherLeague] || h.country || ''}${more}</div>
        <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button></div>
      `);
      bindStopButton(marker, stopKey, h, next.start);
      marker.addTo(map);
      currentMarkers.push(marker);
    });
  });

  const fixturesContainer = document.getElementById('fixtures-container');
  fixturesContainer.innerHTML = '';
  const anchorSelections = [];
  // Fixtures at the same venue across different selected leagues — e.g. a
  // club with both a domestic fixture and a UEFA competition fixture in
  // the same window — get ONE marker with a pageable popup instead of two
  // overlapping ones, keyed by rounded lat/lng (~100m precision).
  const venueGroups = new Map();
  const venueMarkers = new Map();
  function venueKey(lat, lng){ return `${lat.toFixed(3)},${lng.toFixed(3)}`; }

  orderedSelected.forEach(league => {
    const teams = TEAMS[league];
    const selectedMd = leagueMatchday[league];
    const fixtures = FIXTURES[league].filter(f => f.matchday === selectedMd).slice().sort((a,b)=> new Date(a.start)-new Date(b.start));
    const color = LEAGUE_COLOR[league];
    const lightColor = lightenColor(color, 0.72);
    const homeThisWindow = new Set(fixtures.map(f => f.home));

    // Other clubs of THIS league without a home fixture right now: pale marker
    Object.keys(teams).forEach(code => {
      if(homeThisWindow.has(code)) return;
      const t = teams[code];
      const stopKey = `${league}::${code}`;
      const marker = L.marker([t.lat, t.lng], { icon: makeLeagueIcon(lightColor, 11) });
      marker.bindTooltip(t.name, { permanent:true, direction:'bottom', offset:[0,2], className:'club-label' });
      marker.bindPopup(`
        <div class="popup-club">${t.name}</div>
        <div class="popup-meta">${t.city} · no home fixture in this data window</div>
        <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button></div>
      `);
      bindStopButton(marker, stopKey, t);
      marker.addTo(map);
      currentMarkers.push(marker);
      bounds.push([t.lat, t.lng]);
    });

    // Fixtures block for this league, with its own matchday picker
    const mds = [...new Set(FIXTURES[league].map(f => f.matchday))].sort((a,b)=>a-b);
    const block = document.createElement('div');
    block.className = 'league-block';
    block.innerHTML = `
      <h2>
        ${LEAGUE_LOGO[league] ? `<img class="league-logo-block" src="${LEAGUE_LOGO[league]}" alt="" onerror="this.remove()">` : ''}
        <span class="league-name">${LEAGUE_LABELS[league]}</span>
        <select class="md-select">${mds.map(md => `<option value="${md}" ${md===selectedMd?'selected':''}>Matchday ${md}</option>`).join('')}</select>
        <span class="count">(${fixtures.length})</span>
      </h2>
      <div class="fixture-list-inner"></div>
    `;
    fixturesContainer.appendChild(block);
    block.querySelector('.md-select').addEventListener('change', (e) => changeLeagueMatchday(league, e.target.value));
    const listDiv = block.querySelector('.fixture-list-inner');

    fixtures.forEach(f => {
      const h = teams[f.home];
      const a = teams[f.away];
      if(!h) return;
      const stopKey = `${league}::${f.home}`;
      const watchKey = watchKeyFor(league, f.home, f.matchday);
      const watchItem = { key: watchKey, league, homeCode: f.home, homeName: h.name, awayName: a ? a.name : f.away, city: h.city, start: f.start, lat: h.lat, lng: h.lng };
      const gameLabel = `${h.name} vs ${a ? a.name : f.away}`;

      const vKey = venueKey(h.lat, h.lng);
      if(!venueGroups.has(vKey)) venueGroups.set(vKey, []);
      venueGroups.get(vKey).push({ league, f, h, a, color, stopKey, watchKey, watchItem, gameLabel });
      bounds.push([h.lat, h.lng]);

      const item = document.createElement('div');
      item.className = 'fixture-item';
      item.innerHTML = `
        <span class="watch-star" data-key="${watchKey}">☆</span>
        <div class="fbody">
          <div class="teams">${h.name} – ${a ? a.name : f.away}</div>
          <div class="meta">${h.city} · ${fmtDate(f.start)}</div>
        </div>
        <span class="suggest-btn" data-tooltip="Suggest a trip around this game">${ICONS.sparkle}</span>
      `;
      item.querySelector('.fbody').onclick = () => {
        map.setView([h.lat, h.lng], 9);
        const marker = venueMarkers.get(vKey);
        if(marker){
          marker._venueIndex = marker._venueGames.findIndex(g => g.watchKey === watchKey);
          if(marker._venueIndex < 0) marker._venueIndex = 0;
          marker.getPopup().setContent(buildVenuePopupHtml(marker._venueGames, marker._venueIndex));
          marker.openPopup();
        }
      };
      makeWatchable(item, watchItem, item.querySelector('.watch-star'));
      item.querySelector('.suggest-btn').onclick = (e) => { e.stopPropagation(); suggestTripsFor(league, f.home, f.start, gameLabel); };
      listDiv.appendChild(item);
    });

    anchorSelections.push({ league, matchday: selectedMd, fixtures });
  });

  venueGroups.forEach((games, vKey) => {
    const [lat, lng] = vKey.split(',').map(Number);
    const primary = games[0];
    const marker = L.marker([lat, lng], { icon: makeIcon(primary.color, primary.h.logo) });
    marker.bindTooltip(primary.h.name, { permanent:true, direction:'bottom', offset:[0,2], className:'club-label' });
    marker._venueGames = games;
    marker._venueIndex = 0;
    marker.bindPopup(buildVenuePopupHtml(games, 0));
    bindVenuePopupHandlers(marker);
    marker.addTo(map);
    currentMarkers.push(marker);
    venueMarkers.set(vKey, marker);
  });

  if(bounds.length) map.fitBounds(bounds, { padding:[40,40] });

  lastAnchorSelections = anchorSelections;
  updateCombosView();
}

// A venue "group" is 1+ fixtures sharing the same home venue this window
// (almost always 1 — the >1 case is a club playing both a domestic and a
// UEFA competition fixture at once). Builds the popup for whichever game
// is currently paged to; single-game groups render identically to before.
function buildVenuePopupHtml(games, idx){
  const g = games[idx];
  const pager = games.length > 1 ? `
    <div class="popup-pager">
      <button type="button" class="popup-pager-btn" data-dir="-1">‹</button>
      <span>${idx+1} / ${games.length} · ${LEAGUE_LABELS[g.league] || g.league}</span>
      <button type="button" class="popup-pager-btn" data-dir="1">›</button>
    </div>
  ` : '';
  return `
    ${pager}
    <div class="popup-club">${g.gameLabel}</div>
    <div class="popup-meta">${g.h.city} · ${fmtDate(g.f.start)}</div>
    <div><button class="add-stop-btn" data-stop="${g.stopKey}">+ Add to route</button><button class="watch-btn" data-key="${g.watchKey}">☆ Plan</button><button class="suggest-trip-btn" data-key="${g.watchKey}">${ICONS.sparkle} Suggest trip</button></div>
  `;
}

function bindVenuePopupHandlers(marker){
  marker.on('popupopen', () => wireVenuePopupButtons(marker));
}

// Wires the action buttons for whichever game a venue marker's popup is
// currently showing. Called on popupopen AND after every page-change,
// since setContent() updates the DOM without re-firing 'popupopen'.
function wireVenuePopupButtons(marker){
  const games = marker._venueGames;
  const g = games[marker._venueIndex];
  const stopBtn = document.querySelector(`.add-stop-btn[data-stop="${CSS.escape(g.stopKey)}"]`);
  if(stopBtn) stopBtn.onclick = () => { addStop(g.stopKey, g.h, g.f.start); marker.closePopup(); };
  const watchBtn = document.querySelector(`.watch-btn[data-key="${CSS.escape(g.watchKey)}"]`);
  if(watchBtn){
    watchBtn.textContent = isWatched(g.watchKey) ? '★ Planned' : '☆ Plan';
    watchBtn.onclick = () => { toggleWatch(g.watchItem); watchBtn.textContent = isWatched(g.watchKey) ? '★ Planned' : '☆ Plan'; };
  }
  const suggestBtn = document.querySelector(`.suggest-trip-btn[data-key="${CSS.escape(g.watchKey)}"]`);
  if(suggestBtn) suggestBtn.onclick = () => { suggestTripsFor(g.league, g.f.home, g.f.start, g.gameLabel); marker.closePopup(); };
  document.querySelectorAll('.popup-pager-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      marker._venueIndex = (marker._venueIndex + parseInt(btn.dataset.dir, 10) + games.length) % games.length;
      marker.getPopup().setContent(buildVenuePopupHtml(games, marker._venueIndex));
      wireVenuePopupButtons(marker);
    };
  });
}

// ===== Cross-league trip clustering (drive-time feasibility) =====
// A leg between two home fixtures is only offered as a combo if you could
// realistically make it: leave venue A after full-time, arrive at venue B
// with time to spare before kickoff, using real driving time (not straight-
// line distance) between the two stadiums.
const POST_MATCH_BUFFER_MIN = 120; // assume full-time ~2h after kickoff
const PRE_MATCH_BUFFER_MIN = 15;   // want to arrive at least 15 min early
// A plain "N days" span is ambiguous — which weekdays that covers depends
// on where the anchor happens to fall, and isn't something you can target
// (e.g. "I can only travel Fri-Sun"). So the user-facing control is which
// weekdays are eligible at all (see selectedTripDays/toggleTripDay below);
// this stays a fixed, generous internal safety net against chaining
// together games that are technically drive-feasible but weeks apart.
const MAX_TRIP_SPAN_H = 9 * 24;
const MAX_LEG_KM = 600;            // don't offer a single hop longer than this, even if time allows it
const MAX_ROUTING_POOL = 80;       // cap on points sent to the OSRM table API per render

// Which weekdays (JS Date#getDay(): 0=Sun..6=Sat) are eligible to be
// chained into a trip. All on by default (unrestricted); the anchor
// fixture itself is always included regardless of this filter — it's the
// game the trip is built around, not a candidate to exclude.
let selectedTripDays = new Set([0,1,2,3,4,5,6]);

function toggleTripDay(day){
  const btn = document.querySelector(`.day-btn[data-day="${day}"]`);
  if(selectedTripDays.has(day)){
    if(selectedTripDays.size === 1) return; // keep at least one day selected
    selectedTripDays.delete(day);
    btn.classList.remove('active');
  } else {
    selectedTripDays.add(day);
    btn.classList.add('active');
  }
  updateCombosView();
}

function buildGamePool(){
  const pool = [];
  Object.keys(FIXTURES).forEach(league => {
    const teams = TEAMS[league];
    FIXTURES[league].forEach(f => {
      const h = teams[f.home];
      const a = teams[f.away];
      if(!h) return;
      pool.push({
        league, country: COUNTRY_TAG[league] || h.country || 'EUR', homeCode: f.home, matchday: f.matchday,
        home: h, awayName: a ? a.name : f.away,
        start: new Date(f.start)
      });
    });
  });
  pool.sort((x,y) => x.start - y.start);
  return pool;
}

// Real driving-time + distance matrices between all given points, via
// OSRM's table service — one request for the whole pool instead of one
// route request per pair. durations are seconds, distances are meters.
async function fetchDurationMatrix(points){
  if(points.length < 2) return null;
  const coordStr = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}?annotations=duration,distance`;
  const res = await fetch(url);
  const json = await res.json();
  if(json.code !== 'Ok') return null;
  return { durations: json.durations, distances: json.distances };
}

let combosRequestId = 0;
// Default is same-country trips only; the toggle opts in to also letting
// legs reach into a neighboring country. This restricts the CANDIDATE POOL
// itself (see renderCombosMulti), not just which already-computed trips
// are displayed — the DAG longest-chain algorithm only ever keeps ONE
// (the longest) candidate chain per anchor, so a purely-domestic chain
// can lose out to a longer chain that happens to pad itself with a
// foreign leg, hiding an otherwise-valid same-country trip entirely if
// this were just a display-level filter. So toggling this re-runs the
// routing request rather than instantly re-filtering cached results.
let includeCrossBorder = false;
let lastCombos = null; // cached inputs, kept only for reference/debugging

function toggleIncludeCrossBorder(checked){
  includeCrossBorder = checked;
  updateCombosView();
}

// ----- "Suggest a trip for this game(s)" focus mode -----
// Normal browsing anchors combos on every fixture of every selected
// league's current matchday (set by renderAll below). Picking a single
// game via its 🔀 button, or a whole watchlist plan via "Suggest trips for
// My Plan", instead pins the anchor(s) to specific fixtures, independent
// of whatever leagues/matchdays are toggled on, until cleared. A trip is
// still only ever built within the configurable trip-length window per
// anchor (see tripSpanDays) — a plan spanning weeks produces several
// separate short trip clusters, not one long multi-week itinerary.
let focusedFixtures = []; // [{ league, home, start, label }, ...] — empty = no focus
let lastAnchorSelections = []; // the normal (non-focused) anchor set, from the last renderAll()

function suggestTripsFor(league, homeCode, start, label){
  focusedFixtures = [{ league, home: homeCode, start, label }];
  updateCombosView();
}

// Anchors Combinable Trips on every game currently in the active "My Plan"
// watchlist, so it suggests further realistic games around your whole
// marked plan rather than just one game at a time.
function suggestTripsForPlan(){
  const items = activePlan().items;
  if(items.length === 0){
    document.getElementById('combos-heading').textContent = 'Combinable Trips';
    alert('My Plan is empty — mark a few games with ☆ first.');
    return;
  }
  focusedFixtures = items.map(w => ({
    league: w.league, home: w.homeCode, start: w.start, label: `${w.homeName} vs ${w.awayName}`
  }));
  updateCombosView();
  document.querySelectorAll('.header-dropdown-panel.open').forEach(p => p.classList.remove('open'));
}

function clearFocusedTrip(){
  focusedFixtures = [];
  updateCombosView();
}

function updateCombosView(){
  if(focusedFixtures.length){
    const byLeague = {};
    focusedFixtures.forEach(f => {
      (byLeague[f.league] || (byLeague[f.league] = [])).push({ home: f.home, start: f.start });
    });
    const selections = Object.keys(byLeague).map(league => ({ league, matchday: null, fixtures: byLeague[league] }));
    const label = focusedFixtures.length === 1
      ? focusedFixtures[0].label
      : `${focusedFixtures.length} selected games`;
    renderCombosMulti(selections, label);
  } else {
    renderCombosMulti(lastAnchorSelections);
  }
}

// ----- Swipeable trip carousel -----
const COMBO_CARD_GAP = 10; // must match the CSS `gap` on #combos-list

function updateCombosPositionUI(){
  const list = document.getElementById('combos-list');
  const posEl = document.getElementById('combos-position');
  if(!list || !posEl) return;
  const cards = list.querySelectorAll('.combo-card');
  if(!cards.length){ posEl.textContent = ''; return; }
  const cardSpan = cards[0].offsetWidth + COMBO_CARD_GAP;
  const idx = cardSpan ? Math.round(list.scrollLeft / cardSpan) : 0;
  posEl.textContent = `${Math.min(idx + 1, cards.length)} / ${cards.length}`;
}

function scrollCombos(dir){
  const list = document.getElementById('combos-list');
  const card = list.querySelector('.combo-card');
  if(!card) return;
  list.scrollBy({ left: dir * (card.offsetWidth + COMBO_CARD_GAP), behavior: 'smooth' });
}

(function initCombosScrollTracking(){
  const list = document.getElementById('combos-list');
  let scrollTimer = null;
  list.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(updateCombosPositionUI, 80);
  }, { passive:true });
})();

// Builds the combo-card elements for an already-computed trips list. The
// same-country restriction is applied upstream, in the candidate pool
// itself (see renderCombosMulti) — by the time trips are computed, every
// leg already respects the current includeCrossBorder setting, so no
// further filtering happens here.
function renderComboCards({ trips, pool, legInfo, anchorSet, summaryLabel }){
  const combosList = document.getElementById('combos-list');

  if(trips.length === 0){
    combosList.innerHTML = includeCrossBorder
      ? `<div class="empty-note">No realistic combinations found around ${summaryLabel} — driving between venues doesn't leave enough time between full-time and the next kickoff (2h post-match + 15 min arrival buffer built in).</div>`
      : `<div class="empty-note">No same-country combinations found around ${summaryLabel}. Turn on "Include cross-border trips" to widen the search into neighboring countries too.</div>`;
    combosList.scrollLeft = 0;
    updateCombosPositionUI();
    return;
  }

  combosList.innerHTML = '';
  trips.slice(0, 10).forEach((idxs, cIdx) => {
    const games = idxs.map(i => pool[i]);
    const countries = [...new Set(games.map(g => g.country))];
    const crossBorder = countries.length > 1;
    let totalDriveSec = 0, totalKm = 0;
    const legLabels = [];
    for(let k=1;k<idxs.length;k++){
      const info = legInfo[`${idxs[k-1]}-${idxs[k]}`];
      totalDriveSec += info.driveSec;
      totalKm += info.driveKm;
      const slackMin = Math.round((info.availableSec - info.driveSec)/60);
      legLabels.push(`${fmtHM(info.driveSec)} · ${info.driveKm.toFixed(0)} km · ${slackMin} min to spare`);
    }
    const gamesHtml = games.map((g,i) => {
      const isAnchor = anchorSet.has(`${g.league}::${g.homeCode}::${g.start.getTime()}`);
      const legNote = i > 0 ? `<br><span style="color:#00A650; font-size:0.62rem;">${legLabels[i-1]}</span>` : '';
      return `
      <div class="combo-game" style="${isAnchor ? 'font-weight:700;' : ''}">${i+1}. ${g.home.name} <span style="color:#6b6455;">(${g.country})</span> – ${g.awayName}${isAnchor ? ' ★' : ''}<br>
      <span style="color:#6b6455; font-size:0.66rem;">${g.home.city} · ${fmtDate(g.start.toISOString())}</span>${legNote}</div>
    `;
    }).join('');
    const card = document.createElement('div');
    card.className = 'combo-card';
    card.innerHTML = `
      <div class="combo-title">${crossBorder ? ICONS.globe + ' Cross-border trip' : 'Trip'} ${cIdx+1} · ${games.length} games</div>
      ${gamesHtml}
      <div class="combo-stats">≈ ${fmtHM(totalDriveSec)} · ${totalKm.toFixed(0)} km total driving · ${countries.join(' → ')}</div>
      <div class="combo-load-hint">${ICONS.route} Click to load as your route</div>
    `;
    card.onclick = () => {
      const bnds = games.map(g => [g.home.lat, g.home.lng]);
      map.fitBounds(bnds, { padding:[60,60] });
      loadRouteFromGames(games);
    };
    combosList.appendChild(card);
  });
  combosList.scrollLeft = 0;
  updateCombosPositionUI();
}

// selections: [{ league, matchday, fixtures }, ...] — one entry per
// currently selected league, each with its own chosen matchday's fixtures,
// UNLESS focusLabel is set, in which case selections is a single-fixture
// anchor built by suggestTripsFor() and focusLabel names that one game.
async function renderCombosMulti(selections, focusLabel = null){
  const requestId = ++combosRequestId;
  const combosList = document.getElementById('combos-list');
  const heading = document.getElementById('combos-heading');
  const focusBar = document.getElementById('combos-focus-bar');
  const posEl = document.getElementById('combos-position');
  lastCombos = null;
  if(posEl) posEl.textContent = '';
  if(focusBar) focusBar.style.display = focusLabel ? 'flex' : 'none';

  const withFixtures = selections.filter(s => s.fixtures.length > 0);
  const summaryLabel = focusLabel || selections.map(s => `${LEAGUE_LABELS[s.league]} MD${s.matchday}`).join(' · ');
  if(heading) heading.textContent = focusLabel
    ? `Suggested Trips – ${focusLabel}`
    : (selections.length ? `Combinable Trips – ${summaryLabel}` : 'Combinable Trips');

  if(selections.length === 0){
    combosList.innerHTML = `<div class="empty-note">Select at least one league to see combinable trips.</div>`;
    return;
  }
  if(withFixtures.length === 0){
    combosList.innerHTML = `<div class="empty-note">No home fixtures to combine for this matchday.</div>`;
    return;
  }

  combosList.innerHTML = `<div class="empty-note">Calculating realistic routes…</div>`;

  // Anchor set: the fixtures actually shown for every selected league +
  // its chosen matchday. Every trip must include at least one of these.
  // allowedCountries: the country of every anchor's own league/club —
  // when cross-border trips aren't enabled, only legs from one of these
  // countries can be chained in, so e.g. selecting two same-country
  // leagues (Pro League + Challenger Pro League, both BEL) never needs
  // the cross-border toggle just to combine THOSE two — the countries
  // already selected are never "cross-border" by definition.
  // Keyed by league+team+kickoff instant, NOT just league+team — a club
  // with many home fixtures in the search window (e.g. full-season
  // Championship/League One data) must only have the ONE actually-selected
  // fixture treated as an anchor, not every home game it plays that whole
  // window; a coarser key would falsely "protect" all of them from the
  // weekday/country filters and the pool cap below.
  const anchorSet = new Set();
  const anchorTimes = [];
  const allowedCountries = new Set();
  withFixtures.forEach(s => {
    const teams = TEAMS[s.league];
    s.fixtures.forEach(f => {
      anchorSet.add(`${s.league}::${f.home}::${new Date(f.start).getTime()}`);
      anchorTimes.push(new Date(f.start).getTime());
      const h = teams && teams[f.home];
      const c = COUNTRY_TAG[s.league] || (h && h.country);
      if(c) allowedCountries.add(c);
    });
  });
  const minAnchor = Math.min(...anchorTimes), maxAnchor = Math.max(...anchorTimes);
  const windowMs = MAX_TRIP_SPAN_H * 3600 * 1000;

  // Pre-filter the full cross-league pool to fixtures that could plausibly
  // chain to an anchor fixture, so the routing request stays small. Also
  // drop any non-anchor fixture on a weekday the user hasn't enabled, or
  // (unless cross-border trips are on) from a country not already among
  // the selected anchors — anchors are always kept regardless of either
  // filter, since they're the games the trip is built around, not a
  // candidate to exclude.
  const poolAnchorKey = g => `${g.league}::${g.homeCode}::${g.start.getTime()}`;
  let pool = buildGamePool().filter(g => {
    const t = g.start.getTime();
    if(t < minAnchor - windowMs || t > maxAnchor + windowMs) return false;
    const isAnchor = anchorSet.has(poolAnchorKey(g));
    if(!selectedTripDays.has(g.start.getDay()) && !isAnchor) return false;
    if(!includeCrossBorder && !allowedCountries.has(g.country) && !isAnchor) return false;
    return true;
  });
  // Anchors must never be dropped by the cap below — they're the games the
  // whole search is built around (e.g. every game in "Suggest trips for My
  // Plan", possibly spread across months) — only trim the non-anchor
  // candidates, nearest-to-midpoint first, to fill whatever budget remains.
  if(pool.length > MAX_ROUTING_POOL){
    const mid = (minAnchor + maxAnchor) / 2;
    const anchors = pool.filter(g => anchorSet.has(poolAnchorKey(g)));
    const others = pool.filter(g => !anchorSet.has(poolAnchorKey(g)));
    const budget = Math.max(0, MAX_ROUTING_POOL - anchors.length);
    others.sort((a,b) => Math.abs(a.start-mid) - Math.abs(b.start-mid));
    pool = anchors.concat(others.slice(0, budget)).sort((a,b) => a.start - b.start);
  }

  const n = pool.length;
  if(n < 2){
    combosList.innerHTML = `<div class="empty-note">Not enough nearby fixtures in this data window to form a trip.</div>`;
    return;
  }

  let matrix;
  try{
    matrix = await fetchDurationMatrix(pool.map(g => ({ lat:g.home.lat, lng:g.home.lng })));
  } catch(e){
    matrix = null;
  }
  if(requestId !== combosRequestId) return; // a newer selection has since superseded this one
  if(!matrix){
    combosList.innerHTML = `<div class="empty-note">Could not calculate driving times right now (routing service unavailable). Try again shortly.</div>`;
    return;
  }
  const { durations, distances } = matrix;

  // Feasible legs: i -> j (i earlier than j) is usable if (a) the real
  // driving time from i's venue to j's venue fits between full-time at i
  // and kickoff minus the arrival buffer at j, AND (b) the drive itself
  // isn't longer than MAX_LEG_KM — plenty of slack in the schedule doesn't
  // make an 800 km overnight drive a "combinable" trip. Every leg actually
  // shown must be one of these checked edges — a trip is only valid if
  // EVERY consecutive hop is individually feasible, not just "somehow
  // connected".
  const edgesFrom = Array.from({length:n}, () => []);
  const edgesTo = Array.from({length:n}, () => []);
  const legInfo = {};

  for(let i=0;i<n;i++){
    for(let j=i+1;j<n;j++){
      const gapSec = (pool[j].start - pool[i].start) / 1000;
      if(gapSec/3600 > MAX_TRIP_SPAN_H) break; // sorted by time, no need to check further j
      const availableSec = gapSec - (POST_MATCH_BUFFER_MIN + PRE_MATCH_BUFFER_MIN) * 60;
      if(availableSec <= 0) continue;
      const driveSec = durations[i][j];
      const driveMeters = distances[i][j];
      if(driveSec == null || driveMeters == null) continue; // unreachable by road (e.g. ferry-only crossing)
      if(driveMeters > MAX_LEG_KM * 1000) continue;
      if(driveSec <= availableSec){
        edgesFrom[i].push(j);
        edgesTo[j].push(i);
        legInfo[`${i}-${j}`] = { driveSec, availableSec, driveKm: driveMeters / 1000 };
      }
    }
  }

  // Longest feasible chain starting at / ending at each node (DAG longest
  // path DP — edges only ever point forward in time, so this terminates).
  const fwdLen = new Array(n).fill(1), fwdNext = new Array(n).fill(-1);
  for(let i=n-1;i>=0;i--){
    for(const j of edgesFrom[i]){
      if(1 + fwdLen[j] > fwdLen[i]){ fwdLen[i] = 1 + fwdLen[j]; fwdNext[i] = j; }
    }
  }
  const bwdLen = new Array(n).fill(1), bwdPrev = new Array(n).fill(-1);
  for(let j=0;j<n;j++){
    for(const i of edgesTo[j]){
      if(1 + bwdLen[i] > bwdLen[j]){ bwdLen[j] = 1 + bwdLen[i]; bwdPrev[j] = i; }
    }
  }

  // Per-edge feasibility alone doesn't stop a chain of individually-valid
  // hops from drifting across many days (e.g. Wed -> Fri -> Sun -> Mon, each
  // hop within the cap but the whole "trip" spanning almost a week). Trim
  // each candidate down to the longest window containing the anchor whose
  // *total* span (first game to last) still fits within the trip length.
  function trimToSpan(chain, anchorPos){
    const capMs = MAX_TRIP_SPAN_H * 3600 * 1000;
    const times = chain.map(i => pool[i].start.getTime());
    let bestLo = anchorPos, bestHi = anchorPos;
    for(let lo=0; lo<=anchorPos; lo++){
      if(times[anchorPos] - times[lo] > capMs) continue;
      let hi = anchorPos;
      while(hi+1 < chain.length && times[hi+1] - times[lo] <= capMs) hi++;
      if(hi - lo > bestHi - bestLo){ bestLo = lo; bestHi = hi; }
    }
    return chain.slice(bestLo, bestHi+1);
  }

  // One candidate trip per anchor fixture: the longest feasible chain that
  // passes through it (predecessors walked backward, successors forward),
  // trimmed to a single realistic trip window.
  const seen = new Set();
  let trips = [];
  for(let a=0;a<n;a++){
    if(!anchorSet.has(poolAnchorKey(pool[a]))) continue;
    const chain = [a];
    for(let cur=a; bwdPrev[cur] !== -1; ){ cur = bwdPrev[cur]; chain.unshift(cur); }
    const anchorPos = chain.length - 1;
    for(let cur=a; fwdNext[cur] !== -1; ){ cur = fwdNext[cur]; chain.push(cur); }
    const trimmed = trimToSpan(chain, anchorPos);
    if(trimmed.length < 2) continue;
    const key = trimmed.join(',');
    if(seen.has(key)) continue;
    seen.add(key);
    trips.push(trimmed);
  }
  // Most effective trip first: the most games, and among ties on game
  // count, the fewest total driving km.
  function tripKm(idxs){
    let km = 0;
    for(let k=1;k<idxs.length;k++) km += legInfo[`${idxs[k-1]}-${idxs[k]}`].driveKm;
    return km;
  }
  trips.sort((x,y) => y.length - x.length || tripKm(x) - tripKm(y));

  lastCombos = { trips, pool, legInfo, anchorSet, summaryLabel };
  renderComboCards(lastCombos);
}

function toggleFullscreen(){
  const app = document.getElementById('app');
  if(!document.fullscreenElement){ app.requestFullscreen().catch(()=>{}); }
  else{ document.exitFullscreen(); }
}
document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('fullscreen-btn');
  btn.innerHTML = document.fullscreenElement ? '✕ Close' : `${ICONS.expand} Fullscreen`;
  setTimeout(()=>map.invalidateSize(),150);
});
window.addEventListener('resize', () => map.invalidateSize());

// ===== Point-to-point route planning =====
// stopKey format: "league::teamCode" so any club, from any league, can be a stop.
let routeStops = []; // array of {key, team}
// Optional origin for the route — an airport or a radius-search center
// point — always driven from first, ahead of every numbered stop.
let routeStart = null; // { name, lat, lng } | null
let routingControl = null;

function bindStopButton(marker, stopKey, teamData, fixtureStart){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.add-stop-btn[data-stop="${CSS.escape(stopKey)}"]`);
    if(btn) btn.onclick = () => { addStop(stopKey, teamData, fixtureStart); marker.closePopup(); };
  });
}

// Reusable "🏁 Set as start point" button binding for any marker with a
// fixed lat/lng — airports today, potentially other reference points later.
function bindStartButton(marker, startKey, point){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.start-stop-btn[data-start="${CSS.escape(startKey)}"]`);
    if(btn) btn.onclick = () => { setRouteStart(point); marker.closePopup(); };
  });
}

function setRouteStart(point){
  routeStart = point;
  renderStops();
  computeRoute();
}

function clearRouteStart(){
  routeStart = null;
  renderStops();
  computeRoute();
}

function bindWatchButton(marker, watchItem){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.watch-btn[data-key="${CSS.escape(watchItem.key)}"]`);
    if(btn){
      btn.textContent = isWatched(watchItem.key) ? '★ Planned' : '☆ Plan';
      btn.onclick = () => { toggleWatch(watchItem); btn.textContent = isWatched(watchItem.key) ? '★ Planned' : '☆ Plan'; };
    }
  });
}

// "🔀 Suggest trip" popup button — pins Combinable Trips to just this one
// game (see suggestTripsFor / the focus-mode state near renderCombosMulti).
function bindSuggestButton(marker, key, league, homeCode, start, label){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.suggest-trip-btn[data-key="${CSS.escape(key)}"]`);
    if(btn) btn.onclick = () => { suggestTripsFor(league, homeCode, start, label); marker.closePopup(); };
  });
}

// Stops are ordered by kickoff time — with fixed kickoff times, that's the
// only order you can actually attend them in. Stops with no specific
// fixture (e.g. a club added as a plain waypoint) sort after every timed
// stop, keeping their relative insertion order among themselves.
function sortRouteStopsChronologically(){
  routeStops.sort((a,b) => {
    if(a.start && b.start) return new Date(a.start) - new Date(b.start);
    if(a.start) return -1;
    if(b.start) return 1;
    return 0;
  });
}

function addStop(key, team, start){
  if(routeStops.some(s => s.key === key)) return;
  routeStops.push({ key, team, start: start || null });
  sortRouteStopsChronologically();
  renderStops();
  computeRoute();
}

function removeStop(key){
  routeStops = routeStops.filter(s => s.key !== key);
  renderStops();
  computeRoute();
}

function clearRoute(){
  routeStops = [];
  routeStart = null;
  renderStops();
  computeRoute();
}

// Replaces the whole route with a set of games in one shot — used when
// loading a Combinable Trips suggestion. `games` entries need
// {league, homeCode, home:{name,city,lat,lng}, start}; already
// chronologically ordered by the trip-building algorithm, but sorted again
// here for safety since this is a public entry point.
function loadRouteFromGames(games){
  routeStart = null;
  routeStops = games.map(g => ({
    key: `${g.league}::${g.homeCode}`,
    team: g.home,
    start: g.start instanceof Date ? g.start.toISOString() : g.start
  }));
  sortRouteStopsChronologically();
  renderStops();
  computeRoute();
  document.querySelectorAll('.header-dropdown-panel.open').forEach(p => p.classList.remove('open'));
  document.getElementById('route-panel').classList.add('open');
}

function renderStops(){
  const container = document.getElementById('route-stops');
  const clearBtn = document.getElementById('clear-route-btn');
  const hint = document.getElementById('route-hint');
  if(!routeStart && routeStops.length === 0){
    container.innerHTML = '';
    clearBtn.disabled = true;
    hint.style.display = 'block';
    return;
  }
  hint.style.display = 'none';
  clearBtn.disabled = false;

  const rows = [];
  if(routeStart){
    rows.push(`
      <div class="route-stop route-start">
        <span class="num start-flag">${ICONS.flag}</span>
        <span class="name">${routeStart.name}</span>
        <span class="rm" onclick="clearRouteStart()">×</span>
      </div>
    `);
  }
  routeStops.forEach((s,i) => {
    rows.push(`
      <div class="route-stop">
        <span class="num">${i+1}</span>
        <span class="name">${s.team.name}</span>
        <span class="rm" onclick="removeStop('${s.key.replace(/'/g,"\\'")}')">×</span>
      </div>
    `);
  });

  const legsValid = routeLegs && routeLegs.length === rows.length - 1;
  let html = rows[0];
  for(let i=1;i<rows.length;i++){
    if(legsValid){
      const leg = routeLegs[i-1];
      html += `<div class="route-leg">${fmtHM(leg.time)} · ${(leg.distance/1000).toFixed(0)} km</div>`;
    }
    html += rows[i];
  }
  container.innerHTML = html;
}

let routeLegs = null; // per-leg {time,distance}, matching the current points order, or null
let routeComputeId = 0;

async function computeRoute(){
  const summary = document.getElementById('route-summary');
  if(routingControl){ map.removeControl(routingControl); routingControl = null; }
  const points = [...(routeStart ? [routeStart] : []), ...routeStops.map(s => s.team)];
  routeLegs = null;
  const computeId = ++routeComputeId;
  if(points.length < 2){ summary.style.display='none'; summary.textContent=''; renderStops(); return; }
  const waypoints = points.map(p => L.latLng(p.lat, p.lng));
  routingControl = L.Routing.control({
    waypoints: waypoints,
    lineOptions: { styles: [{ color:'#FFF200', weight:5, opacity:0.9 }] },
    createMarker: () => null,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    show: false,
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' })
  }).addTo(map);
  routingControl.on('routesfound', (e) => {
    const route = e.routes[0];
    const km = (route.summary.totalDistance/1000).toFixed(0);
    const hrs = route.summary.totalTime/3600;
    const h = Math.floor(hrs); const m = Math.round((hrs-h)*60);
    summary.style.display='block';
    summary.textContent = `≈ ${km} km · ${h} hr ${m} min driving time`;
  });
  routingControl.on('routingerror', () => {
    summary.style.display='block';
    summary.textContent = 'Could not calculate a route (a ferry crossing may be required).';
  });

  // Per-leg time/distance, fetched the same way as Combinable Trips (a
  // separate OSRM table lookup) since Leaflet Routing Machine's route
  // object doesn't expose a reliable per-leg breakdown.
  try{
    const matrix = await fetchDurationMatrix(points.map(p => ({ lat:p.lat, lng:p.lng })));
    if(computeId !== routeComputeId) return; // a newer route has since superseded this one
    if(matrix){
      routeLegs = points.slice(1).map((_, i) => ({
        time: matrix.durations[i][i+1],
        distance: matrix.distances[i][i+1]
      }));
      renderStops();
    }
  } catch(e){ /* leg breakdown is best-effort */ }
}

// ===== Radius search =====
// Straight-line ("as the crow flies") distance — the right metric for "is
// this fixture within X km of this point", unlike the drive-time/distance
// used for routing and combinable trips.
function haversine(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Free, keyless geocoding via OpenStreetMap's Nominatim — same data source
// as the map tiles and OSRM routing already used elsewhere in this app.
async function geocodeAddress(address){
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  const results = await res.json();
  if(!results.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), label: results[0].display_name };
}

// Reverse geocoding for map-click picks — turns a lat/lng into a readable
// label for the status line and the address box. Falls back to the raw
// coordinates if Nominatim has nothing for that exact point (open water,
// remote areas).
async function reverseGeocode(lat, lng){
  try{
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`;
    const res = await fetch(url);
    const result = await res.json();
    if(result && result.display_name) return result.display_name;
  } catch(e){ /* fall through to coordinate label */ }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

let radiusCircle = null;
let radiusMarkers = [];
let lastRadiusPoint = null; // {lat,lng,label} of the last successfully geocoded address

function clearRadiusSearch(){
  if(radiusCircle){ map.removeLayer(radiusCircle); radiusCircle = null; }
  radiusMarkers.forEach(m => map.removeLayer(m));
  radiusMarkers = [];
  document.getElementById('radius-results').innerHTML = '';
}

// Pure filter + redraw for an already-geocoded point — no network call, so
// this is what scroll-to-adjust re-runs on every tick. fitView is skipped
// for scroll adjustments so the map doesn't jump around mid-gesture; the
// circle/markers/list still update live.
// Small crest thumbnail for a radius-result row; falls back to a plain
// league-color dot if the club has no crest on file or it fails to load.
function handleResultLogoError(imgEl, color){
  imgEl.outerHTML = `<span class="result-logo-dot" style="background:${color}"></span>`;
}
function resultLogoHtml(logoUrl, color){
  return logoUrl
    ? `<img class="result-logo" src="${logoUrl}" onerror="handleResultLogoError(this,'${color}')">`
    : `<span class="result-logo-dot" style="background:${color}"></span>`;
}

function renderRadiusResults(point, radiusKm, fitView){
  clearRadiusSearch();
  const status = document.getElementById('radius-status');

  // Search across ALL leagues and ALL matchdays currently loaded — not just
  // the leagues/matchday toggled on — since "what's near this address" is
  // naturally a global question, independent of the current view filter.
  const pool = buildGamePool();
  const matches = pool
    .map(g => ({ ...g, distKm: haversine(point.lat, point.lng, g.home.lat, g.home.lng) }))
    .filter(g => g.distKm <= radiusKm)
    .sort((a,b) => a.distKm - b.distKm);

  status.textContent = `${matches.length} fixture${matches.length===1?'':'s'} within ${radiusKm} km of "${point.label.split(',').slice(0,3).join(',')}"`;

  radiusCircle = L.circle([point.lat, point.lng], {
    radius: radiusKm * 1000, color: '#FFF200',
    weight: 2, fillColor: '#FFF200', fillOpacity: 0.08
  }).addTo(map);

  const bounds = [[point.lat, point.lng]];
  const resultsList = document.getElementById('radius-results');

  matches.slice(0, 60).forEach(g => {
    const stopKey = `${g.league}::${g.homeCode}`;
    const watchKey = watchKeyFor(g.league, g.homeCode, g.matchday);
    const watchItem = { key: watchKey, league: g.league, homeCode: g.homeCode, homeName: g.home.name, awayName: g.awayName, city: g.home.city, start: g.start.toISOString(), lat: g.home.lat, lng: g.home.lng };
    const gameLabel = `${g.home.name} vs ${g.awayName}`;
    const marker = L.marker([g.home.lat, g.home.lng], { icon: makeIcon(LEAGUE_COLOR[g.league], g.home.logo) });
    marker.bindPopup(`
      <div class="popup-club">${gameLabel}</div>
      <div class="popup-meta">${g.home.city} · ${fmtDate(g.start.toISOString())} · ${LEAGUE_LABELS[g.league] || g.league}</div>
      <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button><button class="watch-btn" data-key="${watchKey}">☆ Plan</button><button class="suggest-trip-btn" data-key="${watchKey}">${ICONS.sparkle} Suggest trip</button></div>
    `);
    bindStopButton(marker, stopKey, g.home, g.start.toISOString());
    bindWatchButton(marker, watchItem);
    bindSuggestButton(marker, watchKey, g.league, g.homeCode, g.start.toISOString(), gameLabel);
    marker.addTo(map);
    radiusMarkers.push(marker);
    bounds.push([g.home.lat, g.home.lng]);

    const item = document.createElement('div');
    item.className = 'radius-result';
    item.innerHTML = `
      <span class="watch-star" data-key="${watchKey}">☆</span>
      ${resultLogoHtml(g.home.logo, LEAGUE_COLOR[g.league])}
      <div class="rbody">
        <div class="rteams">${g.home.name} – ${g.awayName}</div>
        <div class="rmeta">${g.distKm.toFixed(0)} km · ${g.home.city} · ${fmtDate(g.start.toISOString())} · ${LEAGUE_LABELS[g.league] || g.league}</div>
      </div>
      <span class="suggest-btn" data-tooltip="Suggest a trip around this game">${ICONS.sparkle}</span>
    `;
    item.querySelector('.rbody').onclick = () => { map.setView([g.home.lat, g.home.lng], 10); marker.openPopup(); };
    makeWatchable(item, watchItem, item.querySelector('.watch-star'));
    item.querySelector('.suggest-btn').onclick = (e) => { e.stopPropagation(); suggestTripsFor(g.league, g.homeCode, g.start.toISOString(), gameLabel); };
    resultsList.appendChild(item);
  });

  if(fitView) map.fitBounds(bounds, { padding: [50,50] });
  radiusCircle.bringToFront();
}

async function runRadiusSearch(){
  const address = document.getElementById('radius-address').value.trim();
  const radiusKm = parseInt(document.getElementById('radius-km').value, 10);
  const status = document.getElementById('radius-status');
  const btn = document.getElementById('radius-search-btn');
  clearRadiusSearch();

  if(!address){ status.textContent = 'Enter an address first.'; return; }

  status.textContent = 'Looking up address…';
  btn.disabled = true;
  let point;
  try{
    point = await geocodeAddress(address);
  } catch(e){
    point = null;
  }
  btn.disabled = false;

  if(!point){
    status.textContent = 'Could not find that address. Try a more specific one (city, country).';
    return;
  }

  lastRadiusPoint = point;
  renderRadiusResults(point, radiusKm, true);
}

// Lets the radius search's center point (from an address search or a
// map-pick) double as the route's start point, so a scouting trip can be
// planned outward from "wherever I searched" as well as from an airport.
function useRadiusPointAsStart(){
  if(!lastRadiusPoint){
    document.getElementById('radius-status').textContent = 'Search an address or pick a point first.';
    return;
  }
  setRouteStart({
    name: lastRadiusPoint.label.split(',').slice(0,3).join(','),
    lat: lastRadiusPoint.lat, lng: lastRadiusPoint.lng
  });
}

// Radius is a continuous slider (5-500 km, step 5) rather than a fixed list
// of stops — dragging it (or scrolling over it) re-filters live against the
// already-geocoded point straight away, no "Search" click needed. Only a
// brand-new address still needs Search, since that's the one step that
// actually has to call Nominatim.
const radiusSlider = document.getElementById('radius-km');
const radiusKmLabel = document.getElementById('radius-km-label');

function setRadiusSlider(km, live){
  radiusSlider.value = String(km);
  radiusKmLabel.textContent = `${km} km`;
  if(live && lastRadiusPoint) renderRadiusResults(lastRadiusPoint, km, false);
}

radiusSlider.addEventListener('input', () => setRadiusSlider(parseInt(radiusSlider.value, 10), true));

radiusSlider.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = parseInt(radiusSlider.step, 10);
  const min = parseInt(radiusSlider.min, 10), max = parseInt(radiusSlider.max, 10);
  const next = Math.max(min, Math.min(max, parseInt(radiusSlider.value, 10) + (e.deltaY < 0 ? step : -step)));
  setRadiusSlider(next, true);
}, { passive:false });

// Pick-a-point-on-the-map mode: click the button, then click anywhere on
// the map to use that spot as the radius search center instead of typing
// an address. One-shot — picking a point (or clicking the button again)
// turns it back off.
let mapPickMode = false;

function toggleMapPick(){
  mapPickMode = !mapPickMode;
  const btn = document.getElementById('radius-pick-btn');
  const mapEl = document.getElementById('map');
  btn.classList.toggle('active', mapPickMode);
  btn.innerHTML = mapPickMode ? 'Click anywhere on the map…' : `${ICONS.target} Pick point on map`;
  mapEl.classList.toggle('picking', mapPickMode);
}

map.on('click', async (e) => {
  if(!mapPickMode) return;
  mapPickMode = false;
  const btn = document.getElementById('radius-pick-btn');
  const mapEl = document.getElementById('map');
  btn.classList.remove('active');
  btn.innerHTML = `${ICONS.target} Pick point on map`;
  mapEl.classList.remove('picking');

  const { lat, lng } = e.latlng;
  const status = document.getElementById('radius-status');
  status.textContent = 'Looking up that location…';
  const label = await reverseGeocode(lat, lng);
  document.getElementById('radius-address').value = label;
  const point = { lat, lng, label };
  lastRadiusPoint = point;
  const radiusKm = parseInt(document.getElementById('radius-km').value, 10);
  renderRadiusResults(point, radiusKm, true);
  // The click that picked this point also bubbled to the generic dropdown
  // outside-click handler, which closed this panel before this async
  // handler could finish — reopen it so the results are actually visible.
  document.getElementById('radius-panel').classList.add('open');
});

// ===== Reset all filters =====
// Deliberately scoped to *filters/view state*, not to content the user
// built up on purpose — route planning (its own "Clear") and the "My Plan"
// watchlist (its own rename/delete flow) are left untouched.
function resetAllFilters(){
  selectedLeagues = new Set(['epl']);
  leagueMatchday = {};
  buildLeaguePanel();

  if(showAirports) toggleAirports();

  includeCrossBorder = false;
  const cbToggle = document.getElementById('cross-border-toggle');
  if(cbToggle) cbToggle.checked = false;
  selectedTripDays = new Set([0,1,2,3,4,5,6]);
  document.querySelectorAll('.day-btn').forEach(b => b.classList.add('active'));
  focusedFixtures = [];

  if(mapPickMode) toggleMapPick();
  clearRadiusSearch();
  lastRadiusPoint = null;
  document.getElementById('radius-address').value = '';
  document.getElementById('radius-status').textContent = '';
  setRadiusSlider(100, false);

  document.querySelectorAll('.header-dropdown-panel.open').forEach(p => p.classList.remove('open'));

  renderAll();
  if(calendarOpen) renderCalendar();
}

// ===== Calendar view =====
// A full-screen month grid over #body (map + side panel) for the
// currently selected leagues, bounded by a From/To date range — doubles
// as "search by date" since picking the range IS the filter. Clicking a
// day with games shows that day's fixtures below the grid. Deliberately
// an in-app overlay rather than a real second page/URL, so it shares all
// in-memory state (loaded data, league selection, plan) instead of
// duplicating it; the header/controls bar stays visible and usable while
// it's open.
let calendarOpen = false;
let calendarViewDate = new Date(); // which month is displayed (day-of-month ignored)
let calendarSelectedDate = null;   // 'YYYY-MM-DD' of the day shown in the detail pane, or null

function toggleCalendarView(){
  calendarOpen = !calendarOpen;
  document.getElementById('calendar-view').classList.toggle('open', calendarOpen);
  document.getElementById('calendar-toggle-btn').classList.toggle('active', calendarOpen);
  if(calendarOpen){
    const fromInput = document.getElementById('calendar-date-from');
    if(!fromInput.value) calendarJumpToday();
    else renderCalendar();
  }
}

function calendarJumpToday(){
  const today = new Date();
  document.getElementById('calendar-date-from').value = localDateKey(today);
  const to = new Date(today);
  to.setDate(to.getDate() + 30);
  document.getElementById('calendar-date-to').value = localDateKey(to);
  calendarViewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  calendarSelectedDate = null;
  renderCalendar();
}

function calendarShiftMonth(delta){
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + delta, 1);
  renderCalendar();
}

function calendarSelectDay(key){
  calendarSelectedDate = key;
  renderCalendar();
}

function fmtTimeOnly(date){
  return date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

// Local (not UTC) calendar-day key, so grouping matches what the user
// actually sees displayed elsewhere (fmtDate etc. also render local time).
function localDateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Multi-line match-list preview for a day cell's hover tooltip — lets you
// read what's on without having to click the day first. Capped so a busy
// day (many leagues selected) doesn't produce an unreadably long bubble.
function buildDayTooltip(dayFixtures){
  const sorted = dayFixtures.slice().sort((a,b) => a.start - b.start);
  const lines = sorted.slice(0, 6).map(g => `${fmtTimeOnly(g.start)}  ${g.home.name} – ${g.awayName}`);
  if(sorted.length > 6) lines.push(`+${sorted.length - 6} more`);
  return lines.join('\n')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Short pairings shown directly inside a day cell (kickoff time + first
// name word each, e.g. "20:00 Arsenal–Coventry") now that the tiles are
// big enough for it — the full names are still one hover (buildDayTooltip)
// or click (renderCalendarDayDetail) away, so truncation/rare ambiguity
// between similarly-named clubs (e.g. both Manchester sides) is an
// acceptable tradeoff for an at-a-glance preview, not the final word. Each
// line gets a chip styled with its league's color as a left accent, so a
// day with multiple selected leagues stays easy to scan at a glance.
function buildDayCellMatches(dayFixtures){
  const sorted = dayFixtures.slice().sort((a,b) => a.start - b.start);
  const firstWord = name => name.split(' ')[0];
  const shown = sorted.slice(0, 3)
    .map(g => `<div class="cal-match-line" style="border-left-color:${LEAGUE_COLOR[g.league] || '#999'}" oncontextmenu="jumpToFixtureFromCalendarCell(event, '${g.league}', '${g.homeCode}', ${g.matchday})"><span class="cal-match-time">${fmtTimeOnly(g.start)}</span> ${firstWord(g.home.name)}–${firstWord(g.awayName)}</div>`)
    .join('');
  const more = sorted.length > 3 ? `<div class="cal-match-more">+${sorted.length - 3} more</div>` : '';
  return `<div class="cal-matches">${shown}${more}</div>`;
}

// Switches to a fixture's league/matchday, closes the Calendar, and centers
// the map on its venue — the single "open this game on the map" action
// used both by the day-detail list (left-click) and, as a shortcut straight
// from the month grid, by right-clicking a match chip (see
// jumpToFixtureFromCalendarCell / buildDayCellMatches).
function jumpToFixtureOnMap(league, matchday, lat, lng){
  selectedLeagues.add(league);
  leagueMatchday[league] = matchday;
  buildLeaguePanel();
  renderAll();
  toggleCalendarView();
  setTimeout(() => { map.setView([lat, lng], 10); }, 150);
}

// Right-click on a match chip in the month grid: jump straight to the map
// without first left-clicking the day to open its detail list below.
function jumpToFixtureFromCalendarCell(event, league, homeCode, matchday){
  event.preventDefault();
  event.stopPropagation(); // don't also trigger the day cell's own onclick (calendarSelectDay)
  const h = TEAMS[league] && TEAMS[league][homeCode];
  if(!h) return;
  jumpToFixtureOnMap(league, matchday, h.lat, h.lng);
}

function renderCalendar(){
  const grid = document.getElementById('calendar-grid');
  const detail = document.getElementById('calendar-day-detail');
  const year = calendarViewDate.getFullYear(), month = calendarViewDate.getMonth();
  document.getElementById('calendar-month-label').textContent =
    calendarViewDate.toLocaleDateString('en-GB', { month:'long', year:'numeric' });

  const leagues = Object.keys(LEAGUE_LABELS).filter(c => selectedLeagues.has(c));
  if(leagues.length === 0){
    grid.innerHTML = `<div class="empty-note">Select at least one league (top left) to see its fixtures here.</div>`;
    detail.innerHTML = '';
    return;
  }

  const fromVal = document.getElementById('calendar-date-from').value;
  const toVal = document.getElementById('calendar-date-to').value;
  const fromDate = fromVal ? new Date(fromVal + 'T00:00:00') : null;
  const toDate = toVal ? new Date(toVal + 'T23:59:59') : null;

  // Fixtures for the displayed month only, grouped by local day.
  const byDay = {};
  leagues.forEach(league => {
    const teams = TEAMS[league];
    (FIXTURES[league] || []).forEach(f => {
      const start = new Date(f.start);
      if(start.getFullYear() !== year || start.getMonth() !== month) return;
      const h = teams[f.home];
      if(!h) return;
      const a = teams[f.away];
      const key = localDateKey(start);
      (byDay[key] = byDay[key] || []).push({ league, home:h, homeCode:f.home, awayName: a ? a.name : f.away, start, matchday:f.matchday });
    });
  });

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // 0=Mon..6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());

  // Days this month that actually have games within the From/To range, in
  // date order — used both to build the grid and to auto-pick a sensible
  // default day below, so the detail pane shows real fixtures right away
  // instead of an empty "click a day" prompt.
  const inRangeGameDays = [];
  for(let d=1; d<=daysInMonth; d++){
    const cellDate = new Date(year, month, d);
    const key = localDateKey(cellDate);
    const inRange = (!fromDate || cellDate >= fromDate) && (!toDate || cellDate <= toDate);
    if((byDay[key] || []).length > 0 && inRange) inRangeGameDays.push(key);
  }
  if(!calendarSelectedDate || inRangeGameDays.indexOf(calendarSelectedDate) === -1){
    calendarSelectedDate = inRangeGameDays.includes(todayKey) ? todayKey : (inRangeGameDays[0] || null);
  }

  let cells = '';
  for(let i=0;i<startOffset;i++) cells += `<div class="cal-cell cal-pad"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const cellDate = new Date(year, month, d);
    const key = localDateKey(cellDate);
    const dayFixtures = byDay[key] || [];
    const hasGames = inRangeGameDays.includes(key);
    const classes = ['cal-cell'];
    if(key === todayKey) classes.push('cal-today');
    if(key === calendarSelectedDate) classes.push('cal-selected');
    classes.push(hasGames ? 'cal-has-games' : 'cal-empty');
    const tooltip = hasGames ? `data-tooltip="${buildDayTooltip(dayFixtures)}"` : '';
    const matchesHtml = hasGames ? buildDayCellMatches(dayFixtures) : '';
    cells += `
      <div class="${classes.join(' ')}" ${hasGames ? `onclick="calendarSelectDay('${key}')"` : ''} ${tooltip}>
        <div class="cal-cell-top">
          <span class="cal-daynum">${d}</span>
          ${hasGames ? `<span class="cal-badge">${dayFixtures.length}</span>` : ''}
        </div>
        ${matchesHtml}
      </div>
    `;
  }
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7;
  for(let i=0;i<trailing;i++) cells += `<div class="cal-cell cal-pad"></div>`;

  grid.innerHTML = `
    <div class="cal-weekday-row">
      <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
    </div>
    <div class="cal-grid">${cells}</div>
  `;

  if(calendarSelectedDate && byDay[calendarSelectedDate]){
    renderCalendarDayDetail(calendarSelectedDate, byDay[calendarSelectedDate]);
  } else {
    calendarSelectedDate = null;
    detail.innerHTML = `<div class="empty-note">Click a day with games (green outline, badge shows the count) to see its fixtures here.</div>`;
  }
}

function renderCalendarDayDetail(key, dayFixtures){
  const detail = document.getElementById('calendar-day-detail');
  const [y, m, d] = key.split('-').map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const games = dayFixtures.slice().sort((a,b) => a.start - b.start);

  let html = `<div class="calendar-day-header">${dayLabel}</div>`;
  games.forEach(g => {
    const watchKey = watchKeyFor(g.league, g.homeCode, g.matchday);
    html += `
      <div class="calendar-row" data-key="${watchKey}">
        <span class="watch-star" data-key="${watchKey}">☆</span>
        ${resultLogoHtml(g.home.logo, LEAGUE_COLOR[g.league])}
        <div class="crbody">
          <div class="crteams">${g.home.name} – ${g.awayName}</div>
          <div class="crmeta">${fmtTimeOnly(g.start)} · ${g.home.city} · ${LEAGUE_LABELS[g.league] || g.league}</div>
        </div>
      </div>
    `;
  });
  detail.innerHTML = html;

  games.forEach(g => {
    const watchKey = watchKeyFor(g.league, g.homeCode, g.matchday);
    const row = detail.querySelector(`.calendar-row[data-key="${CSS.escape(watchKey)}"]`);
    if(!row) return;
    const watchItem = { key: watchKey, league: g.league, homeCode: g.homeCode, homeName: g.home.name, awayName: g.awayName, city: g.home.city, start: g.start.toISOString(), lat: g.home.lat, lng: g.home.lng };
    makeWatchable(row, watchItem, row.querySelector('.watch-star'));
    row.querySelector('.crbody').onclick = () => jumpToFixtureOnMap(g.league, g.matchday, g.home.lat, g.home.lng);
  });
}

// ===== Bootstrap: load data, then render =====
async function loadData(){
  const [teamsRes, fixturesRes, airportsRes, leaguesRes] = await Promise.all([
    fetch('data/teams.json'),
    fetch('data/fixtures.json'),
    fetch('data/airports.json'),
    fetch('data/leagues.json')
  ]);
  TEAMS = await teamsRes.json();
  FIXTURES = await fixturesRes.json();
  AIRPORTS = await airportsRes.json();
  LEAGUE_LOGO = await leaguesRes.json();

  buildLeaguePanel();
  renderWatchlist();
  renderAll();
}

loadData();
