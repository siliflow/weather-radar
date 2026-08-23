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
let radarOverlayEl = null; // 강수량(레이더) 이미지 오버레이 DOM

function initMap() {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.5, 127.8), // 대한민국 중심 부근
    level: 10,
  });

  setupLayerButtons();
  setupGroundOverlaySync();
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
    statusValue.textContent = "기상청 레이더 합성영상";
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
// 강수량(레이더) 레이어 — 기상청 API허브 레이더 합성영상
// ---------------------------------------------------------------
function getLatestRadarTimeString() {
  // 레이더는 5분 주기 생산. 여유를 두고 10분 전 시각을 사용.
  const now = new Date(Date.now() - 10 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(Math.floor(now.getMinutes() / 5) * 5);
  return { str: `${y}${m}${d}${hh}${mm}`, display: `${y}-${m}-${d} ${hh}:${mm}` };
}

function loadRadarLayer() {
  const { str, display } = getLatestRadarTimeString();
  document.getElementById("status-note").textContent = `관측시각 ${display} (KST, 근사치)`;

  // 기상청 API허브 레이더 합성 이미지 URL
  // cmp=HSR: 강수량, qcd=MSK: 품질보정, disp=A: 자동
  const radarUrl =
    `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-rdr_cmp1_api` +
    `?tm=${str}&cmp=HSR&qcd=MSK&obs=ECHO&map=HB&disp=A&authKey=${CONFIG.KMA_AUTH_KEY}`;

  // 레이더 합성영상의 대략적인 위경도 범위 (한반도 전역, 근사값)
  // 정확한 투영법(LCC)이 아닌 사각형 근사이므로 가장자리는 오차가 있습니다.
  const bounds = {
    swLat: 32.0, swLng: 121.0,
    neLat: 43.2, neLng: 133.0,
  };

  createGroundOverlay(radarUrl, bounds);
}

// ---------------------------------------------------------------
// 카카오맵에는 Google Maps 식 GroundOverlay가 없어서
// 직접 이미지를 지도 위에 절대좌표로 배치/동기화합니다.
// ---------------------------------------------------------------
function createGroundOverlay(imageUrl, bounds) {
  clearRadarOverlay();

  const img = document.createElement("img");
  img.src = imageUrl;
  img.style.position = "absolute";
  img.style.pointerEvents = "none";
  img.style.opacity = "0.75";
  img.style.zIndex = "10";
  img.onerror = () => {
    document.getElementById("status-note").textContent =
      "레이더 이미지를 불러오지 못했습니다. authKey를 확인해주세요.";
  };

  document.getElementById("map").appendChild(img);
  radarOverlayEl = { el: img, bounds };
  positionGroundOverlay();
}

function clearRadarOverlay() {
  if (radarOverlayEl) {
    radarOverlayEl.el.remove();
    radarOverlayEl = null;
  }
}

function positionGroundOverlay() {
  if (!radarOverlayEl || !map) return;
  const proj = map.getProjection();
  const { swLat, swLng, neLat, neLng } = radarOverlayEl.bounds;

  const swPoint = proj.pointFromCoords(new kakao.maps.LatLng(swLat, swLng));
  const nePoint = proj.pointFromCoords(new kakao.maps.LatLng(neLat, neLng));

  const left = Math.min(swPoint.x, nePoint.x);
  const top = Math.min(swPoint.y, nePoint.y);
  const width = Math.abs(nePoint.x - swPoint.x);
  const height = Math.abs(swPoint.y - nePoint.y);

  Object.assign(radarOverlayEl.el.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
}

function setupGroundOverlaySync() {
  kakao.maps.event.addListener(map, "zoom_changed", positionGroundOverlay);
  kakao.maps.event.addListener(map, "center_changed", positionGroundOverlay);
  kakao.maps.event.addListener(map, "dragend", positionGroundOverlay);
  window.addEventListener("resize", () => {
    map.relayout();
    positionGroundOverlay();
  });
}
