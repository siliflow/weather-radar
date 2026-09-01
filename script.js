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
  precip: { title: "강수량", readout: "레이더 관측 중", live: true },
  temp: { title: "기온", readout: "준비 중인 레이어입니다", live: false },
  air: { title: "대기질", readout: "준비 중인 레이어입니다", live: false },
  wind: { title: "바람", readout: "준비 중인 레이어입니다", live: false },
};

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupLayerNav();
  setupPlayButton();
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

  // 어두운 계기판 톤과 어울리는 다크 베이스맵
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
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

function switchLayer(layer) {
  currentLayer = layer;
  const info = LAYER_INFO[layer];

  document.getElementById("status-title").textContent = info.title;
  document.getElementById("status-readout-text").textContent = info.readout;
  document
    .getElementById("live-dot")
    .classList.toggle("on", info.live && radarLoaded);

  const legend = document.getElementById("legend");
  const playback = document.getElementById("playback");

  if (layer === "precip") {
    legend.classList.add("visible");
    playback.classList.add("visible");

    if (radarLoaded) {
      showFrame(currentFrameIndex);
      startAnimation();
    } else {
      document.getElementById("status-time").textContent = "불러오는 중...";
      loadRadarLayer();
    }
  } else {
    legend.classList.remove("visible");
    playback.classList.remove("visible");
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
    buildFrameTrack();
    document
      .getElementById("live-dot")
      .classList.toggle("on", currentLayer === "precip");

    showFrame(radarLayers.length - 1);

    if (currentLayer === "precip") startAnimation();
  } catch (err) {
    console.error(err);
    document.getElementById("status-time").textContent = "레이더 불러오기 실패";
  }
}

function buildFrameTrack() {
  const track = document.getElementById("frame-track");
  track.innerHTML = "";
  radarLayers.forEach((_, i) => {
    const tick = document.createElement("button");
    tick.className = "frame-tick";
    tick.setAttribute("aria-label", `프레임 ${i + 1}`);
    tick.addEventListener("click", () => {
      stopAnimation();
      showFrame(i);
    });
    track.appendChild(tick);
  });
}

function showFrame(index) {
  if (!radarLayers.length) return;

  radarLayers.forEach((layer, i) => {
    layer.setOpacity(i === index ? 0.7 : 0);
  });

  currentFrameIndex = index;

  document
    .querySelectorAll(".frame-tick")
    .forEach((tick, i) => tick.classList.toggle("active", i === index));

  if (currentLayer === "precip") {
    document.getElementById("status-time").textContent =
      formatFrameTime(index);
  }
}

function formatFrameTime(index) {
  if (!radarTimestamps[index]) return "";
  const t = new Date(radarTimestamps[index].time * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}  ${pad(
    t.getHours()
  )}:${pad(t.getMinutes())} KST`;
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
