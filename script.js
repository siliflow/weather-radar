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
  statusNote.textContent = "레이더 이미지 불러오는 중...";

  const today = getTodayString();
  const apiUrl =
    `https://apis.data.go.kr/1360000/RadarImgInfoService/getCmpImg` +
    `?serviceKey=${CONFIG.DATA_GO_KR_KEY}` +
    `&pageNo=1&numOfRows=50&dataType=XML&data=CMP_WRC&time=${today}`;

  try {
    const res = await fetch(apiUrl);
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");

    const resultCode = xml.querySelector("resultCode")?.textContent;
    if (resultCode && resultCode !== "00") {
      const msg = xml.querySelector("resultMsg")?.textContent || "알 수 없는 오류";
      statusNote.textContent = `API 오류: ${msg}`;
      return;
    }

    // 하나의 <item> 안에 <rdr-img-file> 태그가 시간순으로 여러 개 들어있음.
    // 가장 마지막 것이 최신 이미지.
    const fileNodes = xml.querySelectorAll("rdr-img-file");
    if (fileNodes.length === 0) {
      statusNote.textContent = "레이더 이미지 목록이 비어있습니다.";
      return;
    }

    const latestUrl = fileNodes[fileNodes.length - 1].textContent.trim();
    const httpsUrl = latestUrl.replace(/^http:\/\//, "https://");

    // 파일명 끝의 yyyyMMddHHmm 부분에서 관측시각 표시
    const m = httpsUrl.match(/(\d{8})(\d{4})\.png$/);
    if (m) {
      const [, ymd, hm] = m;
      statusNote.textContent =
        `관측시각 ${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)} ${hm.slice(0, 2)}:${hm.slice(2, 4)} (KST)`;
    }

    const bounds = {
      swLat: 32.0, swLng: 121.0,
      neLat: 43.2, neLng: 133.0,
    };

    const processedUrl = await processRadarImage(httpsUrl);
    if (!processedUrl) {
      statusNote.textContent += " (원본 이미지 — 자동 가공 실패, 콘솔 확인)";
    }
    createGroundOverlay(processedUrl || httpsUrl, bounds);
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 API 호출 실패 (콘솔 확인).";
  }
}

// ---------------------------------------------------------------
// 레이더 이미지에서 회색 배경/테두리선/오른쪽 범례를 투명 처리해서
// 강수 부분(채도 있는 색)만 남기는 가공 함수.
// CORS 정책 때문에 픽셀 읽기가 막히면 null을 반환 (그 경우 원본 그대로 사용).
// ---------------------------------------------------------------
function processRadarImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        // 오른쪽 색상 범례 영역(대략 전체 폭의 6%)은 통째로 제거
        const legendWidth = Math.round(canvas.width * 0.06);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;

            if (x >= canvas.width - legendWidth) {
              data[i + 3] = 0;
              continue;
            }

            const r = data[i], g = data[i + 1], b = data[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const lightness = (max + min) / 2;
            const saturation =
              max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness - 255));

            // 채도가 낮은(회색 계열) 픽셀 = 배경/테두리선/마스크 → 투명 처리
            // 너무 밝거나(흰 배경) 너무 어두운(검은 테두리선) 픽셀도 함께 제거
            if (saturation < 0.15 || lightness > 235 || lightness < 20) {
              data[i + 3] = 0;
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        console.warn("레이더 이미지 가공 실패 (CORS 제한 가능성):", err);
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = url;
  });
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
