import { convertHtmlToPptx, ConvertError } from './convert.js';
import { generateChartSlide, ChartError } from './chart.js';
import { validatePptx } from './validate.js';
import { mergePptx, MergeError } from './merge.js';

function printUsage(): void {
  console.error(`Usage: hive-ppt <command> [options]

Commands:
  convert  <html-file> <output.pptx> [--charts] [--fonts <dir>]
           Convert HTML with .slide divs to PPTX via dom-to-pptx.
           --charts   Extract data-chart divs and inject native charts.
           --fonts    Directory with extra font files for @font-face.

  chart    <chart-config.json> <output.pptx>
           Generate a single-slide PPTX with a native OOXML chart.
           Chart config: { "type": "bar|line|pie|...", "categories": [...], "series": [...] }

  merge    <base.pptx> <chart1.pptx> [chart2.pptx ...] <output.pptx>
           Merge chart PPTX slides into the base PPTX. Last argument is output.

  validate <file.pptx>
           Inspect pptx zip: slide count, chart/media presence.
           Outputs JSON: { "pass": true/false, "slideCount": N, "hasChart": bool, "issues": [...] }
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const command = args[0];

  switch (command) {
    case 'convert': {
      const positional = args.slice(1).filter((a) => !a.startsWith('--'));
      const htmlFile = positional[0];
      const outputFile = positional[1];

      if (!htmlFile || !outputFile) {
        console.error('Usage: hive-ppt convert <html-file> <output.pptx> [--charts] [--fonts <dir>]');
        process.exit(1);
      }

      const chartsFlag = args.includes('--charts');
      const fontsIdx = args.indexOf('--fonts');
      const fontsDir = fontsIdx !== -1 ? args[fontsIdx + 1] : undefined;

      try {
        await convertHtmlToPptx(htmlFile, outputFile, {
          charts: chartsFlag,
          fonts: fontsDir,
        });
        console.log(`PPTX written: ${outputFile}`);
      } catch (err) {
        if (err instanceof ConvertError) {
          console.error(`Error: ${err.message}`);
          process.exit(err.exitCode);
        }
        throw err;
      }
      break;
    }

    case 'chart': {
      const configFile = args[1];
      const outputFile = args[2];

      if (!configFile || !outputFile) {
        console.error('Usage: hive-ppt chart <chart-config.json> <output.pptx>');
        process.exit(1);
      }

      try {
        await generateChartSlide(configFile, outputFile);
        console.log(`Chart PPTX written: ${outputFile}`);
      } catch (err) {
        if (err instanceof ChartError) {
          console.error(`Error: ${err.message}`);
          process.exit(err.exitCode);
        }
        throw err;
      }
      break;
    }

    case 'merge': {
      // Last arg is output, all middle args are chart PPTXs
      const positional = args.slice(1);
      if (positional.length < 3) {
        console.error('Usage: hive-ppt merge <base.pptx> <chart1.pptx> [chart2.pptx ...] <output.pptx>');
        process.exit(1);
      }

      const baseFile = positional[0];
      const outputFile = positional[positional.length - 1];
      const chartFiles = positional.slice(1, -1);

      try {
        await mergePptx(baseFile, chartFiles, outputFile);
        console.log(`Merged PPTX written: ${outputFile} (${chartFiles.length} chart file(s))`);
      } catch (err) {
        if (err instanceof MergeError) {
          console.error(`Error: ${err.message}`);
          process.exit(err.exitCode);
        }
        throw err;
      }
      break;
    }

    case 'validate': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: hive-ppt validate <file.pptx>');
        process.exit(1);
      }

      const result = await validatePptx(filePath);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.pass ? 0 : 1);
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

export { main };
