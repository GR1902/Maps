// ===== Static vector-map projection (matches build_map_svg.py) =====
const MAP = { lngMin: -27.0, latMax: 71.5, k: 24.5, cos: Math.cos(54 * Math.PI / 180), w: 864.0, h: 1016.8 };
function project(lat, lng){
  return { x: (lng - MAP.lngMin) * MAP.cos * MAP.k, y: (MAP.latMax - lat) * MAP.k };
}

const LEAGUE_COLOR = { epl:"#1c3f95", la_liga:"#c8102e", bundesliga:"#2b2b2b", serie_a:"#008c45", ligue_1:"#0055a4", primeira_liga:"#046a38", eredivisie:"#ff8c00", pro_league:"#f7c631", allsvenskan:"#005293", eliteserien:"#a3123a", superliga:"#c8102e", veikkausliiga:"#003580" };
const COUNTRY_TAG = {
  epl:"ENG", la_liga:"ESP", bundesliga:"GER", serie_a:"ITA", ligue_1:"FRA", primeira_liga:"POR",
  eredivisie:"NED", pro_league:"BEL", allsvenskan:"SWE", eliteserien:"NOR", superliga:"DEN", veikkausliiga:"FIN"
};

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function fmtHM(totalSeconds){
  const totalMin = Math.round(totalSeconds/60);
  return `${Math.floor(totalMin/60)}h ${totalMin%60}m`;
}
function haversine(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// No live routing engine is available in this format, so distance/time are
// estimated: straight-line distance with a fixed detour multiplier (roads
// aren't straight), driven at an assumed average speed.
const DETOUR_FACTOR = 1.3;
const AVG_SPEED_KMH = 80;
function estimateLeg(aLat, aLng, bLat, bLng){
  const km = haversine(aLat, aLng, bLat, bLng) * DETOUR_FACTOR;
  const sec = km / AVG_SPEED_KMH * 3600;
  return { km, sec };
}

// ===== Map viewport: pan + zoom on a plain transformed div =====
const mapWrap = document.getElementById('map-wrap');
const mapWorld = document.getElementById('map-world');
const mapSvg = document.getElementById('map-svg');
mapSvg.setAttribute('viewBox', `0 0 ${MAP.w} ${MAP.h}`);
mapSvg.setAttribute('width', MAP.w);
mapSvg.setAttribute('height', MAP.h);
mapWorld.style.width = MAP.w + 'px';
mapWorld.style.height = MAP.h + 'px';

let viewScale = 1, viewTx = 0, viewTy = 0;
function applyView(){
  mapWorld.style.transform = `translate(${viewTx}px, ${viewTy}px) scale(${viewScale})`;
  repositionPins();
}
function fitMap(){
  const rect = mapWrap.getBoundingClientRect();
  viewScale = Math.min(rect.width / MAP.w, rect.height / MAP.h) * 0.96;
  viewTx = (rect.width - MAP.w * viewScale) / 2;
  viewTy = (rect.height - MAP.h * viewScale) / 2;
  applyView();
}
function fitToPoints(points, padPx){
  if(points.length === 0) return;
  const rect = mapWrap.getBoundingClientRect();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  points.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
  const w = Math.max(maxX-minX, 20), h = Math.max(maxY-minY, 20);
  const pad = padPx || 60;
  viewScale = Math.min((rect.width-pad*2)/w, (rect.height-pad*2)/h, 6);
  viewTx = rect.width/2 - (minX+maxX)/2*viewScale;
  viewTy = rect.height/2 - (minY+maxY)/2*viewScale;
  applyView();
}
function zoomBy(factor, cx, cy){
  const rect = mapWrap.getBoundingClientRect();
  const px = cx != null ? cx : rect.width/2, py = cy != null ? cy : rect.height/2;
  const worldX = (px - viewTx) / viewScale, worldY = (py - viewTy) / viewScale;
  viewScale = Math.min(Math.max(viewScale * factor, 0.5), 12);
  viewTx = px - worldX * viewScale;
  viewTy = py - worldY * viewScale;
  applyView();
}
let dragging = false, dragStartX, dragStartY, dragTx0, dragTy0;
mapWrap.addEventListener('mousedown', (e) => {
  dragging = true; mapWrap.classList.add('grabbing');
  dragStartX = e.clientX; dragStartY = e.clientY; dragTx0 = viewTx; dragTy0 = viewTy;
});
window.addEventListener('mousemove', (e) => {
  if(!dragging) return;
  viewTx = dragTx0 + (e.clientX - dragStartX);
  viewTy = dragTy0 + (e.clientY - dragStartY);
  applyView();
});
window.addEventListener('mouseup', () => { dragging = false; mapWrap.classList.remove('grabbing'); });
mapWrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = mapWrap.getBoundingClientRect();
  zoomBy(e.deltaY < 0 ? 1.15 : 1/1.15, e.clientX-rect.left, e.clientY-rect.top);
}, { passive:false });
window.addEventListener('resize', () => { if(!hasZoomedToFixtures) fitMap(); });
let hasZoomedToFixtures = false;

