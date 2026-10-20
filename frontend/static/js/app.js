/* ClipHarbor - shared UI + config */
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
// CHANGE THIS after deploying the backend on Render:
window.API_BASE = isLocal ? "http://localhost:8000" : "https://clipharbor-api.onrender.com";

const menuBtn = document.querySelector(".menu");
menuBtn?.addEventListener("click", () => {
  const open = document.querySelector("nav ul").classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
});
