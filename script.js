// ================================================================
// 전체 화면 레이더 - 카카오맵 없이 이미지만 표시
// ================================================================

const radarImage = document.getElementById('radar-image');
const loadingText = document.getElementById('loading-text');
const timeDisplay = document.getElementById('time-display');
const statusText = document.getElementById('status-text');
let currentImageUrl = '';
let retryCount = 0;

// ===== 최신 레이더 이미지 가져오기 =====
async function fetchRadarImage() {
  try {
    loadingText.style.display = 'block';
    loadingText.textContent = '🌧️ 레이더 불러오는 중...';
    radarImage.style.opacity = '0.3';
    statusText.textContent = '연결 중...';

    // 1. RainViewer API 호출
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await response.json();
    
    // 2. 가장 최신 데이터
    const pastData = data.radar.past;
    const latest = pastData[pastData.length - 1];
    
    // 3. 이미지 URL (한반도 중심, 넓은 범위)
    const imageUrl = `${data.host}${latest.path}/512/5/16/16/2/1_1.png`;
    
    // 4. 이미지 로드
    currentImageUrl = imageUrl;
    radarImage.src = imageUrl;
    
    // 5. 시간 표시
    const date = new Date(latest.time * 1000);
    timeDisplay.textContent = 
      `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    // 6. 로드 완료
    radarImage.onload = () => {
      loadingText.style.display = 'none';
      radarImage.style.opacity = '1';
      statusText.textContent = '✅ 실시간 레이더';
      retryCount = 0;
    };
    
    // 7. 로드 실패
    radarImage.onerror = () => {
      retryCount++;
      loadingText.textContent = `⚠️ 로드 실패 (${retryCount}회), 재시도 중...`;
      statusText.textContent = '❌ 오류 발생';
      setTimeout(fetchRadarImage, 3000);
    };
    
  } catch (error) {
    console.error('레이더 가져오기 실패:', error);
    retryCount++;
    loadingText.textContent = `⚠️ 네트워크 오류 (${retryCount}회), 재시도 중...`;
    statusText.textContent = '❌ 네트워크 오류';
    setTimeout(fetchRadarImage, 5000);
  }
}

// ===== 더 넓은 범위 시도 (한반도+주변국) =====
async function fetchWideRadar() {
  try {
    loadingText.style.display = 'block';
    loadingText.textContent = '🌏 넓은 범위 로딩 중...';
    radarImage.style.opacity = '0.3';
    
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await response.json();
    const latest = data.radar.past[data.radar.past.length - 1];
    
    // z=4: 더 넓은 범위 (동아시아 전체)
    const imageUrl = `${data.host}${latest.path}/512/4/8/8/2/1_1.png`;
    
    currentImageUrl = imageUrl;
    radarImage.src = imageUrl;
    
    const date = new Date(latest.time * 1000);
    timeDisplay.textContent = 
      `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    radarImage.onload = () => {
      loadingText.style.display = 'none';
      radarImage.style.opacity = '1';
      statusText.textContent = '✅ 넓은 범위 레이더';
    };
    
  } catch (error) {
    console.error('넓은 범위 로드 실패:', error);
    setTimeout(fetchWideRadar, 5000);
  }
}

// ===== 새로고침 =====
document.getElementById('refresh-btn').addEventListener('click', () => {
  const timestamp = new Date().getTime();
  if (currentImageUrl) {
    radarImage.src = `${currentImageUrl}?t=${timestamp}`;
    loadingText.textContent = '🔄 업데이트 중...';
    loadingText.style.display = 'block';
    statusText.textContent = '🔄 새로고침 중...';
  } else {
    fetchRadarImage();
  }
});

// ===== 자동 업데이트 (2분마다) =====
setInterval(() => {
  fetchRadarImage();
}, 120000);

// ===== 키보드 단축키: R =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    document.getElementById('refresh-btn').click();
  }
});

// ===== 시작 =====
// 기본: 넓은 범위로 시작
fetchWideRadar();

console.log('🌧️ 전체화면 레이더 실행 중! (R키로 새로고침)');
console.log('📌 문제 있으면 콘솔을 확인하세요.');
