:root {
  --bg: #0b1220;
  --panel: rgba(15, 23, 42, 0.85);
  --line: rgba(148, 163, 184, 0.2);
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --accent-dim: rgba(56, 189, 248, 0.15);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; font-family: "Pretendard", -apple-system, "Malgun Gothic", sans-serif; }
#map { width: 100%; height: 100%; position: relative; overflow: hidden; }

/* 상단 우측 레이어 토글 */
#layer-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 50;
  background: var(--panel);
  backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 6px;
  display: flex;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.layer-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}
.layer-btn:hover { color: var(--text); background: rgba(148,163,184,0.08); }
.layer-btn.active { color: var(--accent); background: var(--accent-dim); }

/* 하단 상태/범례 바 */
#status-bar {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 50;
  background: var(--panel);
  backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 14px;
  color: var(--text);
  font-size: 12px;
  max-width: 260px;
  line-height: 1.5;
}
#status-bar .title { color: var(--muted); font-weight: 600; margin-bottom: 2px; }
#status-bar .value { font-size: 14px; font-weight: 700; }
#status-bar .note { color: var(--muted); margin-top: 6px; font-size: 11px; }

#setup-warning {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: var(--bg);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: left;
}
#setup-warning .box {
  max-width: 480px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 24px;
}
#setup-warning h1 { font-size: 16px; margin: 0 0 12px; }
#setup-warning code {
  display: block;
  background: rgba(148,163,184,0.1);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  margin: 8px 0;
  color: var(--accent);
  word-break: break-all;
}
#setup-warning p { font-size: 13px; color: var(--muted); line-height: 1.6; }
