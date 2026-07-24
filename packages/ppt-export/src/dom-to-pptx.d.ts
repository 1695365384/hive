declare module 'dom-to-pptx' {
  export interface ExportToPptxOptions {
    /** Slide width in inches (default: 10 for 16:9) */
    width?: number;
    /** Slide height in inches (default: 5.625 for 16:9) */
    height?: number;
    /** PptxGenJS layout name: 'LAYOUT_16x9', 'LAYOUT_4x3', 'LAYOUT_16x10', 'LAYOUT_WIDE' */
    layout?: string;
  }

  /**
   * Convert DOM elements to a PowerPoint (.pptx) buffer.
   * Each element should represent a slide.
   */
  export function exportToPptx(
    target: Element | Element[],
    options?: ExportToPptxOptions,
  ): Promise<Uint8Array>;

  /**
   * Apply browser CSS animations to DOM elements.
   */
  export function applyBrowserAnimations(
    elements: Element[],
    options?: Record<string, unknown>,
  ): void;
}