// ===== Markers =====
// Pins/labels live in the unscaled #marker-layer overlay, so their on-screen
// size never changes with zoom (only their position does) — same behavior
// as Leaflet markers. pinRecords holds each element's *world* coordinates;
// repositionPins() (called from applyView on every pan/zoom) projects those
// into current screen space.
const markerLayer = document.getElementById('marker-layer');
let currentPins = [];
let pinRecords = [];
const markerByStop = {}; // stopKey -> {lat,lng,name}

function clearPins(){
  currentPins.forEach(el => el.remove());
  currentPins = [];
  pinRecords = [];
}
function repositionPins(){
  pinRecords.forEach(r => {
    r.el.style.left = (viewTx + r.wx * viewScale) + 'px';
    r.el.style.top = (viewTy + r.wy * viewScale) + 'px';
  });
}
function addPin({ lat, lng, color, size, label, popupHtml, stopKey, muted }){
  const p = project(lat, lng);
  const pin = document.createElement('div');
  pin.className = 'pin' + (muted ? ' muted' : '');
  if(!muted){
    pin.style.width = size + 'px'; pin.style.height = size + 'px';
    pin.style.margin = `-${size}px 0 0 -${size/2}px`;
    pin.style.background = color;
  }
  if(popupHtml){
    pin.addEventListener('click', (e) => { e.stopPropagation(); openPopup(p, popupHtml, stopKey); });
  }
  markerLayer.appendChild(pin);
  currentPins.push(pin);
  pinRecords.push({ el: pin, wx: p.x, wy: p.y });
  if(label){
    const lbl = document.createElement('div');
    lbl.className = 'pin-label';
    lbl.textContent = label;
    markerLayer.appendChild(lbl);
    currentPins.push(lbl);
    pinRecords.push({ el: lbl, wx: p.x, wy: p.y });
  }
  return p;
}

function lightenColor(hex, amount){
  const c = hex.replace('#','');
  const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
  const nr = Math.round(r + (255-r)*amount), ng = Math.round(g + (255-g)*amount), nb = Math.round(b + (255-b)*amount);
  return `rgb(${nr},${ng},${nb})`;
}

// ===== Popup =====
const popupEl = document.getElementById('popup');
const popupBody = document.getElementById('popup-body');
let popupStopKey = null, popupStopData = null;
function openPopup(worldPoint, html, stopKey){
  popupBody.innerHTML = html;
  const rect = mapWrap.getBoundingClientRect();
  const sx = viewTx + worldPoint.x * viewScale, sy = viewTy + worldPoint.y * viewScale;
  popupEl.style.left = Math.min(sx + 10, rect.width - 190) + 'px';
  popupEl.style.top = Math.max(sy - 60, 6) + 'px';
  popupEl.style.display = 'block';
  popupStopKey = stopKey;
  const btn = popupBody.querySelector('.add-stop-btn');
  if(btn) btn.onclick = () => { addStop(stopKey, markerByStop[stopKey]); closePopup(); };
}
function closePopup(){ popupEl.style.display = 'none'; }
mapWrap.addEventListener('click', closePopup);

