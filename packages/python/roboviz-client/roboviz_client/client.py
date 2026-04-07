"""RobovizClient — Socket.IO client for streaming joint state to roboviz server."""

import time
from typing import Dict, List, Optional

import socketio


class RobovizClient:
    """Stream joint state to a running roboviz server.

    Usage (MuJoCo qpos array):
        with RobovizClient('http://localhost:3000') as client:
            client.send_qpos([0.1, 0.2, 0.3, ...])

    Usage (URDF named joints):
        with RobovizClient('http://localhost:3000') as client:
            client.send_joints({'shoulder': 0.5, 'elbow': -0.3})
    """

    def __init__(self, url: str = "http://localhost:3000", max_hz: float = 60.0) -> None:
        self._sio = socketio.SimpleClient()
        self._min_interval = 1.0 / max_hz if max_hz > 0 else 0.0
        self._last_emit: float = 0.0
        self._sio.connect(url, transports=["websocket"])

    def send_qpos(self, qpos: List[float], t: Optional[float] = None) -> None:
        """Emit indexed joint state (MuJoCo qpos array style).

        STRM-10: The qpos array should match the robot's qposMap ordering.
        For MuJoCo, pass sim.data.qpos directly (as a list).
        Rate-limited: calls exceeding max_hz are silently dropped (not queued).

        Args:
            qpos: Joint position array matching the robot's qposMap.
            t: Optional timestamp. Defaults to time.monotonic().
        """
        now = time.monotonic()
        if now - self._last_emit < self._min_interval:
            return  # STRM-12: rate limit — drop, don't queue
        self._sio.emit("joint_state", {"t": t if t is not None else now, "qpos": list(qpos)})
        self._last_emit = now

    def send_joints(self, joints: Dict[str, float], t: Optional[float] = None) -> None:
        """Emit named joint state (ROS2 / URDF style).

        STRM-11: Joint names must match the robot's jointIndex keys.
        Rate-limited: calls exceeding max_hz are silently dropped (not queued).

        Args:
            joints: Dict mapping joint name to position value (radians for revolute, meters for prismatic).
            t: Optional timestamp. Defaults to time.monotonic().
        """
        now = time.monotonic()
        if now - self._last_emit < self._min_interval:
            return  # STRM-12: rate limit — drop, don't queue
        self._sio.emit("joint_state", {"t": t if t is not None else now, "joints": dict(joints)})
        self._last_emit = now

    def disconnect(self) -> None:
        """Disconnect from the roboviz server."""
        self._sio.disconnect()

    def __enter__(self) -> "RobovizClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.disconnect()
