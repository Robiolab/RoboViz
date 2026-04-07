import { XMLParser } from 'fast-xml-parser';
import { parseMjcf } from './mjcf.js';
import { parseUrdf } from './urdf.js';
import type { RobotModel } from './types.js';

export type RobotFormat = 'mjcf' | 'urdf';

export function detectFormat(xmlContent: string): RobotFormat {
  // Lightweight peek parse — ignoreAttributes to avoid attribute overhead
  const peekParser = new XMLParser({ ignoreAttributes: true });
  const parsed = peekParser.parse(xmlContent) as Record<string, unknown>;

  if ('mujoco' in parsed) return 'mjcf';
  if ('robot' in parsed) return 'urdf';

  const keys = Object.keys(parsed).filter(k => k !== '?xml');
  throw new Error(
    `Unknown robot description format. Expected root element <mujoco> (MJCF) or <robot> (URDF), ` +
    `but found: <${keys[0] ?? 'empty'}>. ` +
    `Supported formats: MJCF (.xml) and URDF (.urdf)`
  );
}

export interface ParseOptions {
  meshDir?: string;
}

export function parseRobotFile(xmlContent: string, options?: ParseOptions): RobotModel {
  const format = detectFormat(xmlContent);
  if (format === 'mjcf') {
    return parseMjcf(xmlContent);
  } else {
    return parseUrdf(xmlContent, { meshDir: options?.meshDir });
  }
}
