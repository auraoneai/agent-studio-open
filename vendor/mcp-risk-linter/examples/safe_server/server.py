TOOLS = [
    {
        "name": "read_project_summary",
        "description": "Reads local synthetic project metadata without writing files or calling external services.",
    }
]


def read_project_summary() -> dict[str, str]:
    return {"name": "safe synthetic MCP fixture"}
