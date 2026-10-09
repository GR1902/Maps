// ===== Team + fixture data, loaded from data/*.json =====
let TEAMS = {};
let FIXTURES = {};
let AIRPORTS = [];
let LEAGUE_LOGO = {}; // league code -> competition logo URL, loaded from data/leagues.json
let META = {};         // data/meta.json: { checked: 'YYYY-MM-DD' } = when the fixtures were last verified
let SCOUTS = [];       // data/scouts.json: roster of scout names a plan can be assigned to

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

// A plan stores a copy of each game so it can render without a lookup. That
// copy goes stale when a kickoff is corrected or a game is dropped from the
// data. After every data load, each saved game is re-checked against FIXTURES
// by its key (league::home::matchday): times and names are refreshed, a moved
// kickoff is flagged with the time the user last saw (changedFrom), and a game
// that no longer exists is flagged (missing). Flags stay until acknowledged.
function reconcilePlans(){
  const index = new Map();
  Object.keys(FIXTURES).forEach(lg => (FIXTURES[lg] || []).forEach(f => {
    index.set(`${lg}::${f.home}::${f.matchday}`, f);
  }));
  if(index.size === 0) return; // data did not load, so there is nothing to compare with
  let touched = false;
  plans.forEach(plan => plan.items.forEach(w => {
    const f = index.get(w.key);
    if(!f){
      if(!w.missing){ w.missing = true; touched = true; }
      return;
    }
    if(w.missing){ delete w.missing; touched = true; }
    if(new Date(f.start).getTime() !== new Date(w.start).getTime()){
      if(!w.changedFrom) w.changedFrom = w.start;
      w.start = f.start;
      touched = true;
    }
    if(w.changedFrom && new Date(w.changedFrom).getTime() === new Date(w.start).getTime()){
      delete w.changedFrom; // moved back to the time the user already knew
      touched = true;
    }
    const teams = TEAMS[w.league] || {};
    const home = teams[f.home], away = teams[f.away];
    if(home && (w.homeName !== home.name || w.city !== home.city || w.lat !== home.lat || w.lng !== home.lng)){
      Object.assign(w, { homeName: home.name, city: home.city, lat: home.lat, lng: home.lng });
      touched = true;
    }
    if(away && w.awayName !== away.name){ w.awayName = away.name; touched = true; }
  }));
  if(touched) savePlans();
}
function planHasFlags(plan){ return plan.items.some(w => w.changedFrom || w.missing); }
function acknowledgePlanChange(key){
  const w = activePlan().items.find(x => x.key === key);
  if(!w) return;
  delete w.changedFrom;
  savePlans();
  renderWatchlist();
  computeWatchlistLegs();
}

function watchKeyFor(league, homeCode, matchday){ return `${league}::${homeCode}::${matchday}`; }
function isWatched(key){ return activePlan().items.some(w => w.key === key); }

// A plan can have a start point (an airport or a searched address) that is
// driven from first, ahead of its games: plan.start = { name, lat, lng }.
// planPoints() is the full ordered list the route is built from; the start
// has no kickoff, so it is never part of a timing check.
function planPoints(plan = activePlan()){
  return [...(plan.start ? [{ lat: plan.start.lat, lng: plan.start.lng, start: null }] : []), ...plan.items];
}

// Brings My Plan into view, e.g. after a start point was set from a map popup.
function revealMyPlan(){
  const side = document.getElementById('side');
  if(side.classList.contains('panel-collapsed')) toggleSidePanel();
  const body = document.getElementById('watchlist-body');
  if(body.classList.contains('collapsed')) toggleSidePanelSection('watchlist-body', document.getElementById('watchlist-heading'));
}

function setPlanStart(point){
  activePlan().start = { name: point.name, lat: point.lat, lng: point.lng };
  savePlans();
  renderWatchlist();
  computeWatchlistLegs();
  revealMyPlan();
}

function clearPlanStart(){
  delete activePlan().start;
  savePlans();
  renderWatchlist();
  computeWatchlistLegs();
}

function addToWatchlist(item){
  if(isWatched(item.key)) return;
  activePlan().items.push(item);
  savePlans();
  renderWatchlist();
  refreshWatchStars();
  computeWatchlistLegs();
}
function removeFromWatchlist(key){
  const plan = activePlan();
  plan.items = plan.items.filter(w => w.key !== key);
  savePlans();
  renderWatchlist();
  refreshWatchStars();
  computeWatchlistLegs();
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
  refreshPlanVisuals();
}

// ----- Plan management (rename / switch / create / delete) -----
// A plan can be assigned to one scout from data/scouts.json (plan.scout holds
// the name, so a plan keeps its scout even if the roster changes later), has
// a status (plan.status; no value means "idea") and a free-text note.
const PLAN_STATUSES = [['idea', 'Idea'], ['planned', 'Planned'], ['booked', 'Booked'], ['done', 'Done']];
const PLAN_NOTE_MAX = 500;
function planStatus(plan){ return PLAN_STATUSES.some(([k]) => k === plan.status) ? plan.status : 'idea'; }
function planStatusLabel(plan){ return PLAN_STATUSES.find(([k]) => k === planStatus(plan))[1]; }

function renderPlanToolbar(){
  const select = document.getElementById('plan-select');
  const option = p => `<option value="${p.id}" ${p.id===activePlanId?'selected':''}>${escapeHtml(p.name)} (${p.items.length})${planStatus(p) !== 'idea' ? ` · ${planStatusLabel(p)}` : ''}${planHasFlags(p) ? ' ⟳' : ''}</option>`;
  if(plans.some(p => p.scout)){
    // Grouped by scout (roster order first, then names no longer on the roster, then unassigned).
    const names = [...SCOUTS, ...plans.map(p => p.scout).filter(n => n && !SCOUTS.includes(n))];
    const groups = [...new Set(names)].filter(n => plans.some(p => p.scout === n))
      .map(n => `<optgroup label="${escapeHtml(n)}">${plans.filter(p => p.scout === n).map(option).join('')}</optgroup>`);
    const open = plans.filter(p => !p.scout);
    if(open.length) groups.push(`<optgroup label="No scout">${open.map(option).join('')}</optgroup>`);
    select.innerHTML = groups.join('');
  } else {
    select.innerHTML = plans.map(option).join('');
  }
  document.getElementById('plan-name-display').textContent = activePlan().name;

  const scoutSelect = document.getElementById('plan-scout-select');
  const current = activePlan().scout || '';
  const roster = current && !SCOUTS.includes(current) ? [...SCOUTS, current] : SCOUTS;
  scoutSelect.innerHTML = `<option value="">No scout</option>` + roster.map(n => `<option value="${escapeHtml(n)}" ${n===current?'selected':''}>${escapeHtml(n)}</option>`).join('');

  document.getElementById('plan-status-select').innerHTML = PLAN_STATUSES
    .map(([k, label]) => `<option value="${k}" ${k === planStatus(activePlan()) ? 'selected' : ''}>${label}</option>`).join('');
  // Re-rendering must never move the cursor while typing, so the field is only
  // rewritten when another plan became active or when it is not being edited.
  const noteEl = document.getElementById('plan-note');
  const note = activePlan().note || '';
  if(noteShownPlanId !== activePlan().id || (document.activeElement !== noteEl && noteEl.value !== note)){
    noteEl.value = note;
    noteShownPlanId = activePlan().id;
  }
}
let noteShownPlanId = null;

function setPlanStatus(value){
  const plan = activePlan();
  if(value && value !== 'idea' && PLAN_STATUSES.some(([k]) => k === value)) plan.status = value; else delete plan.status;
  savePlans();
  renderPlanToolbar();
}

// The note is saved shortly after typing stops and when the field loses
// focus; the plan is captured when typing starts, so switching plans in
// between never writes the text to the wrong one.
let planNoteTimer = null;
let planNotePending = null; // { plan, value }
function onPlanNoteInput(value){
  planNotePending = { plan: activePlan(), value };
  clearTimeout(planNoteTimer);
  planNoteTimer = setTimeout(flushPlanNote, 400);
}
function flushPlanNote(){
  clearTimeout(planNoteTimer);
  if(!planNotePending) return;
  const { plan, value } = planNotePending;
  planNotePending = null;
  const text = value.slice(0, PLAN_NOTE_MAX);
  if(text.trim()) plan.note = text; else delete plan.note;
  savePlans();
}

function setPlanScout(name){
  const plan = activePlan();
  if(name) plan.scout = name; else delete plan.scout;
  savePlans();
  renderPlanToolbar();
}

// ----- Share a plan as a link -----
// The link carries only what cannot be looked up: the plan's name, scout, start
// point and the keys of its games. Teams, venues and kickoff times are read
// from the current data when the link is opened, so the receiver never gets a
// stale copy of a time that has since been corrected.
const SHARE_BASE_URL = 'https://gr1902.github.io/Maps/'; // used when the app runs from a file
let dataReady = false; // set once the data is loaded, so a link in the URL can be resolved

function encodeShareData(obj){
  let bin = '';
  new TextEncoder().encode(JSON.stringify(obj)).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeShareData(text){
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}

function buildPlanLink(plan = activePlan()){
  const data = { v: 1, n: plan.name, k: plan.items.map(w => w.key) };
  if(plan.scout) data.s = plan.scout;
  if(planStatus(plan) !== 'idea') data.t = planStatus(plan);
  if(plan.note) data.m = plan.note.slice(0, PLAN_NOTE_MAX);
  if(plan.start) data.p = { n: plan.start.name, a: +plan.start.lat.toFixed(4), o: +plan.start.lng.toFixed(4) };
  const base = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : SHARE_BASE_URL;
  return `${base}#plan=${encodeShareData(data)}`;
}

function updateShareButton(){
  const empty = activePlan().items.length === 0;
  ['plan-share-btn', 'plan-ics-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if(btn) btn.disabled = empty;
  });
}

async function sharePlan(){
  flushPlanNote();
  const plan = activePlan();
  if(plan.items.length === 0) return;
  const url = buildPlanLink(plan);
  const label = document.getElementById('plan-share-label');
  try{
    await navigator.clipboard.writeText(url);
    label.textContent = 'Link copied';
    setTimeout(() => { label.textContent = 'Copy link'; }, 1800);
  } catch(e){
    prompt('Copy this link and send it to the scout:', url);
  }
}

