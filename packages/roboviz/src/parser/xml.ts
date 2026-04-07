import { XMLParser } from 'fast-xml-parser';

// Elements that can repeat as siblings in MJCF or URDF.
// Without isArray, fast-xml-parser returns single elements as objects
// and multiple siblings as arrays — a silent type inconsistency bug.
const ALWAYS_ARRAY_ELEMENTS = new Set([
  // MJCF
  'body', 'geom', 'joint', 'site', 'light', 'camera',
  'mesh', 'material', 'texture', 'default',
  // URDF
  'link', 'visual', 'collision', 'joint',
]);

export function createXMLParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    isArray: (name: string) => ALWAYS_ARRAY_ELEMENTS.has(name),
  });
}
