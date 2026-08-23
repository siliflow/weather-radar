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
  
  // 1. 지도 기본 생성 (기상 타일 고정을 위해 드래그/줌 비활성화 옵션 적용)
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.5, 127.8), // 대한민국 중심
    level: 10,
    draggable: false,       // 마우스 드래그 이동 금지 (위치 고정)
    scrollwheel: false,     // 마우스 휠 줌 금지
    disableDoubleClickZoom: true // 더블 클릭 줌 금지
  });

  // 이벤트 컨트롤 완전히 차단 (상위 조작 방지)
  map.setZoomable(false);
  map.setDraggable(false);

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
  } else if (layer === "air") {
    statusTitle.textContent = "대기질";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "에어코리아(airkorea.or.kr) API 키 발급 후 연동 필요. (TODO)";
  } else if (layer === "wind") {
    statusTitle.textContent = "바람";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "바람은 방향/풍속 데이터 + 화살표(또는 입자) 렌더링이 필요합니다. (TODO)";
  }
}

// ---------------------------------------------------------------
// 강수량(레이더) 레이어 — RainViewer 타일 오버레이
// ---------------------------------------------------------------
let radarFrame = null;
let radarTileEls = [];

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

  // 화면 여백 없이 타일이 전체를 채우도록 경계 영역 계산 범위를 확장 (+1/-1 타일 넉넉하게 계산)
  const topLeft = lonLatToTileXY(sw.getLng(), ne.getLat(), z);
  const bottomRight = lonLatToTileXY(ne.getLng(), sw.getLat(), z);

  const xStart = Math.floor(topLeft.x) - 1;
  const xEnd = Math.floor(bottomRight.x) + 1;
  const yStart = Math.floor(topLeft.y) - 1;
  const yEnd = Math.floor(bottomRight.y) + 1;

  const proj = map.getProjection();

  for (let tx = xStart; tx <= xEnd; tx++) {
    for (let ty = yStart; ty <= yEnd; ty++) {
      const nw = tileXYToLonLat(tx, ty, z);
      const se = tileXYToLonLat(tx + 1, ty + 1, z);

      const p1 = proj.pointFromCoords(new kakao.maps.LatLng(nw.lat, nw.lon));
      const p2 = proj.pointFromCoords(new kakao.maps.LatLng(se.lat, se.lon));
      const width = Math.abs(p2.x - p1.x);
      const height = Math.abs(p2.y - p1.y);
      if (width < 1 || height < 1) continue;

      const img = document.createElement("img");
      img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tx}/${ty}/2/1_1.png`;
      img.style.width = `${width + 1}px`;  // 타일 경계 틈새 핏 방지 (+1px 오버랩)
      img.style.height = `${height + 1}px`;
      img.style.display = "block";
      img.style.opacity = "0.85";
      img.style.pointerEvents = "none";
      
      // 2. 구름 간 빈 공간 채우기: CSS Blur & Soft Edge 처리
      img.style.filter = "blur(1.5px) contrast(120%)";
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

  // 리사이즈 시 화면 전체 재정렬 및 다시 그리기
  window.addEventListener("resize", () => {
    map.relayout();
    rerender();
  });
}
