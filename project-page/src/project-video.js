export function initProjectVideo(frame) {
  const video = frame.querySelector('video');
  const controls = frame.querySelector('.film-controls');
  const toggle = frame.querySelector('.film-toggle');
  const seek = frame.querySelector('.film-progress');
  const time = frame.querySelector('.film-time');
  const fullscreen = frame.querySelector('.film-fullscreen');
  let animationFrame;
  let dragging = false;
  const format = (value) => {
    const seconds = Math.max(0, Math.floor(value || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  function updateTime() {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    seek.disabled = !duration;
    seek.max = duration || 1;
    if (!dragging) seek.value = video.currentTime;
    const current = Number(seek.value);
    const elapsed = format(current);
    const total = format(Math.ceil(duration));
    const label = `${elapsed} / ${total}`;
    if (time.textContent !== label) time.textContent = label;
    time.title = label;
    seek.setAttribute('aria-valuetext', `${elapsed} of ${total}`);
    seek.style.setProperty('--film-progress', `${duration ? current / duration * 100 : 0}%`);
  }

  function tick() {
    updateTime();
    if (!video.paused && !video.ended && !document.hidden) animationFrame = requestAnimationFrame(tick);
  }

  function updateState() {
    cancelAnimationFrame(animationFrame);
    const paused = video.paused || video.ended;
    frame.dataset.paused = String(paused);
    toggle.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    toggle.title = paused ? 'Play' : 'Pause';
    tick();
  }

  function togglePlayback() {
    if (video.paused || video.ended) video.play().catch(updateState);
    else video.pause();
  }

  function seekTo(value) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, value));
    seek.value = video.currentTime;
    updateTime();
  }

  toggle.addEventListener('click', togglePlayback);
  video.addEventListener('click', togglePlayback);
  video.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); togglePlayback();
    }
  });
  seek.addEventListener('input', () => seekTo(Number(seek.value)));
  seek.addEventListener('pointerdown', () => { dragging = true; });
  for (const event of ['pointerup', 'pointercancel']) window.addEventListener(event, () => { dragging = false; updateTime(); });
  seek.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); seekTo(video.currentTime + (event.key === 'ArrowRight' ? 5 : -5));
  });
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked']) video.addEventListener(event, updateTime);
  for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, updateState);
  document.addEventListener('visibilitychange', updateState);
  video.addEventListener('error', () => { cancelAnimationFrame(animationFrame); controls.hidden = true; });

  fullscreen.hidden = !((document.fullscreenEnabled && frame.requestFullscreen) || video.webkitEnterFullscreen);
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else if (document.fullscreenEnabled && frame.requestFullscreen) await frame.requestFullscreen();
      else video.webkitEnterFullscreen();
    } catch { fullscreen.title = 'Fullscreen is unavailable'; }
  });
  document.addEventListener('fullscreenchange', () => {
    const expanded = document.fullscreenElement === frame;
    fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreen.title = expanded ? 'Exit fullscreen' : 'Fullscreen';
  });

  video.controls = false;
  video.tabIndex = 0;
  controls.hidden = false;
  updateState();
}
