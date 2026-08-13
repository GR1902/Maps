// ===== Team + fixture data, loaded from data/*.json =====
let TEAMS = {};
let FIXTURES = {};
let AIRPORTS = [];
let LEAGUE_LOGO = {}; // league code -> competition logo URL, loaded from data/leagues.json

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
  czech_first_league:"#11457e", croatian_hnl:"#c65102"
};
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
  czech_first_league: "Chance Liga (CZE)", croatian_hnl: "HNL (CRO)"
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
    html:`<div class="airport-icon">✈️</div>`,
    iconSize:[18,18], iconAnchor:[9,9], popupAnchor:[0,-9]
  });
}

function renderAirports(){
  airportMarkers.forEach(m => map.removeLayer(m));
  airportMarkers = [];
  if(!showAirports) return;
  AIRPORTS.forEach(ap => {
    const marker = L.marker([ap.lat, ap.lng], { icon: makeAirportIcon(), zIndexOffset: -1000 });
    marker.bindPopup(`
      <div class="popup-club">✈️ ${ap.name} (${ap.iata})</div>
      <div class="popup-meta">${ap.city}</div>
    `);
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

  // Muted grey markers for every league NOT selected, for geographic context
  Object.keys(FIXTURES).forEach(otherLeague => {
    if(selectedLeagues.has(otherLeague)) return;
    const otherTeams = TEAMS[otherLeague];
    FIXTURES[otherLeague].forEach(f => {
      const h = otherTeams[f.home];
      const a = otherTeams[f.away];
      if(!h) return;
      const stopKey = `${otherLeague}::${f.home}`;
      const marker = L.marker([h.lat, h.lng], { icon: makeMutedIcon() });
      marker.bindPopup(`
        <div class="popup-club">${h.name} vs ${a ? a.name : f.away}</div>
        <div class="popup-meta">${h.city} · ${fmtDate(f.start)} · ${COUNTRY_TAG[otherLeague]}</div>
        <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button></div>
      `);
      bindStopButton(marker, stopKey, h);
      marker.addTo(map);
      currentMarkers.push(marker);
    });
  });

  const fixturesContainer = document.getElementById('fixtures-container');
  fixturesContainer.innerHTML = '';
  const anchorSelections = [];

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
      const marker = L.marker([h.lat, h.lng], { icon: makeIcon(color, h.logo) });
      marker.bindTooltip(h.name, { permanent:true, direction:'bottom', offset:[0,2], className:'club-label' });
      marker.bindPopup(`
        <div class="popup-club">${h.name} vs ${a ? a.name : f.away}</div>
        <div class="popup-meta">${h.city} · ${fmtDate(f.start)}</div>
        <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button><button class="watch-btn" data-key="${watchKey}">☆ Plan</button></div>
      `);
      bindStopButton(marker, stopKey, h);
      bindWatchButton(marker, watchItem);
      marker.addTo(map);
      currentMarkers.push(marker);
      bounds.push([h.lat, h.lng]);

      const item = document.createElement('div');
      item.className = 'fixture-item';
      item.innerHTML = `
        <span class="watch-star" data-key="${watchKey}">☆</span>
        <div class="fbody">
          <div class="teams">${h.name} – ${a ? a.name : f.away}</div>
          <div class="meta">${h.city} · ${fmtDate(f.start)}</div>
        </div>
      `;
      item.querySelector('.fbody').onclick = () => { map.setView([h.lat, h.lng], 9); marker.openPopup(); };
      makeWatchable(item, watchItem, item.querySelector('.watch-star'));
      listDiv.appendChild(item);
    });

    anchorSelections.push({ league, matchday: selectedMd, fixtures });
  });

  if(bounds.length) map.fitBounds(bounds, { padding:[40,40] });

  renderCombosMulti(anchorSelections);
}

// ===== Cross-league trip clustering (drive-time feasibility) =====
// A leg between two home fixtures is only offered as a combo if you could
// realistically make it: leave venue A after full-time, arrive at venue B
// with time to spare before kickoff, using real driving time (not straight-
// line distance) between the two stadiums.
const POST_MATCH_BUFFER_MIN = 120; // assume full-time ~2h after kickoff
const PRE_MATCH_BUFFER_MIN = 15;   // want to arrive at least 15 min early
const MAX_TRIP_SPAN_H = 72;        // covers a full Fri-to-Mon matchday window
const MAX_LEG_KM = 600;            // don't offer a single hop longer than this, even if time allows it
const MAX_ROUTING_POOL = 80;       // cap on points sent to the OSRM table API per render

