let map;
let currentLayer = "precip";

let radarLayers = [];
let radarTimestamps = [];
let currentFrameIndex = 0;
let animationInterval = null;
let radarLoaded = false;

const KOREA_BOUNDS = L.latLngBounds(
  L.latLng(33.0, 124.0),
  L.latLng(38.9, 132.0)
);

const LAYER_INFO = {
  precip: { title: "강수량 (레이더)", value: "RainViewer 실시간 강수 레이더" },
  temp: { title: "기온", value: "준비 중인 레이어입니다." },
  air: { title: "대기질", value: "준비 중인 레이어입니다." },
  wind: { title: "바람", value: "준비 중인 레이어입니다." },
};

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupLayerButtons();
  switchLayer("precip");
});

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    minZoom: 6,
    maxZoom: 18,
    maxBounds: KOREA_BOUNDS.pad(0.15),
    maxBoundsViscosity: 1.0,
  }).setView([36.2, 127.8], 7);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OSM</a>',
  }).addTo(map);
}

function setupLayerButtons() {
  document.querySelectorAll(".layer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".layer-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchLayer(btn.dataset.layer);
    });
  });

  document.getElementById("playBtn").addEventListener("click", () => {
    if (animationInterval) {
      stopAnimation();
    } else {
      startAnimation();
    }
  });
}

function switchLayer(layer) {
  currentLayer = layer;

  const statusTitle = document.getElementById("status-title");
  const statusValue = document.getElementById("status-value");
  const statusNote = document.getElementById("status-note");
  const radarControls = document.getElementById("radar-controls");

  const info = LAYER_INFO[layer];
  statusTitle.textContent = info.title;
  statusValue.textContent = info.value;

  if (layer === "precip") {
    radarControls.classList.add("visible");
    if (radarLoaded) {
      showRadarLayers();
      statusNote.textContent = formatFrameTime(currentFrameIndex);
      startAnimation();
    } else {
      statusNote.textContent = "레이더 불러오는 중...";
      loadRadarLayer();
    }
  } else {
    radarControls.classList.remove("visible");
    statusNote.textContent = "";
    hideRadarLayers();
    stopAnimation();
  }
}

async function loadRadarLayer() {
  const statusNote = document.getElementById("status-note");

  try {
    const res = await fetch(
      "https://api.rainviewer.com/public/weather-maps.json"
    );
    const data = await res.json();

    const past = data.radar.past;
    if (!past || past.length === 0) throw new Error("레이더 데이터 없음");

    radarTimestamps = past;

    radarLayers = past.map((frame) => {
      const tileUrl = `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      return L.tileLayer(tileUrl, {
        opacity: 0,
        maxZoom: 18,
        zIndex: 100,
      }).addTo(map);
    });

    radarLoaded = true;
    showFrame(radarLayers.length - 1);

    if (currentLayer === "precip") {
      startAnimation();
    }
  } catch (err) {
    console.error(err);
    statusNote.textContent = "레이더 불러오기 실패.";
  }
}

function showFrame(index) {
  if (!radarLayers.length) return;

  radarLayers.forEach((layer, i) => {
    layer.setOpacity(i === index ? 0.65 : 0);
  });

  currentFrameIndex = index;

  if (currentLayer === "precip") {
    document.getElementById("status-note").textContent =
      formatFrameTime(index);
  }
}

function formatFrameTime(index) {
  if (!radarTimestamps[index]) return "";
  const t = new Date(radarTimestamps[index].time * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `관측시각 ${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ` +
    `${pad(t.getHours())}:${pad(t.getMinutes())} (RainViewer 기준)`
  );
}

function showRadarLayers() {
  if (radarLayers.length) showFrame(currentFrameIndex);
}

function hideRadarLayers() {
  radarLayers.forEach((layer) => layer.setOpacity(0));
}

function startAnimation() {
  if (!radarLayers.length) return;
  stopAnimation();
  document.getElementById("playBtn").textContent = "⏸";
  animationInterval = setInterval(() => {
    const nextIndex = (currentFrameIndex + 1) % radarLayers.length;
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
