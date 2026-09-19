"""Run the evaluation suite from the command line.

Usage:  python -m scripts.run_eval            # retrieval + offline composer (fast, deterministic)
        python -m scripts.run_eval --llm      # include LLM generation (needs LLM_* settings in .env)
"""

from __future__ import annotations

import argparse
import logging

from backend.config import get_settings
from backend.container import build_services
from backend.evaluation.evaluator import run_evaluation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--llm", action="store_true", help="include LLM answer generation")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)

    report = run_evaluation(build_services(get_settings()), include_generation=args.llm)
    print(f"\nMode: {report['mode']}   Embedder: {report['embedder']['model']}\n")
    print(f"{'Case':7} {'Theme':30} {'Recall':>6} {'RR':>5} {'Assets ok':>9} {'Leak':>4} {'Abst':>5} {'ms':>6}")
    for row in report["cases"]:
        recall = "-" if row["recall"] is None else f"{row['recall']:.2f}"
        rr = "-" if row["reciprocal_rank"] is None else f"{row['reciprocal_rank']:.2f}"
        cross = "-" if row["cross_asset_ok"] is None else ("yes" if row["cross_asset_ok"] else "NO")
        leak = len(row["leaked_docs"]) + len(row["forbidden_hits"])
        print(f"{row['id']:7} {row['theme'][:30]:30} {recall:>6} {rr:>5} {cross:>9} {leak:>4} "
              f"{str(row['abstained'])[0]:>5} {row['latency_ms']:>6.0f}")
    print("\nSummary")
    for key, value in report["summary"].items():
        print(f"  {key:26} {value}")
    print(f"\nSaved to {get_settings().eval_report_path}")


if __name__ == "__main__":
    main()
