import { readFile, writeFile, access } from 'node:fs/promises';
import JSZip from 'jszip';

/**
 * Merge chart PPTXs into a base PPTX by appending slides and copying
 * chart resources (ppt/charts/) with renumbering.
 */
export async function mergePptx(
  basePath: string,
  chartPaths: string[],
  outputPath: string,
): Promise<void> {
  try { await access(basePath); } catch {
    throw new MergeError(`Base pptx not found: ${basePath}`, 1);
  }
  for (const p of chartPaths) {
    try { await access(p); } catch {
      throw new MergeError(`Chart pptx not found: ${p}`, 1);
    }
  }
  if (chartPaths.length === 0) {
    const buf = await readFile(basePath);
    await writeFile(outputPath, buf);
    return;
  }

  const baseZip = await JSZip.loadAsync(await readFile(basePath));

  // Find max existing slide and chart numbers in base
  const baseSlides = Object.keys(baseZip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  const existingCharts = Object.keys(baseZip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));

  let nextSlide = baseSlides.length + 1;
  let nextChart = existingCharts.length + 1;

  // Build a map from old chart ref → new chart ref for rel updates
  const chartRefMap = new Map<string, string>();

  let contentTypesXml = (await baseZip.file('[Content_Types].xml')?.async('string')) || '';
  let presXml = (await baseZip.file('ppt/presentation.xml')?.async('string')) || '';
  let presRelsXml = (await baseZip.file('ppt/_rels/presentation.xml.rels')?.async('string')) || '';

  if (!contentTypesXml || !presXml) {
    throw new MergeError('Base pptx is missing required internal files', 2);
  }

  // Helper: add content type if not present
  const ensureContentType = (partName: string, ct: string) => {
    if (!contentTypesXml.includes(partName)) {
      contentTypesXml = contentTypesXml.replace(
        '</Types>',
        `<Override PartName="${partName}" ContentType="${ct}"/></Types>`,
      );
    }
  };

  for (const chartPath of chartPaths) {
    const chartZip = await JSZip.loadAsync(await readFile(chartPath));

    // 1. Copy chart resources (ppt/charts/) with renumbering
    const chartXmlFiles = Object.keys(chartZip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    for (const chartFile of chartXmlFiles) {
      const content = await chartZip.file(chartFile)?.async('nodebuffer');
      if (!content) continue;

      const oldNum = chartFile.match(/chart(\d+)\.xml$/)![1];
      const newChartFile = `ppt/charts/chart${nextChart}.xml`;
      baseZip.file(newChartFile, content);
      chartRefMap.set(oldNum, String(nextChart));
      ensureContentType(`/ppt/charts/chart${nextChart}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
      nextChart++;
    }

    // Copy chart rels
    const chartRelsFiles = Object.keys(chartZip.files).filter((f) => /^ppt\/charts\/_rels\/chart\d+\.xml.rels$/.test(f));
    for (const relsFile of chartRelsFiles) {
      const content = await chartZip.file(relsFile)?.async('nodebuffer');
      if (!content) continue;
      const oldNum = relsFile.match(/chart(\d+)\.xml\.rels$/)![1];
      const newNum = chartRefMap.get(oldNum);
      if (newNum) {
        baseZip.file(`ppt/charts/_rels/chart${newNum}.xml.rels`, content);
      }
    }

    // Copy chart colors/styles if present
    for (const prefix of ['ppt/charts/colors', 'ppt/charts/style']) {
      for (const f of Object.keys(chartZip.files)) {
        if (f.startsWith(prefix)) {
          const content = await chartZip.file(f)?.async('nodebuffer');
          if (content && !baseZip.file(f)) {
            baseZip.file(f, content);
          }
        }
      }
    }

    // 2. Copy slides with renumbering and fix chart refs in rels
    const slideFiles = Object.keys(chartZip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    for (const slideFile of slideFiles) {
      const oldSlideNum = slideFile.match(/slide(\d+)\.xml$/)![1];
      const slideContent = await chartZip.file(slideFile)?.async('nodebuffer');
      if (slideContent) {
        baseZip.file(`ppt/slides/slide${nextSlide}.xml`, slideContent);
      }

      // Copy and fix slide rels (update chart references)
      const relsFile = `ppt/slides/_rels/slide${oldSlideNum}.xml.rels`;
      let relsContent = await chartZip.file(relsFile)?.async('string');
      if (relsContent) {
        // Fix chart references
        for (const [oldNum, newNum] of chartRefMap) {
          relsContent = relsContent.replace(
            new RegExp(`charts/chart${oldNum}\\.xml`, 'g'),
            `charts/chart${newNum}.xml`,
          );
        }
        // Fix slideLayout reference (keep original layout reference)
        baseZip.file(`ppt/slides/_rels/slide${nextSlide}.xml.rels`, relsContent);
      }

      ensureContentType(
        `/ppt/slides/slide${nextSlide}.xml`,
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
      );

      // Add slide relationship to presentation.xml.rels
      const relId = `rIdSlide${nextSlide}`;
      if (presRelsXml && !presRelsXml.includes(relId)) {
        presRelsXml = presRelsXml.replace(
          '</Relationships>',
          `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${nextSlide}.xml"/></Relationships>`,
        );
      }

      nextSlide++;
    }

    // Copy notes slides if present
    for (const f of Object.keys(chartZip.files)) {
      if (f.startsWith('ppt/notesSlides/') || f.startsWith('ppt/notesSlides/_rels/')) {
        const content = await chartZip.file(f)?.async('nodebuffer');
        if (content) {
          const newF = f.replace(/slide\d+/, `slide${nextSlide - 1}`);
          if (!baseZip.file(newF)) {
            baseZip.file(newF, content);
          }
        }
      }
    }

    // Copy media if not already present
    for (const f of Object.keys(chartZip.files)) {
      if (f.startsWith('ppt/media/') && !baseZip.file(f)) {
        const content = await chartZip.file(f)?.async('nodebuffer');
        if (content) baseZip.file(f, content);
      }
    }
  }

  const totalSlides = nextSlide - 1;

  // Update presentation.xml sldIdLst
  if (presXml) {
    const sldIds = Array.from({ length: totalSlides }, (_, i) =>
      `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`,
    ).join('');
    presXml = presXml.replace(/<p:sldIdLst>.*?<\/p:sldIdLst>/s, `<p:sldIdLst>${sldIds}</p:sldIdLst>`);
  }

  baseZip.file('[Content_Types].xml', contentTypesXml);
  baseZip.file('ppt/presentation.xml', presXml);
  if (presRelsXml) {
    baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml);
  }

  const mergedBuffer = await baseZip.generateAsync({ type: 'nodebuffer' });
  await writeFile(outputPath, Buffer.from(mergedBuffer));
}

export class MergeError extends Error {
  constructor(message: string, public readonly exitCode: number) {
    super(message);
    this.name = 'MergeError';
  }
}
