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

function initMap() {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.5, 127.8), // 대한민국 중심 부근
    level: 10,
  });

  setupLayerButtons();
  setupRadarTileSync();
  switchLayer("precip");
}

// ---------------------------------------------------------------
// 레이어 전환 버튼
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
  clearRadarTiles();

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
    statusNote.textContent = "기온 레이어는 관측지점 데이터 연동이 필요합니다. (TODO)";
    // TODO: 초단기실황(기온) API 연동 → 지점별 마커 또는 보간 히트맵
  } else if (layer === "air") {
    statusTitle.textContent = "대기질";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "에어코리아(airkorea.or.kr) API 키 발급 후 연동 필요. (TODO)";
    // TODO: 에어코리아 대기오염정보 API 연동
  } else if (layer === "wind") {
    statusTitle.textContent = "바람";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "바람은 방향/풍속 데이터 + 화살표(또는 입자) 렌더링이 필요합니다. (TODO)";
    // TODO: 바람 벡터 데이터 연동 및 시각화
  }
}

// ---------------------------------------------------------------
// 강수량(레이더) 레이어 — RainViewer 타일 오버레이
// (배경/범례 없는 투명 PNG 타일이라 애플 날씨 앱과 비슷한 느낌을 줌)
// ---------------------------------------------------------------
let radarFrame = null;      // { host, path } — RainViewer 최신 프레임 정보
let radarTileEls = [];      // 현재 지도 위에 붙어있는 타일 <img> 요소들

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

    renderRadarTiles();
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패 (콘솔 확인).";
  }
}

// 위경도 <-> 슬리피맵(XYZ) 타일 좌표 변환 함수들
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

function clearRadarTiles() {
  radarTileEls.forEach((overlay) => overlay.setMap(null));
  radarTileEls = [];
}

// 현재 지도 화면 범위에 필요한 타일들을 계산해서 새로 그림.
// 각 타일은 kakao.maps.CustomOverlay로 붙여서, 드래그/이동 시 카카오맵이
// 알아서 위치를 따라 옮겨주도록 함 (우리가 직접 픽셀 좌표를 계산할 필요 없음).
function renderRadarTiles() {
  if (!map || currentLayer !== "precip" || !radarFrame) return;
  clearRadarTiles();

  const mapEl = document.getElementById("map");
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lngSpan = ne.getLng() - sw.getLng();
  if (lngSpan <= 0) return;

  let z = Math.round(Math.log2((mapEl.clientWidth * 360) / (256 * lngSpan)));
  z = Math.max(2, Math.min(z, 7));

  const topLeft = lonLatToTileXY(sw.getLng(), ne.getLat(), z);
  const bottomRight = lonLatToTileXY(ne.getLng(), sw.getLat(), z);

  const xStart = Math.floor(topLeft.x);
  const xEnd = Math.floor(bottomRight.x);
  const yStart = Math.floor(topLeft.y);
  const yEnd = Math.floor(bottomRight.y);

  const MAX_TILES_PER_AXIS = 14;
  if (xEnd - xStart + 1 > MAX_TILES_PER_AXIS || yEnd - yStart + 1 > MAX_TILES_PER_AXIS) return;

  const proj = map.getProjection();

  for (let tx = xStart; tx <= xEnd; tx++) {
    for (let ty = yStart; ty <= yEnd; ty++) {
      const nw = tileXYToLonLat(tx, ty, z);
      const se = tileXYToLonLat(tx + 1, ty + 1, z);

      // 현재 화면 배율에서 이 타일이 몇 픽셀 크기인지 계산 (오버레이 이미지 크기용)
      const p1 = proj.pointFromCoords(new kakao.maps.LatLng(nw.lat, nw.lon));
      const p2 = proj.pointFromCoords(new kakao.maps.LatLng(se.lat, se.lon));
      const width = Math.abs(p2.x - p1.x);
      const height = Math.abs(p2.y - p1.y);
      if (width < 1 || height < 1) continue;

      const img = document.createElement("img");
      img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tx}/${ty}/2/1_1.png`;
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
      img.style.display = "block";
      img.style.opacity = "0.75";
      img.style.pointerEvents = "none";
      img.onerror = () => { img.style.display = "none"; };

      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(nw.lat, nw.lon),
        content: img,
        xAnchor: 0,
        yAnchor: 0,
        zIndex: 10,
      });
      overlay.setMap(map);
      radarTileEls.push(overlay);
    }
  }
}

function setupRadarTileSync() {
  const rerender = () => {
    if (currentLayer === "precip") renderRadarTiles();
  };

  // CustomOverlay는 드래그(이동) 중엔 카카오맵이 알아서 위치를 따라 옮겨주므로
  // 별도 처리가 필요 없음. 확대/축소로 필요한 타일 구성이 달라질 때만 다시 그림.
  kakao.maps.event.addListener(map, "zoom_start", clearRadarTiles);
  kakao.maps.event.addListener(map, "idle", rerender);

  window.addEventListener("resize", () => {
    map.relayout();
    rerender();
  });
}
