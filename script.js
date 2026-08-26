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
let radarFrame = null;
let radarOverlay = null;

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
    level: 10,
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

    renderRadarGrid();
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

function renderRadarGrid() {
  if (!map || currentLayer !== "precip" || !radarFrame) return;

  const center = map.getCenter();
  const kakaoLevel = map.getLevel();
  
  // 카카오 레벨 -> OpenStreetMap Zoom 변환
  const zoom = Math.max(3, Math.min(15 - kakaoLevel, 10));
  const n = Math.pow(2, zoom);

  // 중심점 기준 타일 좌표 계산
  const centerTileX = Math.floor(((center.getLng() + 180) / 360) * n);
  const latRad = (center.getLat() * Math.PI) / 180;
  const centerTileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  // 3x3 타일 그리드 생성용 컨테이너
  const container = document.createElement("div");
  container.style.display = "grid";
  container.style.gridTemplateColumns = "repeat(3, 256px)";
  container.style.gridTemplateRows = "repeat(3, 256px)";
  container.style.width = "768px";
  container.style.height = "768px";
  container.style.pointerEvents = "none";
  container.style.opacity = "0.7";

  // 중심 주변 3x3 범위 타일 생성
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = centerTileX + dx;
      const ty = centerTileY + dy;
      
      const img = document.createElement("img");
      img.src = `${radarFrame.host}${radarFrame.path}/256/${zoom}/${tx}/${ty}/2/1_1.png`;
      img.style.width = "256px";
      img.style.height = "256px";
      img.onerror = () => { img.style.visibility = "hidden"; };
      container.appendChild(img);
    }
  }

  clearRadarOverlay();

  // 중심 타일의 실제 위경도 중심 구하기
  const tileCenterLng = ((centerTileX + 0.5) / n) * 360 - 180;
  const tileCenterLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (centerTileY + 0.5)) / n)));
  const tileCenterLat = (tileCenterLatRad * 180) / Math.PI;

  radarOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(tileCenterLat, tileCenterLng),
    content: container,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 2,
  });

  radarOverlay.setMap(map);
}

function setupRadarEvents() {
  kakao.maps.event.addListener(map, "idle", () => {
    if (currentLayer === "precip") renderRadarGrid();
  });
}
