# roboviz

Visualize any robot description file in your browser with one command. Supports MuJoCo MJCF and ROS2 URDF formats with real-time joint state streaming.

```
npx roboviz serve robot.xml
```

This parses the file, launches a local server, and opens a Three.js visualization with OrbitControls, lighting, and a ground plane. Stream joint updates from Python and watch the robot move in real time.

## Install

### CLI and viewer

```bash
# Linux / macOS
./install.sh

# Windows (PowerShell)
.\install.ps1
```

This builds and packs a `.tgz` in `packages/roboviz/`. Then run via `npx`:

```bash
npx ./packages/roboviz/roboviz-0.1.0.tgz serve robot.xml
```

### Python streaming client

```bash
cd packages/python/roboviz-client
pip install -e .
```

### ROS2 bridge (optional, requires ROS2 install)

```bash
cd packages/python/roboviz-ros2
pip install -e .
```

## Usage

### Visualize a robot

```bash
# MJCF (MuJoCo)
npx ./packages/roboviz/roboviz-0.1.0.tgz serve ant.xml

# URDF (ROS2)
npx ./packages/roboviz/roboviz-0.1.0.tgz serve robot.urdf --mesh-dir ./meshes

# Options
npx ./packages/roboviz/roboviz-0.1.0.tgz serve robot.xml --port 8080 --no-open
```

### Stream joint states from Python

```python
from roboviz_client import RobovizClient

# MuJoCo (indexed qpos array)
with RobovizClient("http://localhost:3000") as client:
    for step in simulation:
        client.send_qpos(sim.data.qpos.tolist())

# URDF / ROS2 (named joints)
with RobovizClient("http://localhost:3000") as client:
    client.send_joints({"shoulder": 0.5, "elbow": -0.3})
```

The client rate-limits to 60 Hz by default. Excess calls are dropped (not queued) so the browser always shows the latest state.

### ROS2 bridge

```bash
# Forward /joint_states to roboviz
python -m roboviz_ros2.bridge --topic /joint_states --url http://localhost:3000
```

### Parse to JSON

```bash
node packages/roboviz/bin/roboviz.js parse robot.xml
node packages/roboviz/bin/roboviz.js parse robot.urdf --mesh-dir ./meshes
```

### Static HTML export

```bash
node packages/roboviz/bin/roboviz.js build robot.xml -o dist/
```

Generates a self-contained `index.html` with the robot model embedded. No server required to view.

## Supported formats

| Feature | MJCF | URDF |
|---------|------|------|
| Primitives (box, sphere, cylinder, capsule, ellipsoid) | Yes | Yes |
| Mesh geometry (STL, OBJ, DAE, GLTF) | Yes | Yes |
| Materials / colors | Yes | Yes |
| Joint types | hinge, slide, ball, free, fixed | revolute, prismatic, continuous, floating, fixed |
| `<compiler>` settings (angle, euler, meshdir) | Yes | N/A |
| `<default>` class inheritance | Yes | N/A |
| `package://` mesh paths | N/A | Yes (via `--mesh-dir`) |
| Format auto-detection | Yes | Yes |

## Browser features

- Three.js rendering with OrbitControls (rotate, pan, zoom)
- Ambient + directional lighting with ground plane
- Joint label overlays (CSS2D)
- FPS and update rate HUD
- Connection status indicator (connected / disconnected / reconnecting)
- Latest-state buffer decouples sim rate from render rate

## Packages

| Package | Registry | Description |
|---------|----------|-------------|
| `roboviz` | npm | CLI, parser, server, and browser client |
| `roboviz-client` | PyPI | Python client for streaming joint states |
| `roboviz-ros2` | PyPI | Optional ROS2 bridge adapter |

## License

MIT
