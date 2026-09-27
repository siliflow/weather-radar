let map;
let currentLayer = "precip";

let radarLayers = []; // 프레임별 격자 강수값 배열 (ECMWF)
let radarTimestamps = [];
let pastCount = 0; // radarTimestamps 중 "과거(관측)" 프레임 개수 — 이 인덱스부터는 예측(nowcast)
let currentFrameIndex = 0;
let animationInterval = null;
let radarLoaded = false;

let rangeMode = "all"; // "all" | "1h"
let visibleStart = 0; // rangeMode에 따라 재생 범위의 시작 인덱스

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// ECMWF 격자 설정 (한국 포함 전지구 모델, Open-Meteo 경유, 키 불필요)
const GRID_STEP = 1.0; // degrees
const GRID_LAT_RANGE = [33, 43];
const GRID_LON_RANGE = [124, 132];
let gridPoints = [];
let precipLayerGroup = null;

const LAYER_INFO = {
  precip: { title: "강수량", readout: "ECMWF 예보 표시 중", live: true },
  temp: { title: "기온", readout: "준비 중인 레이어입니다", live: false },
  air: { title: "대기질", readout: "준비 중인 레이어입니다", live: false },
  wind: { title: "바람", readout: "준비 중인 레이어입니다", live: false },
};

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupLayerNav();
  setupPlayButton();
  setupRangeButtons();
  setupProgressScrub();
  setRadarBarDate();
  switchLayer("precip");
});

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 18,
  }).setView([36.2, 127.8], 7);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  // 키 없이 쓸 수 있는 일반(라이트) 베이스맵 — 표준 OpenStreetMap 타일
  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      subdomains: "abc",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }
  ).addTo(map);

  precipLayerGroup = L.layerGroup().addTo(map);
}

function setupLayerNav() {
  document.querySelectorAll(".layer-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".layer-item")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchLayer(btn.dataset.layer);
    });
  });
}

function setupPlayButton() {
  document.getElementById("playBtn").addEventListener("click", () => {
    if (animationInterval) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });
}

function setupRangeButtons() {
  document.querySelectorAll(".rb-range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".rb-range-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      rangeMode = btn.dataset.range;
      recomputeVisibleRange();
    });
  });
}

function setupProgressScrub() {
  const track = document.getElementById("rb-progress");
  track.addEventListener("click", (e) => {
    if (!radarLayers.length) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const span = radarLayers.length - 1 - visibleStart;
    const idx = visibleStart + Math.round(ratio * span);
    stopAnimation();
    showFrame(idx);
  });
}

function setRadarBarDate() {
  const now = new Date();
  const text = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${
    WEEKDAYS[now.getDay()]
  }요일`;
  document.getElementById("rb-date").textContent = text;
}

function switchLayer(layer) {
  currentLayer = layer;
  const info = LAYER_INFO[layer];

  document.getElementById("status-title").textContent = info.title;
  document.getElementById("status-readout-text").textContent = info.readout;
  document
    .getElementById("live-dot")
    .classList.toggle("on", info.live && radarLoaded);

  const legend = document.getElementById("legend");
  const radarBar = document.getElementById("radar-bar");

  if (layer === "precip") {
    legend.classList.add("visible");
    radarBar.classList.add("visible");

    if (radarLoaded) {
      showFrame(currentFrameIndex);
      startAnimation();
    } else {
      document.getElementById("status-time").textContent = "불러오는 중...";
      loadRadarLayer();
    }
  } else {
    legend.classList.remove("visible");
    radarBar.classList.remove("visible");
    document.getElementById("status-time").textContent = "";
    hideRadarLayers();
    stopAnimation();
  }
}

function buildGridPoints() {
  if (gridPoints.length) return;
  for (let lat = GRID_LAT_RANGE[0]; lat <= GRID_LAT_RANGE[1]; lat += GRID_STEP) {
    for (let lon = GRID_LON_RANGE[0]; lon <= GRID_LON_RANGE[1]; lon += GRID_STEP) {
      gridPoints.push({ lat: +lat.toFixed(2), lon: +lon.toFixed(2) });
    }
  }
}

async function loadRadarLayer() {
  try {
    buildGridPoints();

    const latStr = gridPoints.map((p) => p.lat).join(",");
    const lonStr = gridPoints.map((p) => p.lon).join(",");

    // ECMWF IFS 0.25° 모델, Open-Meteo 경유 (키 불필요)
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lonStr}` +
      `&hourly=precipitation&models=ecmwf_ifs025&forecast_days=2` +
      `&timeformat=unixtime&timezone=Asia%2FSeoul`;

    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data) || !data[0] || !data[0].hourly) {
      throw new Error("ECMWF 데이터 없음");
    }

    const times = data[0].hourly.time;

    radarTimestamps = times.map((t) => ({ time: t }));
    // ECMWF는 전부 예보 데이터라 "과거" 프레임이 없음 —
    // 다만 기존 UI 로직(진행바 '지금' 마커 등)과 맞추기 위해
    // 첫 프레임을 "지금"으로 취급한다.
    pastCount = 1;

    radarLayers = times.map((_, h) =>
      gridPoints.map((_, i) => data[i]?.hourly?.precipitation?.[h] ?? 0)
    );

    radarLoaded = true;
    document
      .getElementById("live-dot")
      .classList.toggle("on", currentLayer === "precip");

    recomputeVisibleRange();
    showFrame(pastCount - 1);

    if (currentLayer === "precip") startAnimation();
  } catch (err) {
    console.error(err);
    document.getElementById("status-time").textContent = "레이더 불러오기 실패";
  }
}

