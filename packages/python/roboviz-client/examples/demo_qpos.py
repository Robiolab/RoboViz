#!/usr/bin/env python3
"""Demo: stream sinusoidal qpos values to roboviz (MuJoCo-style indexed array).

Usage:
    1. Start roboviz server: npx roboviz serve path/to/robot.xml
    2. Run this script: python examples/demo_qpos.py

The script sends a qpos array where each joint oscillates as a sine wave
at a slightly different frequency, producing visible motion in the browser.
"""

import math
import time
import sys

from roboviz_client import RobovizClient


def main() -> None:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    num_joints = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    hz = 60.0

    print(f"Connecting to {url} with {num_joints} qpos values at {hz}Hz...")

    with RobovizClient(url, max_hz=hz) as client:
        t0 = time.monotonic()
        print("Streaming. Press Ctrl+C to stop.")
        try:
            while True:
                t = time.monotonic() - t0
                # Each joint oscillates at a different frequency
                qpos = [math.sin(t * (1.0 + 0.3 * i)) * 0.5 for i in range(num_joints)]
                client.send_qpos(qpos, t=t)
                time.sleep(1.0 / hz)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