// ===== League / matchday rendering =====
function onLeagueChange(){
  const league = document.getElementById('league-select').value;
  const mdSelect = document.getElementById('matchday-select');
  const matchdays = [...new Set(FIXTURES[league].map(f => f.matchday))].sort((a,b)=>a-b);
  mdSelect.innerHTML = matchdays.map(md => `<option value="${md}">Matchday ${md}</option>`).join('');
  renderLeague(league);
}

function renderLeague(league){
  clearPins();
  closePopup();

  const teams = TEAMS[league];
  const selectedMd = parseInt(document.getElementById('matchday-select').value, 10);
  const fixtures = FIXTURES[league].filter(f => f.matchday === selectedMd).slice().sort((a,b)=> new Date(a.start)-new Date(b.start));
  const color = LEAGUE_COLOR[league];
  const lightColor = lightenColor(color, 0.72);
  const boundPts = [];

  Object.keys(FIXTURES).forEach(otherLeague => {
    if(otherLeague === league) return;
    const otherTeams = TEAMS[otherLeague];
    FIXTURES[otherLeague].forEach(f => {
      const h = otherTeams[f.home]; const a = otherTeams[f.away];
      if(!h) return;
      const stopKey = `${otherLeague}::${f.home}`;
      markerByStop[stopKey] = { name:h.name, lat:h.lat, lng:h.lng };
      addPin({
        lat:h.lat, lng:h.lng, muted:true, stopKey,
        popupHtml: `<div class="popup-club">${h.name} vs ${a ? a.name : f.away}</div>
          <div class="popup-meta">${h.city} · ${fmtDate(f.start)} · ${COUNTRY_TAG[otherLeague]}</div>
          <div><button class="add-stop-btn">+ Add to route</button></div>`
      });
    });
  });

  const homeThisWindow = new Set(fixtures.map(f => f.home));
  Object.keys(teams).forEach(code => {
    if(homeThisWindow.has(code)) return;
    const t = teams[code];
    const stopKey = `${league}::${code}`;
    markerByStop[stopKey] = { name:t.name, lat:t.lat, lng:t.lng };
    const p = addPin({
      lat:t.lat, lng:t.lng, color:lightColor, size:11, label:t.name, stopKey,
      popupHtml: `<div class="popup-club">${t.name}</div>
        <div class="popup-meta">${t.city} · no home fixture in this data window</div>
        <div><button class="add-stop-btn">+ Add to route</button></div>`
    });
    boundPts.push(p);
  });

  const fixturesList = document.getElementById('fixtures-list');
  fixturesList.innerHTML = '';
  document.getElementById('fixtures-heading').textContent = `Home Fixtures – Matchday ${selectedMd} (${fixtures.length})`;

  fixtures.forEach(f => {
    const h = teams[f.home]; const a = teams[f.away];
    if(!h) return;
    const stopKey = `${league}::${f.home}`;
    markerByStop[stopKey] = { name:h.name, lat:h.lat, lng:h.lng };
    const p = addPin({
      lat:h.lat, lng:h.lng, color, size:14, label:h.name, stopKey,
      popupHtml: `<div class="popup-club">${h.name} vs ${a ? a.name : f.away}</div>
        <div class="popup-meta">${h.city} · ${fmtDate(f.start)}</div>
        <div><button class="add-stop-btn">+ Add to route</button></div>`
    });
    boundPts.push(p);

    const item = document.createElement('div');
    item.className = 'fixture-item';
    item.innerHTML = `<div class="teams">${h.name} – ${a ? a.name : f.away}</div><div class="meta">${h.city} · ${fmtDate(f.start)}</div>`;
    item.onclick = () => fitToPoints([p], 140);
    fixturesList.appendChild(item);
  });

  if(boundPts.length){ fitToPoints(boundPts); hasZoomedToFixtures = true; }
  else fitMap();

  renderCombos(league, selectedMd, fixtures);
}