// rangeMode(1시간 / 전체)에 맞춰 재생 구간의 시작 인덱스를 계산하고
// 하단 레이더 바의 시간 라벨 + "지금" 마커를 새로 그린다.
function recomputeVisibleRange() {
  if (!radarTimestamps.length) return;

  if (rangeMode === "1h") {
    const nowTime = radarTimestamps[pastCount - 1].time;
    const idx = radarTimestamps.findIndex((f) => f.time >= nowTime - 3600);
    visibleStart = idx === -1 ? pastCount - 1 : idx;
  } else {
    visibleStart = 0;
  }

  if (currentFrameIndex < visibleStart) {
    currentFrameIndex = visibleStart;
  }

  updateRangeLabels();
  updateProgress();
}

function updateRangeLabels() {
  const nowIndex = pastCount - 1;
  const lastIndex = radarTimestamps.length - 1;
  const span = lastIndex - nowIndex;

  const label1 = document.getElementById("rb-label-1");
  const label2 = document.getElementById("rb-label-2");
  const label3 = document.getElementById("rb-label-now");

  if (span <= 0) {
    label1.textContent = "--:--";
    label2.textContent = "--:--";
    label3.textContent = "--:--";
  } else {
    const idx1 = nowIndex + Math.max(1, Math.round(span * (1 / 3)));
    const idx2 = nowIndex + Math.max(1, Math.round(span * (2 / 3)));
    label1.textContent = formatFrameTimeShort(idx1);
    label2.textContent = formatFrameTimeShort(idx2);
    label3.textContent = formatFrameTimeShort(lastIndex);
  }

  updateNowMarker();
}

function updateNowMarker() {
  const marker = document.getElementById("rb-now-marker");
  if (!marker) return;

  const lastIndex = radarTimestamps.length - 1;
  const span = lastIndex - visibleStart;
  const nowIndex = pastCount - 1;

  if (span <= 0 || nowIndex < visibleStart || nowIndex > lastIndex) {
    marker.style.display = "none";
    return;
  }

  const ratio = (nowIndex - visibleStart) / span;
  marker.style.display = "block";
  marker.style.left = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function formatFrameTimeShort(index) {
  if (!radarTimestamps[index]) return "--:--";
  const t = new Date(radarTimestamps[index].time * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

function showFrame(index) {
  if (!radarLayers.length) return;

  drawFrame(radarLayers[index]);

  currentFrameIndex = index;
  updateProgress();

  if (currentLayer === "precip") {
    document.getElementById("status-time").textContent =
      formatFrameTime(index);
  }
}

// ECMWF 격자 강수값을 사각형 히트맵으로 그린다 (RainViewer 타일 대신)
function drawFrame(values) {
  if (!precipLayerGroup) return;
  precipLayerGroup.clearLayers();

  const half = GRID_STEP / 2;
  values.forEach((v, i) => {
    if (v == null || v < 0.1) return; // 강수 거의 없음 → 생략
    const { lat, lon } = gridPoints[i];
    const bounds = [
      [lat - half, lon - half],
      [lat + half, lon + half],
    ];
    L.rectangle(bounds, {
      stroke: false,
      fillColor: precipColor(v),
      fillOpacity: precipOpacity(v),
    }).addTo(precipLayerGroup);
  });
}

function precipColor(v) {
  if (v < 1) return "#4fa8ff"; // 약함
  if (v < 4) return "#ffd400"; // 보통
  if (v < 10) return "#ff8c00"; // 강함
  return "#e0193c"; // 매우 강함
}

function precipOpacity(v) {
  return Math.min(0.75, 0.3 + v / 15);
}

function updateProgress() {
  const lastIndex = radarTimestamps.length - 1;
  const span = lastIndex - visibleStart;
  const ratio = span > 0 ? (currentFrameIndex - visibleStart) / span : 1;
  document.getElementById("rb-progress-fill").style.width =
    `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function formatFrameTime(index) {
  if (!radarTimestamps[index]) return "";
  const t = new Date(radarTimestamps[index].time * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const base = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}  ${pad(
    t.getHours()
  )}:${pad(t.getMinutes())} KST`;
  return index >= pastCount ? `${base} · 예측` : base;
}

function hideRadarLayers() {
  if (precipLayerGroup) precipLayerGroup.clearLayers();
}

function startAnimation() {
  if (!radarLayers.length) return;
  stopAnimation();
  document.getElementById("playBtn").textContent = "⏸";
  animationInterval = setInterval(() => {
    let nextIndex = currentFrameIndex + 1;
    if (nextIndex > radarLayers.length - 1 || nextIndex < visibleStart) {
      nextIndex = visibleStart;
    }
    showFrame(nextIndex);
  }, 700);
}

function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
  }
  document.getElementById("playBtn").textContent = "▶";
}
