"""Real MCP SDK (FastMCP) stdio server used to drive Agent Studio's StdioTransport."""

from __future__ import annotations

from mcp.server.fastmcp import Context, FastMCP

app = FastMCP("sdk-fixture")


@app.tool()
async def echo(text: str, ctx: Context) -> str:
    """Echo text back, logging first so a notification precedes the response."""
    await ctx.info(f"echoing {len(text)} chars")
    return text


@app.tool()
def boom() -> str:
    """Always fails, to exercise tool-level errors."""
    raise ValueError("boom")


if __name__ == "__main__":
    app.run("stdio")
