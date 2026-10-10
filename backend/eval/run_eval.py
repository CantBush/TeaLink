"""Offline eval entry point. The comparison itself is a later phase."""

from __future__ import annotations

import argparse


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare the agent team to a popularity baseline")
    parser.add_argument("--split", default="heldout")
    parser.parse_args(argv)
    print("not implemented")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
