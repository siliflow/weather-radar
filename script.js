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

// 대한민국 범위 중심 제한 (너무 멀리 이동하는 것 방지)
const KOREA_BOUNDS = {
  minLat: 30.0,
  maxLat: 42.0,
  minLng: 118.0,
  maxLng: 135.0,
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
// 1. 지도 축소 및 범위 제한 (축소 범위를 더 크게 확장)
// ---------------------------------------------------------------
function setupMapLimits() {
  // 축소 한계를 레벨 11로 늘려 한반도 전체 및 주변부가 충분히 보이도록 함
  map.setMaxLevel(9);

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
// 3. 좌표계 변환 함수 (카카오 타일 영역 -> 표준 OSM/Mercator 타일 X, Y)
// ---------------------------------------------------------------
function getTileXyFromPixel(map, x, y, level) {
  const proj = map.getProjection();
  // 카카오 타일의 좌상단, 우하단 픽셀 좌표를 위경도로 변환
  const pointNW = new kakao.maps.Point(x * 256, y * 256);
  const latLngNW = proj.coordsFromPoint(pointNW);

  // Kakao Level -> Standard Web Mercator Zoom Level (Z)
  const z = Math.max(2, Math.min(15 - level, 8));

  const n = Math.pow(2, z);
  const lon = latLngNW.getLng();
  const lat = latLngNW.getLat();

  const tileX = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const tileY = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  return { tileX, tileY, z };
}

// ---------------------------------------------------------------
// 4. Tileset을 이용한 레이더 오버레이 연동
// ---------------------------------------------------------------
let radarFrame = null;
let isTilesetAdded = false;

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
  if (isTilesetAdded) {
    map.removeOverlayMapTypeId(kakao.maps.MapTypeId.USER_RADAR);
    isTilesetAdded = false;
  }
}

function registerRadarTileset() {
  removeRadarTileset();

  kakao.maps.Tileset.add(
    "USER_RADAR",
    new kakao.maps.Tileset({
      width: 256,
      height: 256,
      getTile: function (x, y, level) {
        // 카카오 타일의 좌표를 RainViewer 전용 X, Y, Z로 정밀 변환
        const { tileX, tileY, z } = getTileXyFromPixel(map, x, y, level);

        const img = document.createElement("img");
        img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tileX}/${tileY}/2/1_1.png`;
        img.style.opacity = "0.75";
        img.style.display = "block";

        img.onerror = () => {
          img.style.display = "none";
        };

        return img;
      },
    })
  );

  map.addOverlayMapTypeId(kakao.maps.MapTypeId.USER_RADAR);
  isTilesetAdded = true;
}
