"""Fetch and locate the medieval-mss corpus."""
import subprocess
import tarfile
from pathlib import Path

TARBALL_URL = "https://codeload.github.com/bodleian/medieval-mss/tar.gz/refs/heads/master"


def record_files(root: Path) -> list[Path]:
    """Every TEI record file. Excludes schemas (.rng) and the root authority files."""
    return sorted(p for p in (root / "collections").rglob("*.xml") if p.is_file())


def corpus_root(cache_dir: Path) -> Path:
    """Download and extract the corpus if absent. Returns the extracted directory."""
    root = cache_dir / "medieval-mss-master"
    if root.is_dir():
        return root
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive = cache_dir / "medieval-mss.tar.gz"
    if not archive.exists():
        subprocess.run(["curl", "-sSL", "-o", str(archive), TARBALL_URL], check=True)
    with tarfile.open(archive) as tf:
        tf.extractall(cache_dir, filter="data")
    return root
