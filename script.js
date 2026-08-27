<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>실시간 날씨 레이더</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="style.css" />
  <!-- Leaflet CSS & JS (타일 레이어 완벽 지원) -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
  <div id="map"></div>

  <div id="layer-panel">
    <button class="layer-btn active" data-layer="precip">강수량</button>
    <button class="layer-btn" data-layer="temp">기온</button>
    <button class="layer-btn" data-layer="air">대기질</button>
    <button class="layer-btn" data-layer="wind">바람</button>
  </div>

  <div id="status-bar">
    <div class="title" id="status-title">강수량 (레이더)</div>
    <div class="value" id="status-value">RainViewer 실시간 강수 레이더</div>
    <div class="note" id="status-note">불러오는 중...</div>
  </div>

  <script src="script.js"></script>
</body>
</html>
