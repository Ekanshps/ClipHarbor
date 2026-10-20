/* ClipHarbor - downloader logic (video + thumbnail tabs) */
(() => {
  const $ = (s) => document.querySelector(s);
  const form = $("#tool-form"); if (!form) return;
  const input = $("#url"), status = $("#status"), result = $("#result"), go = $("#go");
  let mode = "video";

  const setStatus = (msg, err = false) => { status.textContent = msg; status.classList.toggle("err", err); };
  const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");

  function setMode(next) {
    mode = next;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.mode === mode));
    go.textContent = mode === "video" ? "Get download links" : "Get thumbnails";
    result.hidden = true; setStatus("");
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
  const q = new URLSearchParams(location.search);
  if (q.get("tab") === "thumbnail") setMode("thumbnail");

  function render(d) {
    const u = encodeURIComponent(input.value.trim());
    const links = mode === "video"
      ? d.qualities.map((x) => `<a class="btn ${x.type === "audio" ? "ghost" : ""}" href="${API_BASE}/api/download?url=${u}&type=${x.type}&height=${x.height}" data-dl>${esc(x.label)}</a>`)
      : d.thumbnails.map((x) => `<a class="btn ghost" href="${API_BASE}/api/thumbnail?url=${u}&size=${x.key}">${esc(x.label)}</a>`);
    result.innerHTML = `<div class="meta"><img src="${esc(d.thumbnail)}" alt="Thumbnail of ${esc(d.title)}"><div><h3>${esc(d.title)}</h3><small>${esc(d.channel || "")} ${fmtTime(d.duration)}</small></div></div><div class="grid">${links.join("")}</div>`;
    result.hidden = false;
    result.querySelectorAll("[data-dl]").forEach((a) => a.addEventListener("click", () => setStatus("Preparing your file. The download starts on its own, keep this tab open.")));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return setStatus("Paste a YouTube link first.", true);
    go.disabled = true; result.hidden = true; setStatus("Looking up your video...");
    try {
      const res = await fetch(`${API_BASE}/api/info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input.value.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setStatus("Pick an option below."); render(data);
    } catch (err) {
      setStatus(err.message === "Failed to fetch" ? "Server is waking up or unreachable. Try again in 30 seconds." : err.message, true);
    } finally { go.disabled = false; }
  });
})();
