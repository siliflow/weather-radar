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
let radarOverlay = null;
let allTileImages = [];
let isRendering = false;

// ★★★ 한국 전체를 커버하는 타일 범위 (고정) ★★★
const KOREA_TILE_RANGE = {
  // zoom level 6 기준 (적당한 해상도)
  z: 6,
  xStart: 30,
  xEnd: 35,
  yStart: 32,
  yEnd: 37,
};

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
    statusValue.textContent = "RainViewer 실시간";
    loadRadarLayer();
  } else {
    statusTitle.textContent = layer === "temp" ? "기온" : layer === "air" ? "대기질" : "바람";
    statusValue.textContent = "준비 중";
    statusNote.textContent = "해당 기능은 준비 중입니다.";
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
      `${pad(t.getHours())}:${pad(t.getMinutes())}`;

    // ★★★ 한국 전체 타일을 미리 모두 렌더링 ★★★
    renderAllKoreaTiles();
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패";
  }
}

function clearRadarOverlay() {
  if (radarOverlay) {
    radarOverlay.setMap(null);
    radarOverlay = null;
  }
  allTileImages = [];
}

// ★★★ 한국 전체 타일을 미리 렌더링 (화면 밖까지 모두) ★★★
function renderAllKoreaTiles() {
  if (isRendering || currentLayer !== "precip" || !radarFrame || !map) return;
  isRendering = true;

  try {
    clearRadarOverlay();

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '20';
    container.style.backgroundColor = 'transparent';

    const z = KOREA_TILE_RANGE.z;
    const proj = map.getProjection();
    let totalTiles = 0;
    let loadedCount = 0;

    // ★★★ 고정된 범위의 모든 타일을 생성 (화면 밖까지 포함) ★★★
    for (let tx = KOREA_TILE_RANGE.xStart; tx <= KOREA_TILE_RANGE.xEnd; tx++) {
      for (let ty = KOREA_TILE_RANGE.yStart; ty <= KOREA_TILE_RANGE.yEnd; ty++) {
        totalTiles++;
        
        // 타일의 좌상단/우하단 위경도 계산
        const nw = tileXYToLonLat(tx, ty, z);
        const se = tileXYToLonLat(tx + 1, ty + 1, z);

        // 화면 픽셀 좌표로 변환
        const p1 = proj.pointFromCoords(new kakao.maps.LatLng(nw.lat, nw.lon));
        const p2 = proj.pointFromCoords(new kakao.maps.LatLng(se.lat, se.lon));
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);
        
        if (width < 1 || height < 1) {
          loadedCount++;
          continue;
        }

        const img = document.createElement("img");
        img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tx}/${ty}/2/1_1.png`;
        img.style.position = 'absolute';
        img.style.left = `${Math.min(p1.x, p2.x)}px`;
        img.style.top = `${Math.min(p1.y, p2.y)}px`;
        img.style.width = `${width}px`;
        img.style.height = `${height}px`;
        img.style.display = 'block';
        img.style.opacity = '0.8';
        img.style.pointerEvents = 'none';
        img.style.backgroundColor = 'transparent';
        
        img.onerror = () => {
          img.style.display = 'none';
          loadedCount++;
          checkComplete();
        };
        
        img.onload = () => {
          loadedCount++;
          checkComplete();
        };
        
        function checkComplete() {
          if (loadedCount >= totalTiles) {
            const statusNote = document.getElementById("status-note");
            if (statusNote) {
              statusNote.textContent += ` ✅ (${totalTiles}개 타일 모두 로드)`;
            }
            isRendering = false;
          }
        }

        container.appendChild(img);
        allTileImages.push(img);
      }
    }

    // ★★★ 오버레이를 지도에 추가 ★★★
    radarOverlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(36.5, 127.8),
      content: container,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 20,
    });
    
    radarOverlay.setMap(map);

    // 상태 표시
    const statusNote = document.getElementById("status-note");
    if (statusNote && !statusNote.textContent.includes("타일")) {
      statusNote.textContent += ` (${totalTiles}개 타일 렌더링 중...)`;
    }

  } catch (err) {
    console.error("타일 렌더링 오류:", err);
    isRendering = false;
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

function setupRadarTileSync() {
  // 지도가 이동/확대되어도 다시 렌더링하지 않음 (이미 모든 타일이 있음)
  // 대신 오버레이 위치만 업데이트
  kakao.maps.event.addListener(map, "idle", () => {
    if (currentLayer === "precip" && radarOverlay) {
      // 오버레이를 다시 설정하여 위치 업데이트
      const container = radarOverlay.getContent();
      if (container) {
        // 컨테이너 내부 이미지들의 위치를 현재 화면에 맞게 재계산
        updateTilePositions();
      }
    }
  });

  window.addEventListener("resize", () => {
    map.relayout();
    if (currentLayer === "precip") {
      updateTilePositions();
    }
  });
}

// ★★★ 타일 위치를 현재 화면에 맞게 업데이트 ★★★
function updateTilePositions() {
  if (!radarOverlay || !map) return;
  
  const container = radarOverlay.getContent();
  if (!container) return;

  const proj = map.getProjection();
  const z = KOREA_TILE_RANGE.z;
  const images = container.querySelectorAll('img');
  let index = 0;

  for (let tx = KOREA_TILE_RANGE.xStart; tx <= KOREA_TILE_RANGE.xEnd; tx++) {
    for (let ty = KOREA_TILE_RANGE.yStart; ty <= KOREA_TILE_RANGE.yEnd; ty++) {
      if (index >= images.length) break;
      
      const img = images[index];
      if (!img) continue;

      const nw = tileXYToLonLat(tx, ty, z);
      const se = tileXYToLonLat(tx + 1, ty + 1, z);

      const p1 = proj.pointFromCoords(new kakao.maps.LatLng(nw.lat, nw.lon));
      const p2 = proj.pointFromCoords(new kakao.maps.LatLng(se.lat, se.lon));
      
      img.style.left = `${Math.min(p1.x, p2.x)}px`;
      img.style.top = `${Math.min(p1.y, p2.y)}px`;
      img.style.width = `${Math.abs(p2.x - p1.x)}px`;
      img.style.height = `${Math.abs(p2.y - p1.y)}px`;
      
      index++;
    }
  }
}

function refreshRadar() {
  radarFrame = null;
  clearRadarOverlay();
  loadRadarLayer();
}

console.log("🌧️ 한국 전체 레이더 실행 중! (콘솔에서 refreshRadar() 호출로 새로고침)");
console.log(`📌 렌더링 범위: zoom ${KOREA_TILE_RANGE.z}, x: ${KOREA_TILE_RANGE.xStart}~${KOREA_TILE_RANGE.xEnd}, y: ${KOREA_TILE_RANGE.yStart}~${KOREA_TILE_RANGE.yEnd}`);
