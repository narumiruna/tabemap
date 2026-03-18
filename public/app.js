(() => {
  "use strict";

  const MAP_VIEW_STORAGE_KEY = "tabemap:last-map-view";
  const DEFAULT_MAP_VIEW = Object.freeze({ lat: 34.4902, lng: 136.7091, zoom: 14 });
  const GPS_OPTIONS = Object.freeze({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });

  const appState = {
    location: null,
    hasMapChanged: false,
    isSearching: false,
    sheetExpanded: false,
    radius: 1000,
    minScore: 3.5,
    hasGpsError: false
  };

  const mapHint = document.getElementById("map-hint");
  const searchAreaBtn = document.getElementById("search-area-btn");
  const openSheetBtn = document.getElementById("open-sheet-btn");
  const gpsFabBtn = document.getElementById("gps-fab-btn");

  const bottomSheet = document.getElementById("bottom-sheet");
  const sheetHeader = document.getElementById("sheet-header");
  const sheetSummary = document.getElementById("sheet-summary");

  const radiusSelect = document.getElementById("radius-select");
  const minScoreSelect = document.getElementById("min-score");

  const resultsSection = document.getElementById("results-section");
  const resultCount = document.getElementById("result-count");
  const statusBar = document.getElementById("status-bar");
  const restaurantList = document.getElementById("restaurant-list");

  let userMarker = null;
  let bootstrapping = true;

  const map = initMap();

  function initMap() {
    const view = loadLastMapView();
    const mapInstance = L.map("map").setView([view.lat, view.lng], view.zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    mapInstance.on("click", (e) => {
      appState.location = { lat: e.latlng.lat, lng: e.latlng.lng };
      appState.hasMapChanged = true;
      appState.hasGpsError = false;
      updateUI();
    });

    mapInstance.on("moveend", () => {
      saveMapView(mapInstance);
      if (bootstrapping) return;
      const center = mapInstance.getCenter();
      appState.location = { lat: center.lat, lng: center.lng };
      appState.hasMapChanged = true;
      updateUI();
    });

    mapInstance.on("zoomend", () => {
      if (bootstrapping) return;
      const center = mapInstance.getCenter();
      appState.location = { lat: center.lat, lng: center.lng };
      appState.hasMapChanged = true;
      updateUI();
    });

    mapInstance.whenReady(() => {
      setTimeout(() => {
        mapInstance.invalidateSize();
        bootstrapping = false;
      }, 0);
    });

    window.addEventListener("resize", () => mapInstance.invalidateSize());
    window.addEventListener("orientationchange", () => setTimeout(() => mapInstance.invalidateSize(), 120));

    return mapInstance;
  }

  function loadLastMapView() {
    try {
      const raw = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
      if (!raw) return DEFAULT_MAP_VIEW;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.lat !== "number" ||
        typeof parsed?.lng !== "number" ||
        typeof parsed?.zoom !== "number"
      ) {
        return DEFAULT_MAP_VIEW;
      }
      return parsed;
    } catch {
      return DEFAULT_MAP_VIEW;
    }
  }

  function saveMapView(mapInstance) {
    try {
      const center = mapInstance.getCenter();
      localStorage.setItem(
        MAP_VIEW_STORAGE_KEY,
        JSON.stringify({ lat: center.lat, lng: center.lng, zoom: mapInstance.getZoom() })
      );
    } catch {
      // ignore
    }
  }

  function getCurrentPositionAsync(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  function renderMarker() {
    if (!appState.location) {
      if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
      }
      return;
    }

    const icon = L.divIcon({
      className: "user-marker",
      html: "<span style='display:block;width:16px;height:16px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)'></span>",
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    if (userMarker) {
      userMarker.setLatLng([appState.location.lat, appState.location.lng]);
    } else {
      userMarker = L.marker([appState.location.lat, appState.location.lng], { icon }).addTo(map);
    }
  }

  function updateSheetSummary() {
    const radiusText = appState.radius >= 1000 ? `${appState.radius / 1000} km` : `${appState.radius} m`;
    const scoreText = `${appState.minScore.toFixed(1)}+`;
    sheetSummary.textContent = `${radiusText} ・ ${scoreText}`;
  }

  function updateMapHint() {
    if (appState.hasGpsError) {
      mapHint.textContent = "定位失敗，請改用地圖選點";
      mapHint.style.display = "";
      return;
    }

    mapHint.textContent = "移動地圖或點選位置後即可搜尋";
    mapHint.style.display = appState.hasMapChanged ? "none" : "";
  }

  function updateSearchAreaButton() {
    const shouldShow = appState.hasMapChanged;
    searchAreaBtn.hidden = !shouldShow;

    if (!shouldShow) {
      searchAreaBtn.disabled = false;
      searchAreaBtn.textContent = "在此區域搜尋";
      return;
    }

    searchAreaBtn.disabled = appState.isSearching;
    searchAreaBtn.textContent = appState.isSearching ? "搜尋中..." : "在此區域搜尋";
  }

  function updateSheetExpandedState() {
    bottomSheet.classList.toggle("is-expanded", appState.sheetExpanded);
    sheetHeader.setAttribute("aria-expanded", appState.sheetExpanded ? "true" : "false");
  }

  function updateUI() {
    updateSheetExpandedState();
    updateSheetSummary();
    updateMapHint();
    updateSearchAreaButton();
    renderMarker();
  }

  function setStatusBar(message, type) {
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
  }

  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderRestaurants(restaurants) {
    restaurantList.innerHTML = "";
    resultCount.textContent = `（${restaurants.length} 間）`;

    if (restaurants.length === 0) {
      restaurantList.innerHTML = '<p class="rst-card">此範圍內找不到符合條件的餐廳。</p>';
      return;
    }

    restaurants.forEach((r) => {
      const card = document.createElement("article");
      card.className = "rst-card";

      const scoreClass = r.score >= 4.0 ? "score-gold" : r.score >= 3.5 ? "score-green" : "score-default";
      const scoreText = r.score != null ? Number(r.score).toFixed(2) : "—";

      card.innerHTML = `
        <a class="rst-name" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
        <div class="rst-meta">
          <span class="score-badge ${scoreClass}">★ ${scoreText}</span>
          ${r.genre ? `<span>${esc(r.genre)}</span>` : ""}
        </div>
        ${r.address ? `<p class="rst-address">${esc(r.address)}</p>` : ""}
      `;

      restaurantList.appendChild(card);
    });
  }

  async function doSearch() {
    if (appState.isSearching || !appState.hasMapChanged) return;

    const center = appState.location || map.getCenter();
    appState.location = { lat: center.lat, lng: center.lng };
    appState.isSearching = true;
    appState.hasGpsError = false;
    updateUI();

    resultsSection.style.display = "";
    setStatusBar("🔍 搜尋中，請稍候...", "info");

    const radius = appState.radius;
    const minScore = appState.minScore;

    try {
      const res = await fetch(
        `/api/restaurants?lat=${center.lat}&lng=${center.lng}&radius=${radius}&min_score=${minScore}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      renderRestaurants(data.restaurants || []);
      if ((data.count || 0) > 0) {
        setStatusBar(`✅ 找到 ${data.count} 間評分 ≥ ${minScore} 的餐廳`, "success");
      } else {
        setStatusBar(`⚠️ 範圍內找不到評分 ≥ ${minScore} 的餐廳`, "warn");
      }
      resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      appState.hasMapChanged = false;
    } catch (err) {
      setStatusBar(`❌ 搜尋失敗：${err.message}`, "error");
      restaurantList.innerHTML = "";
      resultCount.textContent = "";
    } finally {
      appState.isSearching = false;
      updateUI();
    }
  }

  async function triggerGpsLocation() {
    if (!navigator.geolocation) {
      appState.hasGpsError = true;
      updateUI();
      return;
    }

    try {
      const pos = await getCurrentPositionAsync(GPS_OPTIONS);
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      appState.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      appState.hasMapChanged = true;
      appState.hasGpsError = false;
    } catch {
      appState.hasGpsError = true;
    }

    updateUI();
  }

  sheetHeader.addEventListener("click", () => {
    appState.sheetExpanded = !appState.sheetExpanded;
    updateUI();
  });

  openSheetBtn.addEventListener("click", () => {
    appState.sheetExpanded = true;
    updateUI();
  });

  gpsFabBtn.addEventListener("click", triggerGpsLocation);

  radiusSelect.addEventListener("change", () => {
    appState.radius = parseInt(radiusSelect.value, 10);
    updateUI();
  });

  minScoreSelect.addEventListener("change", () => {
    appState.minScore = parseFloat(minScoreSelect.value);
    updateUI();
  });

  searchAreaBtn.addEventListener("click", doSearch);

  updateUI();
})();
