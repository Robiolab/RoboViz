import * as path from 'node:path';
import { RobotModel, Body, Geom } from '../parser/types.js';

function rewriteGeomMeshRef(geom: Geom): Geom {
  if (geom.type === 'mesh' && geom.meshRef) {
    return { ...geom, meshRef: '/meshes/' + path.basename(geom.meshRef) };
  }
  return geom;
}

function rewriteBodyMeshRefs(body: Body): Body {
  return {
    ...body,
    geoms: body.geoms.map((g) => rewriteGeomMeshRef(g)),
    children: body.children.map((c) => rewriteBodyMeshRefs(c)),
  };
}

export function serializeModel(model: RobotModel, meshDir?: string): object {
  const root = meshDir ? rewriteBodyMeshRefs(model.root) : model.root;
  return {
    ...model,
    root,
    jointIndex: Object.fromEntries(model.jointIndex),
  };
}
