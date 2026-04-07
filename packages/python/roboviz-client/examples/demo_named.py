#!/usr/bin/env python3
"""Demo: stream sinusoidal named joint values to roboviz (URDF/ROS2-style).

Usage:
    1. Start roboviz server: npx roboviz serve path/to/robot.urdf
    2. Run this script: python examples/demo_named.py joint1 joint2 joint3

Joint names must match those in the robot model. If no names are provided,
defaults to 'joint1' through 'joint4'.
"""

import math
import time
import sys

from roboviz_client import RobovizClient


def main() -> None:
    url = "http://localhost:3000"
    joint_names = sys.argv[1:] if len(sys.argv) > 1 else ["joint1", "joint2", "joint3", "joint4"]
    hz = 60.0

    print(f"Connecting to {url} with joints: {joint_names} at {hz}Hz...")

    with RobovizClient(url, max_hz=hz) as client:
        t0 = time.monotonic()
        print("Streaming. Press Ctrl+C to stop.")
        try:
            while True:
                t = time.monotonic() - t0
                joints = {
                    name: math.sin(t * (1.0 + 0.3 * i)) * 0.5
                    for i, name in enumerate(joint_names)
                }
                client.send_joints(joints, t=t)
                time.sleep(1.0 / hz)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
