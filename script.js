
  document.getElementById("status-note").textContent = "카카오 API 키를 확인해주세요.";
} else {
  loadKakaoSDK();
}


  const script = document.createElement("script");
  script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${CONFIG.KAKAO_JS_KEY}&autoload=false`;
  script.onload = () => kakao.maps.load(initMap);
  document.head.appendChild(script);
}

let map;
let currentLayer = "precip";
let radarFrame = null;
let radarOverlay = null;

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
  removeRadar();

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

// 수정된 코드
async function loadRadarLayer() {
  const statusNote = document.getElementById("status-note");
  statusNote.textContent = "레이더 불러오는 중...";

  try {
    if (!radarFrame) {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const json = await res.json();
      
      const past = json.radar.past;
      if (!past || past.length === 0) throw new Error("레이더 데이터 없음");
      
      const latest = past[past.length - 1];
      
      // host 주소 끝의 '/' 중복 처리 방지
      const host = json.host.endsWith('/') ? json.host.slice(0, -1) : json.host;
      
      radarFrame = { host: host, path: latest.path, time: latest.time };
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

function renderRadarCanvas() {
  if (!map || currentLayer !== "precip" || !radarFrame) return;

  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const kakaoLevel = map.getLevel();
  const zoom = Math.max(3, Math.min(15 - kakaoLevel, 8));
  const n = Math.pow(2, zoom);

  // 화면 경계 타일 인덱스
  const minTileX = Math.floor(((sw.getLng() + 180) / 360) * n);
  const maxTileX = Math.floor(((ne.getLng() + 180) / 360) * n);

  const latRadNorth = (ne.getLat() * Math.PI) / 180;
  const minTileY = Math.floor(((1 - Math.log(Math.tan(latRadNorth) + 1 / Math.cos(latRadNorth)) / Math.PI) / 2) * n);

  const latRadSouth = (sw.getLat() * Math.PI) / 180;
  const maxTileY = Math.floor(((1 - Math.log(Math.tan(latRadSouth) + 1 / Math.cos(latRadSouth)) / Math.PI) / 2) * n);

  const cols = Math.max(1, maxTileX - minTileX + 1);
  const rows = Math.max(1, maxTileY - minTileY + 1);

  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.width = `${cols * 256}px`;
  container.style.height = `${rows * 256}px`;
  container.style.pointerEvents = "none";
  container.style.opacity = "0.65";

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const img = document.createElement("img");
      img.src = `${radarFrame.host}${radarFrame.path}/256/${zoom}/${tx}/${ty}/2/1_0.png`;
      img.style.position = "absolute";
      img.style.left = `${(tx - minTileX) * 256}px`;
      img.style.top = `${(ty - minTileY) * 256}px`;
      img.style.width = "256px";
      img.style.height = "256px";
      img.onerror = () => { img.style.display = "none"; };
      container.appendChild(img);
    }
  }

  // 타일 블록의 실제 북서쪽 위경도 계산
  const nwLng = (minTileX / n) * 360 - 180;
  const nwLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * minTileY) / n)));
  const nwLat = (nwLatRad * 180) / Math.PI;

  removeRadar();

  radarOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(nwLat, nwLng),
    content: container,
    xAnchor: 0,
    yAnchor: 0,
    zIndex: 2,
  });

  radarOverlay.setMap(map);
}

function setupRadarEvents() {
  kakao.maps.event.addListener(map, "idle", () => {
    if (currentLayer === "precip") renderRadarCanvas();
  });
}
kakao.maps.load(initMap);
