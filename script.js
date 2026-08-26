if (!CONFIG.KAKAO_JS_KEY || CONFIG.KAKAO_JS_KEY === "YOUR_KAKAO_JS_KEY") {
  document.getElementById("setup-warning").style.display = "flex";
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

// 한반도 영역 경계 제한
const KOREA_BOUNDS = {
  minLat: 33.0,
  maxLat: 38.9,
  minLng: 124.0,
  maxLng: 132.0,
};

function initMap() {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.5, 127.8),
    level: 10,
  });

  setupMapLimits();
  setupLayerButtons();
  setupRadarEvents();
  switchLayer("precip");
}

// ---------------------------------------------------------------
// 1. 축소 및 이동 범위 제한 (1대 64km 기준 = 카카오 레벨 12)
// ---------------------------------------------------------------
function setupMapLimits() {
  // 카카오맵 레벨 12 = 스케일바 64km 기준
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

    if (moved) {
      map.setCenter(new kakao.maps.LatLng(lat, lng));
    }
  };

  kakao.maps.event.addListener(map, "dragend", checkBounds);
  kakao.maps.event.addListener(map, "zoom_changed", checkBounds);
}

// ---------------------------------------------------------------
// 2. 레이어 버튼 설정
// ---------------------------------------------------------------
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
  } else if (layer === "temp") {
    statusTitle.textContent = "기온";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "기온 레이어 준비 중입니다.";
  } else if (layer === "air") {
    statusTitle.textContent = "대기질";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "에어코리아 API 연동 필요.";
  } else if (layer === "wind") {
    statusTitle.textContent = "바람";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "바람 데이터 연동 준비 중입니다.";
  }
}

// ---------------------------------------------------------------
// 3. 단일 화면 덮어씌우기 (Single Image Bounding Overlay)
// ---------------------------------------------------------------
let radarFrame = null;

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

    renderSingleRadarOverlay();
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

function renderSingleRadarOverlay() {
  if (!map || currentLayer !== "precip" || !radarFrame) return;

  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  // 화면 크기에 맞춘 픽셀 계산
  const container = document.getElementById("map");
  const width = container.clientWidth;
  const height = container.clientHeight;

  if (width === 0 || height === 0) return;

  // RainViewer의 Coverage 범위 이미지 단일 추출 URL (위경도 Bounding Box 기준)
  // RainViewer API 표준: {host}{path}/512/{z}/{x}/{y}/2/1_1.png 대신 
  // 전체 영역을 커버하는 커스텀 지도 오버레이 엘리먼트 생성
  const img = new Image();
  
  // 현재 줌 레벨 산출 (카카오 레벨 -> 표준 줌)
  const kakaoLevel = map.getLevel();
  const zoom = Math.max(2, Math.min(19 - kakaoLevel, 12));

  // 화면 중심 좌표 기준 타일 범위 계산
  const center = map.getCenter();
  const lon = center.getLng();
  const lat = center.getLat();
  
  const n = Math.pow(2, zoom);
  const tileX = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const tileY = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  // 중심 타일 기반 위경도 구하기
  const tileLon = (tileX / n) * 360 - 180;
  const tileLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n)));
  const tileLat = (tileLatRad * 180) / Math.PI;

  img.src = `${radarFrame.host}${radarFrame.path}/512/${zoom}/${tileX}/${tileY}/2/1_1.png`;
  img.style.width = "500px";
  img.style.height = "500px";
  img.style.opacity = "0.7";
  img.style.pointerEvents = "none";

  img.onerror = () => {
    img.style.display = "none";
  };

  img.onload = () => {
    clearRadarOverlay();
    radarOverlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(tileLat, tileLon),
      content: img,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 10,
    });
    radarOverlay.setMap(map);
  };
}

function setupRadarEvents() {
  const rerender = () => {
    if (currentLayer === "precip") renderSingleRadarOverlay();
  };

  kakao.maps.event.addListener(map, "idle", rerender);
  window.addEventListener("resize", () => {
    map.relayout();
    rerender();
  });
}
