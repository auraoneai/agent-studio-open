#!/usr/bin/env python3
"""Build and validate the Agent Studio Open CLI release distributions."""

from __future__ import annotations

import argparse
import email.parser
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_NAME = "auraone-agent-studio-open"
IMPORT_NAME = "agentstudio"
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:[-+][0-9A-Za-z.-]+)?$"
)


def run(*command: str) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def tagged_version() -> str | None:
    ref = os.environ.get("GITHUB_REF", "")
    prefix = "refs/tags/agent-studio-open-v"
    return ref.removeprefix(prefix) if ref.startswith(prefix) else None


def metadata_from_wheel(path: Path) -> email.message.Message:
    with zipfile.ZipFile(path) as archive:
        metadata_names = [
            name
            for name in archive.namelist()
            if name.endswith(".dist-info/METADATA")
        ]
        if len(metadata_names) != 1:
            raise ValueError("wheel must contain exactly one METADATA file")
        if not any(name.startswith(f"{IMPORT_NAME}/") for name in archive.namelist()):
            raise ValueError(f"wheel is missing the {IMPORT_NAME} package")
        return email.parser.Parser().parsestr(
            archive.read(metadata_names[0]).decode("utf-8", errors="strict")
        )


def metadata_from_sdist(path: Path) -> email.message.Message:
    with tarfile.open(path, "r:gz") as archive:
        names = archive.getnames()
        metadata_names = [
            name
            for name in names
            if name.count("/") == 1 and name.endswith("/PKG-INFO")
        ]
        if len(metadata_names) != 1:
            raise ValueError("source distribution must contain one top-level PKG-INFO")
        if not any(name.endswith("/README.md") for name in names):
            raise ValueError("source distribution is missing README.md")
        if not any(f"/src/{IMPORT_NAME}/cli.py" in name for name in names):
            raise ValueError(f"source distribution is missing {IMPORT_NAME}/cli.py")
        extracted = archive.extractfile(metadata_names[0])
        if extracted is None:
            raise ValueError("could not read source distribution PKG-INFO")
        return email.parser.Parser().parsestr(
            extracted.read().decode("utf-8", errors="strict")
        )


def validate_distributions(dist: Path, version: str) -> None:
    if not dist.is_dir():
        raise SystemExit(f"distribution directory does not exist: {dist}")
    run(sys.executable, "-m", "twine", "check", "--strict", *map(str, dist.iterdir()))

    wheels = sorted(dist.glob("*.whl"))
    sdists = sorted(dist.glob("*.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1:
        raise SystemExit("expected exactly one wheel and one source distribution")

    for metadata in (
        metadata_from_wheel(wheels[0]),
        metadata_from_sdist(sdists[0]),
    ):
        if (metadata["Name"], metadata["Version"]) != (PACKAGE_NAME, version):
            raise SystemExit(
                "distribution metadata mismatch: "
                f"Name={metadata['Name']}, Version={metadata['Version']}"
            )

    with tempfile.TemporaryDirectory(prefix="agentstudio-install-") as temp:
        venv = Path(temp) / "venv"
        run(sys.executable, "-m", "venv", str(venv))
        python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        executable = venv / (
            "Scripts/agentstudio.exe" if os.name == "nt" else "bin/agentstudio"
        )
        run(
            str(python),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            str(wheels[0]),
        )
        run(
            str(python),
            "-c",
            (
                "from importlib.metadata import distribution; "
                f"d=distribution('{PACKAGE_NAME}'); "
                f"assert d.version == '{version}'; "
                "assert any(e.name == 'agentstudio' and "
                "e.value == 'agentstudio.cli:main' for e in d.entry_points)"
            ),
        )
        run(str(executable), "--json", "self-test")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-version")
    parser.add_argument(
        "--dist",
        type=Path,
        help="validate these exact distributions instead of building temporary ones",
    )
    args = parser.parse_args()

    project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))[
        "project"
    ]
    version = project["version"]
    expected = args.expected_version or tagged_version()
    if not SEMVER.fullmatch(version):
        raise SystemExit(f"invalid semantic version: {version}")
    if expected and expected != version:
        raise SystemExit(
            f"release version mismatch: expected {expected}, package is {version}"
        )
    if project.get("scripts", {}).get("agentstudio") != "agentstudio.cli:main":
        raise SystemExit("pyproject.toml is missing the agentstudio console entry point")
    urls = project.get("urls", {})
    if urls.get("Repository") != "https://github.com/auraoneai/agent-studio-open.git":
        raise SystemExit("pyproject.toml has an incorrect Agent Studio repository URL")
    if urls.get("Issues") != "https://github.com/auraoneai/agent-studio-open/issues":
        raise SystemExit("pyproject.toml has an incorrect Agent Studio issue tracker URL")

    changelog = (ROOT.parent / "CHANGELOG.md").read_text(encoding="utf-8")
    if f"## {version} " not in changelog:
        raise SystemExit(f"CHANGELOG.md has no section for {version}")

    if args.dist is not None:
        validate_distributions(args.dist.resolve(), version)
    else:
        with tempfile.TemporaryDirectory(prefix="agentstudio-release-") as temp:
            dist = Path(temp) / "dist"
            run(sys.executable, "-m", "build", "--outdir", str(dist))
            validate_distributions(dist, version)

    print(f"release preflight passed for {PACKAGE_NAME} {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
