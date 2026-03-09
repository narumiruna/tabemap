# 🍜 Tabelog 附近高評分餐廳

在地圖上搜尋 [食べログ（日文版）](https://tabelog.com) 附近評分 ≥ 3.5 的餐廳。  
支援自動偵測位置、手動輸入座標、自訂搜尋半徑與最低評分。

## 需求環境

| 工具 | 建議版本 |
|------|---------|
| [Node.js](https://nodejs.org) | 18 以上 |
| npm | 8 以上（隨 Node.js 附帶） |

## 安裝

```bash
git clone https://github.com/narumiruna/tabemap.git
cd tabemap
npm install
```

## 執行方式

### 開發模式（即時重載）

```bash
npm run dev
```

伺服器啟動後開啟瀏覽器前往 <http://localhost:7751>。

### 正式模式

先編譯 TypeScript，再以 Node.js 執行：

```bash
npm run build   # 編譯至 dist/
npm start       # 啟動 dist/server.js
```

伺服器預設監聽 port `7751`。若要更改，可透過環境變數設定：

```bash
PORT=8080 npm start
```

## Docker 部署

可使用 Docker Compose 直接在主機啟動：

```bash
docker compose up -d --build
```

預設對外提供 `http://localhost:7751`。

查看即時日誌：

```bash
docker compose logs -f
```

停止服務：

```bash
docker compose down
```

## 網頁操作說明

開啟 <http://localhost:7751> 後：

1. **位置來源**
   - **自動偵測**（預設）：點擊「搜尋」時瀏覽器會請求您授予位置權限，取得 GPS 座標。
   - **手動輸入**：選取此選項後，輸入緯度與經度。也可以直接**點擊地圖**上的任意點來設定位置。

2. **搜尋半徑**：從下拉選單選擇 300 m／500 m／1 km／3 km／5 km。

3. **最低評分**：輸入希望篩選的最低食べログ評分（0–5，預設 3.5）。

4. 點擊 **「搜尋」** 按鈕，等待結果顯示。

5. 結果以**卡片清單**呈現（含縮圖、評分、類型、預算、地址），同時在地圖上顯示**編號標記**。點擊卡片可在地圖上定位該餐廳；點擊標記可查看摘要並連結至食べログ頁面。

## API 參考

後端提供一個 REST 端點供程式呼叫：

```
GET /api/restaurants
```

### Query 參數

| 參數 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `lat` | number | **必填** | 搜尋中心緯度 |
| `lng` | number | **必填** | 搜尋中心經度 |
| `radius` | number | `1000` | 搜尋半徑（公尺，300–5000） |
| `min_score` | number | `3.5` | 最低食べログ評分（0–5） |

### 範例

```bash
curl "http://localhost:7751/api/restaurants?lat=35.6812&lng=139.7671&radius=1000&min_score=3.5"
```

### 回應格式

```json
{
  "lat": 35.6812,
  "lng": 139.7671,
  "radius": 1000,
  "minScore": 3.5,
  "count": 5,
  "restaurants": [
    {
      "name": "レストラン名",
      "url": "https://tabelog.com/...",
      "score": 3.72,
      "genre": "イタリアン",
      "address": "東京都...",
      "image": "https://...",
      "budget": "¥3,000～¥3,999"
    }
  ]
}
```

## 專案結構

```
.
├── src/
│   ├── server.ts      # Express 伺服器、路由設定
│   └── scraper.ts     # 食べログ日文版爬蟲（cheerio）
├── public/
│   ├── index.html     # 前端頁面
│   ├── style.css      # 樣式
│   └── app.js         # 地圖互動邏輯（Leaflet）
├── package.json
└── tsconfig.json
```
