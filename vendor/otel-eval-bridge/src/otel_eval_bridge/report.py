from __future__ import annotations


def summary(cases: list[dict]) -> str:
    providers = sorted({case.get("metadata", {}).get("provider") for case in cases if case.get("metadata", {}).get("provider")})
    return f"Extracted {len(cases)} eval cases from traces. Providers: {', '.join(providers) or 'unknown'}."

