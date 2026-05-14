from otel_eval_bridge.manifest import attach_results, build_manifest


def test_manifest_and_result_attachment():
    cases = [{"trace_id": "t1", "span_id": "s1"}]
    assert build_manifest(cases)["case_count"] == 1
    attached = attach_results(cases, {"t1": {"passed": True}})
    assert attached[0]["eval_result"]["passed"] is True

