import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RobotModel } from '../parser/types.js';
import { serializeModel } from './robotToJSON.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createRobovizServer(model: RobotModel, port: number, meshDir?: string): void {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);

  const clientDir = path.join(__dirname, '../client');
  app.use(express.static(clientDir));

  if (meshDir) {
    app.use('/meshes', express.static(meshDir));
  }

  const serialized = serializeModel(model, meshDir);

  io.on('connection', (socket) => {
    socket.emit('init', serialized);
    socket.on('joint_state', (data: unknown) => {
      socket.broadcast.emit('joint_state', data);
    });
  });

  httpServer.listen(port, () => {
    console.log('roboviz: server running at http://localhost:' + port);
  });
}
