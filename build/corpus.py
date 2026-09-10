"""Fetch and locate the medieval-mss corpus."""
import subprocess
import tarfile
from pathlib import Path

TARBALL_URL = "https://codeload.github.com/bodleian/medieval-mss/tar.gz/refs/heads/master"
DIRNAME = "medieval-mss-master"

# A corpus is only usable if the authority files are there; everything the build
# does depends on them.
REQUIRED = ("places.xml", "works.xml")


def record_files(root: Path) -> list[Path]:
    """Every TEI record file. Excludes schemas (.rng) and the root authority files."""
    return sorted(p for p in (root / "collections").rglob("*.xml") if p.is_file())


def is_complete(root: Path) -> bool:
    """Whether an extracted corpus can actually be built from.

    Checked rather than assumed: a directory can survive while its contents do
    not, and failing here is far cheaper than failing inside an XML parse.
    """
    return root.is_dir() and (root / "collections").is_dir() and all(
        (root / name).is_file() for name in REQUIRED)


def _download(cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive = cache_dir / "medieval-mss.tar.gz"
    if not archive.exists():
        subprocess.run(["curl", "-sSL", "-o", str(archive), TARBALL_URL], check=True)
    with tarfile.open(archive) as tf:
        tf.extractall(cache_dir, filter="data")


def corpus_root(cache_dir: Path) -> Path:
    """The extracted corpus, fetching it first if it is absent or incomplete."""
    root = cache_dir / DIRNAME
    if not is_complete(root):
        _download(cache_dir)
    return root
