import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRobotFile } from '../parser/detect.js';

export function registerParseCommand(program: Command): void {
  program
    .command('parse <file>')
    .description('Parse a robot description file (MJCF or URDF) and print the RobotModel as JSON')
    .option('--mesh-dir <dir>', 'Directory for resolving package:// mesh paths')
    .action((file: string, opts: { meshDir?: string }) => {
      const filePath = path.resolve(file);

      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      try {
        const model = parseRobotFile(content, { meshDir: opts.meshDir });
        // Convert Map to plain object for JSON serialization
        const serializable = {
          ...model,
          jointIndex: Object.fromEntries(model.jointIndex),
        };
        console.log(JSON.stringify(serializable, null, 2));
      } catch (err) {
        console.error(`Error parsing ${file}: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
