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

// 한반도 중심 이동 제한 범위
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
    level: 10, // 초기 확대 레벨
  });

  setupMapLimits();
  setupLayerButtons();
  setupRadarTileSync();
  switchLayer("precip");
}

// ---------------------------------------------------------------
// 1. 지도 축소 및 범위 제한 (바다만 나오거나 지도 비어보이는 현상 방지)
// ---------------------------------------------------------------
function setupMapLimits() {
  // 카카오맵 특성상 레벨이 8~9를 넘어가면 주변 외곽 지도가 잘려 보입니다.
  // 최대 축소 제한을 8로 설정하여 한반도 및 주변부만 차있게 유지합니다.
  map.setMaxLevel(8);

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

  kakao.maps.event.addListener(map, "drag", checkBounds);
  kakao.maps.event.addListener(map, "zoom_changed", checkBounds);
}

// ---------------------------------------------------------------
// 레이어 전환
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
// 2. 강수량(레이더) Canvas 통채 합성 렌더링 (여백/어긋남 완전 해결)
// ---------------------------------------------------------------
let radarFrame = null;
let radarOverlay = null; // 오버레이 1개만 관리

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

    renderRadarCanvas();
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패.";
  }
}

// 좌표 변환 공식 (EPSG:3857 슬리피맵 타일)
function lonLatToTileXY(lon, lat, z) {
  const n = Math.pow(2, z);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function tileXYToLonLat(x, y, z) {
  const n = Math.pow(2, z);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}

function clearRadarOverlay() {
  if (radarOverlay) {
    radarOverlay.setMap(null);
    radarOverlay = null;
  }
}

// 단일 Canvas에 모든 타일을 붙여서 통으로 올리는 핵심 렌더링 로직
async function renderRadarCanvas() {
  if (!map || currentLayer !== "precip" || !radarFrame) return;

  const mapEl = document.getElementById("map");
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lngSpan = ne.getLng() - sw.getLng();
  if (lngSpan <= 0) return;

  // 줌 레벨에 맞는 타일 Zoom 결정
  let z = Math.round(Math.log2((mapEl.clientWidth * 360) / (256 * lngSpan)));
  z = Math.max(2, Math.min(z, 8));

  const topLeft = lonLatToTileXY(sw.getLng(), ne.getLat(), z);
  const bottomRight = lonLatToTileXY(ne.getLng(), sw.getLat(), z);

  const xStart = Math.floor(topLeft.x);
  const xEnd = Math.floor(bottomRight.x);
  const yStart = Math.floor(topLeft.y);
  const yEnd = Math.floor(bottomRight.y);

  // 타일 범위 바운더리의 전체 위경도 구하기
  const nwBound = tileXYToLonLat(xStart, yStart, z);
  const seBound = tileXYToLonLat(xEnd + 1, yEnd + 1, z);

  const proj = map.getProjection();
  const pStart = proj.pointFromCoords(new kakao.maps.LatLng(nwBound.lat, nwBound.lon));
  const pEnd = proj.pointFromCoords(new kakao.maps.LatLng(seBound.lat, seBound.lon));

  const totalWidth = Math.abs(pEnd.x - pStart.x);
  const totalHeight = Math.abs(pEnd.y - pStart.y);

  if (totalWidth < 1 || totalHeight < 1) return;

  // 통짜 오버레이용 Canvas 생성
  const canvas = document.createElement("canvas");
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  canvas.style.width = `${totalWidth}px`;
  canvas.style.height = `${totalHeight}px`;
  canvas.style.pointerEvents = "none";

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.75; // 투명도 설정

  const tileWidth = totalWidth / (xEnd - xStart + 1);
  const tileHeight = totalHeight / (yEnd - yStart + 1);

  const loadPromises = [];

  for (let tx = xStart; tx <= xEnd; tx++) {
    for (let ty = yStart; ty <= yEnd; ty++) {
      const drawX = (tx - xStart) * tileWidth;
      const drawY = (ty - yStart) * tileHeight;

      const p = new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tx}/${ty}/2/1_1.png`;

        img.onload = () => {
          // 캔버스에 타일 그리기 (경계선 오차 제거를 위해 0.5px 더 넓게 그림)
          ctx.drawImage(img, drawX, drawY, tileWidth + 0.5, tileHeight + 0.5);
          resolve();
        };
        img.onerror = () => resolve(); // 에러 타일 무시
      });

      loadPromises.push(p);
    }
  }

  await Promise.all(loadPromises);

  // 로딩 완료 후 이전 오버레이 지우고 새 캔버스 1개로 등록
  clearRadarOverlay();

  radarOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(nwBound.lat, nwBound.lon),
    content: canvas,
    xAnchor: 0,
    yAnchor: 0,
    zIndex: 10,
  });

  radarOverlay.setMap(map);
}

function setupRadarTileSync() {
  const rerender = () => {
    if (currentLayer === "precip") renderRadarCanvas();
  };

  kakao.maps.event.addListener(map, "zoom_start", clearRadarOverlay);
  kakao.maps.event.addListener(map, "idle", rerender);

  window.addEventListener("resize", () => {
    map.relayout();
    rerender();
  });
}
