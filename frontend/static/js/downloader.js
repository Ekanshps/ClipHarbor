
/* ClipHarbor - Downloader Logic (Video + Thumbnail Tabs) */
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const form = $("#tool-form");
  if (!form) return;

  const input = $("#url");
  const status = $("#status");
  const result = $("#result");
  const go = $("#go");

  let mode = "video";

  // -----------------------------
  // API Configuration
  // -----------------------------
  const getApiBase = () => {
    const base = window.API_BASE;

    if (typeof base !== "string" || !base.trim()) {
      throw new Error("API URL is not configured. Please try again later.");
    }

    return base.trim().replace(/\/+$/, "");
  };

  // -----------------------------
  // UI Helpers
  // -----------------------------
  const setStatus = (message, isError = false) => {
    if (status) {
      status.textContent = message;
      status.classList.toggle("err", isError);
      status.setAttribute("role", isError ? "alert" : "status");
    }
  };

  const setLoading = (loading) => {
    if (go) {
      go.disabled = loading;
      go.setAttribute("aria-busy", String(loading));
    }
  };

  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const formatTime = (seconds) => {
    const value = Number(seconds);

    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const total = Math.floor(value);
    const minutes = Math.floor(total / 60);
    const remainingSeconds = String(total % 60).padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
  };

  const encodeQuery = (value) => encodeURIComponent(value);

  // -----------------------------
  // Video / Thumbnail Tabs
  // -----------------------------
  function setMode(nextMode) {
    mode = nextMode === "thumbnail" ? "thumbnail" : "video";

    document.querySelectorAll(".tab").forEach((tab) => {
      const selected = tab.dataset.mode === mode;

      tab.setAttribute("aria-selected", String(selected));
      tab.classList.toggle("active", selected);
    });

    if (go) {
      go.textContent =
        mode === "video" ? "Get download links" : "Get thumbnails";
    }

    if (result) {
      result.hidden = true;
      result.replaceChildren();
    }

    setStatus("");
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setMode(tab.dataset.mode);
    });
  });

  const queryParams = new URLSearchParams(window.location.search);

  if (queryParams.get("tab") === "thumbnail") {
    setMode("thumbnail");
  }

  // -----------------------------
  // API Error Handling
  // -----------------------------
  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      if (!response.ok) {
        throw new Error(
          `Server returned HTTP ${response.status}. Please try again later.`
        );
      }

      throw new Error(
        "The server returned an unexpected response. Please try again later."
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(
        data?.error || `Request failed with HTTP ${response.status}.`
      );
    }

    return data;
  }

  function showRequestError(error) {
    console.error("ClipHarbor API request failed:", error);

    if (error instanceof TypeError) {
      setStatus(
        "Unable to connect to the API. Check your connection, CORS settings, and backend status.",
        true
      );
      return;
    }

    setStatus(
      error.message || "Something went wrong. Please try again.",
      true
    );
  }

  // -----------------------------
  // Render Results
  // -----------------------------
  function render(data) {
    const apiBase = getApiBase();
    const videoUrl = input.value.trim();
    const encodedUrl = encodeQuery(videoUrl);

    const items =
      mode === "video"
        ? (Array.isArray(data.qualities) ? data.qualities : [])
        : (Array.isArray(data.thumbnails) ? data.thumbnails : []);

    if (items.length === 0) {
      throw new Error(
        mode === "video"
          ? "No download options are available for this video."
          : "No thumbnail options are available for this video."
      );
    }

    const links = items.map((item) => {
      const label = escapeHTML(item.label || "Download");
      let href;
      let isDownload = false;
      let className = "btn ghost";

      if (mode === "video") {
        const type = item.type === "audio" ? "audio" : "video";
        const height = Number(item.height);

        if (
          !Number.isFinite(height) ||
          height < 144 ||
          height > 4320
        ) {
          throw new Error("The server returned an invalid video quality.");
        }

        const params = new URLSearchParams({
          url: videoUrl,
          type,
          height: String(Math.floor(height))
        });

        href = `${apiBase}/api/download?${params.toString()}`;
        isDownload = true;
        className = type === "audio" ? "btn ghost" : "btn";
      } else {
        const size = String(item.key || "");

        if (!/^[a-zA-Z0-9_-]+$/.test(size)) {
          throw new Error("The server returned an invalid thumbnail option.");
        }

        const params = new URLSearchParams({
          url: videoUrl,
          size
        });

        href = `${apiBase}/api/thumbnail?${params.toString()}`;
      }

      return `
        <a
          class="${className}"
          href="${escapeHTML(href)}"
          ${isDownload ? 'data-dl="true"' : ""}
        >${label}</a>
      `;
    });

    const title = escapeHTML(data.title || "Untitled video");
    const channel = escapeHTML(data.channel || "");
    const thumbnail = escapeHTML(data.thumbnail || "");
    const duration = formatTime(data.duration);

    result.innerHTML = `
      <div class="meta">
        ${
          thumbnail
            ? `<img src="${thumbnail}" alt="${title}" loading="lazy">`
            : ""
        }
        <div>
          <h3>${title}</h3>
          <small>${channel}${channel && duration ? " · " : ""}${duration}</small>
        </div>
      </div>
      <div class="grid">
        ${links.join("")}
      </div>
    `;

    result.hidden = false;

    result.querySelectorAll("[data-dl]").forEach((link) => {
      link.addEventListener("click", () => {
        setStatus(
          "Preparing your file. The download may take some time; keep this tab open."
        );
      });
    });
  }

  // -----------------------------
  // Submit Form
  // -----------------------------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const videoUrl = input?.value.trim();

    if (!videoUrl) {
      setStatus("Paste a YouTube link first.", true);
      input?.focus();
      return;
    }

    if (!/^https?:\/\//i.test(videoUrl)) {
      setStatus("Please enter a valid YouTube URL.", true);
      input?.focus();
      return;
    }

    setLoading(true);
    result.hidden = true;
    result.replaceChildren();

    setStatus("Looking up your video...");

    try {
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: videoUrl
        })
      });

      const data = await readResponse(response);

      setStatus(
        mode === "video"
          ? "Pick a download option below."
          : "Choose a thumbnail size below."
      );

      render(data);
    } catch (error) {
      showRequestError(error);
    } finally {
      setLoading(false);
    }
  });
})();
