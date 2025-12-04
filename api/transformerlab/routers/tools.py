import json
import os
import subprocess
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import transformerlab.db.db as db

# MCP client imports
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
except ImportError:
    ClientSession = None
    StdioServerParameters = None
    stdio_client = None

router = APIRouter(prefix="/tools", tags=["tools"])


#############################
# TOOLS API ENDPOINTS
#############################


@router.get("/list", summary="List the MCP tools that are currently available.")
async def list_tools(
    mcp_server_file: str = Query(None, description="MCP server file to include MCP tools"),
    mcp_args: Optional[str] = Query(None, description="Comma-separated args for MCP server"),
    mcp_env: Optional[str] = Query(None, description="JSON string for MCP server env"),
) -> list[object]:
    tool_descriptions = []

    if mcp_server_file:
        args = mcp_args.split(",") if mcp_args and len(mcp_args) > 1 else None
        base_env = os.environ.copy()
        override_env = json.loads(mcp_env) if mcp_env else {}
        env = {**base_env, **override_env}
        mcp_tools = await mcp_list_tools(mcp_server_file, args=args, env=env)
        mcp_tools = mcp_tools.tools

        # If MCP returns a list of dicts of Tool objects, convert them to dicts
        if isinstance(mcp_tools, list):
            for tool in mcp_tools:
                if not isinstance(tool, dict):
                    tool_descriptions.append(tool.model_dump())
                else:
                    tool_descriptions.append(tool)
        elif isinstance(mcp_tools, dict) and mcp_tools.get("status") == "error":
            tool_descriptions.append({"name": "MCP_ERROR", "description": mcp_tools.get("message")})

    return tool_descriptions


@router.get("/all", summary="Returns all available MCP tools in OpenAI format for completions API")
async def get_all_tools(x_team_id: str | None = Header(None, alias="X-Team-Id")):
    """Returns all available MCP tools converted to OpenAI format for completions API"""
    try:
        tool_descriptions = []

        # Get MCP server config directly from database (team-specific)
        mcp_config = None
        try:
            config_text = await db.config_get(key="MCP_SERVER", team_id=x_team_id)
            if config_text:
                mcp_config = json.loads(config_text)
        except Exception:
            return {"status": "error", "message": "Failed to get MCP configuration"}

        # Add MCP tools if configured
        if mcp_config and mcp_config.get("serverName"):
            try:
                args = mcp_config.get("args", "").split(",") if mcp_config.get("args") else None
                base_env = os.environ.copy()
                override_env = json.loads(mcp_config.get("env", "{}")) if mcp_config.get("env") else {}
                env = {**base_env, **override_env}

                mcp_tools = await mcp_list_tools(mcp_config["serverName"], args=args, env=env)
                mcp_tools = mcp_tools.tools

                # Convert MCP tools to OpenAI format
                if isinstance(mcp_tools, list):
                    for tool in mcp_tools:
                        # Get tool data as dict
                        if not isinstance(tool, dict):
                            tool_data = tool.model_dump()
                        else:
                            tool_data = tool

                        # Convert MCP format to OpenAI format
                        # MCP: {"name": "...", "description": "...", "inputSchema": {...}}
                        # OpenAI: {"type": "function", "function": {"name": "...", "description": "...", "parameters": {...}}}
                        openai_tool = {
                            "type": "function",
                            "function": {
                                "name": tool_data.get("name", "unnamed"),
                                "description": tool_data.get("description", ""),
                                "parameters": tool_data.get("inputSchema", {}),
                            },
                        }
                        tool_descriptions.append(openai_tool)
            except Exception:
                return {"status": "error", "message": "Failed to connect to MCP server"}

        return tool_descriptions
    except Exception:
        return {"status": "error", "message": "An error occurred while loading tools"}


