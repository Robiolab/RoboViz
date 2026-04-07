import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRobotFile } from '../parser/detect.js';
import { serializeModel } from '../server/robotToJSON.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerBuildCommand(program: Command): void {
  program
    .command('build <file>')
    .description('Generate a self-contained static HTML visualization')
    .option('-o, --out <dir>', 'Output directory', 'dist')
    .option('--mesh-dir <dir>', 'Directory for resolving package:// mesh paths')
    .action(async (file: string, opts: { out: string; meshDir?: string }) => {
      const filePath = path.resolve(file);

      if (!fs.existsSync(filePath)) {
        console.error('Error: File not found: ' + filePath);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const model = parseRobotFile(content, { meshDir: opts.meshDir });
      const serialized = serializeModel(model, opts.meshDir);
      const outDir = path.resolve(opts.out);
      const clientDir = path.resolve(__dirname, '../../client');

      const { build } = await import('vite');
      const { viteSingleFile } = await import('vite-plugin-singlefile');

      console.log('roboviz: building static visualization...');

      await build({
        root: clientDir,
        plugins: [viteSingleFile()],
        define: {
          'import.meta.env.VITE_STATIC_BUILD': JSON.stringify('true'),
          'window.__ROBOVIZ_MODEL__': JSON.stringify(serialized),
        },
        build: {
          outDir: outDir,
          emptyOutDir: true,
        },
        logLevel: 'warn',
      });

      console.log('roboviz: static HTML written to ' + path.join(outDir, 'index.html'));
    });
}