// ----- Calendar file (.ics) -----
// One event per planned game (kickoff in UTC, 2 h long), with a stable UID per
// plan and game so importing a fresh export later updates the events instead
// of duplicating them in most calendar apps. A snapshot: export again after
// the plan or a kickoff changed.
function icsEscape(text){
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsFold(line){ // content lines are limited to 75 octets
  const enc = new TextEncoder();
  let out = '', cur = '', bytes = 0;
  for(const ch of line){
    const b = enc.encode(ch).length;
    if(bytes + b > 75){ out += cur + '\r\n'; cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  return out + cur;
}
function icsDate(d){ return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

function buildIcs(planList){
  const stamp = icsDate(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matchday Explorer//Scouting plans//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Matchday Explorer'];
  let events = 0;
  planList.forEach(plan => plan.items.forEach(w => {
    const start = new Date(w.start);
    if(isNaN(start)) return;
    const end = new Date(start.getTime() + PLAN_MATCH_MINUTES * 60000);
    const unconfirmed = isUnverifiedKey(w.key) || w.missing || planStatus(plan) === 'idea';
    const notes = [`Plan: ${plan.name}`, plan.scout ? `Scout: ${plan.scout}` : null, `Status: ${planStatusLabel(plan)}`, `Competition: ${LEAGUE_LABELS[w.league] || w.league}`];
    if(plan.note) notes.push(`Note: ${plan.note}`);
    if(isUnverifiedKey(w.key)) notes.push('WARNING: kickoff not yet confirmed by two sources. Check before you travel.');
    if(w.missing) notes.push('WARNING: this game is no longer in the schedule.');
    if(w.changedFrom) notes.push(`Kickoff changed, it was ${fmtDate(w.changedFrom)}.`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${(plan.id + '-' + w.key).replace(/[^A-Za-z0-9._-]/g, '-')}@matchday-explorer`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(`${w.homeName} v ${w.awayName}${plan.scout ? ` (${plan.scout})` : ''}`)}`,
      `LOCATION:${icsEscape(w.city)}`,
      `GEO:${w.lat};${w.lng}`,
      `DESCRIPTION:${icsEscape(notes.filter(Boolean).join('\n'))}`,
      `STATUS:${unconfirmed ? 'TENTATIVE' : 'CONFIRMED'}`,
      'END:VEVENT'
    );
    events++;
  }));
  lines.push('END:VCALENDAR');
  return { text: lines.map(icsFold).join('\r\n') + '\r\n', events };
}

function downloadTextFile(filename, text, mime){
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fileSlug(text){ return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'plan'; }

function exportPlanIcs(){
  flushPlanNote();
  const plan = activePlan();
  const { text, events } = buildIcs([plan]);
  if(!events){ alert('This plan has no games to export.'); return; }
  downloadTextFile(`${fileSlug(plan.name)}.ics`, text, 'text/calendar;charset=utf-8');
}

// Rebuilds a plan item from a game key (league::home::matchday) using the
// loaded data; null when that game is not in the schedule (any more).
function itemFromKey(key){
  const [league, home, matchday] = String(key).split('::');
  if(!Object.prototype.hasOwnProperty.call(FIXTURES, league) || !Array.isArray(FIXTURES[league])) return null;
  const teams = TEAMS[league];
  const f = FIXTURES[league].find(g => g.home === home && String(g.matchday) === matchday);
  const h = teams && Object.prototype.hasOwnProperty.call(teams, home) ? teams[home] : null;
  if(!f || !h) return null;
  const a = Object.prototype.hasOwnProperty.call(teams, f.away) ? teams[f.away] : null;
  return { key: `${league}::${home}::${f.matchday}`, league, homeCode: home, homeName: h.name, awayName: a ? a.name : f.away, city: h.city, start: f.start, lat: h.lat, lng: h.lng };
}

// Opens a plan link (#plan=...) from the address bar as a new plan after the
// user confirms it. The link is untrusted input: only games that exist in the
// loaded data are taken over, texts are length-limited, coordinates validated.
function importSharedPlanFromUrl(){
  const m = /^#plan=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if(!m) return;
  history.replaceState(null, '', location.pathname + location.search); // so a reload does not import it again
  let data = null;
  try{ data = decodeShareData(m[1]); } catch(e){ /* handled below */ }
  if(!data || data.v !== 1 || !Array.isArray(data.k) || data.k.length === 0 || data.k.length > 60){
    alert('This plan link could not be read. Ask for a new one.');
    return;
  }
  const items = data.k.map(itemFromKey).filter(Boolean);
  const dropped = data.k.length - items.length;
  if(items.length === 0){
    alert('None of the games in this plan link are in the current schedule.');
    return;
  }
  const text = v => typeof v === 'string' ? v.trim().slice(0, 80) : '';
  const name = text(data.n) || 'Shared plan';
  const scout = text(data.s);
  const status = PLAN_STATUSES.some(([k]) => k === data.t) ? data.t : 'idea';
  const note = typeof data.m === 'string' ? data.m.trim().slice(0, PLAN_NOTE_MAX) : '';

  let plan = findPlanWithSameGames(items);
  if(!plan){
    const lines = [name, `${items.length} ${items.length === 1 ? 'game' : 'games'}`];
    if(scout) lines.push(`Scout: ${scout}`);
    if(status !== 'idea') lines.push(`Status: ${PLAN_STATUSES.find(([k]) => k === status)[1]}`);
    if(note) lines.push(`Note: ${note.length > 120 ? note.slice(0, 120) + '…' : note}`);
    if(dropped) lines.push(`${dropped} ${dropped === 1 ? 'game is' : 'games are'} no longer in the schedule and will be left out.`);
    if(!confirm(`Add this shared plan?\n\n${lines.join('\n')}`)) return;
    plan = { id: uid(), name, items };
    if(scout) plan.scout = scout;
    if(status !== 'idea') plan.status = status;
    if(note) plan.note = note;
    const p = data.p;
    if(p && typeof p === 'object' && text(p.n) && Number.isFinite(p.a) && Math.abs(p.a) <= 90 && Number.isFinite(p.o) && Math.abs(p.o) <= 180){
      plan.start = { name: text(p.n), lat: p.a, lng: p.o };
    }
    plans.push(plan);
  }
  activePlanId = plan.id;
  savePlans();
  renderWatchlist();
  refreshWatchStars();
  planRouteActive = true;
  updatePlanRouteButton();
  drawPlanRoute(true);
  computeWatchlistLegs();
  revealMyPlan();
}
window.addEventListener('hashchange', () => { if(dataReady) importSharedPlanFromUrl(); });

function switchPlan(id){
  flushPlanNote();
  activePlanId = id;
  savePlans();
  renderWatchlist();
  refreshWatchStars();
  computeWatchlistLegs();
}

// Opens a set of games (a Combinable Trips card) as a NEW plan, so nothing in
// the plan the user is working on is overwritten. An identical plan that
// already exists is reused instead of duplicated. The new plan inherits the
// current start point, and its route is drawn straight away.
function findPlanWithSameGames(items){
  const signature = list => list.map(i => i.key).sort().join('|');
  return plans.find(p => p.items.length === items.length && signature(p.items) === signature(items));
}

function openGamesAsNewPlan(games){
  const items = games.map(g => ({
    key: watchKeyFor(g.league, g.homeCode, g.matchday), league: g.league, homeCode: g.homeCode,
    homeName: g.home.name, awayName: g.awayName, city: g.home.city,
    start: g.start.toISOString(), lat: g.home.lat, lng: g.home.lng
  }));
  let plan = findPlanWithSameGames(items);
  if(!plan){
    plan = { id: uid(), name: `Trip ${fmtDateShort(games[0].start)} (${games.length} games)`, items };
    const current = activePlan();
    if(current.start) plan.start = { ...current.start };
    plans.push(plan);
  }
  activePlanId = plan.id;
  savePlans();
  renderWatchlist();
  refreshWatchStars();
  planRouteActive = true;
  updatePlanRouteButton();
  drawPlanRoute(true);
  computeWatchlistLegs();
  revealMyPlan();
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
  computeWatchlistLegs();
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
  computeWatchlistLegs();
}

let watchDragIndex = null;
// Per-leg {time,distance} between consecutive points of the plan (start point
// first, if there is one) in their CURRENT, possibly manually drag-reordered
// order: the order is whatever the user dragged it into, so distances are
// computed against that.
let watchlistLegs = null;
let watchlistLegsComputeId = 0;

async function computeWatchlistLegs(){
  const items = planPoints();
  const computeId = ++watchlistLegsComputeId;
  if(items.length < 2){
    watchlistLegs = null;
    renderWatchlist();
    if(planRouteActive) drawPlanRoute(false);
    return;
  }
  try{
    const matrix = await fetchDurationMatrix(items.map(w => ({ lat:w.lat, lng:w.lng })));
    if(computeId !== watchlistLegsComputeId) return; // a newer change has since superseded this one
    watchlistLegs = matrix ? items.slice(1).map((_, i) => ({
      time: matrix.durations[i][i+1],
      distance: matrix.distances[i][i+1]
    })) : null;
  } catch(e){
    watchlistLegs = null;
  }
  renderWatchlist();
  if(planRouteActive) drawPlanRoute(false);
}

function renderWatchlist(){
  renderPlanToolbar();
  const plan = activePlan();
  const items = plan.items;
  const startOffset = plan.start ? 1 : 0;
  const list = document.getElementById('watchlist-list');
  const summaryEl = document.getElementById('watchlist-summary');
  const dropzone = document.getElementById('watchlist-dropzone');
  const countEl = document.getElementById('watchlist-count');
  countEl.textContent = `(${items.length})`;
  dropzone.classList.toggle('empty', items.length === 0);
  updatePlanRouteButton();
  updateShareButton();
  list.innerHTML = '';

  // Per-leg drive time/distance between consecutive rows in their CURRENT
  // order — only trusted when it matches this exact number of items;
  // stale otherwise (e.g. mid-drag, or a fetch still in flight), in which
  // case legs are simply omitted until computeWatchlistLegs() catches up.
  const legsValid = watchlistLegs && watchlistLegs.length === items.length + startOffset - 1;

  if(plan.start){
    const startRow = document.createElement('div');
    startRow.className = 'watch-start';
    startRow.innerHTML = `
      <span class="start-flag">${ICONS.flag}</span>
      <div class="wbody"><div class="wteams">Start: ${escapeHtml(plan.start.name)}</div></div>
      <span class="wremove" title="Remove start point">×</span>
    `;
    startRow.querySelector('.wbody').onclick = () => { map.setView([plan.start.lat, plan.start.lng], 10); };
    startRow.querySelector('.wremove').onclick = clearPlanStart;
    list.appendChild(startRow);
  }

  items.forEach((w, idx) => {
    if((idx > 0 || startOffset) && legsValid){
      const leg = watchlistLegs[idx - 1 + startOffset];
      const legDiv = document.createElement('div');
      legDiv.className = 'route-leg';
      legDiv.textContent = `${fmtHM(leg.time)} · ${(leg.distance/1000).toFixed(0)} km`;
      list.appendChild(legDiv);
    }

    const row = document.createElement('div');
    row.className = 'watch-row';
    row.draggable = true;
    row.innerHTML = `
      <span class="rank">${idx + 1}</span>
      <div class="wbody">
        <div class="wteams">${w.homeName} – ${w.awayName}</div>
        <div class="wmeta">${w.city} · ${fmtDate(w.start)}${unverifiedBadge(w.key)} · ${LEAGUE_LABELS[w.league] || w.league}</div>
        ${w.missing ? `<div class="wflag wflag-missing">No longer in the schedule. Check before you travel.</div>` : ''}
        ${w.changedFrom ? `<div class="wflag">⟳ Kickoff changed, was ${fmtDate(w.changedFrom)} <button type="button" class="wflag-ok" title="Got it, hide this note">OK</button></div>` : ''}
      </div>
      <span class="wremove" title="Remove">×</span>
    `;
    row.querySelector('.wbody').onclick = () => { map.setView([w.lat, w.lng], 10); };
    row.querySelector('.wremove').onclick = () => removeFromWatchlist(w.key);
    const okBtn = row.querySelector('.wflag-ok');
    if(okBtn) okBtn.onclick = (e) => { e.stopPropagation(); acknowledgePlanChange(w.key); };

    // Drag-to-reorder within the list = set priority (and, now, the order
    // distances are computed against).
    row.addEventListener('dragstart', (e) => {
      watchDragIndex = idx;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', w.key); // needed for some browsers to allow the drag
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      savePlans();
      refreshPlanVisuals(); // the numbers on the map follow the new order
      computeWatchlistLegs(); // order has settled — (re)fetch for the final order
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if(watchDragIndex === null || watchDragIndex === idx) return;
      const arr = activePlan().items;
      const [moved] = arr.splice(watchDragIndex, 1);
      arr.splice(idx, 0, moved);
      watchDragIndex = idx;
      watchlistLegs = null; // stale mid-drag — computeWatchlistLegs() on dragend refreshes it
      renderWatchlist();
    });

    list.appendChild(row);
  });

  if(legsValid && items.length + startOffset >= 2){
    const totalTime = watchlistLegs.reduce((s,l) => s + l.time, 0);
    const totalKm = watchlistLegs.reduce((s,l) => s + l.distance, 0) / 1000;
    summaryEl.style.display = 'block';
    summaryEl.textContent = `≈ ${fmtHM(totalTime)} · ${totalKm.toFixed(0)} km total driving`;
  } else {
    summaryEl.style.display = 'none';
    summaryEl.textContent = '';
  }
}

// ===== My Plan route on the map =====
// "Show route" draws the planned games, in the order shown in My Plan, as a
// route on the map: numbered stops with their kickoff, and a chip on every leg
// with drive time + distance. A leg turns red when the next kickoff can't be
// reached in time (previous kickoff + match length + drive time) or when the
// order itself runs backwards in time. Geometry comes from OSRM, one request
// per leg (cached), with a dashed straight-line estimate as a fallback.
const PLAN_MATCH_MINUTES = 120; // time to allow for the match itself before driving on
let planRouteActive = false;
let planRouteLayer = null;
let planRouteSummaryControl = null;
let planRouteDrawId = 0;
const planLegCache = new Map();

function escapeHtml(str){
  return String(str).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

function updatePlanRouteButton(){
  const btn = document.getElementById('plan-route-btn');
  if(!btn) return;
  const n = planPoints().length;
  btn.disabled = n < 2;
  btn.title = n < 2 ? 'Add two games, or a start point and a game, to show a route' : 'Draw the plan on the map as a route, in the order shown above';
  document.getElementById('plan-route-btn-label').textContent = planRouteActive ? 'Hide route' : 'Show route';
}

function clearPlanRoute(){
  if(planRouteLayer){ map.removeLayer(planRouteLayer); planRouteLayer = null; }
  if(planRouteSummaryControl){ map.removeControl(planRouteSummaryControl); planRouteSummaryControl = null; }
}

function togglePlanRoute(){
  planRouteActive = !planRouteActive;
  if(planRouteActive) drawPlanRoute(true);
  else { planRouteDrawId++; clearPlanRoute(); }
  updatePlanRouteButton();
}

async function fetchPlanLeg(a, b){
  const key = `${a.lat},${a.lng}|${b.lat},${b.lng}`;
  if(planLegCache.has(key)) return planLegCache.get(key);
  let result = null;
  try{
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const r = data.routes && data.routes[0];
    if(r) result = { coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), time: r.duration, dist: r.distance };
  } catch(e){ /* falls back to a straight-line estimate */ }
  if(result) planLegCache.set(key, result);
  return result;
}

// The point halfway along a polyline (by length) — where the leg chip sits.
function polylineMidpoint(coords){
  let total = 0;
  const seg = [];
  for(let i = 1; i < coords.length; i++){
    const d = haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    seg.push(d); total += d;
  }
  let acc = 0;
  for(let i = 0; i < seg.length; i++){
    if(acc + seg[i] >= total / 2){
      const t = seg[i] ? (total / 2 - acc) / seg[i] : 0;
      return [coords[i][0] + (coords[i+1][0] - coords[i][0]) * t, coords[i][1] + (coords[i+1][1] - coords[i][1]) * t];
    }
    acc += seg[i];
  }
  return coords[Math.floor(coords.length / 2)];
}

// Chip on the middle of one route leg: drive time + distance, red with a
// warning when the next kickoff cannot be reached (previous kickoff + match
// length + drive time) or when the order runs backwards in time. Either
// kickoff may be missing (plain waypoint or start point): then there is no
// timing check. Returns true when the leg is flagged.
function addLegChip(layer, coords, time, dist, estimated, startA, startB, legIndex){
  let warn = false, tip = '';
  if(startA && startB){
    const kickA = new Date(startA), kickB = new Date(startB);
    const arrive = new Date(kickA.getTime() + PLAN_MATCH_MINUTES * 60000 + time * 1000);
    const backwards = kickB < kickA;
    const tooTight = !backwards && arrive > kickB;
    warn = backwards || tooTight;
    tip = backwards
      ? `Stop ${legIndex+2} kicks off before stop ${legIndex+1}. Reorder the route.`
      : tooTight
        ? `Too tight: after stop ${legIndex+1} (+${PLAN_MATCH_MINUTES / 60} h match) you arrive about ${fmtTimeOnly(arrive)}, kickoff is ${fmtTimeOnly(kickB)}.`
        : `Arrive about ${fmtTimeOnly(arrive)} (kickoff ${fmtTimeOnly(kickB)}), assuming ${PLAN_MATCH_MINUTES / 60} h per match.`;
  }
  const chipText = `${warn ? '⚠ ' : ''}${estimated ? '≈ ' : ''}${fmtHM(time)} · ${(dist/1000).toFixed(0)} km`;
  const chip = L.marker(polylineMidpoint(coords), {
    icon: L.divIcon({ className:'plan-leg-icon', html:`<div class="plan-leg-chip${warn ? ' warn' : ''}">${chipText}</div>`, iconSize:[0,0] }),
    zIndexOffset: 2000 // above the stop labels, so a chip on a short leg is never hidden under one
  }).addTo(layer);
  if(tip) chip.bindTooltip(tip, { direction:'top', offset:[0,-10] });
  return warn;
}

// fit is remembered until a draw actually finishes: a later redraw may
// supersede the one that was asked to fit the map, and must still do it.
let planRouteFitPending = false;

async function drawPlanRoute(fit){
  const plan = activePlan();
  const items = planPoints(plan);
  const startOffset = plan.start ? 1 : 0;
  const drawId = ++planRouteDrawId;
  if(fit) planRouteFitPending = true;
  if(items.length < 2){
    clearPlanRoute();
    planRouteActive = false;
    updatePlanRouteButton();
    return;
  }
  const fetched = await Promise.all(items.slice(1).map((_, i) => fetchPlanLeg(items[i], items[i+1])));
  if(drawId !== planRouteDrawId) return; // superseded by a newer draw (or the route was hidden)

  clearPlanRoute();
  const layer = L.layerGroup().addTo(map);
  planRouteLayer = layer;
  const allCoords = [];
  let totalTime = 0, totalDist = 0, warnCount = 0, anyEstimate = false;

  fetched.forEach((leg, i) => {
    const a = items[i], b = items[i+1];
    const estimated = !leg;
    let coords, time, dist;
    if(leg){ coords = leg.coords; time = leg.time; dist = leg.dist; }
    else {
      coords = [[a.lat, a.lng], [b.lat, b.lng]];
      dist = haversine(a.lat, a.lng, b.lat, b.lng) * 1.3 * 1000; // rough road factor
      time = dist / 1000 / 75 * 3600;
      anyEstimate = true;
    }
    totalTime += time; totalDist += dist;
    allCoords.push(...coords);

    const warn = addLegChip(layer, coords, time, dist, estimated, a.start, b.start, i - startOffset);
    if(warn) warnCount++;

    L.polyline(coords, { color:'#00622F', weight:9, opacity:0.85, lineCap:'round', dashArray: estimated ? '2 12' : null }).addTo(layer);
    L.polyline(coords, { color:'#FFF200', weight:5, opacity:1, lineCap:'round', dashArray: estimated ? '2 12' : null }).addTo(layer);
  });

  if(plan.start){
    L.marker([plan.start.lat, plan.start.lng], {
      icon: L.divIcon({
        className:'plan-stop-icon', iconSize:[0,0],
        html:`<div class="plan-stop"><span class="plan-stop-num plan-stop-start">${ICONS.flag}</span><span class="plan-stop-label">Start<small>${escapeHtml(plan.start.name)}</small></span></div>`
      }),
      zIndexOffset: 1000
    }).addTo(layer);
  }
  plan.items.forEach((w, i) => {
    L.marker([w.lat, w.lng], {
      icon: L.divIcon({
        className:'plan-stop-icon', iconSize:[0,0],
        html:`<div class="plan-stop"><span class="plan-stop-num">${i + 1}</span><span class="plan-stop-label">${escapeHtml(w.homeName)} – ${escapeHtml(w.awayName)}<small>${fmtDate(w.start)}${unverifiedBadge(w.key)}</small></span></div>`
      }),
      zIndexOffset: 1000
    }).addTo(layer);
  });

  const SummaryControl = L.Control.extend({
    options: { position:'bottomleft' },
    onAdd(){
      const div = L.DomUtil.create('div', 'plan-route-summary');
      div.innerHTML = `${escapeHtml(plan.name)} · ${plan.items.length} ${plan.items.length === 1 ? 'game' : 'games'}<br>${anyEstimate ? '≈ ' : ''}${fmtHM(totalTime)} · ${(totalDist / 1000).toFixed(0)} km driving`
        + (warnCount ? `<br><span class="warn-line">⚠ ${warnCount} timing ${warnCount === 1 ? 'conflict' : 'conflicts'}</span>` : '');
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  planRouteSummaryControl = new SummaryControl().addTo(map);

  if(planRouteFitPending){
    planRouteFitPending = false;
    map.fitBounds(L.latLngBounds(allCoords), { padding:[70,70] });
  }
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
  champions_league:"#0b1f4e", europa_league:"#ff6a13", conference_league:"#00a19a",
  youth_league:"#7a1fa2"
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
  conference_league: "UEFA Conference League", youth_league: "UEFA Youth League"
};

// ===== Map setup =====
const map = L.map('map', { zoomControl:true }).setView([48, 5], 4);
// CARTO's basemap tiles (formerly used here) now require a registered API
// key even for anonymous/free-tier use — switched to OSM's own standard
// tile server, which stays keyless. Note: no {r} retina-tile support on
// this endpoint (OSM only serves @1x), unlike the old CARTO URL.
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
}).addTo(map);

let currentMarkers = [];

// A small numbered badge, overlaid on any marker whose club has a game in the
// active plan — the number is that game's position in My Plan, so the map and
// the plan read as the same ordering. null/undefined routeIndex means "not in
// the plan", which every icon factory below treats as "render normally".
function routeBadgeHtml(routeIndex){
  if(routeIndex == null) return '';
  return `<div style="position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;padding:0 3px;border-radius:50%;background:var(--gold);color:var(--green-dark);font-size:9px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;border:1.5px solid #fffdf4;box-shadow:0 1px 2px rgba(0,0,0,0.35);">${routeIndex}</div>`;
}
function routeRingStyle(routeIndex){
  return routeIndex == null ? 'box-shadow:0 1px 3px rgba(0,0,0,0.4);' : 'box-shadow:0 0 0 2.5px var(--gold), 0 1px 3px rgba(0,0,0,0.4);';
}

function makeDiamondIcon(color, routeIndex){
  const size = 14;
  return L.divIcon({
    className:'',
    html:`<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;${routeRingStyle(routeIndex)}"></div>
      ${routeBadgeHtml(routeIndex)}
    </div>`,
    iconSize:[size,size], iconAnchor:[size/2,size], popupAnchor:[0,-size]
  });
}

// If a club has a logo URL, show it as a circular badge with a league-color
// ring; otherwise fall back to the plain colored diamond. handleLogoError
// swaps a broken/missing image (e.g. a stale hotlinked URL) back to the
// diamond at runtime too — it only replaces the inner circle, so a route
// badge positioned on the wrapper around it (see makeIcon) survives.
function handleLogoError(imgEl){
  const color = imgEl.dataset.fallbackColor;
  imgEl.parentElement.outerHTML = `<div style="width:14px;height:14px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`;
}

function makeIcon(color, logoUrl, routeIndex){
  if(!logoUrl) return makeDiamondIcon(color, routeIndex);
  const size = 24;
  return L.divIcon({
    className:'',
    html:`<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:#fffdf4;border:2px solid ${color};${routeRingStyle(routeIndex)}display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${logoUrl}" data-fallback-color="${color}" onerror="handleLogoError(this)" style="width:17px;height:17px;object-fit:contain;" />
      </div>
      ${routeBadgeHtml(routeIndex)}
    </div>`,
    iconSize:[size,size], iconAnchor:[size/2,size], popupAnchor:[0,-size]
  });
}

// Fixtures flagged "unverified": true in fixtures.json have not yet been
// confirmed by two independent sources (see data/review_queue.json). The set
// is rebuilt whenever FIXTURES is replaced, keyed like watchKeyFor().
let unverifiedKeysSource = null;
let unverifiedKeys = new Map(); // key -> kickoff time (ms)
function isUnverifiedKey(key){
  if(unverifiedKeysSource !== FIXTURES){
    unverifiedKeys = new Map();
    Object.keys(FIXTURES).forEach(lg => FIXTURES[lg].forEach(f => {
      if(f.unverified) unverifiedKeys.set(`${lg}::${f.home}::${f.matchday}`, new Date(f.start).getTime());
    }));
    unverifiedKeysSource = FIXTURES;
  }
  // Only worth a warning while the game is still ahead of us.
  return unverifiedKeys.has(key) && unverifiedKeys.get(key) > Date.now();
}
// Small amber warning for a game whose kickoff isn't double-confirmed yet.
// verbose=true spells it out (map popups); the short form is just the symbol.
function unverifiedBadge(key, verbose){
  if(!isUnverifiedKey(key)) return '';
  const tip = 'Kickoff not yet confirmed by two sources. Check before you travel.';
  return verbose
    ? ` <span class="unverified-badge verbose" title="${tip}">⚠ unconfirmed</span>`
    : ` <span class="unverified-badge" title="${tip}">⚠</span>`;
}

function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// Short calendar-date-only label (no weekday/time) for the date-range mode's
// league-block header, e.g. "21 Aug" — fmtDate above is time-of-kickoff
// oriented and too long to sit next to a league name.
function fmtDateShort(d){
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
}

function fmtHM(totalSeconds){
  const totalMin = Math.round(totalSeconds/60);
  return `${Math.floor(totalMin/60)}h ${totalMin%60}m`;
}

// Muted "geographic context" markers for clubs in leagues not currently
// selected — deliberately kept small/pale/subdued relative to the
// highlighted match markers (should recede into the background, not draw
// the eye); a crisp black outline is enough on its own to keep them
// readable against OSM's busier tiles without making them prominent.
function makeMutedIcon(routeIndex){
  const size = 9;
  return L.divIcon({
    className:'',
    html:`<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:#a8a89c;transform:rotate(-45deg);border:1.25px solid #000000;opacity:0.75;${routeRingStyle(routeIndex)}"></div>
      ${routeBadgeHtml(routeIndex)}
    </div>`,
    iconSize:[size,size], iconAnchor:[size/2,size], popupAnchor:[0,-size]
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

function makeLeagueIcon(color, size, routeIndex){
  return L.divIcon({
    className:'',
    html:`<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:1.5px solid #fffdf4;${routeRingStyle(routeIndex)}"></div>
      ${routeBadgeHtml(routeIndex)}
    </div>`,
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
  updatePlaceButton();
}

// ===== League picker (multi-select) =====
let selectedLeagues = new Set(['epl']);
let leagueMatchday = {}; // league code -> chosen matchday number

// ----- Map filter mode: per-league matchday (default) vs. a single global
// date range. In 'range' mode every selected league shows ALL its home
// fixtures whose kickoff falls inside #map-date-from/#map-date-to, instead
// of just one chosen matchday — useful since matchdays don't line up across
// leagues' own calendars, but a date range does. Combinable Trips already
// has its own From/To range (combos-date-from/to) for the candidate POOL of
// connecting legs; this one instead controls which fixtures are ANCHORS in
// the first place, same role leagueMatchday plays in the default mode. -----
let filterMode = 'matchday'; // 'matchday' | 'range'

// Shared by renderAll and the Radius Search: only meaningful in 'range'
// mode, where #map-date-from/#map-date-to bound which fixtures are in
// play. Returns {from,to} (either side possibly null if left open) or
// null when the Date Selection dropdown is in 'matchday' mode.
function getActiveDateRange(){
  if(filterMode !== 'range') return null;
  const fromVal = document.getElementById('map-date-from').value;
  const toVal = document.getElementById('map-date-to').value;
  return {
    from: fromVal ? new Date(fromVal + 'T00:00:00') : null,
    to: toVal ? new Date(toVal + 'T23:59:59') : null
  };
}

function setFilterMode(mode, presetRange){
  filterMode = mode;
  document.querySelectorAll('#filter-mode-row .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('map-daterange-row').style.display = mode === 'range' ? 'flex' : 'none';
  if(mode === 'range'){
    const fromEl = document.getElementById('map-date-from');
    const toEl = document.getElementById('map-date-to');
    if(presetRange){
      fromEl.value = presetRange.from;
      toEl.value = presetRange.to;
    } else if(!fromEl.value && !toEl.value){
      const today = new Date();
      fromEl.value = localDateKey(today);
      toEl.value = localDateKey(new Date(today.getTime() + 14 * 24 * 3600 * 1000));
    }
  }
  updateDateButtonLabel();
  renderAll();
  if(calendarOpen){ syncCalendarToDateRange(); renderCalendar(); }
}

// One date range drives both the map (in 'range' mode) and the calendar, so
// there is a single place to say "which days am I looking at".
function onMapDateChange(){
  updateDateButtonLabel();
  renderAll();
  if(calendarOpen){ syncCalendarToDateRange(); renderCalendar(); }
}

// Shortcuts for the ranges scouts ask for most. Football weekends run
// Fri to Sun; on a Saturday or Sunday the range starts today.
function setQuickRange(kind){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  let from = today, to = today;
  if(kind === '7days') to = addDays(today, 6);
  else if(kind === '30days') to = addDays(today, 29);
  else {
    const dow = today.getDay(); // 0=Sun..6=Sat
    if(dow === 6){ to = addDays(today, 1); }
    else if(dow === 0){ to = today; }
    else { from = addDays(today, (5 - dow + 7) % 7); to = addDays(from, 2); }
  }
  setFilterMode('range', { from: localDateKey(from), to: localDateKey(to) });
}

// If a league has a competition logo, show it as a small badge; otherwise
// fall back to the plain color swatch. handleLeagueLogoError swaps a
// broken/missing image back to the swatch at runtime too.
function handleLeagueLogoError(imgEl, color){
  imgEl.outerHTML = `<span class="swatch" style="background:${color}"></span>`;
}

function buildLeaguePanel(){
  const list = document.getElementById('league-checkbox-list');
  list.innerHTML = Object.keys(LEAGUE_LABELS).map(code => `
    <label class="league-row">
      <input type="checkbox" value="${code}" ${selectedLeagues.has(code) ? 'checked' : ''} onchange="toggleLeague('${code}', this.checked)">
      ${LEAGUE_LOGO[code]
        ? `<img class="league-logo" src="${LEAGUE_LOGO[code]}" alt="" onerror="handleLeagueLogoError(this,'${LEAGUE_COLOR[code]}')">`
        : `<span class="swatch" style="background:${LEAGUE_COLOR[code]}"></span>`}
      ${LEAGUE_LABELS[code]}
    </label>
  `).join('');
  const search = document.getElementById('league-search');
  if(search && search.value) filterLeagues(search.value);
  updateLeagueButtonLabel();
}

// Country names (English + German) so "austria", "osterreich" or "spanien" find
// a league even though the label only carries the 3-letter country code.
const COUNTRY_SEARCH_TERMS = {
  ENG: 'england englisch', ESP: 'spain spanien spanisch', GER: 'germany deutschland deutsch',
  ITA: 'italy italien italienisch', FRA: 'france frankreich franzosisch', POR: 'portugal',
  NED: 'netherlands holland niederlande dutch', BEL: 'belgium belgien', SWE: 'sweden schweden',
  NOR: 'norway norwegen', DEN: 'denmark danemark', FIN: 'finland finnland', SCO: 'scotland schottland',
  SUI: 'switzerland schweiz swiss', AUT: 'austria osterreich', GRE: 'greece griechenland',
  TUR: 'turkey turkei turkiye', POL: 'poland polen', CZE: 'czech tschechien czechia', CRO: 'croatia kroatien'
};
function leagueSearchHaystack(code){
  const label = LEAGUE_LABELS[code];
  const m = label.match(/\(([A-Z]{3})\)\s*$/);
  const country = m ? (COUNTRY_SEARCH_TERMS[m[1]] || '') : (code.endsWith('_league') ? 'uefa europe europa' : '');
  return normalizeSearchText(`${label} ${code.replace(/_/g, ' ')} ${country}`);
}

// Lowercase + strip diacritics so "osterreich"/"Österreich" and "bund" all match.
function normalizeSearchText(str){
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Live-filters the league checklist by label or league code. Only hides rows —
// the checked state lives in selectedLeagues, so a hidden league stays selected.
function filterLeagues(query){
  const q = normalizeSearchText(query);
  let visible = 0;
  document.querySelectorAll('#league-checkbox-list .league-row').forEach(row => {
    const code = row.querySelector('input').value;
    const hit = !q || leagueSearchHaystack(code).includes(q);
    row.style.display = hit ? '' : 'none';
    if(hit) visible++;
  });
  document.getElementById('league-no-results').style.display = visible ? 'none' : 'block';
  updateSearchClearButtons();
}

function clearLeagueSearch(){
  const search = document.getElementById('league-search');
  search.value = '';
  filterLeagues('');
  search.focus();
}

// Clears the address field AND the radius results (circle, markers, list),
// the same way "Reset filters" does for that one section.
function clearRadiusAddress(){
  if(mapPickMode) toggleMapPick();
  clearRadiusSearch();
  lastRadiusPoint = null;
  document.getElementById('radius-address').value = '';
  document.getElementById('radius-status').textContent = '';
  updateSearchClearButtons();
  updatePlaceButton();
  document.getElementById('radius-address').focus();
}

function clearMapDateRange(){
  document.getElementById('map-date-from').value = '';
  document.getElementById('map-date-to').value = '';
  onMapDateChange();
}

// Shows the inline ✕ only while its field has text.
function updateSearchClearButtons(){
  [['league-search','league-search-clear'], ['radius-address','radius-address-clear']].forEach(([inputId]) => {
    const input = document.getElementById(inputId);
    if(input && input.parentElement) input.parentElement.classList.toggle('has-text', input.value.length > 0);
  });
}

// The header buttons say what is active: "Leagues (3)", "Dates: 09 Oct to 11 Oct".
function updateLeagueButtonLabel(){
  document.getElementById('league-picker-label').textContent = `Leagues (${selectedLeagues.size})`;
}
function updateDateButtonLabel(){
  const range = getActiveDateRange();
  document.getElementById('date-picker-label').textContent = range && (range.from || range.to)
    ? `Dates: ${range.from ? fmtDateShort(range.from) : '…'} to ${range.to ? fmtDateShort(range.to) : '…'}`
    : 'Dates';
}
// Place covers the radius search, the plan start and the airports layer; it is
// highlighted while a searched point or the airports layer is active, since
// both live inside the panel and would otherwise be easy to forget.
function updatePlaceButton(){
  document.getElementById('place-picker-btn').classList.toggle('has-active', !!(showAirports || lastRadiusPoint));
}

function toggleLeague(code, checked){
  if(checked) selectedLeagues.add(code); else selectedLeagues.delete(code);
  updateLeagueButtonLabel();
  renderAll();
  // The League picker stays reachable while the Calendar overlay is open
  // (it lives in the header, not #body) — keep the grid in sync instead of
  // leaving it showing the pre-change league selection.
  if(calendarOpen) renderCalendar();
}

// Generic open/close for the header dropdowns (Leagues, Dates, Radius
// Search) — opening one closes any other that's open, and clicking outside
// a dropdown's own button+panel closes it.
function toggleDropdown(panelId){
  const panel = document.getElementById(panelId);
  const wasOpen = panel.classList.contains('open');
  document.querySelectorAll('.header-dropdown-panel.open').forEach(p => p.classList.remove('open'));
  if(!wasOpen) panel.classList.add('open');
  // Jump straight into the league search so typing works right after opening.
  if(!wasOpen && panelId === 'league-panel') document.getElementById('league-search').focus();
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

// ===== Collapsible side-panel sections =====
// "My Plan" and "Combinable Trips" are simple header+body pairs — toggling
// just adds/removes a class on the body (see .section-body.collapsed CSS)
// and flips the header's chevron via the same class on the header itself.
function toggleSidePanelSection(bodyId, headerEl){
  const body = document.getElementById(bodyId);
  const collapsed = body.classList.toggle('collapsed');
  headerEl.classList.toggle('collapsed', collapsed);
}

// Each league's fixture block is rebuilt from scratch on every renderAll(),
// so its collapsed/expanded state has to be tracked separately (by league
// code) and re-applied when the block is (re)built, rather than living
// only on the DOM node like toggleSidePanelSection above.
let collapsedLeagueBlocks = new Set();
function toggleLeagueBlock(league){
  if(collapsedLeagueBlocks.has(league)) collapsedLeagueBlocks.delete(league);
  else collapsedLeagueBlocks.add(league);
  const block = document.querySelector(`.league-block[data-league="${CSS.escape(league)}"]`);
  if(block) block.classList.toggle('collapsed', collapsedLeagueBlocks.has(league));
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

  // 'range' mode: every selected league shows ALL its home fixtures inside
  // this single global window instead of one chosen matchday each — see
  // setFilterMode above. Both ends are optional (an empty input = no bound
  // on that side).
  const useRange = filterMode === 'range';
  const activeRange = getActiveDateRange();
  const mapRangeFrom = activeRange ? activeRange.from : null;
  const mapRangeTo = activeRange ? activeRange.to : null;

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
      const nextKey = watchKeyFor(otherLeague, code, next.matchday);
      const nextItem = { key: nextKey, league: otherLeague, homeCode: code, homeName: h.name, awayName: a ? a.name : next.away, city: h.city, start: next.start, lat: h.lat, lng: h.lng };
      const mutedIdx = planIndexFor([stopKey]);
      const marker = L.marker([h.lat, h.lng], { icon: makeMutedIcon(mutedIdx) });
      marker._planKeys = [stopKey];
      marker._planIdx = mutedIdx;
      marker._iconBuilder = (idx) => makeMutedIcon(idx);
      const more = teamFixtures.length > 1 ? ` <span style="opacity:0.7;">(+${teamFixtures.length - 1} more this window)</span>` : '';
      marker.bindPopup(`
        <div class="popup-club">${h.name} vs ${a ? a.name : next.away}</div>
        <div class="popup-meta">${h.city} · ${fmtDate(next.start)}${unverifiedBadge(nextKey, true)} · ${COUNTRY_TAG[otherLeague] || h.country || ''}${more}</div>
        <div><button class="watch-btn" data-key="${nextKey}">${watchButtonLabel(isWatched(nextKey))}</button></div>
      `);
      bindWatchButton(marker, nextItem);
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
    const fixtures = (useRange
      ? FIXTURES[league].filter(f => {
          const d = new Date(f.start);
          if(mapRangeFrom && d < mapRangeFrom) return false;
          if(mapRangeTo && d > mapRangeTo) return false;
          return true;
        })
      : FIXTURES[league].filter(f => f.matchday === selectedMd)
    ).slice().sort((a,b)=> new Date(a.start)-new Date(b.start));
    const color = LEAGUE_COLOR[league];
    const lightColor = lightenColor(color, 0.72);
    const homeThisWindow = new Set(fixtures.map(f => f.home));

    // Other clubs of THIS league without a home fixture right now: pale marker
    Object.keys(teams).forEach(code => {
      if(homeThisWindow.has(code)) return;
      const t = teams[code];
      const stopKey = `${league}::${code}`;
      const paleIdx = planIndexFor([stopKey]);
      const marker = L.marker([t.lat, t.lng], { icon: makeLeagueIcon(lightColor, 11, paleIdx) });
      marker._planKeys = [stopKey];
      marker._planIdx = paleIdx;
      marker._iconBuilder = (idx) => makeLeagueIcon(lightColor, 11, idx);
      marker.bindTooltip(t.name, { permanent:true, direction:'bottom', offset:[0,2], className:'club-label' });
      marker.bindPopup(`
        <div class="popup-club">${t.name}</div>
        <div class="popup-meta">${t.city} · no home fixture in this data window</div>
      `);
      marker.addTo(map);
      currentMarkers.push(marker);
      bounds.push([t.lat, t.lng]);
    });

    // Fixtures block for this league. In matchday mode it has its own
    // matchday picker; in range mode the matchday concept doesn't apply per
    // league (fixtures can span several matchdays at once), so a plain date
    // label replaces the dropdown.
    const mds = [...new Set(FIXTURES[league].map(f => f.matchday))].sort((a,b)=>a-b);
    const rangeNote = mapRangeFrom || mapRangeTo
      ? `${mapRangeFrom ? fmtDateShort(mapRangeFrom) : '…'}–${mapRangeTo ? fmtDateShort(mapRangeTo) : '…'}`
      : 'all loaded fixtures';
    const block = document.createElement('div');
    block.className = 'league-block' + (collapsedLeagueBlocks.has(league) ? ' collapsed' : '');
    block.dataset.league = league;
    block.innerHTML = `
      <h2>
        <span class="league-collapse-toggle" onclick="toggleLeagueBlock('${league}')">
          <svg class="section-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          ${LEAGUE_LOGO[league] ? `<img class="league-logo-block" src="${LEAGUE_LOGO[league]}" alt="" onerror="this.remove()">` : ''}
          <span class="league-name">${LEAGUE_LABELS[league]}</span>
        </span>
        ${useRange
          ? `<span class="league-range-note">${rangeNote}</span>`
          : `<select class="md-select">${mds.map(md => `<option value="${md}" ${md===selectedMd?'selected':''}>Matchday ${md}</option>`).join('')}</select>`}
        <span class="count">(${fixtures.length})</span>
      </h2>
      <div class="fixture-list-inner"></div>
    `;
    fixturesContainer.appendChild(block);
    if(!useRange) block.querySelector('.md-select').addEventListener('change', (e) => changeLeagueMatchday(league, e.target.value));
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
      item.className = 'fixture-item' + (isWatched(watchKey) ? ' in-plan' : '');
      item.dataset.key = watchKey;
      item.innerHTML = `
        <span class="watch-star" data-key="${watchKey}">☆</span>
        <div class="fbody">
          <div class="teams">${h.name} – ${a ? a.name : f.away}</div>
          <div class="meta">${h.city} · ${fmtDate(f.start)}${unverifiedBadge(watchKey)}${useRange ? ` · MD${f.matchday}` : ''}</div>
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

    anchorSelections.push({ league, matchday: useRange ? null : selectedMd, fixtures });
  });

  venueGroups.forEach((games, vKey) => {
    const [lat, lng] = vKey.split(',').map(Number);
    const primary = games[0];
    const stopKeys = games.map(g => g.stopKey);
    const venueIdx = planIndexFor(stopKeys);
    const marker = L.marker([lat, lng], { icon: makeIcon(primary.color, primary.h.logo, venueIdx) });
    marker._planKeys = stopKeys;
    marker._planIdx = venueIdx;
    marker._iconBuilder = (idx) => makeIcon(primary.color, primary.h.logo, idx);
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
    <div class="popup-meta">${g.h.city} · ${fmtDate(g.f.start)}${unverifiedBadge(g.watchKey, true)}</div>
    <div><button class="watch-btn" data-key="${g.watchKey}">${watchButtonLabel(isWatched(g.watchKey))}</button><button class="suggest-trip-btn" data-key="${g.watchKey}">${ICONS.sparkle} Suggest trip</button></div>
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
  const watchBtn = document.querySelector(`.watch-btn[data-key="${CSS.escape(g.watchKey)}"]`);
  if(watchBtn){
    setWatchButton(watchBtn, g.watchKey);
    watchBtn.onclick = () => { toggleWatch(g.watchItem); setWatchButton(watchBtn, g.watchKey); };
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
// together games that are technically drive-feasible but weeks apart — it
// caps how long a single TRIP can span (trimToSpan below), not which
// candidate fixtures enter the pool. Which dates the pool itself draws
// from is now the user-facing combos-date-from/to range (see
// autoFillCombosDates / renderCombosMulti) instead of a hidden window.
const MAX_TRIP_SPAN_H = 9 * 24;
const MAX_LEG_KM = 600;            // don't offer a single hop longer than this, even if time allows it
const MAX_ROUTING_POOL = 80;       // cap on points sent to the OSRM table API per render
const COMBOS_DATE_AUTO_PAD_DAYS = 2; // how far the "Auto" range extends past the anchors' own date span

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

// ----- Combinable Trips date range -----
// Which calendar dates the candidate pool is allowed to draw connecting
// legs from. Left empty, it's auto-filled (see below) from the actual
// date span of whatever's currently anchored — recognizing e.g. that two
// leagues' selected matchdays already fall on the same weekend, rather
// than always assuming a fixed multi-day window regardless of what's
// actually selected. Once the user edits it directly, their range sticks
// until they hit "Auto" again or Reset filters.
let lastAnchorTimeSpan = null; // { min, max } in ms, set by the most recent renderCombosMulti

function computeAutoDateRange(minMs, maxMs){
  const pad = COMBOS_DATE_AUTO_PAD_DAYS * 24 * 3600 * 1000;
  return { from: localDateKey(new Date(minMs - pad)), to: localDateKey(new Date(maxMs + pad)) };
}

function autoFillCombosDates(){
  if(!lastAnchorTimeSpan) return;
  const { from, to } = computeAutoDateRange(lastAnchorTimeSpan.min, lastAnchorTimeSpan.max);
  document.getElementById('combos-date-from').value = from;
  document.getElementById('combos-date-to').value = to;
  updateCombosView();
}

function onCombosDateChange(){
  updateCombosView();
}

// ----- Excluding specific fixtures from Combinable Trips -----
// A fixture excluded here is dropped from the candidate pool entirely
// (including if it's an anchor) — it stops being offered anywhere in
// Combinable Trips until cleared, without affecting the fixture list, map,
// or My Plan. Keyed the same way as anchors (league+team+kickoff instant).
let excludedFixtures = new Set();

function excludeFixtureFromCombos(league, homeCode, timestamp){
  excludedFixtures.add(`${league}::${homeCode}::${timestamp}`);
  updateCombosView();
}

function clearExcludedFixtures(){
  excludedFixtures.clear();
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
    document.getElementById('combos-heading-text').textContent = 'Combinable Trips';
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

// Default is "swipe" — one card at a time, snapped — for a focused look at
// each trip. #combos-mode-toggle flips it into a free-scrolling view with
// several narrower cards visible side by side, for comparing trips at a
// glance instead. Not persisted — resets to swipe on reload, like the
// other display-only toggles in this panel.
let combosScrollMode = false;

function toggleCombosScrollMode(){
  combosScrollMode = !combosScrollMode;
  document.getElementById('combos-list').classList.toggle('scroll-mode', combosScrollMode);
  document.getElementById('combos-nav').classList.toggle('scroll-mode', combosScrollMode);
  const btn = document.getElementById('combos-mode-toggle');
  btn.classList.toggle('active', combosScrollMode);
  btn.textContent = combosScrollMode ? 'Swipe view' : 'Scroll view';
  updateCombosPositionUI();
}

// In scroll mode there's no single "current card" — it's a plain stacked
// list — so the ‹ pos › swipe controls are hidden (see the #combos-nav
// .scroll-mode CSS rule) and this is a no-op.
function updateCombosPositionUI(){
  if(combosScrollMode) return;
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
      <div class="combo-game" style="${isAnchor ? 'font-weight:700;' : ''}"><span class="combo-game-remove" title="Exclude this game from Combinable Trips" onclick="event.stopPropagation(); excludeFixtureFromCombos('${g.league}','${g.homeCode}',${g.start.getTime()})">×</span>${i+1}. ${g.home.name} <span style="color:#6b6455;">(${g.country})</span> – ${g.awayName}${isAnchor ? ' ★' : ''}<br>
      <span style="color:#6b6455; font-size:0.66rem;">${g.home.city} · ${fmtDate(g.start.toISOString())}</span>${legNote}</div>
    `;
    }).join('');
    const card = document.createElement('div');
    card.className = 'combo-card';
    card.innerHTML = `
      <div class="combo-title">${crossBorder ? ICONS.globe + ' Cross-border trip' : 'Trip'} ${cIdx+1} · ${games.length} games</div>
      ${gamesHtml}
      <div class="combo-stats">≈ ${fmtHM(totalDriveSec)} · ${totalKm.toFixed(0)} km total driving · ${countries.join(' → ')}</div>
      <div class="combo-load-hint">${ICONS.route} Click to open as a new plan</div>
    `;
    card.onclick = () => {
      const bnds = games.map(g => [g.home.lat, g.home.lng]);
      map.fitBounds(bnds, { padding:[60,60] });
      openGamesAsNewPlan(games);
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
  const heading = document.getElementById('combos-heading-text');
  const focusBar = document.getElementById('combos-focus-bar');
  const posEl = document.getElementById('combos-position');
  lastCombos = null;
  if(posEl) posEl.textContent = '';
  if(focusBar) focusBar.style.display = focusLabel ? 'flex' : 'none';
  const excludedBar = document.getElementById('combos-excluded-bar');
  if(excludedBar){
    excludedBar.style.display = excludedFixtures.size ? 'flex' : 'none';
    document.getElementById('combos-excluded-count').textContent =
      `${excludedFixtures.size} game${excludedFixtures.size === 1 ? '' : 's'} excluded from trips`;
  }

  const withFixtures = selections.filter(s => s.fixtures.length > 0);
  const summaryLabel = focusLabel || selections.map(s => s.matchday != null ? `${LEAGUE_LABELS[s.league]} MD${s.matchday}` : LEAGUE_LABELS[s.league]).join(' · ');
  if(heading) heading.textContent = focusLabel
    ? `Suggested Trips – ${focusLabel}`
    : (selections.length ? `Combinable Trips – ${summaryLabel}` : 'Combinable Trips');

  if(selections.length === 0){
    combosList.innerHTML = `<div class="empty-note">Select at least one league to see combinable trips.</div>`;
    return;
  }
  if(withFixtures.length === 0){
    combosList.innerHTML = `<div class="empty-note">No home fixtures to combine for this selection.</div>`;
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
  lastAnchorTimeSpan = { min: minAnchor, max: maxAnchor };

  // Which calendar dates the pool may draw connecting legs from — user-
  // controlled (see autoFillCombosDates), auto-filled from the anchors'
  // own date span the first time / whenever both fields are empty (e.g.
  // right after Reset filters), so a fresh view always starts from
  // "whatever's actually selected" rather than a blind multi-day window.
  const fromInput = document.getElementById('combos-date-from');
  const toInput = document.getElementById('combos-date-to');
  const existingFrom = fromInput.value ? new Date(fromInput.value + 'T00:00:00') : null;
  const existingTo = toInput.value ? new Date(toInput.value + 'T23:59:59') : null;
  // Re-derive the range whenever it's empty, or when it doesn't even
  // overlap the current anchors' own date span — e.g. switching to a
  // different league/matchday whose dates fall outside whatever range was
  // left over from before. A range that still overlaps is left alone,
  // since that's the user deliberately narrowing/widening on purpose.
  const staleRange = (existingFrom && existingFrom.getTime() > maxAnchor) ||
                      (existingTo && existingTo.getTime() < minAnchor);
  if((!existingFrom && !existingTo) || staleRange){
    const auto = computeAutoDateRange(minAnchor, maxAnchor);
    fromInput.value = auto.from;
    toInput.value = auto.to;
  }
  const rangeFrom = fromInput.value ? new Date(fromInput.value + 'T00:00:00') : null;
  const rangeTo = toInput.value ? new Date(toInput.value + 'T23:59:59') : null;

  // Pre-filter the full cross-league pool to fixtures that could plausibly
  // chain to an anchor fixture, so the routing request stays small. Also
  // drop any non-anchor fixture on a weekday the user hasn't enabled, or
  // (unless cross-border trips are on) from a country not already among
  // the selected anchors — anchors are always kept regardless of either
  // filter, since they're the games the trip is built around, not a
  // candidate to exclude. Explicitly excluded fixtures (see
  // excludeFixtureFromCombos) are dropped regardless of anchor status —
  // that's the point of excluding one.
  const poolAnchorKey = g => `${g.league}::${g.homeCode}::${g.start.getTime()}`;
  let pool = buildGamePool().filter(g => {
    if(excludedFixtures.has(poolAnchorKey(g))) return false;
    const isAnchor = anchorSet.has(poolAnchorKey(g));
    if(!isAnchor){
      if(rangeFrom && g.start < rangeFrom) return false;
      if(rangeTo && g.start > rangeTo) return false;
    }
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
    combosList.innerHTML = `<div class="empty-note">Not enough fixtures in this date range to form a trip — try widening From/To above, or selecting more leagues.</div>`;
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

// Whole side-panel collapse — independent of, and combinable with, the
// per-section collapses (My Plan / league blocks / Combinable Trips can
// each be open or closed regardless of whether the panel itself is
// shown). Shrinks #side to zero width so #map-wrap's flex fills the
// freed space, then invalidates the map's size so Leaflet redraws into
// the newly available area (mirrors the same fullscreenchange pattern
// above — Leaflet doesn't notice its container resized on its own).
function toggleSidePanel(){
  const side = document.getElementById('side');
  const btn = document.getElementById('side-toggle-btn');
  const collapsed = side.classList.toggle('panel-collapsed');
  btn.classList.toggle('collapsed', collapsed);
  btn.setAttribute('aria-label', collapsed ? 'Show side panel' : 'Hide side panel');
  setTimeout(() => map.invalidateSize(), 150);
}

// ===== Plan helpers shared by the map popups =====
// "Set as start point" on a marker (airports today): the point becomes the
// start of the active plan, driven from first ahead of its games.
function bindStartButton(marker, startKey, point){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.start-stop-btn[data-start="${CSS.escape(startKey)}"]`);
    if(btn) btn.onclick = () => { setPlanStart(point); marker.closePopup(); };
  });
}

// One label and look for every "add to plan" popup button, so they all read
// alike: green "Add to plan", red-outlined "In plan (remove)".
function watchButtonLabel(inPlan){
  return inPlan ? '★ In plan (remove)' : '☆ Add to plan';
}
function setWatchButton(btn, key){
  const inPlan = isWatched(key);
  btn.textContent = watchButtonLabel(inPlan);
  btn.classList.toggle('in-plan', inPlan);
}

function bindWatchButton(marker, watchItem){
  marker.on('popupopen', () => {
    const btn = document.querySelector(`.watch-btn[data-key="${CSS.escape(watchItem.key)}"]`);
    if(btn){
      setWatchButton(btn, watchItem.key);
      btn.onclick = () => { toggleWatch(watchItem); setWatchButton(btn, watchItem.key); };
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

// Which My Plan position (1-based) the first game of any of these clubs has,
// or null if none of them is in the active plan — drives the gold marker
// badge (see routeBadgeHtml). stopKeys are "league::teamCode"; a venue marker
// can stand for more than one club (a domestic and a UEFA fixture at the same
// ground), and the first one that is in the plan wins.
function planIndexFor(stopKeys){
  const idx = activePlan().items.findIndex(w => stopKeys.includes(`${w.league}::${w.homeCode}`));
  return idx === -1 ? null : idx + 1;
}

// Re-applies plan badges and highlights to already-rendered markers and list
// rows without a full renderAll(). Markers opt in by carrying _planKeys +
// _iconBuilder (set where they are created in renderAll / renderRadiusResults)
// and only get a new icon when their number actually changed.
function refreshPlanVisuals(){
  [...currentMarkers, ...radiusMarkers].forEach(m => {
    if(!m._planKeys || !m._iconBuilder) return;
    const idx = planIndexFor(m._planKeys);
    if(m._planIdx === idx) return;
    m._planIdx = idx;
    m.setIcon(m._iconBuilder(idx));
  });
  document.querySelectorAll('.fixture-item[data-key], .radius-result[data-key]').forEach(el => {
    el.classList.toggle('in-plan', isWatched(el.dataset.key));
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

// includePast lets the calendar's "jump to this match" shortcut (see
// jumpToFixtureOnMap) still surface the exact fixture it was pointed at
// even if that fixture already kicked off — a genuine address/radius
// search, on the other hand, always excludes past games (see below).
function renderRadiusResults(point, radiusKm, fitView, includePast){
  clearRadiusSearch();
  updatePlaceButton();
  const status = document.getElementById('radius-status');

  // Search across ALL leagues currently loaded — not just the leagues
  // toggled on — since "what's near this address" is naturally a global
  // question, independent of the league filter. The Date Selection dropdown
  // still applies though (an explicit 'range' bounds the pool the same way
  // it bounds the map view), and past kickoffs are excluded by default — a
  // scouting trip can't be planned around a game that already happened.
  const now = Date.now();
  const activeRange = getActiveDateRange();
  const pool = buildGamePool().filter(g => {
    if(!includePast && g.start.getTime() < now) return false;
    if(activeRange){
      if(activeRange.from && g.start < activeRange.from) return false;
      if(activeRange.to && g.start > activeRange.to) return false;
    }
    return true;
  });
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
    const radiusIdx = planIndexFor([stopKey]);
    const marker = L.marker([g.home.lat, g.home.lng], { icon: makeIcon(LEAGUE_COLOR[g.league], g.home.logo, radiusIdx) });
    marker._planKeys = [stopKey];
    marker._planIdx = radiusIdx;
    marker._iconBuilder = (idx) => makeIcon(LEAGUE_COLOR[g.league], g.home.logo, idx);
    marker.bindPopup(`
      <div class="popup-club">${gameLabel}</div>
      <div class="popup-meta">${g.home.city} · ${fmtDate(g.start.toISOString())}${unverifiedBadge(watchKey, true)} · ${LEAGUE_LABELS[g.league] || g.league}</div>
      <div><button class="watch-btn" data-key="${watchKey}">${watchButtonLabel(isWatched(watchKey))}</button><button class="suggest-trip-btn" data-key="${watchKey}">${ICONS.sparkle} Suggest trip</button></div>
    `);
    bindWatchButton(marker, watchItem);
    bindSuggestButton(marker, watchKey, g.league, g.homeCode, g.start.toISOString(), gameLabel);
    marker.addTo(map);
    radiusMarkers.push(marker);
    bounds.push([g.home.lat, g.home.lng]);

    const item = document.createElement('div');
    item.className = 'radius-result' + (isWatched(watchKey) ? ' in-plan' : '');
    item.dataset.key = watchKey;
    item.innerHTML = `
      <span class="watch-star" data-key="${watchKey}">☆</span>
      ${resultLogoHtml(g.home.logo, LEAGUE_COLOR[g.league])}
      <div class="rbody">
        <div class="rteams">${g.home.name} – ${g.awayName}</div>
        <div class="rmeta">${g.distKm.toFixed(0)} km · ${g.home.city} · ${fmtDate(g.start.toISOString())}${unverifiedBadge(watchKey)} · ${LEAGUE_LABELS[g.league] || g.league}</div>
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
// map-pick) double as the plan's start point, so a scouting trip can be
// planned outward from "wherever I searched" as well as from an airport.
function useRadiusPointAsStart(){
  if(!lastRadiusPoint){
    document.getElementById('radius-status').textContent = 'Search an address or pick a point first.';
    return;
  }
  setPlanStart({
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
  updateSearchClearButtons();
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
// built up on purpose — the "My Plan" plans (their own rename/delete flow)
// are left untouched.
function resetAllFilters(){
  selectedLeagues = new Set(['epl']);
  leagueMatchday = {};
  document.getElementById('league-search').value = '';
  buildLeaguePanel();
  filterLeagues('');

  filterMode = 'matchday';
  document.querySelectorAll('#filter-mode-row .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'matchday'));
  document.getElementById('map-daterange-row').style.display = 'none';
  document.getElementById('map-date-from').value = '';
  document.getElementById('map-date-to').value = '';

  if(showAirports) toggleAirports();

  includeCrossBorder = false;
  const cbToggle = document.getElementById('cross-border-toggle');
  if(cbToggle) cbToggle.checked = false;
  selectedTripDays = new Set([0,1,2,3,4,5,6]);
  document.querySelectorAll('.day-btn').forEach(b => b.classList.add('active'));
  focusedFixtures = [];
  document.getElementById('combos-date-from').value = '';
  document.getElementById('combos-date-to').value = '';
  excludedFixtures.clear();

  if(mapPickMode) toggleMapPick();
  clearRadiusSearch();
  lastRadiusPoint = null;
  document.getElementById('radius-address').value = '';
  document.getElementById('radius-status').textContent = '';
  setRadiusSlider(100, false);
  updateSearchClearButtons();
  updateDateButtonLabel();
  updatePlaceButton();

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
  document.getElementById('view-map-btn').classList.toggle('active', !calendarOpen);
  document.getElementById('view-calendar-btn').classList.toggle('active', calendarOpen);
  if(calendarOpen){
    syncCalendarToDateRange();
    renderCalendar();
  }
}

// The calendar has no range of its own: it follows the Date Selection range
// (only active in 'range' mode). When one is set, jump to its first month;
// otherwise the whole displayed month is shown.
function syncCalendarToDateRange(){
  const range = getActiveDateRange();
  if(range && range.from){
    calendarViewDate = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    calendarSelectedDate = null;
  }
}

// Map | Calendar switch in the header.
function setView(view){
  if((view === 'calendar') !== calendarOpen) toggleCalendarView();
}

function calendarJumpToday(){
  const today = new Date();
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

// Switches to a fixture's league/matchday, closes the Calendar, and runs a
// 200 km radius search centered on its venue — the single "open this game
// on the map" action used both by the day-detail list (left-click) and, as
// a shortcut straight from the month grid, by right-clicking a match chip
// (see jumpToFixtureFromCalendarCell / buildDayCellMatches). Reusing the
// radius search (rather than a plain setView) gives the jump the same
// zoom-to-fit + circle + nearby-fixtures list you'd get from searching
// that spot manually.
function jumpToFixtureOnMap(league, matchday, lat, lng, label){
  selectedLeagues.add(league);
  leagueMatchday[league] = matchday;
  // Jumping to one specific fixture only makes sense against the matchday
  // picker — a date-range selection could easily not even cover this date.
  filterMode = 'matchday';
  document.querySelectorAll('#filter-mode-row .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === 'matchday'));
  document.getElementById('map-daterange-row').style.display = 'none';
  buildLeaguePanel();
  renderAll();
  toggleCalendarView();
  setTimeout(() => {
    const point = { lat, lng, label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    lastRadiusPoint = point;
    document.getElementById('radius-address').value = point.label;
    updateSearchClearButtons();
    setRadiusSlider(200, false);
    // fitView:false — renderRadiusResults's own fit only covers the nearest
    // 60 *results*, which for a dense area can be much tighter than the
    // actual 200 km circle. Fit to the circle's real bounds instead so the
    // whole radius is always visible, not just wherever the closest games
    // happen to cluster.
    renderRadiusResults(point, 200, false, true);
    if(radiusCircle) map.fitBounds(radiusCircle.getBounds(), { padding:[20,20] });
    document.querySelectorAll('.header-dropdown-panel.open').forEach(p => p.classList.remove('open'));
    document.getElementById('radius-panel').classList.add('open');
  }, 150);
}

// Right-click on a match chip in the month grid: jump straight to the map
// without first left-clicking the day to open its detail list below.
function jumpToFixtureFromCalendarCell(event, league, homeCode, matchday){
  event.preventDefault();
  event.stopPropagation(); // don't also trigger the day cell's own onclick (calendarSelectDay)
  const h = TEAMS[league] && TEAMS[league][homeCode];
  if(!h) return;
  jumpToFixtureOnMap(league, matchday, h.lat, h.lng, `${h.name}, ${h.city}`);
}

// ----- Calendar: plans mode -----
// "Games" (default) shows every game of the selected leagues; "Plans" shows
// the games of the saved plans instead, coloured per scout, regardless of the
// league selection. A scout who is in two different plans on the same day is
// flagged, since that is a double booking.
let calendarMode = 'games'; // 'games' | 'plans'
let calendarScoutFilter = ''; // '' = all scouts, '__none__' = plans without a scout, else a scout name
let calendarStatusFilter = ''; // '' = every status, else a PLAN_STATUSES key
// Eight distinct colours for the eight scouts, deliberately without red or amber, which the app uses for warnings.
const SCOUT_COLORS = ['#2563eb', '#7c3aed', '#0f766e', '#db2777', '#65a30d', '#78350f', '#0891b2', '#4338ca'];
function scoutColor(name){
  const i = name ? SCOUTS.indexOf(name) : -1;
  return i >= 0 ? SCOUT_COLORS[i % SCOUT_COLORS.length] : '#6b7280';
}
function scoutInitials(name){
  return name ? name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '·';
}

function plansInCalendarScope(){
  return plans.filter(p => (calendarScoutFilter === '' ? true
    : calendarScoutFilter === '__none__' ? !p.scout
    : p.scout === calendarScoutFilter)
    && (calendarStatusFilter === '' || planStatus(p) === calendarStatusFilter));
}
function planCalendarEntries(){
  const out = [];
  plansInCalendarScope().forEach(plan => plan.items.forEach(item => {
    const start = new Date(item.start);
    if(!isNaN(start)) out.push({ plan, item, start });
  }));
  return out;
}

function fillCalendarScoutFilter(){
  const sel = document.getElementById('calendar-scout-filter');
  const names = [...SCOUTS, ...plans.map(p => p.scout).filter(n => n && !SCOUTS.includes(n))];
  const unique = [...new Set(names)];
  sel.innerHTML = `<option value="">All scouts</option>` + unique.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('') + `<option value="__none__">No scout</option>`;
  sel.value = calendarScoutFilter;
  if(sel.value !== calendarScoutFilter){ calendarScoutFilter = ''; sel.value = ''; }
  const st = document.getElementById('calendar-status-filter');
  st.innerHTML = `<option value="">All statuses</option>` + PLAN_STATUSES.map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  st.value = calendarStatusFilter;
}

function setCalendarMode(mode){
  calendarMode = mode;
  document.getElementById('cal-mode-games').classList.toggle('active', mode === 'games');
  document.getElementById('cal-mode-plans').classList.toggle('active', mode === 'plans');
  document.getElementById('calendar-scout-filter').style.display = mode === 'plans' ? '' : 'none';
  document.getElementById('calendar-status-filter').style.display = mode === 'plans' ? '' : 'none';
  document.getElementById('calendar-ics-btn').style.display = mode === 'plans' ? '' : 'none';
  if(mode === 'plans'){
    fillCalendarScoutFilter();
    // Start at the next planned game, so the first thing on screen is a plan.
    const now = Date.now();
    const upcoming = planCalendarEntries().filter(e => e.start.getTime() >= now).sort((a, b) => a.start - b.start)[0];
    if(upcoming) calendarViewDate = new Date(upcoming.start.getFullYear(), upcoming.start.getMonth(), 1);
    calendarSelectedDate = null;
  } else {
    syncCalendarToDateRange();
  }
  renderCalendar();
}

function onCalendarScoutFilter(value){
  calendarScoutFilter = value;
  calendarSelectedDate = null;
  renderCalendar();
}
function onCalendarStatusFilter(value){
  calendarStatusFilter = value;
  calendarSelectedDate = null;
  renderCalendar();
}

function exportCalendarIcs(){
  const list = plansInCalendarScope();
  const { text, events } = buildIcs(list);
  if(!events){ alert('There are no planned games to export for this selection.'); return; }
  const who = calendarScoutFilter === '' ? 'all-scouts' : calendarScoutFilter === '__none__' ? 'unassigned' : fileSlug(calendarScoutFilter);
  const what = calendarStatusFilter ? `-${calendarStatusFilter}` : '';
  downloadTextFile(`scouting-plans-${who}${what}.ics`, text, 'text/calendar;charset=utf-8');
}

// Same scout in two different plans on one day.
function calendarConflicts(dayEntries){
  const byScout = new Map();
  dayEntries.forEach(e => {
    if(!e.plan.scout) return;
    if(!byScout.has(e.plan.scout)) byScout.set(e.plan.scout, new Set());
    byScout.get(e.plan.scout).add(e.plan.name);
  });
  return [...byScout.entries()].filter(([, names]) => names.size > 1).map(([scout, names]) => ({ scout, plans: [...names] }));
}

function renderPlansCalendar(){
  const grid = document.getElementById('calendar-grid');
  const detail = document.getElementById('calendar-day-detail');
  const year = calendarViewDate.getFullYear(), month = calendarViewDate.getMonth();
  document.getElementById('calendar-range-note').textContent = 'Plans coloured per scout; dashed = idea, faded = done. The Dates range does not apply here.';
  const entries = planCalendarEntries();
  if(entries.length === 0){
    grid.innerHTML = `<div class="empty-note">No planned games for this selection yet. Star games on the map, or open a shared plan link.</div>`;
    detail.innerHTML = '';
    return;
  }

  const byDay = {};
  entries.forEach(e => {
    if(e.start.getFullYear() !== year || e.start.getMonth() !== month) return;
    (byDay[localDateKey(e.start)] = byDay[localDateKey(e.start)] || []).push(e);
  });
  const gameDays = Object.keys(byDay).sort();
  const todayKey = localDateKey(new Date());
  if(!calendarSelectedDate || !byDay[calendarSelectedDate]){
    calendarSelectedDate = gameDays.includes(todayKey) ? todayKey : (gameDays[0] || null);
  }

  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let cells = '';
  for(let i = 0; i < startOffset; i++) cells += `<div class="cal-cell cal-pad"></div>`;
  for(let d = 1; d <= daysInMonth; d++){
    const key = localDateKey(new Date(year, month, d));
    const dayEntries = (byDay[key] || []).slice().sort((a, b) => a.start - b.start);
    const has = dayEntries.length > 0;
    const conflicts = has ? calendarConflicts(dayEntries) : [];
    const classes = ['cal-cell', has ? 'cal-has-games' : 'cal-empty'];
    if(key === todayKey) classes.push('cal-today');
    if(key === calendarSelectedDate) classes.push('cal-selected');
    if(conflicts.length) classes.push('cal-conflict');
    const lines = dayEntries.slice(0, 3).map(e => `<div class="cal-match-line status-${planStatus(e.plan)}" style="border-left-color:${scoutColor(e.plan.scout)}"><span class="cal-match-time">${fmtTimeOnly(e.start)}</span> <b>${escapeHtml(scoutInitials(e.plan.scout))}</b> ${escapeHtml(e.item.homeName.split(' ')[0])}–${escapeHtml(e.item.awayName.split(' ')[0])}</div>`).join('');
    const more = dayEntries.length > 3 ? `<div class="cal-match-more">+${dayEntries.length - 3} more</div>` : '';
    const tip = has ? `data-tooltip="${escapeHtml(dayEntries.slice(0, 6).map(e => `${fmtTimeOnly(e.start)}  ${e.item.homeName} – ${e.item.awayName} (${e.plan.scout || 'no scout'})`).join('\n'))}"` : '';
    cells += `
      <div class="${classes.join(' ')}" ${has ? `onclick="calendarSelectDay('${key}')"` : ''} ${tip}>
        <div class="cal-cell-top">
          <span class="cal-daynum">${d}</span>
          ${conflicts.length ? `<span class="cal-conflict-mark" title="A scout is in two plans this day">⚠</span>` : ''}
          ${has ? `<span class="cal-badge">${dayEntries.length}</span>` : ''}
        </div>
        ${has ? `<div class="cal-matches">${lines}${more}</div>` : ''}
      </div>`;
  }
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7;
  for(let i = 0; i < trailing; i++) cells += `<div class="cal-cell cal-pad"></div>`;
  grid.innerHTML = `
    <div class="cal-weekday-row"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
    <div class="cal-grid">${cells}</div>`;

  if(calendarSelectedDate && byDay[calendarSelectedDate]){
    renderPlansDayDetail(calendarSelectedDate, byDay[calendarSelectedDate]);
  } else {
    calendarSelectedDate = null;
    detail.innerHTML = `<div class="empty-note">No planned games in this month. Use the arrows to look at another month.</div>`;
  }
}

function renderPlansDayDetail(key, dayEntries){
  const detail = document.getElementById('calendar-day-detail');
  const [y, m, d] = key.split('-').map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const sorted = dayEntries.slice().sort((a, b) => a.start - b.start);
  let html = `<div class="calendar-day-header">${dayLabel}</div>`;
  calendarConflicts(sorted).forEach(c => {
    html += `<div class="cal-conflict-note">⚠ ${escapeHtml(c.scout)} is in ${c.plans.length} plans on this day: ${c.plans.map(escapeHtml).join(', ')}.</div>`;
  });
  sorted.forEach((e, i) => {
    const w = e.item;
    html += `
      <div class="calendar-row" data-i="${i}">
        <span class="cal-scout-dot" style="background:${scoutColor(e.plan.scout)}" title="${escapeHtml(e.plan.scout || 'No scout')}">${escapeHtml(scoutInitials(e.plan.scout))}</span>
        <div class="crbody">
          <div class="crteams">${escapeHtml(w.homeName)} – ${escapeHtml(w.awayName)}</div>
          <div class="crmeta">${fmtTimeOnly(e.start)}${unverifiedBadge(w.key)} · ${escapeHtml(w.city)} · ${escapeHtml(LEAGUE_LABELS[w.league] || w.league)} · Plan: ${escapeHtml(e.plan.name)}${e.plan.scout ? ` · ${escapeHtml(e.plan.scout)}` : ''} <span class="status-pill status-${planStatus(e.plan)}">${planStatusLabel(e.plan)}</span></div>
          ${e.plan.note ? `<div class="crnote">${escapeHtml(e.plan.note)}</div>` : ''}
          ${w.missing ? `<div class="wflag wflag-missing">No longer in the schedule. Check before you travel.</div>` : ''}
          ${w.changedFrom ? `<div class="wflag">⟳ Kickoff changed, was ${fmtDate(w.changedFrom)}</div>` : ''}
        </div>
      </div>`;
  });
  detail.innerHTML = html;
  detail.querySelectorAll('.calendar-row').forEach(row => {
    const e = sorted[Number(row.dataset.i)];
    row.querySelector('.crbody').onclick = () => openPlanFromCalendar(e.plan.id, e.item);
  });
}

// Back to the map with that plan active and its route shown.
function openPlanFromCalendar(planId, item){
  setView('map');
  switchPlan(planId);
  revealMyPlan();
  map.setView([item.lat, item.lng], 9);
}

function renderCalendar(){
  if(calendarMode === 'plans'){
    document.getElementById('calendar-month-label').textContent =
      calendarViewDate.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    renderPlansCalendar();
    return;
  }
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

  const range = getActiveDateRange();
  const fromDate = range ? range.from : null;
  const toDate = range ? range.to : null;
  const noteEl = document.getElementById('calendar-range-note');
  if(noteEl){
    noteEl.textContent = range && (range.from || range.to)
      ? `Dates: ${range.from ? fmtDateShort(range.from) : 'open'} to ${range.to ? fmtDateShort(range.to) : 'open'}`
      : 'Showing every game this month. Use Dates to limit it.';
  }

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
    row.querySelector('.crbody').onclick = () => jumpToFixtureOnMap(g.league, g.matchday, g.home.lat, g.home.lng, `${g.home.name}, ${g.home.city}`);
  });
}

// ===== Data status line (header) =====
// Replaces a fixed claim with what is actually known: when the fixtures were
// last verified (data/meta.json) and how many upcoming kickoffs still lack a
// second source. Turns amber when the check is more than 10 days old.
const DATA_STALE_DAYS = 10;
function renderDataStatus(){
  const el = document.getElementById('snapshot-note');
  if(!el) return;
  const parts = [];
  let stale = false;
  if(META && META.checked){
    const checked = new Date(META.checked + 'T12:00:00');
    const days = Math.floor((Date.now() - checked.getTime()) / 86400000);
    stale = days > DATA_STALE_DAYS;
    const label = checked.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    parts.push(`Fixtures checked <b>${label}</b>${stale ? ` (${days} days ago)` : ''}`);
  }
  const now = Date.now();
  let open = 0;
  Object.keys(FIXTURES).forEach(lg => FIXTURES[lg].forEach(f => { if(f.unverified && new Date(f.start).getTime() > now) open++; }));
  if(open > 0) parts.push(`<span class="unverified-badge">⚠</span> ${open} kickoff${open === 1 ? '' : 's'} not yet confirmed by two sources`);
  el.innerHTML = parts.join(' · ');
  el.classList.toggle('stale', stale);
}

// ===== Bootstrap: load data, then render =====
async function loadData(){
  const [teamsRes, fixturesRes, airportsRes, leaguesRes, metaRes, scoutsRes] = await Promise.all([
    fetch('data/teams.json'),
    fetch('data/fixtures.json'),
    fetch('data/airports.json'),
    fetch('data/leagues.json'),
    fetch('data/meta.json').catch(() => null), // optional: the app works without it
    fetch('data/scouts.json').catch(() => null) // optional as well
  ]);
  TEAMS = await teamsRes.json();
  FIXTURES = await fixturesRes.json();
  AIRPORTS = await airportsRes.json();
  LEAGUE_LOGO = await leaguesRes.json();
  try{ if(metaRes && metaRes.ok) META = await metaRes.json(); } catch(e){ /* keep the empty default */ }
  try{ if(scoutsRes && scoutsRes.ok) SCOUTS = await scoutsRes.json(); } catch(e){ /* keep the empty default */ }

  reconcilePlans();
  renderDataStatus();
  buildLeaguePanel();
  renderWatchlist();
  computeWatchlistLegs(); // covers a returning user's plan already having 2+ saved games
  renderAll();
  dataReady = true;
  importSharedPlanFromUrl();
}

loadData();
