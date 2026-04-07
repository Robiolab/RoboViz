import { Command } from 'commander';
import { io } from 'socket.io-client';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Frame {
  t: number;
  qpos?: number[];
  joints?: Record<string, number>;
}

export function registerRecordCommand(program: Command): void {
  program
    .command('record')
    .description('Record joint state stream from a running roboviz server')
    .option('--url <url>', 'Server URL', 'http://localhost:3000')
    .option('-o, --out <file>', 'Output file path', 'trajectory.json')
    .action((opts: { url: string; out: string }) => {
      const outPath = path.resolve(opts.out);
      console.log(`roboviz record: connecting to ${opts.url}`);
      console.log('Press Ctrl+C to stop and save.\n');

      const socket = io(opts.url);
      const frames: Frame[] = [];
      let startTime: number | null = null;
      let robotName = '';
      let format = '';

      socket.on('init', (data: { name: string; format: string }) => {
        robotName = data.name;
        format = data.format;
        console.log(`Recording "${robotName}" (${format})...`);
      });

      socket.on('joint_state', (data: { qpos?: number[]; joints?: Record<string, number> }) => {
        const now = Date.now();
        if (startTime === null) startTime = now;
        const frame: Frame = { t: (now - startTime) / 1000 };
        if (data.qpos) frame.qpos = data.qpos;
        if (data.joints) frame.joints = data.joints;
        frames.push(frame);

        if (frames.length % 100 === 0) {
          process.stdout.write(`\r  ${frames.length} frames (${frame.t.toFixed(1)}s)`);
        }
      });

      socket.on('connect', () => {
        console.log('Connected. Waiting for joint states...');
      });

      socket.on('connect_error', () => {
        console.error('Error: Cannot connect to ' + opts.url);
        process.exit(1);
      });

      const save = (): void => {
        const duration = frames.length > 0 ? frames[frames.length - 1].t : 0;
        const trajectory = { robotName, format, frameCount: frames.length, duration, frames };
        fs.writeFileSync(outPath, JSON.stringify(trajectory, null, 2));
        console.log(`\nSaved ${frames.length} frames (${duration.toFixed(2)}s) → ${outPath}`);
        socket.disconnect();
        process.exit(0);
      };

      process.on('SIGINT', save);
      process.on('SIGTERM', save);
    });
}
