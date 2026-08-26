let map;
let radarLayer = null;
let radarFrame = null;
let currentLayer = "precip";

// 대한민국 범위 제한 (남서, 북동 위경도)
const KOREA_BOUNDS = L.latLngBounds(
  L.latLng(32.0, 123.0), // 남서쪽
  L.latLng(39.5, 132.5)  // 북동쪽
);

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupLayerButtons();
  switchLayer("precip");
});

function initMap() {
  // Leaflet 지도 생성
  map = L.map("map", {
    center: [36.2, 127.8],
    zoom: 7,
    minZoom: 6,             // 1대 64km 수준으로 축소 제한
    maxZoom: 12,            // 최대 확대 제한
    maxBounds: KOREA_BOUNDS, // 한국 영역 벗어남 방지
    maxBoundsViscosity: 1.0, // 바운더리 바깥으로 아예 못 튕겨나가게 고정
    zoomControl: false
  });

  // 배경 지도 (Vworld 또는 OpenStreetMap - 바다 휑함 방지용 표준 지도)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}

function setupLayerButtons() {
  document.querySelectorAll(".layer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".layer-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchLayer(btn.dataset.layer);
    });
  });
}

function switchLayer(layer) {
  currentLayer = layer;
  if (radarLayer) {
    map.removeLayer(radarLayer);
    radarLayer = null;
  }

  const statusTitle = document.getElementById("status-title");
  const statusValue = document.getElementById("status-value");
  const statusNote = document.getElementById("status-note");

  if (layer === "precip") {
    statusTitle.textContent = "강수량 (레이더)";
    statusValue.textContent = "RainViewer 실시간 강수 레이더";
    loadRadarLayer();
  } else {
    statusTitle.textContent = "준비 중";
    statusValue.textContent = "준비 중인 레이어입니다.";
    statusNote.textContent = "";
  }
}

async function loadRadarLayer() {
  const statusNote = document.getElementById("status-note");
  statusNote.textContent = "레이더 불러오는 중...";

  try {
    if (!radarFrame) {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const json = await res.json();
      const past = json.radar.past;
      const latest = past[past.length - 1];
      radarFrame = { host: json.host, path: latest.path, time: latest.time };
    }

    const t = new Date(radarFrame.time * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    statusNote.textContent =
      `관측시각 ${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ` +
      `${pad(t.getHours())}:${pad(t.getMinutes())} (RainViewer 기준)`;

    // 표준 EPSG:3857 타일셋 1:1 매핑 (찢어짐/어긋남/환각 현상 0%)
    const tileUrl = `${radarFrame.host}${radarFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    
    radarLayer = L.tileLayer(tileUrl, {
      opacity: 0.7,
      tileSize: 256,
      zIndex: 100
    }).addTo(map);

  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패.";
  }
}
