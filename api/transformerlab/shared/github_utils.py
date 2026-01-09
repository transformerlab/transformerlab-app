"""GitHub utility functions for reading PAT and working with GitHub repositories."""

import base64
import json
import uuid
from typing import Optional, Tuple
from fastapi import HTTPException


import httpx
from lab import storage
from lab.dirs import get_workspace_dir


def read_github_pat_from_workspace(workspace_dir: str) -> Optional[str]:
    """Read GitHub PAT from workspace/github_pat.txt file.

    Args:
        workspace_dir: Path to the workspace directory

    Returns:
        GitHub PAT string if found, None otherwise
    """
    try:
        pat_path = storage.join(workspace_dir, "github_pat.txt")
        if storage.exists(pat_path):
            with storage.open(pat_path, "r") as f:
                pat = f.read().strip()
                if pat:
                    return pat
    except Exception as e:
        print(f"Error reading GitHub PAT from workspace: {e}")
    return None


def generate_github_clone_setup(
    repo_url: str,
    directory: Optional[str] = None,
    github_pat: Optional[str] = None,
) -> str:
    """
    Generate bash script to clone a GitHub repository.
    Supports both public and private repos (with PAT).
    Supports cloning entire repo or specific directory (sparse checkout).

    Args:
        repo_url: GitHub repository URL (e.g., https://github.com/owner/repo.git)
        directory: Optional subdirectory within the repo to clone
        github_pat: Optional GitHub Personal Access Token for private repos

    Returns:
        Bash script string that can be executed to clone the repository
    """
    clone_dir = f"~/tmp/git-clone-{uuid.uuid4().hex[:8]}"

    if github_pat:
        if repo_url.startswith("https://github.com/"):
            repo_url_with_auth = repo_url.replace("https://github.com/", f"https://{github_pat}@github.com/")
        elif repo_url.startswith("https://"):
            repo_url_with_auth = repo_url.replace("https://", f"https://{github_pat}@")
        else:
            repo_url_with_auth = repo_url
    else:
        repo_url_with_auth = repo_url

    def escape_bash(s: str) -> str:
        return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")

    escaped_directory = escape_bash(directory) if directory else None

    if directory:
        setup_script = (
            f"TEMP_CLONE_DIR={clone_dir}; "
            f"CURRENT_DIR=$HOME; "
            f"mkdir -p $TEMP_CLONE_DIR; "
            f"cd $TEMP_CLONE_DIR; "
            f"git init; "
            f"git remote add origin {repo_url_with_auth}; "
            f"git config core.sparseCheckout true; "
            f"echo '{escaped_directory}/' > .git/info/sparse-checkout; "
            f"git pull origin main || git pull origin master || git pull origin HEAD; "
            f"if [ -d '{escaped_directory}' ]; then cp -r {escaped_directory} $CURRENT_DIR/; cd $CURRENT_DIR; rm -rf $TEMP_CLONE_DIR; else echo 'Warning: Directory {escaped_directory} not found in repository'; cd $CURRENT_DIR; rm -rf $TEMP_CLONE_DIR; fi"
        )
    else:
        setup_script = f"git clone {repo_url_with_auth} {clone_dir}; cp -r {clone_dir}/* .; rm -rf {clone_dir}"

    return setup_script


