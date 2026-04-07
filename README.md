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

### Record a session

Capture joint state streams to a file for later replay, sharing, or debugging.

```bash
# Terminal 1: start the server
roboviz serve robot.xml

# Terminal 2: start recording (captures all incoming joint states)
roboviz record -o demo.json

# Terminal 3: run your simulation
python my_simulation.py

# Press Ctrl+C in terminal 2 to stop and save
```

Options:
- `--url <url>` -- Server URL (default: `http://localhost:3000`)
- `-o, --out <file>` -- Output file path (default: `trajectory.json`)

The trajectory file stores timestamped frames in JSON:

```json
{
  "robotName": "humanoid",
  "format": "mjcf",
  "frameCount": 1500,
  "duration": 25.0,
  "frames": [
    { "t": 0.0, "qpos": [0.1, 0.2, 0.3] },
    { "t": 0.016, "qpos": [0.11, 0.21, 0.31] }
  ]
}
```

Frames can contain either `qpos` (MuJoCo indexed array) or `joints` (named joint dict).

### Replay a trajectory

```bash
roboviz play demo.json                # original speed
roboviz play demo.json --speed 2      # 2x fast-forward
roboviz play demo.json --speed 0.5    # half speed
roboviz play demo.json --loop         # loop forever
roboviz play demo.json --url http://host:3000
```

Options:
- `--url <url>` -- Server URL (default: `http://localhost:3000`)
- `--speed <n>` -- Playback speed multiplier (default: 1.0)
- `--loop` -- Loop playback indefinitely

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
- **Interactive joint sliders** -- collapsible control panel with a slider for every hinge and slide joint. Drag to set joint values in real time; sliders track incoming Python/ROS2 state and broadcast changes to other connected browsers. Great for model validation without writing any code.
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