// ===== Cross-league trip clustering (estimated drive-time feasibility) =====
const POST_MATCH_BUFFER_MIN = 120;
const PRE_MATCH_BUFFER_MIN = 15;
const MAX_TRIP_SPAN_H = 72;
const MAX_LEG_KM = 600;

function buildGamePool(){
  const pool = [];
  Object.keys(FIXTURES).forEach(league => {
    const teams = TEAMS[league];
    FIXTURES[league].forEach(f => {
      const h = teams[f.home]; const a = teams[f.away];
      if(!h) return;
      pool.push({ league, country: COUNTRY_TAG[league], homeCode: f.home, home: h, awayName: a ? a.name : f.away, start: new Date(f.start) });
    });
  });
  pool.sort((x,y) => x.start - y.start);
  return pool;
}

function renderCombos(league, selectedMd, anchorFixtures){
  const combosList = document.getElementById('combos-list');
  const heading = document.getElementById('combos-heading');
  const leagueLabel = document.getElementById('league-select').selectedOptions[0].textContent;
  if(heading) heading.textContent = `Combinable Trips – ${leagueLabel}, Matchday ${selectedMd}`;

  if(anchorFixtures.length === 0){
    combosList.innerHTML = `<div class="empty-note">No home fixtures to combine for this matchday.</div>`;
    return;
  }

  const anchorSet = new Set(anchorFixtures.map(f => `${league}::${f.home}`));
  const anchorTimes = anchorFixtures.map(f => new Date(f.start).getTime());
  const minAnchor = Math.min(...anchorTimes), maxAnchor = Math.max(...anchorTimes);
  const windowMs = MAX_TRIP_SPAN_H * 3600 * 1000;

  const pool = buildGamePool().filter(g => {
    const t = g.start.getTime();
    return t >= minAnchor - windowMs && t <= maxAnchor + windowMs;
  });
  const n = pool.length;
  if(n < 2){
    combosList.innerHTML = `<div class="empty-note">Not enough nearby fixtures in this data window to form a trip.</div>`;
    return;
  }

  const edgesFrom = Array.from({length:n}, () => []);
  const edgesTo = Array.from({length:n}, () => []);
  const legInfo = {};
  for(let i=0;i<n;i++){
    for(let j=i+1;j<n;j++){
      const gapSec = (pool[j].start - pool[i].start) / 1000;
      if(gapSec/3600 > MAX_TRIP_SPAN_H) break;
      const availableSec = gapSec - (POST_MATCH_BUFFER_MIN + PRE_MATCH_BUFFER_MIN) * 60;
      if(availableSec <= 0) continue;
      const est = estimateLeg(pool[i].home.lat, pool[i].home.lng, pool[j].home.lat, pool[j].home.lng);
      if(est.km > MAX_LEG_KM) continue;
      if(est.sec <= availableSec){
        edgesFrom[i].push(j); edgesTo[j].push(i);
        legInfo[`${i}-${j}`] = { driveSec: est.sec, availableSec, driveKm: est.km };
      }
    }
  }

  const fwdLen = new Array(n).fill(1), fwdNext = new Array(n).fill(-1);
  for(let i=n-1;i>=0;i--){
    for(const j of edgesFrom[i]) if(1+fwdLen[j] > fwdLen[i]){ fwdLen[i]=1+fwdLen[j]; fwdNext[i]=j; }
  }
  const bwdLen = new Array(n).fill(1), bwdPrev = new Array(n).fill(-1);
  for(let j=0;j<n;j++){
    for(const i of edgesTo[j]) if(1+bwdLen[i] > bwdLen[j]){ bwdLen[j]=1+bwdLen[i]; bwdPrev[j]=i; }
  }

  function trimToSpan(chain, anchorPos){
    const capMs = MAX_TRIP_SPAN_H * 3600 * 1000;
    const times = chain.map(i => pool[i].start.getTime());
    let bestLo = anchorPos, bestHi = anchorPos;
    for(let lo=0; lo<=anchorPos; lo++){
      if(times[anchorPos]-times[lo] > capMs) continue;
      let hi = anchorPos;
      while(hi+1 < chain.length && times[hi+1]-times[lo] <= capMs) hi++;
      if(hi-lo > bestHi-bestLo){ bestLo=lo; bestHi=hi; }
    }
    return chain.slice(bestLo, bestHi+1);
  }

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
    combosList.innerHTML = `<div class="empty-note">No realistic combinations found around Matchday ${selectedMd} of ${leagueLabel} — estimated drive time doesn't leave enough margin between full-time and the next kickoff (2h post-match + 15 min arrival buffer built in).</div>`;
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
      totalDriveSec += info.driveSec; totalKm += info.driveKm;
      const slackMin = Math.round((info.availableSec - info.driveSec)/60);
      legLabels.push(`🚗 ~${fmtHM(info.driveSec)} · ~${info.driveKm.toFixed(0)} km · ${slackMin} min to spare`);
    }
    const gamesHtml = games.map((g,i) => {
      const isAnchor = anchorSet.has(`${g.league}::${g.homeCode}`);
      const legNote = i > 0 ? `<br><span style="color:#00A650; font-size:0.62rem;">${legLabels[i-1]}</span>` : '';
      return `<div class="combo-game" style="${isAnchor?'font-weight:700;':''}">${i+1}. ${g.home.name} <span style="color:#6b6455;">(${g.country})</span> – ${g.awayName}${isAnchor?' ★':''}<br>
        <span style="color:#6b6455; font-size:0.66rem;">${g.home.city} · ${fmtDate(g.start.toISOString())}</span>${legNote}</div>`;
    }).join('');
    const card = document.createElement('div');
    card.className = 'combo-card';
    card.innerHTML = `<div class="combo-title">${crossBorder?'🌍 Cross-border trip':'Trip'} ${cIdx+1} · ${games.length} games</div>
      ${gamesHtml}
      <div class="combo-stats">≈ ${fmtHM(totalDriveSec)} · ${totalKm.toFixed(0)} km total (estimated) · ${countries.join(' → ')}</div>`;
    card.onclick = () => fitToPoints(games.map(g => project(g.home.lat, g.home.lng)), 90);
    combosList.appendChild(card);
  });
}

