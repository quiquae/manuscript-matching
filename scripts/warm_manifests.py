"""Populate the manifest cache. Slow and network-bound; run once, then builds are instant."""
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from build.corpus import corpus_root, record_files          # noqa: E402
from build.manifests import image_service                   # noqa: E402
from build.places import load_places                        # noqa: E402
from build.records import extract, playable                 # noqa: E402
from build.works import load_subjects                       # noqa: E402

CACHE = Path("data/cache")
WORKERS = 6          # polite concurrency against a server that is already flaky


def main() -> None:
    root = corpus_root(CACHE)
    places, subjects = load_places(root), load_subjects(root)
    records = [r for f in record_files(root) for r in extract(f, places, subjects)]
    todo = [r for r in records if playable(r)]
    print(f"{len(todo)} manifests to resolve", flush=True)

    started = time.time()
    done = failed = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(image_service, r.db_uuid, CACHE / "manifests"): r for r in todo}
        for future in as_completed(futures):
            done += 1
            try:
                if future.result() is None:
                    failed += 1
            except Exception:
                failed += 1
            if done % 100 == 0 or done == len(todo):
                rate = done / max(time.time() - started, 1)
                left = (len(todo) - done) / max(rate, 0.01)
                print(f"  {done}/{len(todo)}  failed {failed}  "
                      f"{rate:.1f}/s  ~{left / 60:.0f} min left", flush=True)
    print(f"done: {done - failed} resolved, {failed} failed, "
          f"{(time.time() - started) / 60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
