/* ============================================================
   Japão Golden Route — lógica do app (PWA)
   ============================================================ */
"use strict";

// ---------- Estado persistente (localStorage = funciona offline) ----------
const store = {
  get(k, def) { try { const v = localStorage.getItem("jp_" + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem("jp_" + k, JSON.stringify(v)); } catch {} },
};
let favorites = store.get("favorites", {});   // {placeId: "quero"|"visitei"|"talvez"|"pular"|"importante"}
let notes = store.get("notes", {});           // {placeId: "texto"}
let checklist = store.get("checklist", {});   // {"g-i": true}
let stamps = store.get("stamps", {});         // {"g-i": true} — carimbos coletados
let docsText = store.get("docs", "");
let userPos = null;                            // {lat, lng}
let watchId = null;
let geoDenied = false;

const $ = (s) => document.querySelector(s);
const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));

// ---------- Utilidades ----------
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a)); // km
}
function fmtDist(km) { return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(km < 10 ? 1 : 0) + " km"; }
function travelTime(km) {
  if (km <= 2.5) return "🚶 ~" + Math.max(1, Math.round(km * 13)) + " min a pé";
  if (km <= 40) return "🚇 ~" + Math.round(8 + km * 2.2) + " min de trem/metrô";
  return "🚄 ~" + Math.round(km / 3.5) + " min de trem-bala";
}
function distTo(p) { return userPos ? haversine(userPos.lat, userPos.lng, p.lat, p.lng) : null; }
function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
function catMeta(c) { return CATS[c] || { label: c, icon: "📌", cor: "#888" }; }
const DOW_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function closedToday(p) { return p.fecha && p.fecha.includes(new Date().getDay()); }
function closedInfo(p) {
  if (!p.fecha) return "";
  const dias = p.fecha.map((d) => DOW_PT[d]).join(" e ");
  return closedToday(p)
    ? `<span style="color:#c22740;font-weight:700">🚫 FECHADO HOJE (${dias})</span>`
    : `⚠️ Fecha: ${dias}`;
}
function catBadge(p) {
  const m = catMeta(p.cat);
  return `<div class="pi-icon" style="background:${m.cor}22">${m.icon}</div>`;
}
function mapsLinks(p) {
  const q = encodeURIComponent(p.nome + " " + (p.addr || p.cidade + " Japan"));
  return {
    apple: `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${q}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=&travelmode=transit`,
    gsearch: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}
function tripDayIndex() {
  // retorna o nº do dia da viagem (1-16) se hoje estiver dentro do período, senão null
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(TRIP.inicio + "T00:00:00");
  const diff = Math.round((today - start) / 86400000);
  return diff >= 0 && diff < TRIP.dias ? diff + 1 : null;
}

// ---------- Geolocalização ----------
function startGeo(cb) {
  if (!navigator.geolocation) { geoDenied = true; if (cb) cb(); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => { userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; geoDenied = false; if (cb) cb(); startWatch(); },
    () => { geoDenied = true; if (cb) cb(); },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}
function startWatch() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => { userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateUserMarker(); },
    () => {}, { enableHighAccuracy: true, maximumAge: 15000 }
  );
}

