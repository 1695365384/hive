/** Patch officecli HTML so slides fit the embed by letterboxing (preserve aspect ratio). */
export function enhanceOfficePreviewHtml(html: string): string {
  let out = addHiveEmbedClass(html);
  out = patchOfficeCliScaleLogic(out);

  const cssPatch = `<style id="hive-preview-patch">
html.hive-embed, html.hive-embed body {
  height: 100% !important;
  min-height: 100% !important;
  width: 100% !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  background: #1a1a2e !important;
}
html.hive-embed body {
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}
html.hive-embed .sidebar,
html.hive-embed .sidebar-toggle,
html.hive-embed .toggle-zone { display: none !important; }
/* Horizontal filmstrip — slides scroll sideways, not stacked vertically */
html.hive-embed .main {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  padding: 12px 16px !important;
  margin: 0 !important;
  gap: 14px !important;
  align-items: center !important;
  justify-content: flex-start !important;
  box-sizing: border-box !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scroll-snap-type: x mandatory !important;
  -webkit-overflow-scrolling: touch !important;
}
html.hive-embed .slide-container {
  flex: 0 0 auto !important;
  width: auto !important;
  max-width: none !important;
  height: 100% !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 !important;
  scroll-snap-align: center !important;
}
html.hive-embed .slide-wrapper {
  width: auto !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}
html.hive-embed .slide {
  box-shadow: 0 8px 28px rgba(0,0,0,0.35) !important;
}
</style>`;

  const jsPatch = `<script id="hive-preview-patch-js">
(function() {
  document.documentElement.classList.add("hive-embed");
  window.__hivePreviewWidth = 0;
  window.__hivePreviewHeight = 0;

  var rescaleScheduled = false;
  var rescaleRunning = false;

  function getAvail() {
    var hostW = window.__hivePreviewWidth;
    var hostH = window.__hivePreviewHeight;
    var main = document.querySelector(".main");
    var pad = 24;
    var w = (hostW > 0 ? hostW : (main ? main.clientWidth : window.innerWidth)) - pad;
    var h = (hostH > 0 ? hostH : (main ? main.clientHeight : window.innerHeight)) - pad;
    return { w: Math.max(0, w), h: Math.max(0, h) };
  }

  function hiveFitSlides() {
    if (rescaleRunning) return;
    rescaleRunning = true;
    try {
      var avail = getAvail();
      // Width is required; height may be 0 before first host postMessage — fall back to width-only
      if (avail.w <= 0) return;

      var slides = document.querySelectorAll(".main > .slide-container .slide");
      // Leave a peek of the next slide so the strip reads as horizontal, not a single page
      var maxSlideW = avail.w > 0 ? avail.w * 0.88 : 0;
      slides.forEach(function(slide) {
        slide.style.transform = "none";
        slide.style.margin = "0";

        var designW = slide.offsetWidth;
        var designH = slide.offsetHeight;
        if (designW <= 0 || designH <= 0) return;

        // Fit height first; cap width so neighbors stay visible in the strip
        var s = avail.h > 0 ? avail.h / designH : avail.w / designW;
        if (maxSlideW > 0 && designW * s > maxSlideW) {
          s = maxSlideW / designW;
        }
        slide.style.transform = "scale(" + s + ")";
        slide.style.transformOrigin = "center center";

        var wrapper = slide.parentElement;
        if (wrapper) {
          wrapper.style.width = Math.ceil(designW * s) + "px";
          wrapper.style.maxWidth = "none";
          wrapper.style.height = Math.ceil(designH * s) + "px";
          wrapper.style.marginLeft = "0";
          wrapper.style.marginRight = "0";
        }
      });
    } finally {
      rescaleRunning = false;
    }
  }

  function scheduleRescale() {
    if (rescaleScheduled) return;
    rescaleScheduled = true;
    requestAnimationFrame(function() {
      rescaleScheduled = false;
      hiveFitSlides();
    });
  }

  window.hiveFitSlides = hiveFitSlides;
  window.scaleSlides = hiveFitSlides;

  window.addEventListener("message", function(e) {
    if (e.data && e.data.type === "hive-preview-resize") {
      if (e.data.width > 0) window.__hivePreviewWidth = e.data.width;
      if (e.data.height > 0) window.__hivePreviewHeight = e.data.height;
      scheduleRescale();
    }
  });
  window.addEventListener("resize", scheduleRescale);

  var main = document.querySelector(".main");
  if (main) {
    new MutationObserver(function() {
      scheduleRescale();
    }).observe(main, { childList: true, subtree: true });
  }

  scheduleRescale();
})();
</script>`;

  if (out.includes("</head>")) {
    out = out.replace("</head>", `${cssPatch}</head>`);
  } else {
    out = cssPatch + out;
  }
  if (out.includes("</body>")) {
    out = out.replace("</body>", `${jsPatch}</body>`);
  } else {
    out = out + jsPatch;
  }
  return out;
}

function addHiveEmbedClass(html: string): string {
  return html.replace(/<html(\s[^>]*)?>/i, (match, attrs = "") => {
    if (/\bclass\s*=/.test(attrs)) {
      return match.replace(
        /class\s*=\s*(["'])([^"']*)\1/i,
        (_m, q, cls) => `class=${q}${cls.includes("hive-embed") ? cls : `${cls} hive-embed`.trim()}${q}`,
      );
    }
    return `<html class="hive-embed"${attrs || ""}>`;
  });
}

/** officecli may set fill=true for single slides; embed mode prefers contain (no stretch). */
export function patchOfficeCliScaleLogic(html: string): string {
  return html.replace(
    /const fill = headless && slides\.length === 1;/g,
    'const fill = document.documentElement.classList.contains("hive-embed") ? false : (headless && slides.length === 1);',
  );
}
