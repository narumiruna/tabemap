(() => {
  "use strict";

  const MAP_VIEW_STORAGE_KEY = "tabemap:last-map-view";
  const DEFAULT_MAP_VIEW = Object.freeze({ lat: 34.4902, lng: 136.7091, zoom: 14 });
  const GPS_OPTIONS = Object.freeze({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });

  const appState = {
    location: null,
    locationSource: "map",
    hasMapChanged: false,
    isSearching: false,
    sheetExpanded: false,
    radius: 1000,
    minScore: 3.5,
    hasGpsError: false,
    isGpsLoading: false,
    results: [],
    resultsSheet: "hidden"
  };

  const mapHint = document.getElementById("map-hint");
  const searchAreaBtn = document.getElementById("search-area-btn");
  const searchAreaLabel = document.getElementById("search-area-label");
  const openSheetBtn = document.getElementById("open-sheet-btn");
  const gpsFabBtn = document.getElementById("gps-fab-btn");

  const controlPanel = document.getElementById("control-panel");
  const panelHeader = document.getElementById("panel-header");
  const panelHeaderSummary = document.getElementById("panel-header-summary");
  const locationSummary = document.getElementById("location-summary");
  const filterSummary = document.getElementById("filter-summary");

  const locInlineState = document.getElementById("loc-inline-state");
  const useGpsBtn = document.getElementById("use-gps-btn");
  const radiusSelect = document.getElementById("radius-select");
  const minScoreSelect = document.getElementById("min-score");

  const resultsSection = document.getElementById("results-section");
  const resultsHeader = document.getElementById("results-header");
  const resultsTitle = document.getElementById("results-title");
  const resultsSubtitle = document.getElementById("results-subtitle");
  const resultsDragHandle = document.getElementById("results-drag-handle");
  const resultsCloseBtn = document.getElementById("results-close-btn");
  const resultsReopenBtn = document.getElementById("results-reopen-btn");
  const restaurantList = document.getElementById("restaurant-list");

  let userMarker = null;
  let restaurantMarkers = [];
  let searchRadiusCircle = null;
  let bootstrapping = true;

  const map = initMap();

  function syncAppHeightVar() {
    document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  }

  function isDesktop() {
    return window.matchMedia("(min-width: 961px)").matches;
  }

  function initMap() {
    const view = loadLastMapView();
    const mapInstance = L.map("map").setView([view.lat, view.lng], view.zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    mapInstance.on("click", (e) => {
      appState.locationSource = "map";
      setLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      appState.hasMapChanged = true;
      appState.hasGpsError = false;
      appState.isGpsLoading = false;
      clearSearchLayers();
      syncLocationSourceRadios();
      updateUI();
    });

    mapInstance.on("moveend", () => {
      saveMapView(mapInstance);
      if (bootstrapping) return;
      appState.hasMapChanged = true;
      updateUI();
    });

    mapInstance.on("zoomend", () => {
      if (bootstrapping) return;
      appState.hasMapChanged = true;
      updateUI();
    });

    mapInstance.whenReady(() => {
      setTimeout(() => {
        mapInstance.invalidateSize();
        bootstrapping = false;
      }, 0);
    });

    return mapInstance;
  }

  function setLocation(point) {
    appState.location = point;
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

  function syncLocationSourceRadios() {
    document.querySelectorAll('input[name="loc-source"]').forEach((radio) => {
      radio.checked = radio.value === appState.locationSource;
    });
  }

  function updateLocationSummary() {
    const locationText = appState.location ? "已選位置" : "尚未選擇位置";
    const radiusText = appState.radius >= 1000 ? `${appState.radius / 1000} km` : `${appState.radius} m`;
    const scoreText = `${appState.minScore.toFixed(1)}+`;

    locationSummary.textContent = locationText;
    filterSummary.textContent = `${radiusText} ・ ${scoreText}`;
    panelHeaderSummary.textContent = `${locationText} ・ ${radiusText} ・ ${scoreText}`;
  }

  function updateLocationInlineState() {
    locInlineState.className = "inline-state";

    if (appState.isGpsLoading) {
      locInlineState.textContent = "定位中...";
      locInlineState.classList.add("is-loading");
      return;
    }

    if (appState.hasGpsError) {
      locInlineState.textContent = "定位失敗，請改用地圖選點";
      locInlineState.classList.add("is-error");
      return;
    }

    if (appState.location && appState.locationSource === "gps") {
      locInlineState.textContent = "已使用 GPS 位置";
      locInlineState.classList.add("is-success");
      return;
    }

    if (appState.location && appState.locationSource === "map") {
      locInlineState.textContent = "已使用地圖選點";
      locInlineState.classList.add("is-success");
      return;
    }

    locInlineState.textContent = "點擊地圖選擇位置";
  }

  function clearSearchLayers() {
    restaurantMarkers.forEach((marker) => {
      if (marker) map.removeLayer(marker);
    });
    restaurantMarkers = [];

    if (searchRadiusCircle) {
      map.removeLayer(searchRadiusCircle);
      searchRadiusCircle = null;
    }
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

  function createRestaurantMarkerIcon(label) {
    return L.divIcon({
      className: "restaurant-marker",
      html: `<span style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:26px;
        height:26px;
        border-radius:999px;
        background:rgba(255,255,255,.94);
        color:#111827;
        font-weight:700;
        font-size:12px;
        border:1px solid rgba(59,130,246,.45);
        box-shadow:0 4px 10px rgba(15,23,42,.16);
      ">${label}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function renderSearchOverlays(restaurants, center, radius) {
    clearSearchLayers();

    searchRadiusCircle = L.circle([center.lat, center.lng], {
      radius,
      color: "#2563eb",
      fillColor: "#60a5fa",
      fillOpacity: 0.1,
      weight: 1.5
    }).addTo(map);

    restaurantMarkers = restaurants.map((restaurant, idx) => {
      if (restaurant.lat == null || restaurant.lng == null) return null;

      const scoreText = restaurant.score != null ? Number(restaurant.score).toFixed(2) : "—";
      const marker = L.marker([restaurant.lat, restaurant.lng], {
        icon: createRestaurantMarkerIcon(String(idx + 1))
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-size:12px;line-height:1.45;color:#111827;">
          <a href="${esc(restaurant.url)}" target="_blank" rel="noopener" style="color:#111827;font-weight:700;text-decoration:none;">
            ${esc(restaurant.name)}
          </a><br/>
          <span style="color:#475569;">★ ${scoreText}</span>
          ${restaurant.address ? `<br/><span style="color:#6b7280;">${esc(restaurant.address)}</span>` : ""}
        </div>
      `);

      return marker;
    });
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
      searchAreaLabel.textContent = "在此區域搜尋";
      return;
    }

    searchAreaBtn.disabled = appState.isSearching;
    searchAreaLabel.textContent = appState.isSearching ? "搜尋中..." : "在此區域搜尋";
  }

  function updatePanelState() {
    if (isDesktop()) {
      appState.sheetExpanded = true;
      controlPanel.classList.add("is-expanded");
      panelHeader.setAttribute("aria-expanded", "true");
      return;
    }

    controlPanel.classList.toggle("is-expanded", appState.sheetExpanded);
    panelHeader.setAttribute("aria-expanded", appState.sheetExpanded ? "true" : "false");
  }

  function setResultsSheetState(nextState) {
    appState.resultsSheet = nextState;
    resultsSection.classList.remove("is-hidden", "is-peek", "is-expanded");
    resultsSection.classList.add(`is-${nextState}`);

    const hasResults = appState.results.length > 0;
    resultsReopenBtn.hidden = !(nextState === "hidden" && hasResults);
    resultsReopenBtn.textContent = `搜尋結果（${appState.results.length}）`;
  }

  function updateResultsSheetUI() {
    resultsTitle.textContent = `搜尋結果（${appState.results.length} 間）`;
    setResultsSheetState(appState.resultsSheet);
  }

  function updateUI() {
    syncLocationSourceRadios();
    updatePanelState();
    updateLocationSummary();
    updateLocationInlineState();
    updateMapHint();
    updateSearchAreaButton();
    renderMarker();
    updateResultsSheetUI();
    useGpsBtn.disabled = appState.isGpsLoading;
  }

  function setResultsSubtitle(message, type) {
    resultsSubtitle.textContent = message;
    resultsSubtitle.className = `results-subtitle ${type}`;
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
    appState.results = restaurants;
    resultsTitle.textContent = `搜尋結果（${restaurants.length} 間）`;

    if (restaurants.length === 0) {
      restaurantList.innerHTML = '<p class="empty-state">此範圍內找不到符合條件的餐廳。</p>';
      return;
    }

    restaurants.forEach((r, idx) => {
      const card = document.createElement("article");
      card.className = "rst-card";

      const scoreClass = r.score >= 4.0 ? "score-gold" : r.score >= 3.5 ? "score-green" : "score-default";
      const scoreText = r.score != null ? Number(r.score).toFixed(2) : "—";

      card.innerHTML = `
        <div class="rst-card-num" aria-hidden="true">${idx + 1}</div>
        <div class="rst-card-body">
          <a class="rst-name" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
          <div class="rst-meta">
            <span class="score-badge ${scoreClass}">★ ${scoreText}</span>
            ${r.genre ? `<span>${esc(r.genre)}</span>` : ""}
            ${r.lat == null || r.lng == null ? `<span class="rst-meta-note">位置資料不足</span>` : ""}
          </div>
          ${r.address ? `<p class="rst-address">${esc(r.address)}</p>` : ""}
        </div>
      `;

      card.addEventListener("click", () => {
        const marker = restaurantMarkers[idx];
        if (!marker) return;
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
        marker.openPopup();
      });

      restaurantList.appendChild(card);
    });
  }

  async function doSearch() {
    if (appState.isSearching || !appState.hasMapChanged) return;

    const center = appState.location || map.getCenter();
    appState.isSearching = true;
    appState.hasGpsError = false;
    appState.resultsSheet = "peek";
    updateUI();
    clearSearchLayers();
    setResultsSubtitle("搜尋中，請稍候...", "info");

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
      const restaurants = data.restaurants || [];
      renderRestaurants(restaurants);
      renderSearchOverlays(restaurants, center, radius);

      if ((data.count || 0) > 0) {
        setResultsSubtitle(`找到 ${data.count} 間評分 ≥ ${minScore} 的餐廳`, "success");
      } else {
        setResultsSubtitle(`範圍內找不到評分 ≥ ${minScore} 的餐廳`, "warn");
      }

      appState.hasMapChanged = false;
      appState.resultsSheet = "peek";
    } catch (err) {
      appState.results = [];
      appState.resultsSheet = "hidden";
      setResultsSubtitle(`搜尋失敗：${err.message}`, "error");
      restaurantList.innerHTML = "";
      clearSearchLayers();
    } finally {
      appState.isSearching = false;
      updateUI();
    }
  }

  async function triggerGpsLocation() {
    if (!navigator.geolocation) {
      appState.hasGpsError = true;
      appState.isGpsLoading = false;
      updateUI();
      return;
    }

    appState.locationSource = "gps";
    appState.isGpsLoading = true;
    appState.hasGpsError = false;
    updateUI();

    try {
      const pos = await getCurrentPositionAsync(GPS_OPTIONS);
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      appState.hasMapChanged = true;
      appState.hasGpsError = false;
    } catch {
      appState.hasGpsError = true;
    } finally {
      appState.isGpsLoading = false;
      updateUI();
    }
  }

  function initResultsSheetInteractions() {
    let startY = 0;
    let isDragging = false;
    let activePointerId = null;

    const onPointerMove = (event) => {
      if (!isDragging || event.pointerId !== activePointerId) return;
      const deltaY = event.clientY - startY;
      if (appState.resultsSheet === "peek" || appState.resultsSheet === "expanded") {
        const distance = deltaY > 0 ? Math.min(deltaY, 120) : Math.max(deltaY, -80);
        resultsSection.style.transform = `translateY(${distance}px)`;
      }
    };

    const onPointerUp = (event) => {
      if (!isDragging || event.pointerId !== activePointerId) return;
      const deltaY = event.clientY - startY;
      isDragging = false;
      activePointerId = null;
      resultsSection.style.transform = "";
      resultsSection.releasePointerCapture?.(event.pointerId);

      if (deltaY > 48) {
        if (appState.resultsSheet === "expanded") {
          appState.resultsSheet = "peek";
        } else if (appState.resultsSheet === "peek") {
          appState.resultsSheet = "hidden";
        }
      } else if (deltaY < -28 && appState.resultsSheet === "peek") {
        appState.resultsSheet = "expanded";
      }
      updateUI();
    };

    resultsHeader.addEventListener("pointerdown", (event) => {
      if (event.target === resultsCloseBtn) return;
      if (appState.resultsSheet === "hidden") return;
      isDragging = true;
      startY = event.clientY;
      activePointerId = event.pointerId;
      resultsSection.setPointerCapture?.(event.pointerId);
    });

    // Use the sheet root as drag receiver so captured pointer events never get lost.
    resultsSection.addEventListener("pointermove", onPointerMove);
    resultsSection.addEventListener("pointerup", onPointerUp);
    resultsSection.addEventListener("pointercancel", onPointerUp);

    resultsDragHandle.addEventListener("click", () => {
      if (appState.resultsSheet === "hidden") {
        appState.resultsSheet = "peek";
      } else if (appState.resultsSheet === "peek") {
        appState.resultsSheet = "expanded";
      } else {
        appState.resultsSheet = "peek";
      }
      updateUI();
    });

    resultsHeader.addEventListener("click", (event) => {
      if (event.target === resultsCloseBtn || event.target === resultsDragHandle) return;
      if (appState.resultsSheet === "peek") {
        appState.resultsSheet = "expanded";
        updateUI();
      }
    });

    resultsCloseBtn.addEventListener("click", () => {
      appState.resultsSheet = "hidden";
      updateUI();
    });

    resultsReopenBtn.addEventListener("click", () => {
      appState.resultsSheet = "peek";
      updateUI();
    });
  }

  panelHeader.addEventListener("click", () => {
    if (isDesktop()) return;
    appState.sheetExpanded = !appState.sheetExpanded;
    updateUI();
  });

  openSheetBtn.addEventListener("click", () => {
    if (isDesktop()) return;
    appState.sheetExpanded = true;
    updateUI();
  });

  document.querySelectorAll('input[name="loc-source"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      appState.locationSource = radio.value;
      appState.hasGpsError = false;
      if (appState.hasMapChanged) clearSearchLayers();
      updateUI();
    });
  });

  useGpsBtn.addEventListener("click", triggerGpsLocation);
  gpsFabBtn.addEventListener("click", triggerGpsLocation);

  radiusSelect.addEventListener("change", () => {
    appState.radius = parseInt(radiusSelect.value, 10);
    if (appState.hasMapChanged) clearSearchLayers();
    updateUI();
  });

  minScoreSelect.addEventListener("change", () => {
    appState.minScore = parseFloat(minScoreSelect.value);
    if (appState.hasMapChanged) clearSearchLayers();
    updateUI();
  });

  searchAreaBtn.addEventListener("click", doSearch);
  initResultsSheetInteractions();

  window.addEventListener("resize", () => {
    syncAppHeightVar();
    map.invalidateSize();
    updateUI();
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      syncAppHeightVar();
      map.invalidateSize();
      updateUI();
    }, 120);
  });

  syncAppHeightVar();
  updateUI();
})();
