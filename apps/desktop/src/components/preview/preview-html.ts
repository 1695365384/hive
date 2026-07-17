/** Patch officecli HTML for vertical deck scroll + width-fit slides (PowerPoint-like). */
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
/* Vertical deck — scroll top→bottom like PowerPoint / Keynote */
html.hive-embed .main {
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  padding: 14px 12px 28px !important;
  margin: 0 !important;
  gap: 18px !important;
  align-items: center !important;
  justify-content: flex-start !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  scroll-snap-type: y proximity !important;
  -webkit-overflow-scrolling: touch !important;
}
html.hive-embed .slide-container {
  flex: 0 0 auto !important;
  width: 100% !important;
  max-width: 100% !important;
  height: auto !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: flex-start !important;
  margin: 0 !important;
  scroll-snap-align: start !important;
  box-sizing: border-box !important;
}
html.hive-embed .slide-wrapper {
  width: auto !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}
html.hive-embed .slide {
  box-shadow: 0 8px 28px rgba(0,0,0,0.35) !important;
}
/* Notes sit under each slide in the vertical flow */
html.hive-embed .notes,
html.hive-embed .slide-notes,
html.hive-embed [class*="note"] {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  margin-top: 0.5rem !important;
}
</style>`;

  const jsPatch = `<script id="hive-preview-patch-js">
(function() {
  document.documentElement.classList.add("hive-embed");
  window.__hivePreviewWidth = 0;
  window.__hivePreviewHeight = 0;

  var rescaleScheduled = false;
  var rescaleRunning = false;

  function getAvailWidth() {
    var hostW = window.__hivePreviewWidth;
    var main = document.querySelector(".main");
    // Match .main horizontal padding: 12px * 2
    var padX = 24;
    var w = (hostW > 0 ? hostW : (main ? main.clientWidth : window.innerWidth)) - padX;
    return Math.max(0, w);
  }

  function hiveFitSlides() {
    if (rescaleRunning) return;
    rescaleRunning = true;
    try {
      var availW = getAvailWidth();
      if (availW <= 0) return;

      var slides = document.querySelectorAll(".main > .slide-container .slide");
      slides.forEach(function(slide) {
        slide.style.transform = "none";
        slide.style.margin = "0";

        var designW = slide.offsetWidth;
        var designH = slide.offsetHeight;
        if (designW <= 0 || designH <= 0) return;

        // Fit-to-width for vertical deck review (height grows with aspect ratio)
        var s = availW / designW;
        slide.style.transform = "scale(" + s + ")";
        slide.style.transformOrigin = "center top";

        var wrapper = slide.parentElement;
        if (wrapper) {
          wrapper.style.width = Math.ceil(designW * s) + "px";
          wrapper.style.maxWidth = "100%";
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
