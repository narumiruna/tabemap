(() => {
  'use strict';

  // ── Map init ──────────────────────────────────────────────────────────────
  const map = L.map('map').setView([35.6812, 139.7671], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let userMarker = null;
  let restaurantMarkers = [];
  let radiusCircle = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const statusBar      = document.getElementById('status-bar');
  const searchBtn      = document.getElementById('search-btn');
  const manualCoords   = document.getElementById('manual-coords');
  const inputLat       = document.getElementById('input-lat');
  const inputLng       = document.getElementById('input-lng');
  const radiusSelect   = document.getElementById('radius-select');
  const minScoreInput  = document.getElementById('min-score');
  const resultsSection = document.getElementById('results-section');
  const restaurantList = document.getElementById('restaurant-list');
  const resultCount    = document.getElementById('result-count');

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

  // ── Clear map restaurant layers ───────────────────────────────────────────
  function clearRestaurantLayers() {
    restaurantMarkers.forEach(m => map.removeLayer(m));
    restaurantMarkers = [];
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  }

  // ── Place user marker ─────────────────────────────────────────────────────
  function placeUserMarker(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: 'user-marker', html: '📍', iconSize: [28, 28], iconAnchor: [14, 28] })
    }).addTo(map).bindPopup('您的位置').openPopup();
    map.setView([lat, lng], 15);
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

    const radius = parseInt(radiusSelect.value, 10);

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
            </div>
            ${r.address ? `<p class="rst-address">📌 ${esc(r.address)}</p>` : ''}
          </div>
        </div>`;

      const capturedIdx = idx;
      card.addEventListener('click', () => {
        const m = restaurantMarkers[capturedIdx];
        if (m) { map.setView(m.getLatLng(), 17); m.openPopup(); }
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      restaurantList.appendChild(card);

      // ── Map marker ──
      // Use per-restaurant coordinates when available (scraped from data-lat /
      // data-lng on each Tabelog card).  Fall back to a spread ring around the
      // search centre for the rare case where the data is absent.
      let mLat, mLng;
      if (r.lat != null && r.lng != null) {
        mLat = r.lat;
        mLng = r.lng;
      } else {
        const angle  = (idx / Math.max(restaurants.length, 1)) * 2 * Math.PI;
        const spread = Math.min(radius * 0.00001, 0.002);
        mLat = lat + Math.cos(angle) * spread * (0.3 + 0.7 * ((idx % 5) / 5));
        mLng = lng + Math.sin(angle) * spread * (0.3 + 0.7 * ((idx % 5) / 5));
      }

      const m = L.marker([mLat, mLng], {
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

  function isWithinTaiwanBounds(lat, lng) {
    // Rough bounding box for Taiwan main area + nearby islands.
    return lat >= 20.5 && lat <= 26.6 && lng >= 118.0 && lng <= 123.5;
  }

  async function getBestGeolocationPosition() {
    const requests = [
      withTimeout(
        getCurrentPositionAsync({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }),
        12000,
        '定位逾時'
      ),
      withTimeout(
        getCurrentPositionAsync({ enableHighAccuracy: false, timeout: 6000, maximumAge: 0 }),
        8000,
        '定位逾時'
      )
    ];

    const settled = await Promise.allSettled(requests);
    const ok = settled
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    if (ok.length > 0) {
      return ok.reduce((best, cur) =>
        (cur.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity) ? cur : best
      );
    }

    const firstError = settled.find((r) => r.status === 'rejected');
    throw firstError && firstError.reason instanceof Error
      ? firstError.reason
      : new Error('Unable to get location');
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
      setStatus('📡 正在取得您的位置（最多約 12 秒）…', 'info');
      (async () => {
        try {
          const pos = await getBestGeolocationPosition();
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy ?? Infinity;

          // If location confidence is too low, avoid searching a likely wrong area.
          if (acc > 50000) {
            document.querySelector('input[name="loc-source"][value="manual"]').checked = true;
            manualCoords.style.display = '';
            inputLat.value = lat.toFixed(6);
            inputLng.value = lng.toFixed(6);
            setStatus(`❌ 定位精度過低（約 ±${Math.round(acc / 1000)} km），請改用手動輸入或點地圖選位置`, 'error');
            return;
          }

          // On some desktop/network setups, IP geolocation may jump to a wrong country.
          // For this Taiwan-targeted use case, force manual confirmation when outside Taiwan.
          if (!isWithinTaiwanBounds(lat, lng)) {
            document.querySelector('input[name="loc-source"][value="manual"]').checked = true;
            manualCoords.style.display = '';
            inputLat.value = lat.toFixed(6);
            inputLng.value = lng.toFixed(6);
            setStatus(`⚠️ 自動定位疑似錯誤（${lat.toFixed(4)}, ${lng.toFixed(4)}），已切換手動模式，請修正座標或點地圖`, 'warn');
            return;
          }

          doSearch(lat, lng);
        } catch (err) {
          setStatus(`❌ 無法取得位置（${err.message}），請改用手動輸入`, 'error');
        }
      })();
    }
  });

  // ── Click map to set manual location ─────────────────────────────────────
  map.on('click', e => {
    document.querySelector('input[name="loc-source"][value="manual"]').checked = true;
    manualCoords.style.display = '';
    inputLat.value = e.latlng.lat.toFixed(6);
    inputLng.value = e.latlng.lng.toFixed(6);
    setStatus(`📍 已選取位置：${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, 'info');
  });
})();
