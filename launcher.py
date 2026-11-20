#!/usr/bin/env python3
"""LikeBox 桌面启动器：后台运行 Flask 服务并自动打开浏览器。"""

from __future__ import annotations

import logging
import os
import socket
import sys
import threading
import time
import webbrowser
from logging.handlers import RotatingFileHandler
from pathlib import Path


def runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


def show_error(message: str) -> None:
    if getattr(sys, "frozen", False):
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(0, message, "LikeBox", 0x10)
        except Exception:
            pass


def main() -> int:
    base = runtime_dir()
    data_dir = base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    handler = RotatingFileHandler(
        data_dir / "likebox.log",
        maxBytes=1_000_000,
        backupCount=2,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)

    try:
        import app

        if port_is_open(app.PORT):
            logging.info("LikeBox 已在运行，直接打开页面")
            if os.environ.get("LIKEBOX_NO_BROWSER") != "1":
                webbrowser.open(f"http://127.0.0.1:{app.PORT}/")
            return 0

        from waitress import serve

        server_errors: list[BaseException] = []

        def run_server() -> None:
            try:
                serve(
                    app.app,
                    host="0.0.0.0",
                    port=app.PORT,
                    threads=8,
                    ident="LikeBox",
                )
            except BaseException as exc:
                server_errors.append(exc)
                logging.exception("LikeBox 服务启动失败")

        server_thread = threading.Thread(
            target=run_server,
            name="LikeBoxServer",
            daemon=True,
        )
        server_thread.start()

        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if server_errors:
                break
            if port_is_open(app.PORT):
                break
            time.sleep(0.1)

        if server_errors:
            show_error(
                "LikeBox 启动失败。\n\n"
                f"日志位置：{data_dir / 'likebox.log'}\n"
                "请确认 8180 端口没有被其他程序占用。"
            )
            return 1

        if not port_is_open(app.PORT):
            show_error(
                "LikeBox 服务未能启动。\n\n"
                f"日志位置：{data_dir / 'likebox.log'}\n"
                "请确认 8180 端口没有被其他程序占用。"
            )
            return 1

        logging.info("LikeBox 启动：http://127.0.0.1:%s/", app.PORT)
        if os.environ.get("LIKEBOX_NO_BROWSER") != "1":
            threading.Timer(
                1.2, lambda: webbrowser.open(f"http://127.0.0.1:{app.PORT}/")
            ).start()

        if os.environ.get("LIKEBOX_NO_TRAY") == "1":
            server_thread.join()
            return 0

        from tray_icon import TrayIcon

        try:
            tray = TrayIcon(app.PORT)
            result = tray.run()
        except Exception:
            logging.exception("托盘启动失败")
            show_error(
                "LikeBox 托盘启动失败。\n\n"
                f"日志位置：{data_dir / 'likebox.log'}\n"
                "请确认 Windows 资源管理器正常后重新启动程序。"
            )
            logging.shutdown()
            os._exit(1)

        logging.shutdown()
        os._exit(result)
    except Exception:
        logging.exception("LikeBox 启动失败")
        show_error(
            "LikeBox 启动失败。\n\n"
            f"日志位置：{data_dir / 'likebox.log'}\n"
            "请确认 8180 端口没有被其他程序占用。"
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