function buildGamePool(){
  const pool = [];
  Object.keys(FIXTURES).forEach(league => {
    const teams = TEAMS[league];
    FIXTURES[league].forEach(f => {
      const h = teams[f.home];
      const a = teams[f.away];
      if(!h) return;
      pool.push({
        league, country: COUNTRY_TAG[league], homeCode: f.home, matchday: f.matchday,
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

// selections: [{ league, matchday, fixtures }, ...] — one entry per
// currently selected league, each with its own chosen matchday's fixtures.
async function renderCombosMulti(selections){
  const requestId = ++combosRequestId;
  const combosList = document.getElementById('combos-list');
  const heading = document.getElementById('combos-heading');

  const withFixtures = selections.filter(s => s.fixtures.length > 0);
  const summaryLabel = selections.map(s => `${LEAGUE_LABELS[s.league]} MD${s.matchday}`).join(' · ');
  if(heading) heading.textContent = selections.length ? `Combinable Trips – ${summaryLabel}` : 'Combinable Trips';

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
  const anchorSet = new Set();
  const anchorTimes = [];
  withFixtures.forEach(s => {
    s.fixtures.forEach(f => {
      anchorSet.add(`${s.league}::${f.home}`);
      anchorTimes.push(new Date(f.start).getTime());
    });
  });
  const minAnchor = Math.min(...anchorTimes), maxAnchor = Math.max(...anchorTimes);
  const windowMs = MAX_TRIP_SPAN_H * 3600 * 1000;

  // Pre-filter the full cross-league pool to fixtures that could plausibly
  // chain to an anchor fixture, so the routing request stays small.
  let pool = buildGamePool().filter(g => {
    const t = g.start.getTime();
    return t >= minAnchor - windowMs && t <= maxAnchor + windowMs;
  });
  if(pool.length > MAX_ROUTING_POOL){
    const mid = (minAnchor + maxAnchor) / 2;
    pool = pool.slice()
      .sort((a,b) => Math.abs(a.start-mid) - Math.abs(b.start-mid))
      .slice(0, MAX_ROUTING_POOL)
      .sort((a,b) => a.start - b.start);
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
  // *total* span (first game to last) still fits within MAX_TRIP_SPAN_H.
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
    if(!anchorSet.has(`${pool[a].league}::${pool[a].homeCode}`)) continue;
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
  trips.sort((x,y) => y.length - x.length || pool[x[0]].start - pool[y[0]].start);

  if(trips.length === 0){
    combosList.innerHTML = `<div class="empty-note">No realistic combinations found around ${summaryLabel} — driving between venues doesn't leave enough time between full-time and the next kickoff (2h post-match + 15 min arrival buffer built in).</div>`;
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
      legLabels.push(`🚗 ${fmtHM(info.driveSec)} · ${info.driveKm.toFixed(0)} km · ${slackMin} min to spare`);
    }
    const gamesHtml = games.map((g,i) => {
      const isAnchor = anchorSet.has(`${g.league}::${g.homeCode}`);
      const legNote = i > 0 ? `<br><span style="color:#00A650; font-size:0.62rem;">${legLabels[i-1]}</span>` : '';
      return `
      <div class="combo-game" style="${isAnchor ? 'font-weight:700;' : ''}">${i+1}. ${g.home.name} <span style="color:#6b6455;">(${g.country})</span> – ${g.awayName}${isAnchor ? ' ★' : ''}<br>
      <span style="color:#6b6455; font-size:0.66rem;">${g.home.city} · ${fmtDate(g.start.toISOString())}</span>${legNote}</div>
    `;
    }).join('');
    const card = document.createElement('div');
    card.className = 'combo-card';
    card.innerHTML = `
      <div class="combo-title">${crossBorder ? '🌍 Cross-border trip' : 'Trip'} ${cIdx+1} · ${games.length} games</div>
      ${gamesHtml}
      <div class="combo-stats">≈ ${fmtHM(totalDriveSec)} · ${totalKm.toFixed(0)} km total driving · ${countries.join(' → ')}</div>
    `;
    card.onclick = () => {
      const bnds = games.map(g => [g.home.lat, g.home.lng]);
      map.fitBounds(bnds, { padding:[60,60] });
    };
    combosList.appendChild(card);
  });
}

function toggleFullscreen(){
  const app = document.getElementById('app');
  if(!document.fullscreenElement){ app.requestFullscreen().catch(()=>{}); }
  else{ document.exitFullscreen(); }
}
document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('fullscreen-btn');
  btn.textContent = document.fullscreenElement ? '× Close' : '⤢ Fullscreen';
  setTimeout(()=>map.invalidateSize(),150);
});
window.addEventListener('resize', () => map.invalidateSize());

// ===== Point-to-point route planning =====
// stopKey format: "league::teamCode" so any club, from any league, can be a stop.
let routeStops = []; // array of {key, team}
let routingControl = null;

function bindStopButton(marker, stopKey, teamData){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.add-stop-btn[data-stop="${CSS.escape(stopKey)}"]`);
    if(btn) btn.onclick = () => { addStop(stopKey, teamData); marker.closePopup(); };
  });
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

function addStop(key, team){
  if(routeStops.some(s => s.key === key)) return;
  routeStops.push({ key, team });
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
  renderStops();
  computeRoute();
}

function renderStops(){
  const container = document.getElementById('route-stops');
  const clearBtn = document.getElementById('clear-route-btn');
  const hint = document.getElementById('route-hint');
  if(routeStops.length === 0){
    container.innerHTML = '';
    clearBtn.disabled = true;
    hint.style.display = 'block';
    return;
  }
  hint.style.display = 'none';
  clearBtn.disabled = false;
  container.innerHTML = routeStops.map((s,i) => `
    <div class="route-stop">
      <span class="num">${i+1}</span>
      <span class="name">${s.team.name}</span>
      <span class="rm" onclick="removeStop('${s.key.replace(/'/g,"\\'")}')">×</span>
    </div>
  `).join('');
}

function computeRoute(){
  const summary = document.getElementById('route-summary');
  if(routingControl){ map.removeControl(routingControl); routingControl = null; }
  if(routeStops.length < 2){ summary.style.display='none'; summary.textContent=''; return; }
  const waypoints = routeStops.map(s => L.latLng(s.team.lat, s.team.lng));
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
    const marker = L.marker([g.home.lat, g.home.lng], {
      icon: L.divIcon({ className:'', html:'<div class="radius-pin"></div>', iconSize:[16,16], iconAnchor:[8,16], popupAnchor:[0,-16] })
    });
    marker.bindPopup(`
      <div class="popup-club">${g.home.name} vs ${g.awayName}</div>
      <div class="popup-meta">${g.home.city} · ${fmtDate(g.start.toISOString())} · ${LEAGUE_LABELS[g.league] || g.league}</div>
      <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button><button class="watch-btn" data-key="${watchKey}">☆ Plan</button></div>
    `);
    bindStopButton(marker, stopKey, g.home);
    bindWatchButton(marker, watchItem);
    marker.addTo(map);
    radiusMarkers.push(marker);
    bounds.push([g.home.lat, g.home.lng]);

    const item = document.createElement('div');
    item.className = 'radius-result';
    item.innerHTML = `
      <span class="watch-star" data-key="${watchKey}">☆</span>
      <div class="rbody">
        <div class="rteams">${g.home.name} – ${g.awayName}</div>
        <div class="rmeta">${g.distKm.toFixed(0)} km · ${g.home.city} · ${fmtDate(g.start.toISOString())} · ${LEAGUE_LABELS[g.league] || g.league}</div>
      </div>
    `;
    item.querySelector('.rbody').onclick = () => { map.setView([g.home.lat, g.home.lng], 10); marker.openPopup(); };
    makeWatchable(item, watchItem, item.querySelector('.watch-star'));
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

// Scroll over the radius dropdown to step through distances without
// re-geocoding — Nominatim is rate-limited and the address doesn't change,
// so only the local filter/redraw needs to re-run.
const RADIUS_STEPS = [10, 25, 50, 75, 100, 150, 200, 300, 400, 500];
document.getElementById('radius-km').addEventListener('wheel', (e) => {
  e.preventDefault();
  const sel = e.currentTarget;
  const current = parseInt(sel.value, 10);
  let idx = RADIUS_STEPS.indexOf(current);
  if(idx === -1) idx = RADIUS_STEPS.findIndex(v => v >= current);
  idx = Math.max(0, Math.min(RADIUS_STEPS.length - 1, idx + (e.deltaY < 0 ? 1 : -1)));
  sel.value = String(RADIUS_STEPS[idx]);
  if(lastRadiusPoint) renderRadiusResults(lastRadiusPoint, RADIUS_STEPS[idx], false);
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
  btn.textContent = mapPickMode ? 'Click anywhere on the map…' : '📍 Pick point on map';
  mapEl.classList.toggle('picking', mapPickMode);
}

map.on('click', async (e) => {
  if(!mapPickMode) return;
  mapPickMode = false;
  const btn = document.getElementById('radius-pick-btn');
  const mapEl = document.getElementById('map');
  btn.classList.remove('active');
  btn.textContent = '📍 Pick point on map';
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
