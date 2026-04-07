#!/usr/bin/env node

import { Command } from 'commander';
import { registerParseCommand } from '../dist/cli/parse.js';
import { registerServeCommand } from '../dist/cli/serve.js';
import { registerBuildCommand } from '../dist/cli/build.js';
import { registerRecordCommand } from '../dist/cli/record.js';
import { registerPlayCommand } from '../dist/cli/play.js';

const program = new Command();
program
  .name('roboviz')
  .description('Robot description file visualizer')
  .version('0.1.0');

registerParseCommand(program);
registerServeCommand(program);
registerBuildCommand(program);
registerRecordCommand(program);
registerPlayCommand(program);

program.parse();
