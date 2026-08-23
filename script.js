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
function getTodayString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

async function loadRadarLayer() {
  const statusNote = document.getElementById("status-note");
  statusNote.textContent = "레이더 목록 불러오는 중...";

  const today = getTodayString();
  const apiUrl =
    `https://apis.data.go.kr/1360000/RadarImgInfoService/getCmpImg` +
    `?serviceKey=${CONFIG.DATA_GO_KR_KEY}` +
    `&pageNo=1&numOfRows=50&dataType=XML&data=CMP_WRC&time=${today}`;

  try {
    const res = await fetch(apiUrl);
    const text = await res.text();

    // ---- 디버그: 실제 응답 구조를 콘솔에서 확인하기 위한 임시 로그 ----
    console.log("[레이더 API 원본 응답]", text);

    const xml = new DOMParser().parseFromString(text, "text/xml");
    const errorNode = xml.querySelector("cmmMsgHeader, returnAuthMsg");
    if (errorNode) {
      statusNote.textContent = "API 오류: 콘솔(F12)을 확인해주세요.";
      return;
    }

    const items = Array.from(xml.querySelectorAll("item"));
    if (items.length === 0) {
      statusNote.textContent = "레이더 목록이 비어있습니다. 콘솔(F12)에서 원본 응답을 확인해주세요.";
      return;
    }

    // item 안의 자식 태그 이름을 모르므로, 첫 번째 item의 모든 자식을 콘솔에 출력
    console.log("[첫 item의 필드들]", items[0].children.length
      ? Array.from(items[0].children).map((c) => `${c.tagName}=${c.textContent}`)
      : items[0].textContent);

    statusNote.textContent = `${items.length}개 항목 수신 — 콘솔(F12)에서 구조 확인 필요`;

    // TODO: 실제 필드명을 콘솔에서 확인한 뒤, 아래 두 줄을 맞는 필드명으로 교체
    // const latest = items[items.length - 1];
    // const imgUrl = latest.querySelector("실제필드명").textContent;
    // const bounds = { swLat: 32.0, swLng: 121.0, neLat: 43.2, neLng: 133.0 };
    // createGroundOverlay(imgUrl, bounds);
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 API 호출 실패 (콘솔 확인). CORS 문제일 수 있음.";
  }
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