@router.get("/call/{tool_id}", summary="Executes an MCP tool with parameters supplied in JSON.")
async def call_tool(
    tool_id: str,
    params: str,
    mcp_server_file: str = Query(..., description="MCP server file to call MCP tool"),
    mcp_args: Optional[str] = Query(None, description="Comma-separated args for MCP server (if needed)"),
    mcp_env: Optional[str] = Query(None, description="JSON string for MCP server env (if needed)"),
):
    if not mcp_server_file:
        return {"status": "error", "message": "MCP server file is required."}

    args = mcp_args.split(",") if mcp_args and len(mcp_args) > 1 else None
    base_env = os.environ.copy()
    override_env = json.loads(mcp_env) if mcp_env else {}
    env = {**base_env, **override_env}

    try:
        function_args = json.loads(params)
    except Exception:
        return {"status": "error", "message": "Invalid parameters provided."}

    try:
        result = await mcp_call_tool(mcp_server_file, tool_id, arguments=function_args, args=args, env=env)
        final_result = ""
        for content in result.content:
            content = content.model_dump()
            if isinstance(content, dict) and content.get("type") == "text":
                final_result += f"\n {content.get('text')}"
            elif isinstance(content, dict) and content.get("type") == "json":
                final_result += f"\n {str(content.get('json'))}"

        return {"status": "success", "data": final_result}
    except Exception as e:
        err_string = f"{type(e).__name__}: {e}"
        print(err_string)
        return {"status": "error", "message": "An internal error has occurred."}


class MCPServerParams(BaseModel):
    server_file: str
    args: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None


class MCPCallParams(MCPServerParams):
    arguments: Optional[Dict[str, Any]] = None


def _get_stdio_server_params(server_file: str, args=None, env=None):
    # If server_file ends with .py, treat as file; else as module
    if server_file.endswith(".py"):
        cmd_args = [server_file] + (args or [])
    else:
        cmd_args = ["-m", server_file] + (args or [])
    # Always use 'python' and pass os.environ.copy() as env
    return StdioServerParameters(
        command="python",
        args=cmd_args,
        env=os.environ.copy(),
    )


async def mcp_list_tools(server_file: str, args=None, env=None):
    if not (ClientSession and StdioServerParameters and stdio_client):
        return {"status": "error", "message": "MCP client not installed."}
    params = _get_stdio_server_params(server_file, args=args, env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await session.list_tools()


async def mcp_call_tool(server_file: str, tool_id: str, arguments=None, args=None, env=None):
    if not (ClientSession and StdioServerParameters and stdio_client):
        return {"status": "error", "message": "MCP client not installed."}
    params = _get_stdio_server_params(server_file, args=args, env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await session.call_tool(tool_id, arguments=arguments or {})


@router.get("/install_mcp_server", summary="Install or check MCP server module or script.")
async def install_mcp_server(server_name: str = Query(..., description="Module name or full path to .py file")):
    env = os.environ.copy()
    # If it's a .py file, treat as a full file path and check if it exists
    if server_name.endswith(".py"):
        safe_root = os.path.expanduser("~")
        server_name = os.path.abspath(os.path.normpath(server_name))
        # Check if the file is within the user's home directory and prevent symbolic link attacks
        if not os.path.commonpath([server_name, safe_root]) == safe_root or not server_name.startswith(
            safe_root + os.sep
        ):
            print(f"Access to external files is forbidden: {server_name}")
            return JSONResponse(
                status_code=403,
                content={"status": "error", "message": "Access to external files is forbidden."},
            )

        server_name = os.path.abspath(os.path.normpath(server_name))
        if os.path.islink(server_name) or not os.path.isfile(server_name):
            return {"status": "success", "message": f"File '{server_name}' exists."}
        else:
            print(f"File '{server_name}' does not exist.")
            return JSONResponse(
                status_code=404, content={"status": "error", "message": f"File '{server_name}' not found."}
            )
    # Otherwise, try to pip install the module using uv pip
    try:
        result = subprocess.run(
            ["uv", "pip", "install", server_name],
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        if result.returncode == 0:
            print(f"Successfully installed '{server_name}'.")
            return {"status": "success", "message": f"Successfully installed '{server_name}'.", "output": result.stdout}
        else:
            print(f"Failed to install '{server_name}': {result.stderr}")
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": f"Failed to install '{server_name}'.", "output": result.stderr},
            )
    except Exception as e:
        print(f"An error occurred while installing '{server_name}': {e}")
        return JSONResponse(
            status_code=500, content={"status": "error", "message": "An internal error occurred during installation"}
        )