async def _fetch_task_json_impl(
    repo_url: str, directory: Optional[str] = None, ref: Optional[str] = None, raise_on_error: bool = False
) -> Tuple[Optional[dict], Optional[str], Optional[str], Optional[str]]:
    """
    Internal implementation to fetch task.json from a GitHub repository.

    Args:
        repo_url: GitHub repository URL
        directory: Optional subdirectory path where task.json is located
        ref: Optional branch, tag, or commit SHA to fetch from
        raise_on_error: If True, raises HTTPException on errors instead of returning None

    Returns:
        Tuple of (task_json_dict, owner, repo, file_path) or (None, None, None, None) on error.
        If raise_on_error is True, raises HTTPException instead of returning None.
    """
    # Extract owner and repo from URL
    repo_url_clean = repo_url.replace(".git", "").strip()
    if not repo_url_clean.startswith("https://github.com/"):
        if raise_on_error:
            raise HTTPException(
                status_code=400,
                detail="Invalid GitHub repository URL. Must start with https://github.com/",
            )
        return None, None, None, None

    # Extract owner/repo from URL (e.g., https://github.com/owner/repo -> owner/repo)
    parts = repo_url_clean.replace("https://github.com/", "").split("/")
    if len(parts) < 2:
        if raise_on_error:
            raise HTTPException(
                status_code=400,
                detail="Invalid GitHub repository URL format",
            )
        return None, None, None, None

    owner = parts[0]
    repo = parts[1]

    # Build file path
    file_path = f"{directory}/task.json" if directory else "task.json"
    # Normalize path (remove leading/trailing slashes)
    file_path = file_path.strip("/")

    # Get GitHub PAT from workspace
    workspace_dir = get_workspace_dir()
    github_pat = read_github_pat_from_workspace(workspace_dir)

    # Build GitHub API URL with optional ref parameter
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"
    if ref:
        api_url = f"{api_url}?ref={ref}"

    # Prepare headers
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "TransformerLab",
    }

    # Add authentication if PAT is available
    if github_pat:
        headers["Authorization"] = f"token {github_pat}"

    try:
        # Fetch file from GitHub API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(api_url, headers=headers)

            if response.status_code == 404:
                if raise_on_error:
                    raise HTTPException(
                        status_code=404,
                        detail=f"task.json not found at {file_path} in repository {owner}/{repo}",
                    )
                return None, owner, repo, file_path

            if response.status_code == 403:
                if raise_on_error:
                    if github_pat:
                        raise HTTPException(
                            status_code=403,
                            detail="Access denied. Please check your GitHub PAT permissions.",
                        )
                    else:
                        raise HTTPException(
                            status_code=403,
                            detail="Repository is private. Please configure a GitHub PAT in team settings.",
                        )
                return None, owner, repo, file_path

            if response.status_code != 200:
                if raise_on_error:
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Failed to fetch task.json: {response.text}",
                    )
                return None, owner, repo, file_path

            # Parse response
            file_data = response.json()

            # GitHub API returns base64-encoded content
            if "content" not in file_data:
                if raise_on_error:
                    raise HTTPException(
                        status_code=500,
                        detail="GitHub API response missing content field",
                    )
                return None, owner, repo, file_path

            # Decode base64 content
            try:
                content = base64.b64decode(file_data["content"]).decode("utf-8")
            except Exception as e:
                if raise_on_error:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to decode file content: {str(e)}",
                    )
                return None, owner, repo, file_path

            # Parse JSON
            try:
                task_json = json.loads(content)
                return task_json, owner, repo, file_path
            except json.JSONDecodeError as e:
                if raise_on_error:
                    raise HTTPException(
                        status_code=400,
                        detail=f"task.json is not valid JSON: {str(e)}",
                    )
                return None, owner, repo, file_path

    except httpx.TimeoutException:
        if raise_on_error:
            raise HTTPException(
                status_code=504,
                detail="Request to GitHub API timed out",
            )
        return None, owner, repo, file_path
    except httpx.RequestError as e:
        if raise_on_error:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to connect to GitHub API: {str(e)}",
            )
        return None, owner, repo, file_path
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        if raise_on_error:
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected error fetching task.json: {str(e)}",
            )
        return None, owner, repo, file_path


async def fetch_task_json_from_github_helper(
    repo_url: str, directory: Optional[str] = None, ref: Optional[str] = None
) -> Optional[dict]:
    """
    Helper function to fetch task.json from a GitHub repository.

    Args:
        repo_url: GitHub repository URL
        directory: Optional subdirectory path where task.json is located
        ref: Optional branch, tag, or commit SHA to fetch from

    Returns:
        The parsed JSON as a dict, or None if not found or if an error occurs.
        This is a non-raising version for use in import functions.
    """
    task_json, _, _, _ = await _fetch_task_json_impl(repo_url, directory, ref=ref, raise_on_error=False)
    return task_json


async def fetch_task_json_from_github(
    repo_url: str, directory: Optional[str] = None, ref: Optional[str] = None
) -> dict:
    """
    Fetch task.json from a GitHub repository, raising HTTPException on errors.

    This version is for use in API endpoints that need to return detailed error messages.

    Args:
        repo_url: GitHub repository URL
        directory: Optional subdirectory path where task.json is located
        ref: Optional branch, tag, or commit SHA to fetch from

    Returns:
        The parsed task.json as a dict

    Raises:
        HTTPException: On any error (404, 403, 500, etc.)
    """
    task_json, owner, repo, file_path = await _fetch_task_json_impl(repo_url, directory, ref=ref, raise_on_error=True)
    if task_json is None:
        # This shouldn't happen if raise_on_error=True, but just in case
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch task.json from {owner}/{repo}",
        )
    return task_json
