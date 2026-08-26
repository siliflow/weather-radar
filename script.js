if (!CONFIG.KAKAO_JS_KEY || CONFIG.KAKAO_JS_KEY === "YOUR_KAKAO_JS_KEY") {
  document.getElementById("status-note").textContent = "카카오 API 키를 확인해주세요.";
} else {
  loadKakaoSDK();
}

function loadKakaoSDK() {
  const script = document.createElement("script");
  script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_JS_KEY}&autoload=false`;
  script.onload = () => kakao.maps.load(initMap);
  document.head.appendChild(script);
}

let map;
let currentLayer = "precip";
let radarOverlay = null;
let radarFrame = null;

// 대한민국 영역 제한
const KOREA_BOUNDS = {
  minLat: 33.0,
  maxLat: 38.9,
  minLng: 124.0,
  maxLng: 132.0,
};

function initMap() {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.2, 127.8),
    level: 10, // 초기 레벨
  });

  setupMapLimits();
  setupLayerButtons();
  setupRadarEvents();
  switchLayer("precip");
}

// 1대 64km 제한 (카카오맵 Level 12)
function setupMapLimits() {
  map.setMaxLevel(12);

  const checkBounds = () => {
    const center = map.getCenter();
    let lat = center.getLat();
    let lng = center.getLng();
    let moved = false;

    if (lat < KOREA_BOUNDS.minLat) { lat = KOREA_BOUNDS.minLat; moved = true; }
    if (lat > KOREA_BOUNDS.maxLat) { lat = KOREA_BOUNDS.maxLat; moved = true; }
    if (lng < KOREA_BOUNDS.minLng) { lng = KOREA_BOUNDS.minLng; moved = true; }
    if (lng > KOREA_BOUNDS.maxLng) { lng = KOREA_BOUNDS.maxLng; moved = true; }

    if (moved) map.setCenter(new kakao.maps.LatLng(lat, lng));
  };

  kakao.maps.event.addListener(map, "dragend", checkBounds);
  kakao.maps.event.addListener(map, "zoom_changed", checkBounds);
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
  clearRadarOverlay();

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

    updateRadarOverlay();
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패.";
  }
}

function clearRadarOverlay() {
  if (radarOverlay) {
    radarOverlay.setMap(null);
    radarOverlay = null;
  }
}

// 지도 영역 기반 단일 레이더 이미지 매핑
function updateRadarOverlay() {
  if (!map || currentLayer !== "precip" || !radarFrame) return;

  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  // 타일 반복 현상을 방지하기 위한 단일 Coverage API 렌더링
  const zoom = Math.max(2, Math.min(15 - map.getLevel(), 8));
  const center = map.getCenter();
  const n = Math.pow(2, zoom);
  
  const tileX = Math.floor(((center.getLng() + 180) / 360) * n);
  const latRad = (center.getLat() * Math.PI) / 180;
  const tileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  const imgUrl = `${radarFrame.host}${radarFrame.path}/512/${zoom}/${tileX}/${tileY}/2/1_1.png`;

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.pointerEvents = "none";
  
  const img = document.createElement("img");
  img.src = imgUrl;
  img.style.width = "512px";
  img.style.height = "512px";
  img.style.opacity = "0.65";
  container.appendChild(img);

  clearRadarOverlay();

  radarOverlay = new kakao.maps.CustomOverlay({
    position: center,
    content: container,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 2,
  });

  radarOverlay.setMap(map);
}

function setupRadarEvents() {
  kakao.maps.event.addListener(map, "idle", () => {
    if (currentLayer === "precip") updateRadarOverlay();
  });
}
