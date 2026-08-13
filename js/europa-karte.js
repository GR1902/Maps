const COUNTRY_COLORS = {
  "England": "#1c3f95",
  "Spain": "#c8102e",
  "Germany": "#2b2b2b",
  "Italy": "#008c45",
  "France": "#0055a4",
  "Portugal": "#046a38",
  "Netherlands": "#ff8c00",
  "Belgium": "#f7c631",
  "Sweden": "#005293",
  "Norway": "#a3123a",
  "Denmark": "#c8102e",
  "Finland": "#003580"
};

const map = L.map('map', { zoomControl:true }).setView([52, 8], 4);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  maxZoom: 19
}).addTo(map);

function makeIcon(color){
  return L.divIcon({
    className: '',
    html: `<div style="width:13px;height:13px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize:[13,13], iconAnchor:[7,13], popupAnchor:[0,-13]
  });
}

const markerByClub = {};
const layerByCountry = {};

async function init(){
  const res = await fetch('data/clubs_europe.json');
  const CLUBS = await res.json();
  const countries = [...new Set(CLUBS.map(c => c.country))];
  countries.forEach(c => layerByCountry[c] = L.layerGroup().addTo(map));

  CLUBS.forEach(s => {
    const color = COUNTRY_COLORS[s.country] || "#555";
    const marker = L.marker([s.lat, s.lng], { icon: makeIcon(color) });
    marker.bindTooltip(s.club, {
      permanent:true, direction:'bottom', offset:[0,2], className:'club-label'
    });
    marker.bindPopup(`
      <div class="popup-club">${s.club}</div>
      <div class="popup-meta">${s.city} · ${s.league} (${s.country})</div>
      <div>
        <button class="add-stop-btn" data-club="${s.club.replace(/"/g,'&quot;')}">+ Add to route</button>
      </div>
    `);
    marker.on('popupopen', () => {
      const btn = document.querySelector(`.add-stop-btn[data-club="${CSS.escape(s.club)}"]`);
      if(btn) btn.onclick = () => { addStop(s.club); marker.closePopup(); };
    });
    marker.addTo(layerByCountry[s.country]);
    markerByClub[s.club] = { marker, data:s };
  });

  // Filter panel build
  const filterBody = document.getElementById('filter-body');
  let html = `<div class="filter-actions" style="border-top:none; padding-top:0; margin-top:0; margin-bottom:4px;">
      <button class="mini-btn" onclick="setAll(true)">All</button>
      <button class="mini-btn" onclick="setAll(false)">None</button>
    </div>`;
  countries.forEach(c => {
    const color = COUNTRY_COLORS[c] || "#555";
    html += `<label class="filter-row">
      <input type="checkbox" checked data-country="${c}" onchange="toggleCountry('${c}', this.checked)">
      <span style="width:9px;height:9px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
      ${c}
    </label>`;
  });
  filterBody.innerHTML = html;
}

function toggleCountry(country, checked){
  if(checked){ map.addLayer(layerByCountry[country]); }
  else{ map.removeLayer(layerByCountry[country]); }
}
function setAll(checked){
  document.querySelectorAll('#filter-body input[type=checkbox]').forEach(cb => {
    cb.checked = checked;
    toggleCountry(cb.dataset.country, checked);
  });
}
function toggleFilter(){
  const panel = document.getElementById('filter-panel');
  const t = document.getElementById('filter-toggle');
  panel.classList.toggle('collapsed');
  t.textContent = panel.classList.contains('collapsed') ? '+' : '−';
}

// Fullscreen
function toggleFullscreen(){
  const app = document.getElementById('app');
  if(!document.fullscreenElement){ app.requestFullscreen().catch(()=>{}); }
  else{ document.exitFullscreen(); }
}
document.addEventListener('fullscreenchange', () => {
  const icon = document.getElementById('fs-icon');
  const label = document.getElementById('fs-label');
  if(document.fullscreenElement){ icon.textContent='×'; label.textContent='Close'; }
  else{ icon.textContent='⤢'; label.textContent='Fullscreen'; }
  setTimeout(() => map.invalidateSize(), 150);
});
window.addEventListener('resize', () => map.invalidateSize());

// Routing
let routeStops = [];
let routingControl = null;

function addStop(club){
  if(routeStops.includes(club)) return;
  routeStops.push(club);
  renderStops();
  computeRoute();
}
function removeStop(club){
  routeStops = routeStops.filter(c => c !== club);
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
  container.innerHTML = routeStops.map((club,i) => `
    <div class="route-stop">
      <span class="num">${i+1}</span>
      <span class="name">${club}</span>
      <span class="rm" onclick="removeStop('${club.replace(/'/g,"\\'")}')">×</span>
    </div>
  `).join('');
}
function computeRoute(){
  const summary = document.getElementById('route-summary');
  if(routingControl){ map.removeControl(routingControl); routingControl = null; }
  if(routeStops.length < 2){ summary.style.display='none'; summary.textContent=''; return; }
  const waypoints = routeStops.map(club => {
    const s = markerByClub[club].data;
    return L.latLng(s.lat, s.lng);
  });
  routingControl = L.Routing.control({
    waypoints: waypoints,
    lineOptions: { styles: [{ color:'#c8962c', weight:5, opacity:0.85 }] },
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

init();
