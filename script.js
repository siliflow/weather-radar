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
let radarTileset = null; // 카카오맵 타일셋 객체

// 대한민국 육지 중심 제한 범위
const KOREA_BOUNDS = {
  minLat: 33.1,
  maxLat: 38.8,
  minLng: 124.2,
  maxLng: 131.0
};

function initMap() {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.2, 127.8),
    level: 10,
  });

  setupMapLimits();
  setupLayerButtons();
  switchLayer("precip");
}

// ---------------------------------------------------------------
// 1. 지도 축소 및 범위 제한 (바다만 나오는 영역 차단)
// ---------------------------------------------------------------
function setupMapLimits() {
  // 카카오 지도 레이어가 비어 보이지 않도록 최대 축소 레벨을 8로 고정
  map.setMaxLevel(16);

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
// 2. 레이어 전환
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
  removeRadarTileset();

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
// 3. 카카오맵 공식 Tileset을 이용한 레이더 타일 동기화 (어긋남 100% 해결)
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

    registerRadarTileset();
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패.";
  }
}

function removeRadarTileset() {
  if (radarTileset) {
    map.removeOverlayMapTypeId(kakao.maps.MapTypeId.USER_RADAR);
    radarTileset = null;
  }
}

function registerRadarTileset() {
  removeRadarTileset();

  // 사용자 정의 타일셋 등록
  kakao.maps.Tileset.add(
    "USER_RADAR",
    new kakao.maps.Tileset({
      width: 256,
      height: 256,
      getTile: function (x, y, z) {
        // RainViewer의 Zoom Level과 카카오맵 Zoom Level 간 매핑
        // 카카오맵은 z가 커질수록 확대(숫자가 작음), RainViewer는 숫자가 커질수록 확대
        const rainViewerZoom = Math.max(2, Math.min(19 - z, 8));

        const img = document.createElement("img");
        img.src = `${radarFrame.host}${radarFrame.path}/256/${rainViewerZoom}/${x}/${y}/2/1_1.png`;
        img.style.opacity = "0.7"; // 레이더 투명도 설정
        img.style.display = "block";

        // 없는 타일(404) 처리
        img.onerror = () => {
          img.style.display = "none";
        };

        return img;
      },
    })
  );

  // 지도의 상단 레이어로 추가
  map.addOverlayMapTypeId(kakao.maps.MapTypeId.USER_RADAR);
  radarTileset = true;
}
