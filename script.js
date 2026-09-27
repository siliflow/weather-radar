let map;
let currentLayer = "precip";

let radarLayers = [];
let radarTimestamps = [];
let pastCount = 0; // radarTimestamps 중 "과거(관측)" 프레임 개수 — 이 인덱스부터는 예측(nowcast)
let currentFrameIndex = 0;
let animationInterval = null;
let radarLoaded = false;

let rangeMode = "all"; // "all" | "1h"
let visibleStart = 0; // rangeMode에 따라 재생 범위의 시작 인덱스

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];


const LAYER_INFO = {
  precip: { title: "강수량", readout: "레이더 관측 중", live: true },
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
  // (CARTO Voyager는 API 키가 필요하게 정책이 바뀌어서 제외)
  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      subdomains: "abc",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }
  ).addTo(map);
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

async function loadRadarLayer() {
  try {
    const res = await fetch(
      "https://api.rainviewer.com/public/weather-maps.json"
    );
    const data = await res.json();

    const past = data.radar.past || [];
    const nowcast = data.radar.nowcast || []; // 예측(미래) 프레임
    if (past.length === 0) throw new Error("레이더 데이터 없음");

    radarTimestamps = past.concat(nowcast);
    pastCount = past.length;

    radarLayers = radarTimestamps.map((frame) => {
      const tileUrl = `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      return L.tileLayer(tileUrl, {
        opacity: 0,
        maxZoom: 18,
        zIndex: 100,
      }).addTo(map);
    });

    radarLoaded = true;
    document
      .getElementById("live-dot")
      .classList.toggle("on", currentLayer === "precip");

    // 지상 레이더는 기지국이 있는 곳(한국/일본 본토 등)만 커버해서
    // 먼바다(태풍 등)는 안 보임 — 전 지구 커버되는 위성 적외선 구름
    // 이미지를 레이더 아래 배경으로 깔아준다.
    const satellite = (data.satellite && data.satellite.infrared) || [];
    if (satellite.length) {
      const latestSat = satellite[satellite.length - 1];
      const satUrl = `${data.host}${latestSat.path}/256/{z}/{x}/{y}/0/0_0.png`;
      L.tileLayer(satUrl, {
        opacity: 0.55,
        maxZoom: 18,
        zIndex: 50, // 레이더(zIndex 100)보다 아래
      }).addTo(map);
    }

    recomputeVisibleRange();
    // 가장 최근 "실제 관측"(과거의 마지막 프레임 = 지금)부터 시작.
    // 예측 프레임까지 포함해도 처음엔 "지금" 위치에서 보여준다.
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
  // 라벨 4칸은 과거를 보여주지 않는다 — 항상 "지금"부터 이후(예측)만 보여준다.
  // (재생 구간 자체는 1시간/전체 버튼이 그대로 과거를 포함할 수 있음 — 진행바용)
  const nowIndex = pastCount - 1;
  const lastIndex = radarTimestamps.length - 1;
  const span = lastIndex - nowIndex;

  const label1 = document.getElementById("rb-label-1");
  const label2 = document.getElementById("rb-label-2");
  const label3 = document.getElementById("rb-label-now");

  if (span <= 0) {
    // 예측 프레임이 아직 안 들어온 경우
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

  radarLayers.forEach((layer, i) => {
    layer.setOpacity(i === index ? 0.7 : 0);
  });

  currentFrameIndex = index;
  updateProgress();

  if (currentLayer === "precip") {
    document.getElementById("status-time").textContent =
      formatFrameTime(index);
  }
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
  radarLayers.forEach((layer) => layer.setOpacity(0));
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
