(() => {
  'use strict';

  // ── Persisted map view ────────────────────────────────────────────────────
  const MAP_VIEW_STORAGE_KEY = "tabemap:last-map-view";
  const DEFAULT_MAP_VIEW = Object.freeze({
    lat: 34.4902,
    lng: 136.7091,
    zoom: 14
  });

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
      const zoom = mapInstance.getZoom();
      localStorage.setItem(
        MAP_VIEW_STORAGE_KEY,
        JSON.stringify({ lat: center.lat, lng: center.lng, zoom })
      );
    } catch {
      // Ignore storage failures (private mode/quota/security policy).
    }
  }

  // ── Map init ──────────────────────────────────────────────────────────────
  const initialMapView = loadLastMapView();
  const map = L.map('map').setView([initialMapView.lat, initialMapView.lng], initialMapView.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let userMarker = null;
  let restaurantMarkers = [];
  let radiusCircle = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const statusBar      = document.getElementById('status-bar');
  const gpsInfo        = document.getElementById('gps-info');
  const searchBtn      = document.getElementById('search-btn');
  const diagBtn        = document.getElementById('diag-btn');
  const diagOutput     = document.getElementById('diag-output');
  const manualCoords   = document.getElementById('manual-coords');
  const inputLat       = document.getElementById('input-lat');
  const inputLng       = document.getElementById('input-lng');
  const radiusSelect   = document.getElementById('radius-select');
  const minScoreInput  = document.getElementById('min-score');
  const resultsSection = document.getElementById('results-section');
  const restaurantList = document.getElementById('restaurant-list');
  const resultCount    = document.getElementById('result-count');
  const GPS_FIRST_OPTIONS = Object.freeze({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  });

  // ── Location source toggle ────────────────────────────────────────────────
  document.querySelectorAll('input[name="loc-source"]').forEach(radio => {
    radio.addEventListener('change', () => {
      manualCoords.style.display = radio.value === 'manual' ? '' : 'none';
    });
  });

  // ── Status helper ─────────────────────────────────────────────────────────
  function setStatus(msg, type = 'info') {
    statusBar.textContent = msg;
    statusBar.className = 'status-bar ' + type;
  }

  function setGpsInfo(msg) {
    gpsInfo.textContent = `GPS：${msg}`;
  }

  function setDiagOutput(lines) {
    diagOutput.style.display = '';
    diagOutput.textContent = lines.join('\n');
  }

  // ── Clear map restaurant layers ───────────────────────────────────────────
  function clearRestaurantLayers() {
    restaurantMarkers.forEach(m => map.removeLayer(m));
    restaurantMarkers = [];
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  }

  function buildUserMarkerIcon(color = "red") {
    const safeColor = color === "green" ? "green" : "red";
    return L.divIcon({
      className: "user-marker",
      html: `<span class="user-pin user-pin-${safeColor}"></span>`,
      iconSize: [20, 30],
      iconAnchor: [10, 30]
    });
  }

  // ── Place user marker ─────────────────────────────────────────────────────
  function placeUserMarker(lat, lng, color = "red", options = {}) {
    const { centerMap = true } = options;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: buildUserMarkerIcon(color)
    }).addTo(map).bindPopup('您的位置');
    if (centerMap) {
      map.setView([lat, lng], 15);
    }
  }

  // ── Draw radius circle ────────────────────────────────────────────────────
  function drawRadius(lat, lng, radiusMeters) {
    if (radiusCircle) map.removeLayer(radiusCircle);
    radiusCircle = L.circle([lat, lng], {
      radius: radiusMeters,
      color: '#3b82f6',
      fillColor: '#93c5fd',
      fillOpacity: 0.12,
      weight: 2
    }).addTo(map);
  }

  // ── Escape HTML ───────────────────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Render results ────────────────────────────────────────────────────────
  function renderRestaurants(restaurants, lat, lng) {
    restaurantList.innerHTML = '';
    resultCount.textContent = `（${restaurants.length} 間）`;

    if (restaurants.length === 0) {
      restaurantList.innerHTML = '<p class="no-results">此範圍內找不到符合條件的餐廳。</p>';
      resultsSection.style.display = '';
      return;
    }

    let missingLocationCount = 0;

    restaurants.forEach((r, idx) => {
      // ── Card ──
      const card = document.createElement('article');
      card.className = 'rst-card';

      const scoreClass = r.score >= 4.0 ? 'score-gold' : r.score >= 3.5 ? 'score-green' : 'score-default';
      const scoreText  = r.score != null ? r.score.toFixed(2) : '—';
      const imgHtml    = r.image
        ? `<img class="rst-thumb" src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" onerror="this.style.display='none'" />`
        : `<div class="rst-thumb rst-thumb-placeholder">🍽️</div>`;

      card.innerHTML = `
        <div class="rst-card-inner">
          ${imgHtml}
          <div class="rst-info">
            <a class="rst-name" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>
            <div class="rst-meta">
              <span class="score-badge ${scoreClass}">★ ${scoreText}</span>
              ${r.genre  ? `<span class="tag">${esc(r.genre)}</span>` : ''}
              ${r.budget ? `<span class="tag">💴 ${esc(r.budget)}</span>` : ''}
              ${r.lat == null || r.lng == null ? `<span class="tag tag-warn">位置資料不足</span>` : ''}
            </div>
            ${r.address ? `<p class="rst-address">📌 ${esc(r.address)}</p>` : ''}
          </div>
        </div>`;

      const capturedIdx = idx;
      card.addEventListener('click', () => {
        const m = restaurantMarkers[capturedIdx];
        if (m) {
          map.setView(m.getLatLng(), 17);
          m.openPopup();
        } else {
          setStatus('⚠️ 此餐廳缺少座標，請點卡片標題前往店家頁查看詳細地址', 'warn');
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      restaurantList.appendChild(card);

      // ── Map marker ──
      // Only place markers when we have real coordinates.
      if (r.lat == null || r.lng == null) {
        missingLocationCount += 1;
        restaurantMarkers.push(null);
        return;
      }

      const m = L.marker([r.lat, r.lng], {
        icon: L.divIcon({
          className: 'rst-marker',
          html: `<span>${idx + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(map);

      m.bindPopup(`
        <div class="popup-content">
          <a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.name)}</b></a><br/>
          <strong>★ ${scoreText}</strong>
          ${r.genre   ? `<br/>${esc(r.genre)}` : ''}
          ${r.address ? `<br/><small>${esc(r.address)}</small>` : ''}
        </div>`);

      restaurantMarkers.push(m);
    });

    if (missingLocationCount > 0) {
      resultCount.textContent = `（${restaurants.length} 間，${missingLocationCount} 間無座標）`;
    }

    resultsSection.style.display = '';
  }

  // ── Main search ───────────────────────────────────────────────────────────
  function getCurrentPositionAsync(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  }

  async function runLocationDiagnostics() {
    const now = new Date();
    const lines = [
      `time: ${now.toISOString()}`,
      `isSecureContext: ${String(window.isSecureContext)}`,
      `userAgent: ${navigator.userAgent}`,
    ];

    if (!navigator.geolocation) {
      lines.push('geolocation: unavailable');
      setDiagOutput(lines);
      setStatus('❌ 瀏覽器不支援定位', 'error');
      return;
    }

    lines.push('geolocation: available');

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        lines.push(`permission.state: ${result.state}`);
      } catch {
        lines.push('permission.state: unavailable');
      }
    } else {
      lines.push('permission api: unavailable');
    }

    lines.push(`request: ${JSON.stringify(GPS_FIRST_OPTIONS)}`);

    try {
      const pos = await withTimeout(
        getCurrentPositionAsync(GPS_FIRST_OPTIONS),
        12000,
        '定位逾時'
      );
      lines.push(`coords.lat: ${pos.coords.latitude}`);
      lines.push(`coords.lng: ${pos.coords.longitude}`);
      lines.push(`coords.accuracy_m: ${pos.coords.accuracy}`);
      lines.push(`coords.altitude: ${pos.coords.altitude ?? 'null'}`);
      lines.push(`coords.altitudeAccuracy: ${pos.coords.altitudeAccuracy ?? 'null'}`);
      lines.push(`coords.heading: ${pos.coords.heading ?? 'null'}`);
      lines.push(`coords.speed: ${pos.coords.speed ?? 'null'}`);
      lines.push(`position.timestamp: ${new Date(pos.timestamp).toISOString()}`);
      setDiagOutput(lines);
      setStatus('✅ 定位診斷完成', 'success');
    } catch (err) {
      lines.push(`error.name: ${err?.name ?? 'Error'}`);
      lines.push(`error.message: ${err?.message ?? String(err)}`);
      setDiagOutput(lines);
      setStatus(`❌ 定位診斷失敗：${err.message}`, 'error');
    }
  }

  async function getBestGeolocationPosition() {
    // GPS-first only strategy: retry once with the same high-accuracy options.
    // We intentionally do not degrade to low-accuracy network positioning.
    try {
      return await withTimeout(
        getCurrentPositionAsync(GPS_FIRST_OPTIONS),
        13000,
        '定位逾時'
      );
    } catch {
      return withTimeout(
        getCurrentPositionAsync(GPS_FIRST_OPTIONS),
        13000,
        '定位逾時'
      );
    }
  }

  async function doSearch(lat, lng) {
    const radius   = parseInt(radiusSelect.value, 10);
    const minScore = parseFloat(minScoreInput.value);

    setStatus('🔍 搜尋中，請稍候…', 'info');
    searchBtn.disabled = true;
    clearRestaurantLayers();
    placeUserMarker(lat, lng);
    drawRadius(lat, lng, radius);

    try {
      const res = await fetch(
        `/api/restaurants?lat=${lat}&lng=${lng}&radius=${radius}&min_score=${minScore}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      renderRestaurants(data.restaurants, lat, lng);
      setStatus(
        data.count > 0
          ? `✅ 找到 ${data.count} 間評分 ≥ ${minScore} 的餐廳`
          : `⚠️ 範圍內找不到評分 ≥ ${minScore} 的餐廳`,
        data.count > 0 ? 'success' : 'warn'
      );
    } catch (e) {
      setStatus(`❌ 搜尋失敗：${e.message}`, 'error');
    } finally {
      searchBtn.disabled = false;
    }
  }

  // ── Search button ─────────────────────────────────────────────────────────
  searchBtn.addEventListener('click', () => {
    const source = document.querySelector('input[name="loc-source"]:checked').value;

    if (source === 'manual') {
      setGpsInfo('目前為手動輸入模式');
      const lat = parseFloat(inputLat.value);
      const lng = parseFloat(inputLng.value);
      if (isNaN(lat) || isNaN(lng)) {
        setStatus('❌ 請輸入有效的緯度和經度', 'error');
        return;
      }
      doSearch(lat, lng);
    } else {
      if (!navigator.geolocation) {
        setStatus('❌ 瀏覽器不支援定位，請改用手動輸入', 'error');
        return;
      }
      setStatus('📡 正在以 GPS 優先高精度模式取得位置（最多約 12 秒）…', 'info');
      (async () => {
        try {
          const pos = await getBestGeolocationPosition();
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy ?? Infinity;
          const now = new Date();
          setGpsInfo(
            `${lat.toFixed(6)}, ${lng.toFixed(6)} | 精度 ±${Math.round(acc)} m | ${now.toLocaleTimeString('zh-TW', { hour12: false })}`
          );

          // Require reasonably accurate GPS to avoid wrong-city/country results.
          if (acc > 3000) {
            document.querySelector('input[name="loc-source"][value="manual"]').checked = true;
            manualCoords.style.display = '';
            inputLat.value = lat.toFixed(6);
            inputLng.value = lng.toFixed(6);
            setStatus(`❌ GPS 精度不足（約 ±${Math.round(acc)} m），請開啟精確定位或改用手動輸入`, 'error');
            return;
          }

          doSearch(lat, lng);
        } catch (err) {
          setStatus(`❌ 無法取得位置（${err.message}），請改用手動輸入`, 'error');
        }
      })();
    }
  });

  diagBtn.addEventListener('click', () => {
    runLocationDiagnostics();
  });

  // ── Click map to set manual location ─────────────────────────────────────
  map.on('click', e => {
    document.querySelector('input[name="loc-source"][value="manual"]').checked = true;
    manualCoords.style.display = '';
    inputLat.value = e.latlng.lat.toFixed(6);
    inputLng.value = e.latlng.lng.toFixed(6);
    placeUserMarker(e.latlng.lat, e.latlng.lng, "green", { centerMap: false });
    setStatus(`📍 已選取位置：${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, 'info');
  });

  map.on("moveend", () => {
    saveMapView(map);
  });

  map.whenReady(() => {
    setTimeout(() => map.invalidateSize(), 0);
  });

  window.addEventListener("resize", () => {
    map.invalidateSize();
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => map.invalidateSize(), 120);
  });
})();
