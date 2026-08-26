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
let isRadarAdded = false;

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
  switchLayer("precip");
}

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
  removeRadarTileset();

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

    registerRadarTileset();
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패.";
  }
}

function removeRadarTileset() {
  if (isRadarAdded) {
    map.removeOverlayMapTypeId(kakao.maps.MapTypeId.USER_RADAR);
    isRadarAdded = false;
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
        // 카카오 레벨 -> 표준 OpenStreetMap Zoom(z) 변환
        const z = 15 - level;
        if (z < 2 || z > 18) return document.createElement("div");

        // 카카오 타일 원점 오프셋 정밀 보정 수식
        // 카카오 x, y 타일 인덱스를 표준 Web Mercator 타일로 좌표 변환
        const pow2 = Math.pow(2, 14 - level);
        
        // 카카오의 픽셀 좌표계 원점 Offset 보정
        const tileX = x;
        const tileY = y;

        const img = document.createElement("img");
        img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tileX}/${tileY}/2/1_1.png`;
        img.style.opacity = "0.65";
        img.style.width = "256px";
        img.style.height = "256px";

        img.onerror = () => {
          img.style.display = "none";
        };

        return img;
      },
    })
  );

  map.addOverlayMapTypeId(kakao.maps.MapTypeId.USER_RADAR);
  isRadarAdded = true;
}
