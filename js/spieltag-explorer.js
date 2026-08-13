// ===== Team + fixture data, loaded from data/*.json =====
let TEAMS = {};
let FIXTURES = {};

const LEAGUE_COLOR = { epl:"#1c3f95", la_liga:"#c8102e", bundesliga:"#2b2b2b", serie_a:"#008c45", ligue_1:"#0055a4", primeira_liga:"#046a38", eredivisie:"#ff8c00", pro_league:"#f7c631", allsvenskan:"#005293", eliteserien:"#a3123a", superliga:"#c8102e", veikkausliiga:"#003580" };
const COUNTRY_TAG = {
  epl:"ENG", la_liga:"ESP", bundesliga:"GER", serie_a:"ITA", ligue_1:"FRA", primeira_liga:"POR",
  eredivisie:"NED", pro_league:"BEL", allsvenskan:"SWE", eliteserien:"NOR", superliga:"DEN", veikkausliiga:"FIN"
};

// ===== Map setup =====
const map = L.map('map', { zoomControl:true }).setView([48, 5], 4);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 19
}).addTo(map);

let currentMarkers = [];

function makeIcon(color){
  return L.divIcon({
    className:'',
    html:`<div style="width:14px;height:14px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize:[14,14], iconAnchor:[7,14], popupAnchor:[0,-14]
  });
}

function haversine(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
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

function onLeagueChange(){
  const league = document.getElementById('league-select').value;
  const mdSelect = document.getElementById('matchday-select');
  const matchdays = [...new Set(FIXTURES[league].map(f => f.matchday))].sort((a,b)=>a-b);
  mdSelect.innerHTML = matchdays.map(md => `<option value="${md}">Matchday ${md}</option>`).join('');
  renderLeague(league);
}

function renderLeague(league){
  currentMarkers.forEach(m => map.removeLayer(m));
  currentMarkers = [];

  const teams = TEAMS[league];
  const selectedMd = parseInt(document.getElementById('matchday-select').value, 10);
  const fixtures = FIXTURES[league].filter(f => f.matchday === selectedMd).slice().sort((a,b)=> new Date(a.start)-new Date(b.start));
  const color = LEAGUE_COLOR[league];
  const lightColor = lightenColor(color, 0.72);
  const bounds = [];

  // Muted grey markers for all OTHER leagues, for geographic context
  Object.keys(FIXTURES).forEach(otherLeague => {
    if(otherLeague === league) return;
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

  // Which clubs of the selected league have an upcoming home fixture in this data window?
  const homeThisWindow = new Set(fixtures.map(f => f.home));

  // All other clubs of the SAME league without a home fixture right now: pale version of the league color
  Object.keys(teams).forEach(code => {
    if(homeThisWindow.has(code)) return; // will be drawn highlighted below
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

  // Fixtures list + highlighted markers (selected league, clubs WITH a home fixture)
  const fixturesList = document.getElementById('fixtures-list');
  fixturesList.innerHTML = '';
  document.getElementById('fixtures-heading').textContent = `Home Fixtures – Matchday ${selectedMd} (${fixtures.length})`;

  fixtures.forEach(f => {
    const h = teams[f.home];
    const a = teams[f.away];
    if(!h) return;
    const stopKey = `${league}::${f.home}`;
    const marker = L.marker([h.lat, h.lng], { icon: makeIcon(color) });
    marker.bindTooltip(h.name, { permanent:true, direction:'bottom', offset:[0,2], className:'club-label' });
    marker.bindPopup(`
      <div class="popup-club">${h.name} vs ${a ? a.name : f.away}</div>
      <div class="popup-meta">${h.city} · ${fmtDate(f.start)}</div>
      <div><button class="add-stop-btn" data-stop="${stopKey}">+ Add to route</button></div>
    `);
    bindStopButton(marker, stopKey, h);
    marker.addTo(map);
    currentMarkers.push(marker);
    bounds.push([h.lat, h.lng]);

    const item = document.createElement('div');
    item.className = 'fixture-item';
    item.innerHTML = `
      <div class="teams">${h.name} – ${a ? a.name : f.away}</div>
      <div class="meta">${h.city} · ${fmtDate(f.start)}</div>
    `;
    item.onclick = () => { map.setView([h.lat, h.lng], 9); marker.openPopup(); };
    fixturesList.appendChild(item);
  });

  if(bounds.length) map.fitBounds(bounds, { padding:[40,40] });

  renderCombos(league);
}

// ===== Cross-league trip clustering =====
// Realistic thresholds for an actual scouting road trip:
// Same-day games: tight radius (you're driving straight there and back / same day).
// Next-day games (overnight stay possible, e.g. a Saturday-into-Sunday weekend): much larger radius.
const MAX_KM_SAME_DAY = 150;
const MAX_KM_NEXT_DAY = 500;
const MIN_GAP_H = 3;         // need at least a few hours to travel + get to the ground
const SAME_DAY_MAX_H = 14;   // still counts as "same day", tight radius applies
const MAX_GAP_H = 48;        // covers a full weekend (Fri evening -> Sun evening)

function maxKmFor(gapH){
  if(gapH <= SAME_DAY_MAX_H) return MAX_KM_SAME_DAY;
  if(gapH <= MAX_GAP_H) return MAX_KM_NEXT_DAY;
  return 0;
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
        league, country: COUNTRY_TAG[league],
        home: h, awayName: a ? a.name : f.away,
        start: new Date(f.start)
      });
    });
  });
  pool.sort((x,y) => x.start - y.start);
  return pool;
}

function renderCombos(selectedLeague){
  const combosList = document.getElementById('combos-list');
  combosList.innerHTML = '';

  const pool = buildGamePool();
  const n = pool.length;

  // Union-Find to build trip clusters across ALL loaded leagues
  const parent = Array.from({length:n}, (_,i)=>i);
  function find(x){ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
  function union(a,b){ const ra=find(a), rb=find(b); if(ra!==rb) parent[ra]=rb; }

  for(let i=0;i<n;i++){
    for(let j=i+1;j<n;j++){
      const gapH = (pool[j].start - pool[i].start) / 36e5;
      if(gapH > MAX_GAP_H) break; // sorted by time, no need to check further j for this i
      if(gapH < MIN_GAP_H) continue;
      const allowedKm = maxKmFor(gapH);
      if(allowedKm === 0) continue;
      const dist = haversine(pool[i].home.lat,pool[i].home.lng,pool[j].home.lat,pool[j].home.lng);
      if(dist <= allowedKm){
        union(i,j);
      }
    }
  }

  const groups = {};
  for(let i=0;i<n;i++){
    const r = find(i);
    if(!groups[r]) groups[r] = [];
    groups[r].push(pool[i]);
  }

  let clusters = Object.values(groups).filter(g => g.length >= 2);

  // Filter: only keep trips that include at least one game from the selected league
  if(selectedLeague){
    clusters = clusters.filter(cluster => cluster.some(g => g.league === selectedLeague));
  }

  clusters.forEach(c => c.sort((a,b)=> a.start-b.start));
  // Sort clusters: bigger trips first, then earliest
  clusters.sort((a,b) => b.length - a.length || a[0].start - b[0].start);

  const heading = document.getElementById('combos-heading');
  if(heading){
    const leagueLabel = document.getElementById('league-select').selectedOptions[0].textContent;
    heading.textContent = selectedLeague ? `Combinable Trips (involving ${leagueLabel})` : `Combinable Trips (all loaded leagues)`;
  }

  if(clusters.length === 0){
    combosList.innerHTML = `<div class="empty-note">With the currently loaded leagues and this data snapshot, no home fixtures involving this league are close enough together to form a sensible trip (≤ ${MAX_KM_SAME_DAY} km same-day, ≤ ${MAX_KM_NEXT_DAY} km if overnight into the next day, ${MIN_GAP_H}–${MAX_GAP_H} hrs apart).</div>`;
    return;
  }

  clusters.slice(0, 10).forEach((cluster, idx) => {
    const countries = [...new Set(cluster.map(g => g.country))];
    const crossBorder = countries.length > 1;
    let totalKm = 0;
    let legNotes = [];
    for(let k=1;k<cluster.length;k++){
      const legKm = haversine(cluster[k-1].home.lat,cluster[k-1].home.lng,cluster[k].home.lat,cluster[k].home.lng);
      const legGapH = (cluster[k].start - cluster[k-1].start) / 36e5;
      totalKm += legKm;
      legNotes.push(legGapH > SAME_DAY_MAX_H ? 'overnight' : 'same day');
    }
    const card = document.createElement('div');
    card.className = 'combo-card';
    let gamesHtml = cluster.map((g,i) => {
      const isSelected = selectedLeague && g.league === selectedLeague;
      const legNote = i > 0 ? ` <span style="color:#00A650; font-size:0.62rem;">(${legNotes[i-1]} leg)</span>` : '';
      return `
      <div class="combo-game" style="${isSelected ? 'font-weight:700;' : ''}">${i+1}. ${g.home.name} <span style="color:#6b6455;">(${g.country})</span> – ${g.awayName}${isSelected ? ' ★' : ''}${legNote}<br>
      <span style="color:#6b6455; font-size:0.66rem;">${g.home.city} · ${fmtDate(g.start.toISOString())}</span></div>
    `;
    }).join('');
    card.innerHTML = `
      <div class="combo-title">${crossBorder ? '🌍 Cross-border trip' : 'Trip'} ${idx+1} · ${cluster.length} games</div>
      ${gamesHtml}
      <div class="combo-stats">≈ ${totalKm.toFixed(0)} km total (straight-line, leg by leg) · ${countries.join(' → ')}</div>
    `;
    card.onclick = () => {
      const bnds = cluster.map(g => [g.home.lat, g.home.lng]);
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

// ===== Bootstrap: load data, then render =====
async function loadData(){
  const [teamsRes, fixturesRes] = await Promise.all([
    fetch('data/teams.json'),
    fetch('data/fixtures.json')
  ]);
  TEAMS = await teamsRes.json();
  FIXTURES = await fixturesRes.json();
  onLeagueChange();
}

loadData();
