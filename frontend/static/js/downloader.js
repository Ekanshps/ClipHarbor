
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

  if (!input || !status || !result || !go) {
    console.error("ClipHarbor: Required downloader elements are missing.");
    return;
  }

  let mode = "video";
  let activeController = null;

  // API configuration
  function getApiBase() {
    const base = window.API_BASE;

    if (typeof base !== "string" || !base.trim()) {
      throw new Error(
        "API configuration is missing. Please refresh and try again."
      );
    }

    let parsed;

    try {
      parsed = new URL(base.trim());
    } catch {
      throw new Error("The configured API URL is invalid.");
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("The configured API URL is invalid.");
    }

    if (
      location.protocol === "https:" &&
      parsed.protocol !== "https:"
    ) {
      throw new Error("The API must use HTTPS on this website.");
    }

    return parsed.origin;
  }

  // UI helpers
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("err", isError);
    status.setAttribute("role", isError ? "alert" : "status");
  }

  function setLoading(loading) {
    go.disabled = loading;
    go.setAttribute("aria-busy", String(loading));
  }

  function clearResults() {
    result.replaceChildren();
    result.hidden = true;
  }

  function formatTime(seconds) {
    const value = Number(seconds);

    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const total = Math.floor(value);
    const minutes = Math.floor(total / 60);
    const remainingSeconds = String(total % 60).padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);

    return element;
  }

  // Video / thumbnail tabs
  function setMode(nextMode) {
    mode = nextMode === "thumbnail" ? "thumbnail" : "video";

    document.querySelectorAll(".tab").forEach((tab) => {
      const selected = tab.dataset.mode === mode;

      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });

    go.textContent =
      mode === "video" ? "Get download links" : "Get thumbnails";

    clearResults();
    setStatus("");
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setMode(tab.dataset.mode);
    });
  });

  const queryParams = new URLSearchParams(location.search);

  if (queryParams.get("tab") === "thumbnail") {
    setMode("thumbnail");
  }

  // API response handling
  async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      if (!response.ok) {
        throw new Error(
          `The server returned HTTP ${response.status}. Please try again.`
        );
      }

      throw new Error(
        "The API returned an unexpected response. Please try again."
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("The API returned invalid JSON.");
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `The request failed with HTTP ${response.status}.`
      );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("The API returned an invalid response.");
    }

    return data;
  }

  function showRequestError(error) {
    console.error("ClipHarbor API request failed:", error);

    if (error.name === "AbortError") {
      setStatus(
        "The request timed out. The server may be starting up. Please try again.",
        true
      );
      return;
    }

    if (error instanceof TypeError) {
      setStatus(
        "Could not connect to the API. Check the backend URL, CORS settings, and network connection.",
        true
      );
      return;
    }

    setStatus(
      error.message || "Something went wrong. Please try again.",
      true
    );
  }

  // Result rendering
  function render(data, requestedMode, videoUrl) {
    const apiBase = getApiBase();

    const items =
      requestedMode === "video"
        ? data.qualities
        : data.thumbnails;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(
        requestedMode === "video"
          ? "No download options are available for this video."
          : "No thumbnail options are available for this video."
      );
    }

    const container = document.createDocumentFragment();

    const meta = makeElement("div", "meta");
    const thumbnailUrl =
      typeof data.thumbnail === "string" ? data.thumbnail : "";

    // Only display HTTPS thumbnail images.
    if (thumbnailUrl) {
      try {
        const parsedThumbnail = new URL(thumbnailUrl);

        if (parsedThumbnail.protocol === "https:") {
          const image = makeElement("img");
          image.src = parsedThumbnail.href;
          image.alt =
            typeof data.title === "string"
              ? data.title
              : "Video thumbnail";
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";
          meta.appendChild(image);
        }
      } catch {
        // Ignore an invalid thumbnail URL.
      }
    }

    const details = makeElement("div");
    details.appendChild(
      makeElement(
        "h3",
        "",
        typeof data.title === "string" && data.title.trim()
          ? data.title
          : "Untitled video"
      )
    );

    const channel =
      typeof data.channel === "string" ? data.channel : "";
    const duration = formatTime(data.duration);

    details.appendChild(
      makeElement(
        "small",
        "",
        [channel, duration].filter(Boolean).join(" · ")
      )
    );

    meta.appendChild(details);
    container.appendChild(meta);

    const grid = makeElement("div", "grid");

    items.forEach((item) => {
      if (!item || typeof item !== "object") return;

      const label =
        typeof item.label === "string" && item.label.trim()
          ? item.label
          : "Download";

      let href;
      let className = "btn ghost";
      let isDownload = false;

      if (requestedMode === "video") {
        const type = item.type === "audio" ? "audio" : "video";
        const height = Number(item.height);

        if (
          !Number.isFinite(height) ||
          height < 144 ||
          height > 4320
        ) {
          console.warn("Skipping invalid video quality:", item);
          return;
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
          console.warn("Skipping invalid thumbnail option:", item);
          return;
        }

        const params = new URLSearchParams({
          url: videoUrl,
          size
        });

        href = `${apiBase}/api/thumbnail?${params.toString()}`;
      }

      const link = makeElement("a", className, label);
      link.href = href;

      if (isDownload) {
        link.addEventListener("click", () => {
          setStatus(
            "Preparing your file. This may take some time; keep this tab open."
          );
        });
      } else {
        link.setAttribute("download", "");
      }

      grid.appendChild(link);
    });

    if (!grid.children.length) {
      throw new Error("No valid options were returned by the API.");
    }

    container.appendChild(grid);
    result.replaceChildren(container);
    result.hidden = false;
  }

  // Form submission
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const videoUrl = input.value.trim();

    if (!videoUrl) {
      setStatus("Paste a YouTube link first.", true);
      input.focus();
      return;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(videoUrl);
    } catch {
      setStatus("Enter a valid YouTube video URL.", true);
      input.focus();
      return;
    }

    if (
      !["http:", "https:"].includes(parsedUrl.protocol) ||
      !["youtube.com", "www.youtube.com", "m.youtube.com",
        "youtu.be", "www.youtu.be", "music.youtube.com",
        "youtube-nocookie.com", "www.youtube-nocookie.com"
      ].includes(parsedUrl.hostname.toLowerCase())
    ) {
      setStatus("Please enter a supported YouTube URL.", true);
      input.focus();
      return;
    }

    // Cancel a previous request if one is still active.
    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;

    const requestedMode = mode;

    setLoading(true);
    clearResults();
    setStatus("Connecting to ClipHarbor...");

    // Render free services may need time to wake up.
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 90000);

    try {
      const apiBase = getApiBase();

      setStatus("Looking up your video...");

      const response = await fetch(`${apiBase}/api/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ url: videoUrl }),
        signal: controller.signal,
        mode: "cors",
        credentials: "omit"
      });

      const data = await readResponse(response);

      // Ignore a response if the user has switched tabs meanwhile.
      if (requestedMode !== mode) return;

      render(data, requestedMode, videoUrl);

      setStatus(
        requestedMode === "video"
          ? "Choose a download option below."
          : "Choose a thumbnail size below."
      );
    } catch (error) {
      if (requestedMode === mode) {
        showRequestError(error);
      }
    } finally {
      clearTimeout(timeoutId);

      if (activeController === controller) {
        activeController = null;
        setLoading(false);
      }
    }
  });
})();
