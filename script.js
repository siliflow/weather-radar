// renderRadarTiles() 함수에서 CustomOverlay 생성 부분을 이렇게 수정

function renderRadarTiles() {
  if (currentLayer !== "precip" || !radarFrame || !map) return;
  
  clearRadarOverlay();

  const mapEl = document.getElementById("map");
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const lngSpan = ne.getLng() - sw.getLng();
  if (lngSpan <= 0) return;

  let z = Math.round(Math.log2((mapEl.clientWidth * 360) / (256 * lngSpan)));
  z = Math.max(2, Math.min(z, 7));

  const topLeft = lonLatToTileXY(sw.getLng(), ne.getLat(), z);
  const bottomRight = lonLatToTileXY(ne.getLng(), sw.getLat(), z);

  // ★★★ 중요: 여유 타일을 3배로 늘림 (드래그 시 빈 공간 방지) ★★★
  const padding = 3;
  const xStart = Math.floor(topLeft.x) - padding;
  const xEnd = Math.floor(bottomRight.x) + padding;
  const yStart = Math.floor(topLeft.y) - padding;
  const yEnd = Math.floor(bottomRight.y) + padding;

  const proj = map.getProjection();
  
  // 컨테이너 생성
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '999'; // ★★★ zIndex를 매우 높게 설정 ★★★

  for (let tx = xStart; tx <= xEnd; tx++) {
    for (let ty = yStart; ty <= yEnd; ty++) {
      const nw = tileXYToLonLat(tx, ty, z);
      const se = tileXYToLonLat(tx + 1, ty + 1, z);

      const p1 = proj.pointFromCoords(new kakao.maps.LatLng(nw.lat, nw.lon));
      const p2 = proj.pointFromCoords(new kakao.maps.LatLng(se.lat, se.lon));
      const width = Math.abs(p2.x - p1.x);
      const height = Math.abs(p2.y - p1.y);
      
      if (width < 1 || height < 1) continue;

      const img = document.createElement("img");
      img.src = `${radarFrame.host}${radarFrame.path}/256/${z}/${tx}/${ty}/2/1_1.png`;
      img.style.position = 'absolute';
      img.style.left = `${Math.min(p1.x, p2.x)}px`;
      img.style.top = `${Math.min(p1.y, p2.y)}px`;
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
      img.style.display = "block";
      img.style.opacity = "0.85";
      img.style.pointerEvents = "none";
      img.style.backgroundColor = "#0b1220"; // ★★★ 배경색 추가 ★★★
      
      img.onerror = () => {
        img.style.display = "none";
      };

      container.appendChild(img);
    }
  }

  // ★★★ CustomOverlay를 지도에 추가 ★★★
  radarOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(36.5, 127.8),
    content: container,
    xAnchor: 0.5,
    yAnchor: 0.5,
    zIndex: 999, // ★★★ zIndex를 매우 높게 ★★★
  });
  
  radarOverlay.setMap(map);
}
