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
let radarFrame = null;
let radarOverlay = null; // 단일 오버레이로 통합
let tileImages = [];

function initMap() {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.5, 127.8),
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
// 새로운 방식: 단일 오버레이에 모든 타일을 그룹으로 추가
// ---------------------------------------------------------------
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

function clearRadarOverlay() {
  if (radarOverlay) {
    radarOverlay.setMap(null);
    radarOverlay = null;
  }
  tileImages = [];
}

// ===== [핵심 개선] CustomOverlay를 단일 그룹으로 사용 =====
function renderRadarTiles() {
  if (currentLayer !== "precip" || !radarFrame || !map) return;
  
  clearRadarOverlay();

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

  // 화면보다 2배 더 넓은 범위의 타일을 미리 로드 (드래그 시 빈 공간 방지)
  const padding = 2;
  const xStart = Math.floor(topLeft.x) - padding;
  const xEnd = Math.floor(bottomRight.x) + padding;
  const yStart = Math.floor(topLeft.y) - padding;
  const yEnd = Math.floor(bottomRight.y) + padding;

  const MAX_TILES = 400;
  if ((xEnd - xStart + 1) * (yEnd - yStart + 1) > MAX_TILES) return;

  const proj = map.getProjection();
  
  // 모든 타일을 담을 컨테이너 div 생성
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '10';

  let loadedCount = 0;
  const totalTiles = (xEnd - xStart + 1) * (yEnd - yStart + 1);

  for (let tx = xStart; tx <= xEnd; tx++) {
    for (let ty = yStart; ty <= yEnd; ty++) {
      const nw = tileXYToLonLat(tx, ty, z);
      const se = tileXYToLonLat(tx + 1, ty + 1, z);

      const p1 = proj.pointFromCoords(new kakao.maps.LatLng(nw.lat, nw.lon));
      const p2 = proj.pointFromCoords(new kakao.maps.LatLng(se.lat, se.lon));
      const width = Math.abs(p2.x - p1.x);
      const height = Math.abs(p2.y - p1.y);
      
      if (width < 1 || height < 1) continue;

      // 각 타일을 img 태그로 생성
      const img = document.createElement("img");
      img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tx}/${ty}/2/1_1.png`;
      img.style.position = 'absolute';
      img.style.left = `${Math.min(p1.x, p2.x)}px`;
      img.style.top = `${Math.min(p1.y, p2.y)}px`;
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
      img.style.display = "block";
      img.style.opacity = "0.8";
      img.style.pointerEvents = "none";
      img.style.backgroundColor = "transparent";
      
      // 이미지 로드 실패 시 투명하게
      img.onerror = () => {
        img.style.display = "none";
        checkComplete();
      };
      
      img.onload = checkComplete;
      
      function checkComplete() {
        loadedCount++;
        if (loadedCount >= totalTiles) {
          const statusNote = document.getElementById("status-note");
          if (statusNote && !statusNote.textContent.includes("✅")) {
            statusNote.textContent += ` ✅ (${totalTiles}개 타일)`;
          }
        }
      }

      container.appendChild(img);
      tileImages.push(img);
    }
  }

  // CustomOverlay로 컨테이너 전체를 지도에 고정
  radarOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(36.5, 127.8), // 한국 중심
    content: container,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 10,
  });
  
  radarOverlay.setMap(map);

  // 상태 표시
  const statusNote = document.getElementById("status-note");
  if (statusNote && !statusNote.textContent.includes("타일")) {
    statusNote.textContent += ` (타일 ${tileImages.length}개 로드)`;
  }
}

// ===== [개선] 지도 이벤트 =====
function setupRadarTileSync() {
  let renderTimeout = null;

  const scheduleRender = () => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = setTimeout(() => {
      if (currentLayer === "precip") {
        renderRadarTiles();
      }
      renderTimeout = null;
    }, 50); // 50ms로 더 빠르게 반응
  };

  // 지도 이동/확대 시 즉시 다시 그리기
  kakao.maps.event.addListener(map, "idle", scheduleRender);
  
  // 줌 변경 시에도 다시 그리기
  kakao.maps.event.addListener(map, "zoom_changed", () => {
    clearRadarOverlay();
    scheduleRender();
  });

  // 창 크기 변경
  window.addEventListener("resize", () => {
    map.relayout();
    scheduleRender();
  });
}

// ===== 수동 새로고침 =====
function refreshRadar() {
  radarFrame = null;
  clearRadarOverlay();
  loadRadarLayer();
}

console.log("🔄 레이더 새로고침: refreshRadar() 호출");
