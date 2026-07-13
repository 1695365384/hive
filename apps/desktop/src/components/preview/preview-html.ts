/** Patch officecli HTML so slides fill the embed width and rescale on host resize. */
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
}
html.hive-embed body {
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: row !important;
}
html.hive-embed .sidebar,
html.hive-embed .sidebar-toggle,
html.hive-embed .toggle-zone { display: none !important; }
html.hive-embed .main {
  flex: 1 1 auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  gap: 12px !important;
  align-items: stretch !important;
  box-sizing: border-box !important;
}
html.hive-embed .slide-container {
  width: 100% !important;
  max-width: 100% !important;
  align-items: stretch !important;
  margin: 0 !important;
}
html.hive-embed .slide-wrapper {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  justify-content: center !important;
}
</style>`;

  const jsPatch = `<script id="hive-preview-patch-js">
(function() {
  document.documentElement.classList.add("hive-embed");
  window.__hivePreviewWidth = 0;

  var rescaleScheduled = false;
  var rescaleRunning = false;

  function getAvailWidth() {
    var hostW = window.__hivePreviewWidth;
    if (hostW > 0) return hostW;
    var main = document.querySelector(".main");
    return main ? main.clientWidth : 0;
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

        var s = availW / designW;
        slide.style.transform = "scale(" + s + ")";
        slide.style.transformOrigin = "top center";

        var wrapper = slide.parentElement;
        var container = wrapper && wrapper.parentElement;
        if (wrapper) {
          wrapper.style.width = "100%";
          wrapper.style.maxWidth = availW + "px";
          wrapper.style.height = Math.ceil(designH * s) + "px";
        }
        if (container) {
          container.style.width = "100%";
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
        (_m, q, classes) => `class=${q}${classes} hive-embed${q}`,
      );
    }
    return `<html${attrs} class="hive-embed">`;
  });
}

/** Make officecli scaleSlides always fill width in hive-embed (even its own resize handler). */
function patchOfficeCliScaleLogic(html: string): string {
  return html
    .replace(
      "const availW = main.clientWidth - (headless ? 0 : 40);",
      'const availW = ((window.__hivePreviewWidth > 0 ? window.__hivePreviewWidth : main.clientWidth)) - (document.documentElement.classList.contains("hive-embed") || headless ? 0 : 40);',
    )
    .replace(
      "const fill = headless && slides.length === 1;",
      'const fill = document.documentElement.classList.contains("hive-embed") || (headless && slides.length === 1);',
    );
}