// ---------- Navegação por abas ----------
const TITLES = { inicio: "🎌 Japão Golden Route", roteiro: "📅 Roteiro dia a dia", mapa: "🗺️ Mapa da viagem", perto: "📍 Perto de mim", favoritos: "⭐ Favoritos", cidades: "🏙️ Cidades", config: "⚙️ Ferramentas" };
let currentTab = "inicio";
function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-" + tab).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#topbar-title").textContent = TITLES[tab];
  window.scrollTo(0, 0);
  const render = { inicio: renderInicio, roteiro: renderRoteiro, mapa: initMap, perto: renderPerto, favoritos: renderFavoritos, cidades: renderCidades, config: renderConfig }[tab];
  if (render) render();
  if (tab === "mapa" && map) setTimeout(() => map.invalidateSize(), 60);
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- INÍCIO ----------
function renderInicio() {
  const el = $("#view-inicio");
  const dayIdx = tripDayIndex();
  const start = new Date(TRIP.inicio + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToGo = Math.round((start - today) / 86400000);
  let countdown = "";
  if (dayIdx) countdown = `✈️ Você está no dia ${dayIdx} de ${TRIP.dias} da viagem!`;
  else if (daysToGo > 0) countdown = `⏳ Faltam ${daysToGo} dia${daysToGo > 1 ? "s" : ""} para a viagem!`;
  else countdown = "🏠 Viagem concluída — おかえり!";

  let todayCard = "";
  if (dayIdx) {
    const d = DAYS.find((x) => x.d === dayIdx);
    todayCard = `<div class="card today-card">
      <h2>📌 Hoje — Dia ${d.d}: ${esc(d.titulo)}</h2>
      <p class="muted">${esc(d.cidade)} · ${fmtDate(d.date)} (${d.dow})</p>
      <p style="font-size:13.5px;margin-top:8px">${esc(d.periodos[0].desc)}</p>
      <div class="row" style="margin-top:10px">
        <button class="chip red" onclick="openDayFromHome(${d.d})">Ver o dia completo →</button>
        <button class="chip" onclick="showTab('perto')">O que tem perto de mim?</button>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div class="hero">
      <h1>${esc(TRIP.nome)}</h1>
      <div class="dates">24 de julho – 8 de agosto de 2026 · ${TRIP.dias} dias / ${TRIP.noites} noites</div>
      <p>${esc(TRIP.resumo)}</p>
      <div class="cities">${CIDADES.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
      <div class="countdown">${countdown}</div>
    </div>
    ${todayCard}
    <div class="quick-grid">
      <button class="quick-btn" onclick="showTab('roteiro')"><span>📅</span>Roteiro por dia<small>${TRIP.dias} dias detalhados</small></button>
      <button class="quick-btn" onclick="showTab('mapa')"><span>🗺️</span>Mapa interativo<small>${PLACES.length} locais com GPS</small></button>
      <button class="quick-btn" onclick="showTab('perto')"><span>📍</span>Perto de mim<small>restaurantes, lojas, atrações</small></button>
      <button class="quick-btn" onclick="showTab('cidades')"><span>🏙️</span>Guia por cidade<small>transporte, bairros, dicas</small></button>
    </div>
    <div class="card">
      <h2>🗾 Bases da viagem</h2>
      ${TRIP.bases.map((b) => `
        <div class="base-item">
          <div class="base-n">${b.noites}<small>noite${b.noites > 1 ? "s" : ""}</small></div>
          <div><b>${esc(b.cidade)}</b> <span class="muted">· ${esc(b.periodo)}</span><br><span class="muted">${esc(b.destaque)}</span></div>
        </div>`).join("")}
    </div>
    <div class="card">
      <h2>⚠️ Não esqueça</h2>
      ${TRIP.alertas.map((a) => `<p style="font-size:13.5px;line-height:1.5;padding:6px 0;border-bottom:1px solid var(--line)">• ${esc(a)}</p>`).join("")}
      <button class="chip red" style="margin-top:10px" onclick="showTab('config')">Ver checklist completo →</button>
    </div>`;
}
window.openDayFromHome = (d) => { showTab("roteiro"); setTimeout(() => toggleDay(d, true), 50); };

// ---------- ROTEIRO ----------
function renderRoteiro() {
  const el = $("#view-roteiro");
  const dayIdx = tripDayIndex();
  el.innerHTML = DAYS.map((d) => {
    const isToday = dayIdx === d.d;
    return `<div class="day-card" id="day-${d.d}">
      <button class="day-head" onclick="toggleDay(${d.d})">
        <div class="day-num">${d.d}<small>${fmtDate(d.date)}</small></div>
        <div class="day-head-info">
          <b>${isToday ? "📌 " : ""}${esc(d.titulo)}</b>
          <span class="muted">${esc(d.cidade)} · ${d.dow} · ${esc(d.prioridade)}${d.leve ? " · 🍃 dia leve" : ""}</span>
        </div>
        <span class="day-arrow">›</span>
      </button>
      <div class="day-body">
        ${d.periodos.map((p) => `<div class="period"><b>${esc(p.t)}</b><p>${esc(p.desc)}</p></div>`).join("")}
        <div class="day-meta">🚇 <b>Transporte:</b> ${esc(d.transporte)}<br>💡 <b>Obs:</b> ${esc(d.obs)}</div>
        <div class="day-places">
          <h4>Locais deste dia (toque para detalhes)</h4>
          ${d.places.map((id) => placeItem(byId[id])).join("")}
        </div>
      </div>
    </div>`;
  }).join("");
  if (dayIdx) setTimeout(() => { const c = $("#day-" + dayIdx); if (c) { c.classList.add("open"); c.scrollIntoView({ block: "start", behavior: "smooth" }); } }, 50);
}
window.toggleDay = (n, forceOpen) => {
  const c = $("#day-" + n); if (!c) return;
  if (forceOpen) { c.classList.add("open"); c.scrollIntoView({ block: "start" }); }
  else c.classList.toggle("open");
};

// ---------- Item de local (lista) ----------
function placeItem(p, showDist) {
  if (!p) return "";
  const km = distTo(p);
  const fav = favorites[p.id];
  const distHtml = showDist && km != null ? `<div class="pi-right"><div class="dist">${fmtDist(km)}</div>${travelTime(km)}</div>` : "";
  const favIcon = fav ? STATUS[fav].icon : "";
  return `<button class="place-item" onclick="openPlace('${p.id}')">
    ${catBadge(p)}
    <div class="pi-body">
      <b>${favIcon ? favIcon + " " : ""}${esc(p.nome)}</b>
      <small>${catMeta(p.cat).label} · ${esc(p.cidade)}${p.roteiro ? "" : " · sugestão extra"}${p.rating ? " · ★ " + p.rating : ""}${closedToday(p) ? ' · <span style="color:#c22740;font-weight:700">fechado hoje</span>' : ""}</small>
    </div>
    ${distHtml}
  </button>`;
}

// ---------- Sheet de detalhes ----------
function openPlace(id) {
  const p = byId[id]; if (!p) return;
  const km = distTo(p);
  const links = mapsLinks(p);
  const fav = favorites[p.id];
  const m = catMeta(p.cat);
  $("#sheet").innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <div class="pi-icon" style="background:${m.cor}22">${m.icon}</div>
      <div>
        <h2>${esc(p.nome)}</h2>
        <div class="row" style="margin-top:6px">
          <span class="chip">${m.label}</span>
          <span class="chip">${esc(p.cidade)}</span>
          ${p.roteiro ? `<span class="chip red">No roteiro${p.dias ? " · dia " + p.dias.join(", ") : ""}</span>` : `<span class="chip green">Sugestão extra</span>`}
          ${p.rating ? `<span class="chip">★ ${p.rating}</span>` : ""}
        </div>
      </div>
    </div>
    <p class="sheet-info">${esc(p.desc)}</p>
    <div class="sheet-meta">
      ${p.addr ? "📍 " + esc(p.addr) + "<br>" : ""}
      ${p.hours ? "🕐 " + esc(p.hours) + "<br>" : ""}
      ${p.fecha ? closedInfo(p) + "<br>" : ""}
      ${p.preco ? "💴 " + esc(p.preco) + "<br>" : ""}
      ${km != null ? `📏 ${fmtDist(km)} de você · ${travelTime(km)}` : "📏 Ative a localização para ver a distância"}
    </div>
    <div class="sheet-actions">
      <a class="primary" href="${links.apple}" target="_blank" rel="noopener"> Rota (Apple Maps)</a>
      <a href="${links.google}" target="_blank" rel="noopener">🗺️ Rota (Google Maps)</a>
      <button onclick="showOnMap('${p.id}')">🧭 Ver no mapa do app</button>
      <a href="${links.gsearch}" target="_blank" rel="noopener">ℹ️ Fotos & avaliações</a>
    </div>
    <div class="section-title" style="margin-left:0">Salvar como</div>
    <div class="status-row">
      ${Object.entries(STATUS).map(([k, s]) =>
        `<button class="status-btn ${fav === k ? "active" : ""}" onclick="setStatus('${p.id}','${k}')">${s.icon} ${s.label}</button>`).join("")}
      ${fav ? `<button class="status-btn" onclick="setStatus('${p.id}',null)">✕ Remover</button>` : ""}
    </div>
    <div class="section-title" style="margin-left:0">Minhas anotações</div>
    <textarea class="note-box" placeholder="Ex.: reservado para 19h, pedir o menu de degustação…" onchange="saveNote('${p.id}', this.value)">${esc(notes[p.id] || "")}</textarea>`;
  $("#sheet").classList.remove("hidden");
  $("#sheet-backdrop").classList.remove("hidden");
}
window.openPlace = openPlace;
window.setStatus = (id, st) => {
  if (st) favorites[id] = st; else delete favorites[id];
  store.set("favorites", favorites);
  openPlace(id);
  if (currentTab === "favoritos") renderFavoritos();
};
window.saveNote = (id, v) => { if (v.trim()) notes[id] = v; else delete notes[id]; store.set("notes", notes); };
function closeSheet() { $("#sheet").classList.add("hidden"); $("#sheet-backdrop").classList.add("hidden"); }
$("#sheet-backdrop").addEventListener("click", closeSheet);
window.showOnMap = (id) => { closeSheet(); showTab("mapa"); const p = byId[id]; setTimeout(() => { map.setView([p.lat, p.lng], 16); const mk = markerById[id]; if (mk) mk.openPopup(); }, 150); };

// ---------- MAPA ----------
let map = null, markerById = {}, userMarker = null, activeMapCat = "todos";
function initMap() {
  if (map) { updateUserMarker(); return; }
  map = L.map("map", { zoomControl: false }).setView([35.0116, 135.7681], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(map);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  drawMarkers();
  renderMapFilters();
  // enquadra o Japão do roteiro
  const b = L.latLngBounds(PLACES.map((p) => [p.lat, p.lng]));
  map.fitBounds(b.pad(0.08));
  startGeo(updateUserMarker);
  $("#map-locate").addEventListener("click", () => {
    if (userPos) map.setView([userPos.lat, userPos.lng], 15);
    else startGeo(() => { if (userPos) map.setView([userPos.lat, userPos.lng], 15); else alert("Não foi possível obter sua localização. Verifique as permissões em Ajustes > Safari > Localização."); });
  });
}
function markerIcon(p) {
  const m = catMeta(p.cat);
  return L.divIcon({ className: "", html: `<div class="marker-pin" style="background:${m.cor}">${m.icon}</div>`, iconSize: [32, 32], iconAnchor: [16, 30], popupAnchor: [0, -28] });
}
function drawMarkers() {
  Object.values(markerById).forEach((mk) => map.removeLayer(mk));
  markerById = {};
  PLACES.filter((p) => activeMapCat === "todos" || p.cat === activeMapCat).forEach((p) => {
    const km = distTo(p);
    const links = mapsLinks(p);
    const mk = L.marker([p.lat, p.lng], { icon: markerIcon(p) }).addTo(map);
    mk.bindPopup(`
      <div class="popup-title">${esc(p.nome)}</div>
      <div style="font-size:12px;color:#666">${catMeta(p.cat).label} · ${esc(p.cidade)}${p.roteiro ? " · no roteiro" : " · extra"}</div>
      ${km != null ? `<div style="font-size:12px;margin-top:3px"><b>${fmtDist(km)}</b> · ${travelTime(km)}</div>` : ""}
      <div class="popup-actions">
        <button onclick="openPlace('${p.id}')">Detalhes</button>
        <a href="${links.apple}" target="_blank" rel="noopener">Rota </a>
        <a href="${links.google}" target="_blank" rel="noopener">Rota G</a>
      </div>`);
    markerById[p.id] = mk;
  });
}
function renderMapFilters() {
  const el = $("#map-filters");
  const cats = [["todos", { label: "Todos", icon: "🌐" }], ...Object.entries(CATS)];
  el.innerHTML = cats.map(([k, m]) =>
    `<button class="fbtn ${activeMapCat === k ? "active" : ""}" onclick="setMapCat('${k}')">${m.icon} ${m.label}</button>`).join("");
}
window.setMapCat = (c) => { activeMapCat = c; renderMapFilters(); drawMarkers(); };
function updateUserMarker() {
  if (!map || !userPos) return;
  if (!userMarker) {
    userMarker = L.marker([userPos.lat, userPos.lng], {
      icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      zIndexOffset: 1000,
    }).addTo(map).bindPopup("Você está aqui");
  } else userMarker.setLatLng([userPos.lat, userPos.lng]);
}

// ---------- PERTO DE MIM ----------
let pertoCat = "todos", pertoRaio = 3;
function renderPerto() {
  const el = $("#view-perto");
  if (!userPos) {
    el.innerHTML = `<div class="geo-banner">
      <b>📍 Permita o acesso à localização</b><br>
      O GPS é usado apenas para mostrar os locais próximos, calcular distâncias e facilitar a navegação. Sua localização nunca sai do seu aparelho.
      <br><button onclick="askGeo()">Ativar localização</button>
      ${geoDenied ? "<br><small>Se negou antes: Ajustes > Apps > Safari > Localização > Permitir.</small>" : ""}
    </div>
    <div class="section-title">Enquanto isso, os destaques do roteiro:</div>
    <div class="card">${PLACES.filter((p) => p.rating >= 4.6).slice(0, 8).map((p) => placeItem(p)).join("")}</div>`;
    return;
  }
  const cats = [["todos", { label: "Tudo", icon: "🌐" }], ...Object.entries(CATS)];
  const raios = [1, 3, 10, 50, 20000];
  const near = PLACES
    .map((p) => ({ p, km: distTo(p) }))
    .filter((x) => (pertoCat === "todos" || x.p.cat === pertoCat) && x.km <= pertoRaio)
    .sort((a, b) => a.km - b.km)
    .slice(0, 40);
  el.innerHTML = `
    <div class="filters">${cats.map(([k, m]) => `<button class="fbtn ${pertoCat === k ? "active" : ""}" onclick="setPertoCat('${k}')">${m.icon} ${m.label}</button>`).join("")}</div>
    <div class="filters">${raios.map((r) => `<button class="fbtn ${pertoRaio === r ? "active" : ""}" onclick="setPertoRaio(${r})">${r >= 20000 ? "Sem limite" : "até " + r + " km"}</button>`).join("")}</div>
    ${near.length ? `<div class="card">${near.map((x) => placeItem(x.p, true)).join("")}</div>`
      : `<div class="empty"><span>🗾</span>Nenhum local do roteiro num raio de ${pertoRaio} km.<br>Aumente o raio acima — ou você ainda não está no Japão! 😄</div>`}`;
}
window.setPertoCat = (c) => { pertoCat = c; renderPerto(); };
window.setPertoRaio = (r) => { pertoRaio = r; renderPerto(); };
window.askGeo = () => startGeo(() => { renderPerto(); });

// ---------- FAVORITOS ----------
function renderFavoritos() {
  const el = $("#view-favoritos");
  const ids = Object.keys(favorites);
  if (!ids.length) {
    el.innerHTML = `<div class="empty"><span>⭐</span>Nenhum favorito ainda.<br>Abra qualquer local e marque como <b>Quero ir</b>, <b>Importante</b>, <b>Talvez</b>…</div>`;
    return;
  }
  const groups = {};
  ids.forEach((id) => { const st = favorites[id]; (groups[st] = groups[st] || []).push(byId[id]); });
  el.innerHTML = Object.entries(STATUS)
    .filter(([k]) => groups[k])
    .map(([k, s]) => `
      <div class="section-title">${s.icon} ${s.label} (${groups[k].length})</div>
      <div class="card">${groups[k].filter(Boolean).sort((a, b) => (distTo(a) ?? 9e9) - (distTo(b) ?? 9e9)).map((p) => placeItem(p, true)).join("")}</div>`)
    .join("");
}

// ---------- CIDADES ----------
let cityActive = "Tóquio";
function renderCidades() {
  const el = $("#view-cidades");
  const info = CITY_INFO[cityActive] || {};
  const places = PLACES.filter((p) => p.cidade === cityActive);
  const byCat = {};
  places.forEach((p) => (byCat[p.cat] = byCat[p.cat] || []).push(p));
  const order = ["turismo", "atividade", "restaurante", "cafe", "compras", "conveniencia", "transporte", "hospedagem"];
  el.innerHTML = `
    <div class="city-tabs">${CIDADES.map((c) => `<button class="fbtn ${cityActive === c ? "active" : ""}" onclick="setCity('${c}')">${c}</button>`).join("")}</div>
    <div class="card">
      <h2>${esc(cityActive)}</h2>
      <p class="muted" style="margin-top:6px">🚇 <b>Transporte:</b> ${esc(info.transporte || "")}</p>
      <p class="muted" style="margin-top:6px">🏘️ <b>Bairros:</b> ${esc(info.bairros || "")}</p>
    </div>
    ${info.dicas ? `<div class="card"><h3>💡 Dicas locais</h3>${info.dicas.map((d) => `<p style="font-size:13.5px;padding:6px 0;border-bottom:1px solid var(--line);line-height:1.5">• ${esc(d)}</p>`).join("")}</div>` : ""}
    ${order.filter((c) => byCat[c]).map((c) => `
      <div class="section-title">${catMeta(c).icon} ${catMeta(c).label} (${byCat[c].length})</div>
      <div class="card">${byCat[c].map((p) => placeItem(p, true)).join("")}</div>`).join("")}`;
}
window.setCity = (c) => { cityActive = c; renderCidades(); window.scrollTo(0, 0); };

// ---------- CONFIG / FERRAMENTAS ----------
let rateJPYBRL = store.get("rate", 0.036); // R$ por ¥1 (editável / atualizado online)
function renderConfig() {
  const el = $("#view-config");
  el.innerHTML = `
    <div class="acc" id="acc-agora"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">🎯 O que fazer agora? <span>›</span></button>
      <div class="acc-body" id="agora-body"></div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">🖋️ Carimbos — Goshuin & Eki Stamps <span id="stamps-count" class="chip red"></span></button>
      <div class="acc-body">${CARIMBOS.map((g, gi) => `
        <div class="section-title" style="margin-left:0">${g.icon} ${esc(g.g)} <span id="stamp-g-${gi}" class="muted"></span></div>
        <p class="muted" style="line-height:1.55;margin-bottom:6px">${esc(g.desc)}</p>
        ${g.itens.map((it, i) => {
          const key = gi + "-" + i, done = stamps[key];
          return `<div class="check-item ${done ? "done" : ""}"><input type="checkbox" id="st-${key}" ${done ? "checked" : ""} onchange="toggleStamp('${key}', this.checked)">
            <label for="st-${key}"><b>${esc(it.n)}</b> <span class="muted">· ${esc(it.cidade)} · dia ${it.dia}</span><br><small class="muted">${esc(it.dica)}</small></label></div>`;
        }).join("")}`).join("")}
      </div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">✅ Checklist da viagem <span>›</span></button>
      <div class="acc-body">${CHECKLIST.map((g, gi) => `
        <div class="section-title" style="margin-left:0">${esc(g.g)}</div>
        ${g.itens.map((it, i) => {
          const key = gi + "-" + i, done = checklist[key];
          return `<div class="check-item ${done ? "done" : ""}"><input type="checkbox" id="ck-${key}" ${done ? "checked" : ""} onchange="toggleCheck('${key}', this.checked)"><label for="ck-${key}">${esc(it)}</label></div>`;
        }).join("")}`).join("")}
      </div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">💴 Conversor ¥ ⇄ R$ <span>›</span></button>
      <div class="acc-body">
        <div class="conv-row"><span>¥</span><input type="number" id="conv-jpy" inputmode="decimal" placeholder="Ienes" value="1000"></div>
        <div class="conv-row"><span>R$</span><input type="number" id="conv-brl" inputmode="decimal" placeholder="Reais"></div>
        <p class="muted">Cotação: ¥1 = R$ <span id="rate-val">${rateJPYBRL.toFixed(4)}</span> <button class="chip" onclick="updateRate()">🔄 Atualizar online</button></p>
        <p class="muted" id="rate-status">A cotação salva funciona offline.</p>
      </div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">🗣️ Frases úteis em japonês <span>›</span></button>
      <div class="acc-body">${FRASES.map((f) => `<div class="phrase"><b>${esc(f.pt)}</b><div class="jp">${esc(f.jp)}</div><small>${esc(f.romaji)}</small></div>`).join("")}</div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">🆘 Emergência e contatos <span>›</span></button>
      <div class="acc-body">${EMERGENCIA.map((e) => `
        <div class="emg-item"><div><b style="font-size:14px">${esc(e.nome)}</b><br><small class="muted">${esc(e.desc)}</small></div>
        ${/^[+\d]/.test(e.tel) ? `<a href="tel:${e.tel.replace(/[^+\d]/g, "")}">${esc(e.tel)}</a>` : `<span class="chip">${esc(e.tel)}</span>`}</div>`).join("")}
      </div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">🔗 Links úteis (marés, tufões, trens, parques) <span>›</span></button>
      <div class="acc-body">${LINKS.map((l) => `
        <div class="emg-item"><div><b style="font-size:14px">${esc(l.n)}</b><br><small class="muted">${esc(l.d)}</small></div>
        <a href="${l.url}" target="_blank" rel="noopener">Abrir ↗</a></div>`).join("")}
        <p class="muted" style="margin-top:8px">Estes links precisam de internet.</p>
      </div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">🈴 Etiqueta japonesa <span>›</span></button>
      <div class="acc-body">${ETIQUETA.map((e) => `<p style="font-size:13.5px;padding:7px 0;border-bottom:1px solid var(--line);line-height:1.5">• ${esc(e)}</p>`).join("")}</div></div>
    <div class="acc"><button class="acc-head" onclick="this.parentNode.classList.toggle('open')">📄 Documentos & anotações da viagem <span>›</span></button>
      <div class="acc-body">
        <p class="muted" style="margin-bottom:8px">Números de voo, códigos de reserva, endereço dos hotéis… Fica salvo só no seu aparelho e funciona offline.</p>
        <textarea class="note-box" style="min-height:140px" onchange="saveDocs(this.value)" placeholder="Voo de ida: …&#10;Reserva hotel Tóquio: …&#10;Código DisneySea: …">${esc(docsText)}</textarea>
      </div></div>
    <div class="card" style="margin-top:14px">
      <h3>Sobre o app</h3>
      <p class="muted" style="margin-top:6px;line-height:1.6">Roteiro, locais salvos, favoritos e anotações funcionam <b>offline</b>. Mapa, avaliações e rotas precisam de internet. Sua localização é usada apenas no aparelho — nada é enviado a servidores.</p>
    </div>`;
  renderAgora();
  setupConverter();
  updateStampCounters();
}
window.toggleStamp = (key, v) => {
  if (v) stamps[key] = true; else delete stamps[key];
  store.set("stamps", stamps);
  const item = $("#st-" + key)?.closest(".check-item");
  if (item) item.classList.toggle("done", v);
  updateStampCounters();
};
function updateStampCounters() {
  const total = CARIMBOS.reduce((s, g) => s + g.itens.length, 0);
  const got = Object.keys(stamps).length;
  const badge = $("#stamps-count");
  if (badge) badge.textContent = `${got}/${total}`;
  CARIMBOS.forEach((g, gi) => {
    const el = $("#stamp-g-" + gi);
    if (el) el.textContent = `(${g.itens.filter((_, i) => stamps[gi + "-" + i]).length}/${g.itens.length} coletados)`;
  });
}
window.toggleCheck = (key, v) => { if (v) checklist[key] = true; else delete checklist[key]; store.set("checklist", checklist); const item = $("#ck-" + key)?.closest(".check-item"); if (item) item.classList.toggle("done", v); };
window.saveDocs = (v) => { docsText = v; store.set("docs", v); };

// "O que fazer agora?"
function renderAgora() {
  const body = $("#agora-body"); if (!body) return;
  const dayIdx = tripDayIndex();
  const h = new Date().getHours();
  const periodo = h < 12 ? 0 : h < 17 ? 1 : 2;
  let html = "";
  if (dayIdx) {
    const d = DAYS.find((x) => x.d === dayIdx);
    const per = d.periodos[Math.min(periodo, d.periodos.length - 1)];
    html += `<p style="font-size:14px;line-height:1.6"><b>Dia ${d.d} · ${esc(d.titulo)}</b> — agora (${esc(per.t)}):</p>
      <p style="font-size:13.5px;line-height:1.6;margin:8px 0">${esc(per.desc)}</p>`;
  } else {
    html += `<p class="muted">A viagem começa em 24/07/2026. Durante a viagem, este painel mostra o plano do momento com base no dia e horário.</p>`;
  }
  if (userPos) {
    const near = PLACES.map((p) => ({ p, km: distTo(p) })).sort((a, b) => a.km - b.km).slice(0, 4);
    html += `<div class="section-title" style="margin-left:0">Mais próximos de você agora</div>` + near.map((x) => placeItem(x.p, true)).join("");
  } else {
    html += `<button class="chip red" onclick="askGeoAgora()">📍 Ativar localização para sugestões próximas</button>`;
  }
  body.innerHTML = html;
}
window.askGeoAgora = () => startGeo(renderAgora);

// Conversor
function setupConverter() {
  const jpy = $("#conv-jpy"), brl = $("#conv-brl");
  if (!jpy) return;
  const upd = (from) => {
    if (from === "jpy") brl.value = (parseFloat(jpy.value || 0) * rateJPYBRL).toFixed(2);
    else jpy.value = Math.round(parseFloat(brl.value || 0) / rateJPYBRL);
  };
  jpy.addEventListener("input", () => upd("jpy"));
  brl.addEventListener("input", () => upd("brl"));
  upd("jpy");
}
window.updateRate = async () => {
  const st = $("#rate-status");
  st.textContent = "Buscando cotação…";
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/JPY");
    const j = await r.json();
    if (j && j.rates && j.rates.BRL) {
      rateJPYBRL = j.rates.BRL;
      store.set("rate", rateJPYBRL);
      $("#rate-val").textContent = rateJPYBRL.toFixed(4);
      st.textContent = "Cotação atualizada agora e salva para uso offline. ✅";
      setupConverter();
    } else throw 0;
  } catch { st.textContent = "Sem conexão — usando a última cotação salva."; }
};

// ---------- BUSCA ----------
$("#btn-search").addEventListener("click", () => {
  $("#searchbar").classList.toggle("hidden");
  $("#search-results").classList.add("hidden");
  if (!$("#searchbar").classList.contains("hidden")) $("#search-input").focus();
});
$("#search-close").addEventListener("click", () => { $("#searchbar").classList.add("hidden"); $("#search-results").classList.add("hidden"); $("#search-input").value = ""; });
$("#search-input").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const res = $("#search-results");
  if (q.length < 2) { res.classList.add("hidden"); return; }
  const hits = PLACES.filter((p) =>
    p.nome.toLowerCase().includes(q) || p.cidade.toLowerCase().includes(q) ||
    (p.desc || "").toLowerCase().includes(q) || catMeta(p.cat).label.toLowerCase().includes(q)
  ).slice(0, 12);
  res.innerHTML = hits.length
    ? hits.map((p) => `<button class="sr-item" onclick="openFromSearch('${p.id}')">${catMeta(p.cat).icon}<div><b>${esc(p.nome)}</b><small>${catMeta(p.cat).label} · ${esc(p.cidade)}</small></div></button>`).join("")
    : `<div class="sr-item">Nada encontrado para “${esc(q)}”.</div>`;
  res.classList.remove("hidden");
});
window.openFromSearch = (id) => { $("#search-results").classList.add("hidden"); $("#searchbar").classList.add("hidden"); openPlace(id); };

// ---------- Online/Offline ----------
function updateOnlineBadge() {
  document.querySelectorAll(".offline-badge").forEach((b) => b.remove());
  if (!navigator.onLine) {
    const b = document.createElement("div");
    b.className = "offline-badge";
    b.textContent = "📴 Offline — roteiro e favoritos disponíveis";
    document.body.appendChild(b);
  }
}
window.addEventListener("online", updateOnlineBadge);
window.addEventListener("offline", updateOnlineBadge);

// ---------- Service worker ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- Boot ----------
updateOnlineBadge();
showTab("inicio");
startGeo(() => { if (currentTab === "perto") renderPerto(); if (currentTab === "inicio") renderInicio(); });