// ===== Point-to-point route planning (estimated straight-line legs) =====
let routeStops = [];
const routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
routeSvg.setAttribute('id', 'route-line-layer');
mapSvg.appendChild(routeSvg);

function addStop(key, stop){
  if(routeStops.some(s => s.key === key)) return;
  routeStops.push({ key, stop });
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
    container.innerHTML = ''; clearBtn.disabled = true; hint.style.display = 'block';
    return;
  }
  hint.style.display = 'none'; clearBtn.disabled = false;
  container.innerHTML = routeStops.map((s,i) => `
    <div class="route-stop">
      <span class="num">${i+1}</span>
      <span class="name">${s.stop.name}</span>
      <span class="rm" onclick="removeStop('${s.key.replace(/'/g,"\\'")}')">×</span>
    </div>`).join('');
}
function computeRoute(){
  const summary = document.getElementById('route-summary');
  routeSvg.innerHTML = '';
  if(routeStops.length < 2){ summary.style.display='none'; summary.textContent=''; return; }
  let totalKm = 0, totalSec = 0;
  const pts = routeStops.map(s => project(s.stop.lat, s.stop.lng));
  for(let i=1;i<routeStops.length;i++){
    const a = routeStops[i-1].stop, b = routeStops[i].stop;
    const est = estimateLeg(a.lat, a.lng, b.lat, b.lng);
    totalKm += est.km; totalSec += est.sec;
  }
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#c8962c');
  line.setAttribute('stroke-width', 3);
  line.setAttribute('stroke-dasharray', '8 6');
  line.setAttribute('opacity', '0.85');
  routeSvg.appendChild(line);
  summary.style.display = 'block';
  summary.textContent = `≈ ${totalKm.toFixed(0)} km · ${fmtHM(totalSec)} (estimated)`;
}

fitMap();
onLeagueChange();
