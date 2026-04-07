#!/usr/bin/env node

import { Command } from 'commander';
import { registerParseCommand } from '../dist/cli/parse.js';
import { registerServeCommand } from '../dist/cli/serve.js';
import { registerBuildCommand } from '../dist/cli/build.js';

const program = new Command();
program
  .name('roboviz')
  .description('Robot description file visualizer')
  .version('0.1.0');

registerParseCommand(program);
registerServeCommand(program);
registerBuildCommand(program);

program.parse();
