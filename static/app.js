(() => {
  const form = document.querySelector('#url-form');
  const urlInput = document.querySelector('#video-url');
  const inspectBtn = document.querySelector('#inspect-btn');
  const notice = document.querySelector('#notice');
  const panel = document.querySelector('#video-panel');
  const title = document.querySelector('#video-title');
  const uploader = document.querySelector('#video-uploader');
  const thumbnail = document.querySelector('#thumbnail');
  const format = document.querySelector('#format');
  const quality = document.querySelector('#quality');
  const qualityWrap = document.querySelector('#quality-wrap');
  const downloadBtn = document.querySelector('#download-btn');
  const progressWrap = document.querySelector('#progress-wrap');
  const progressText = document.querySelector('#progress-text');
  const progressPercent = document.querySelector('#progress-percent');
  const progressBar = document.querySelector('#progress-bar');
  const downloadLink = document.querySelector('#download-link');
  let currentVideo = null;
  let polling = false;

  function showNotice(message, type = 'info') {
    notice.hidden = false;
    notice.className = `notice ${type}`;
    notice.textContent = message;
  }
  function clearNotice() { notice.hidden = true; notice.textContent = ''; }
  function setBusy(busy) {
    inspectBtn.disabled = busy;
    inspectBtn.innerHTML = busy ? 'Checking…' : 'Check video <span aria-hidden="true">→</span>';
  }
  function addQualityOptions(formats) {
    quality.innerHTML = '<option value="best">Best available</option>';
    const heights = [...new Set(formats.map(f => Number(f.height)).filter(Boolean))].sort((a,b) => b-a);
    heights.forEach(height => {
      const option = document.createElement('option');
      option.value = String(height);
      option.textContent = `${height}p or lower`;
      quality.appendChild(option);
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearNotice();
    panel.hidden = true;
    downloadLink.hidden = true;
    const url = urlInput.value.trim();
    if (!url) return showNotice('Paste a YouTube video URL to continue.', 'error');
    setBusy(true);
    try {
      const response = await fetch('/api/info', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not inspect this URL.');
      currentVideo = {url, data};
      title.textContent = data.title || 'YouTube video';
      uploader.textContent = data.uploader ? `Uploaded by ${data.uploader}` : 'Video details loaded';
      if (data.thumbnail) { thumbnail.src = data.thumbnail; thumbnail.alt = `Thumbnail for ${data.title || 'video'}`; }
      else { thumbnail.removeAttribute('src'); thumbnail.alt = ''; }
      addQualityOptions(data.formats || []);
      panel.hidden = false;
      showNotice('Video details are ready. Choose a format below.', 'success');
      panel.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest'});
    } catch (error) {
      showNotice(error.message || 'Something went wrong. Try again.', 'error');
    } finally { setBusy(false); }
  });
  format.addEventListener('change', () => { qualityWrap.hidden = format.value === 'mp3'; });
  downloadBtn.addEventListener('click', async () => {
    if (!currentVideo || polling) return;
    clearNotice();
    downloadLink.hidden = true;
    progressWrap.hidden = false;
    progressBar.style.width = '8%';
    progressText.textContent = 'Starting your file…';
    progressPercent.textContent = '8%';
    downloadBtn.disabled = true;
    try {
      const response = await fetch('/api/download', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: currentVideo.url, kind: format.value, quality: quality.value})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start download.');
      polling = true;
      await pollJob(data.job_id);
    } catch (error) {
      showNotice(error.message || 'Download failed. Please try again.', 'error');
      progressText.textContent = 'Could not prepare file';
    } finally {
      polling = false;
      downloadBtn.disabled = false;
    }
  });
  async function pollJob(id) {
    let tries = 0;
    while (tries++ < 240) {
      const response = await fetch(`/api/status/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Job status unavailable.');
      if (data.status === 'error') throw new Error(data.error || 'Download failed.');
      if (data.status === 'done') {
        progressBar.style.width = '100%';
        progressText.textContent = 'Your file is ready';
        progressPercent.textContent = '100%';
        downloadLink.href = data.download_url;
        downloadLink.setAttribute('download', '');
        downloadLink.hidden = false;
        downloadBtn.textContent = 'Prepare another file ↓';
        showNotice('Ready. Select “Download file” to save it to your device.', 'success');
        return;
      }
      const pct = Math.min(92, 10 + Math.floor(tries / 3));
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
      progressText.textContent = data.status === 'queued' ? 'Waiting to start…' : 'Preparing file…';
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new Error('This is taking longer than expected. Check the server logs and try again.');
  }
})();