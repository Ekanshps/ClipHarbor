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

  const ALLOWED_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com"
  ]);

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

  // Clean pasted URLs, including Markdown links.
  function normalizeVideoUrl(value) {
    let url = String(value || "").trim();

    // Convert: [YouTube link](https://youtu.be/...)
    // into:    https://youtu.be/...
    const markdownMatch = url.match(
      /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i
    );

    if (markdownMatch) {
      url = markdownMatch[2];
    }

    // Remove optional angle brackets around a pasted URL.
    if (url.startsWith("<") && url.endsWith(">")) {
      url = url.slice(1, -1).trim();
    }

    return url;
  }

  // Validate and normalize a supported YouTube URL.
  function validateVideoUrl(value) {
    const url = normalizeVideoUrl(value);

    if (!url) {
      throw new Error("Paste a YouTube link first.");
    }

    let parsed;

    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Enter a valid YouTube video URL.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("The URL must use HTTP or HTTPS.");
    }

    if (parsed.username || parsed.password || parsed.port) {
      throw new Error("Please enter a standard YouTube video URL.");
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error("Please enter a supported YouTube URL.");
    }

    // A video URL should identify a video, not just the homepage.
    const hostname = parsed.hostname.toLowerCase();

    if (
      hostname === "youtu.be" ||
      hostname === "www.youtu.be"
    ) {
      if (!parsed.pathname.split("/").filter(Boolean)[0]) {
        throw new Error("The YouTube link does not contain a video ID.");
      }
    } else if (
      !parsed.searchParams.get("v") &&
      !/^\/(shorts|live|embed)\/[^/]+/.test(parsed.pathname)
    ) {
      throw new Error("Please enter a YouTube video, Shorts, or live link.");
    }

    return parsed.href;
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
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainingSeconds = String(total % 60).padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds}`;
    }

    return `${minutes}:${remainingSeconds}`;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);

    return element;
  }

  // Convert API validation errors into readable messages.
  function getApiErrorMessage(data, statusCode) {
    const detail = data?.error ?? data?.message ?? data?.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    // Some frameworks return validation errors as an array.
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") return item;

          if (item && typeof item === "object") {
            const location = Array.isArray(item.loc)
              ? item.loc.join(" → ")
              : "";

            const message = item.msg || item.message || "";

            return [location, message].filter(Boolean).join(": ");
          }

          return "";
        })
        .filter(Boolean);

      if (messages.length) {
        return messages.join(" | ");
      }
    }

    if (statusCode === 422) {
      return "The server rejected the URL or request data (422). Check the URL and try again.";
    }

    if (statusCode === 429) {
      return "Too many requests. Please wait a little and try again.";
    }

    if (statusCode >= 500) {
      return "The server encountered an error. Please try again later.";
    }

    return `The request failed with HTTP ${statusCode}.`;
  }

  // API response handling
  async function readResponse(response) {
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw new Error(
            `The server returned HTTP ${response.status}. Please try again.`
          );
        }

        throw new Error("The API returned an unexpected response.");
      }
    }

    if (!response.ok) {
      throw new Error(
        getApiErrorMessage(data, response.status)
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new Error("The API returned an invalid response.");
    }

    return data;
  }

  function showRequestError(error) {
    console.error("ClipHarbor API request failed:", error);

    if (error.name === "AbortError") {
      setStatus(
        "The request timed out or was cancelled. Please try again.",
        true
      );
      return;
    }

    if (error instanceof TypeError) {
      setStatus(
        "Could not connect to the API. Check your connection and try again.",
        true
      );
      return;
    }

    setStatus(
      error.message || "Something went wrong. Please try again.",
      true
    );
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
      // Cancel a request started in the previous mode.
      if (activeController) {
        activeController.abort();
      }

      setMode(tab.dataset.mode);
    });
  });

  const queryParams = new URLSearchParams(location.search);

  if (queryParams.get("tab") === "thumbnail") {
    setMode("thumbnail");
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
        // Ignore invalid thumbnail URLs.
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

        // Audio quality uses height 0; don't reject it.
        if (type === "video" && (
          !Number.isFinite(height) ||
          height < 144 ||
          height > 4320
        )) {
          console.warn("Skipping invalid video quality:", item);
          return;
        }

        if (
          type === "audio" &&
          (!Number.isFinite(height) || height < 0)
        ) {
          console.warn("Skipping invalid audio option:", item);
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

    let videoUrl;

    try {
      videoUrl = validateVideoUrl(input.value);
    } catch (error) {
      setStatus(error.message, true);
      input.focus();
      return;
    }

    // Keep the cleaned URL visible in the input.
    input.value = videoUrl;

    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;
    const requestedMode = mode;

    setLoading(true);
    clearResults();
    setStatus("Connecting to ClipHarbor...");

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