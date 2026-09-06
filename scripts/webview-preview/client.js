(() => {
  const status = document.querySelector("[data-webview-preview-status]");
  const eventRoute = document.querySelector('meta[name="webview-preview-events"]')?.content
    || "/__webview_preview_events";
  const setStatus = (text, tone = "") => {
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone;
  };
  const events = new EventSource(eventRoute);
  events.addEventListener("ready", () => setStatus("热预览已连接", "ready"));
  events.addEventListener("reload", () => window.location.reload());
  events.addEventListener("build-error", (event) => {
    let count = 1;
    try { count = JSON.parse(event.data).count || 1; } catch { /* keep fallback */ }
    setStatus(`构建错误 ${count} 项 · 保留上一版`, "error");
  });
  events.addEventListener("watch-error", () => {
    setStatus("部分文件监听失效 · 请手动刷新", "warning");
  });
  events.onerror = () => setStatus("正在等待预览服务…", "waiting");
})();
