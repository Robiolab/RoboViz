#!/usr/bin/env python3
"""roboviz ROS2 bridge: subscribe to /joint_states and forward to roboviz."""
import argparse
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from roboviz_client import RobovizClient


class RobovizBridgeNode(Node):
    def __init__(self, topic: str, url: str) -> None:
        super().__init__('roboviz_bridge')
        # RobovizClient connects in __init__ — no separate connect() call needed
        self._client = RobovizClient(url)
        self.get_logger().info(
            f'roboviz bridge: subscribing to {topic}, forwarding to {url}'
        )
        self.create_subscription(JointState, topic, self._cb, 10)

    def _cb(self, msg: JointState) -> None:
        joints = dict(zip(msg.name, msg.position))
        self._client.send_joints(joints)

    def destroy_node(self) -> None:
        self._client.disconnect()
        super().destroy_node()


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Forward ROS2 /joint_states to roboviz server'
    )
    parser.add_argument('--topic', default='/joint_states',
                        help='ROS2 topic to subscribe to (default: /joint_states)')
    parser.add_argument('--url', default='http://localhost:3000',
                        help='roboviz server URL (default: http://localhost:3000)')
    args = parser.parse_args()

    rclpy.init()
    node = RobovizBridgeNode(args.topic, args.url)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
