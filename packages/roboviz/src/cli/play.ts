import { Command } from 'commander';
import { io } from 'socket.io-client';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Frame {
  t: number;
  qpos?: number[];
  joints?: Record<string, number>;
}

interface Trajectory {
  robotName: string;
  format: string;
  frameCount: number;
  duration: number;
  frames: Frame[];
}

export function registerPlayCommand(program: Command): void {
  program
    .command('play <file>')
    .description('Replay a recorded trajectory on a running roboviz server')
    .option('--url <url>', 'Server URL', 'http://localhost:3000')
    .option('--speed <n>', 'Playback speed multiplier', '1.0')
    .option('--loop', 'Loop playback indefinitely')
    .action(async (file: string, opts: { url: string; speed: string; loop: boolean }) => {
      const filePath = path.resolve(file);

      if (!fs.existsSync(filePath)) {
        console.error('Error: File not found: ' + filePath);
        process.exit(1);
      }

      const trajectory: Trajectory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const speed = parseFloat(opts.speed);

      if (trajectory.frames.length === 0) {
        console.error('Error: Trajectory has no frames');
        process.exit(1);
      }

      console.log(
        `roboviz play: "${trajectory.robotName}" — ${trajectory.frameCount} frames, ${trajectory.duration.toFixed(2)}s`
      );
      if (speed !== 1.0) console.log(`  speed: ${speed}x`);
      if (opts.loop) console.log('  loop: on');

      const socket = io(opts.url);

      await new Promise<void>((resolve) => {
        socket.once('connect', resolve);
        socket.once('connect_error', () => {
          console.error('Error: Cannot connect to ' + opts.url);
          process.exit(1);
        });
      });

      console.log('Connected. Playing...\n');

      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

      const playOnce = async (): Promise<void> => {
        const startReal = Date.now();

        for (let i = 0; i < trajectory.frames.length; i++) {
          const frame = trajectory.frames[i];
          const targetMs = (frame.t / speed) * 1000;
          const elapsed = Date.now() - startReal;
          const delay = targetMs - elapsed;

          if (delay > 1) await sleep(delay);

          const payload: { t: number; qpos?: number[]; joints?: Record<string, number> } = { t: frame.t };
          if (frame.qpos) payload.qpos = frame.qpos;
          if (frame.joints) payload.joints = frame.joints;
          socket.emit('joint_state', payload);

          if (i % 100 === 0 || i === trajectory.frames.length - 1) {
            const pct = (((i + 1) / trajectory.frames.length) * 100).toFixed(0);
            process.stdout.write(`\r  ${pct}% (${frame.t.toFixed(2)}s / ${trajectory.duration.toFixed(2)}s)`);
          }
        }
        process.stdout.write('\n');
      };

      process.on('SIGINT', () => {
        console.log('\nPlayback stopped.');
        socket.disconnect();
        process.exit(0);
      });

      do {
        await playOnce();
        if (opts.loop) console.log('Looping...');
      } while (opts.loop);

      console.log('Playback complete.');
      socket.disconnect();
      process.exit(0);
    });
}
