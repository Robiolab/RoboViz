import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRobotFile } from '../parser/detect.js';
import { createRobovizServer } from '../server/index.js';

export function registerServeCommand(program: Command): void {
  program
    .command('serve <file>')
    .description('Visualize a robot description file in the browser')
    .option('--port <n>', 'Port to listen on', '3000')
    .option('--mesh-dir <dir>', 'Directory for resolving mesh paths')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (file: string, opts: { port: string; meshDir?: string; open: boolean }) => {
      const filePath = path.resolve(file);

      if (!fs.existsSync(filePath)) {
        console.error('Error: File not found: ' + filePath);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const model = parseRobotFile(content, { meshDir: opts.meshDir });
      const port = parseInt(opts.port, 10);

      createRobovizServer(model, port, opts.meshDir);

      if (opts.open) {
        const openModule = await import('open');
        openModule.default('http://localhost:' + port);
      }
    });
}
