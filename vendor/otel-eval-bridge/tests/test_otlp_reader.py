from otel_eval_bridge.eval_case import span_to_eval_case
from otel_eval_bridge.otlp_reader import load_spans


def test_otlp_reader_loads_spans_and_redacts():
    spans = load_spans("examples/genai_trace.json")
    case = span_to_eval_case(spans[0])
    assert case["trace_id"] == "trace-1"
    assert "[EMAIL]" in case["input"]
    assert "[SECRET]" in case["input"]

