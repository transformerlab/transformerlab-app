"""Router for managing SSH keys."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from typing import Optional

from transformerlab.routers.auth import get_user_and_team
from transformerlab.schemas.ssh_keys import SshKeyCreate, SshKeyUpdate, SshKeyResponse

router = APIRouter(prefix="/ssh-key", tags=["ssh-keys"])


@router.get("/", response_model=Optional[SshKeyResponse])
async def get_ssh_key(
    user_and_team=Depends(get_user_and_team),
):
    """
    Get the current SSH key for the organization.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    try:
        from transformerlab.services.ssh_key_service import get_ssh_key_info

        key_info = await get_ssh_key_info(team_id)
        return key_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get SSH key: {str(e)}")


@router.post("/", response_model=SshKeyResponse)
async def create_ssh_key(
    ssh_key_data: SshKeyCreate,
    user_and_team=Depends(get_user_and_team),
):
    """
    Create a new SSH key pair for the organization.
    This will replace any existing key.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    try:
        from transformerlab.services.ssh_key_service import create_ssh_key

        new_key = await create_ssh_key(team_id, ssh_key_data.name, user_id)
        return new_key
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create SSH key: {str(e)}")


@router.patch("/", response_model=SshKeyResponse)
async def update_ssh_key(
    ssh_key_data: SshKeyUpdate,
    user_and_team=Depends(get_user_and_team),
):
    """
    Update the SSH key name.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    try:
        from transformerlab.services.ssh_key_service import update_ssh_key

        updated_key = await update_ssh_key(team_id, ssh_key_data.name)
        return updated_key
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update SSH key: {str(e)}")


@router.delete("/")
async def delete_ssh_key(
    user_and_team=Depends(get_user_and_team),
):
    """
    Delete the SSH key and its files.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    try:
        from transformerlab.services.ssh_key_service import delete_ssh_key

        await delete_ssh_key(team_id)
        return {"message": "SSH key deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete SSH key: {str(e)}")


@router.get("/download")
async def download_ssh_key(
    user_and_team=Depends(get_user_and_team),
):
    """
    Download the organization's SSH private key for accessing interactive SSH tasks.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    try:
        from transformerlab.services.ssh_key_service import get_org_ssh_private_key, get_current_key_id

        # Get private key content
        private_key_content = await get_org_ssh_private_key(team_id)

        # Determine filename
        key_id = await get_current_key_id(team_id)
        filename = f"org_ssh_key_{key_id}" if key_id else f"org_ssh_key_{team_id}"

        # Return as downloadable file
        return Response(
            content=private_key_content,
            media_type="application/x-pem-file",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve SSH key: {str(e)}")
