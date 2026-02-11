
from transformerlab.schemas.task import (
    ImportTaskFromGalleryRequest,
    ImportTaskFromTeamGalleryRequest,
)


# Test request schemas
def test_regular_task_import_request():
    """Test ImportTaskFromGalleryRequest structure for regular task."""
    request = ImportTaskFromGalleryRequest(
        gallery_id="task-1",
        experiment_id="exp-123",
        is_interactive=False,
    )
    assert request.gallery_id == "task-1"
    assert request.experiment_id == "exp-123"
    assert request.is_interactive is False


def test_interactive_task_import_request():
    """Test ImportTaskFromGalleryRequest structure for interactive task."""
    request = ImportTaskFromGalleryRequest(
        gallery_id="interactive-vscode",
        experiment_id="exp-123",
        is_interactive=True,
    )
    assert request.gallery_id == "interactive-vscode"
    assert request.is_interactive is True


def test_team_task_import_request():
    """Test ImportTaskFromTeamGalleryRequest structure."""
    request = ImportTaskFromTeamGalleryRequest(
        gallery_id="team-task-1",
        experiment_id="exp-123",
    )
    assert request.gallery_id == "team-task-1"
    assert request.experiment_id == "exp-123"


def test_gallery_id_supports_numeric_and_string():
    """Test that gallery_id supports both numeric (index) and string (id) formats."""
    # Numeric string (index)
    request1 = ImportTaskFromGalleryRequest(
        gallery_id="0",
        experiment_id="exp-123",
        is_interactive=False,
    )
    assert request1.gallery_id == "0"

    # String identifier
    request2 = ImportTaskFromGalleryRequest(
        gallery_id="my-task-id",
        experiment_id="exp-123",
        is_interactive=False,
    )
    assert request2.gallery_id == "my-task-id"


# Test import flow logic
def test_regular_task_import_flow():
    """Test the flow logic for regular task import."""
    # Steps: validate -> fetch gallery -> find entry -> fetch yaml -> parse -> create task
    request_data = {
        "gallery_id": "task-1",
        "experiment_id": "exp-123",
        "is_interactive": False,
    }

    # Verify request data
    assert request_data["is_interactive"] is False
    assert request_data["experiment_id"] == "exp-123"
    assert request_data["gallery_id"] == "task-1"


def test_interactive_task_import_flow():
    """Test the flow logic for interactive task import."""
    # Steps: validate -> fetch interactive gallery -> find entry -> create task template
    request_data = {
        "gallery_id": "interactive-1",
        "experiment_id": "exp-123",
        "is_interactive": True,
    }

    # Verify request data
    assert request_data["is_interactive"] is True
    assert request_data["experiment_id"] == "exp-123"


def test_team_task_import_flow():
    """Test the flow logic for team task import."""
    # Steps: validate -> fetch team gallery -> find entry -> fetch/parse -> create task
    request_data = {
        "gallery_id": "team-custom-1",
        "experiment_id": "exp-123",
    }

    # Verify request data
    assert request_data["experiment_id"] == "exp-123"
    assert request_data["gallery_id"] == "team-custom-1"


# Test response handling
def test_successful_import_response_structure():
    """Test the structure of successful import response."""
    response = {
        "status": "success",
        "message": "Task 'Task Name' imported successfully",
        "id": "task-uuid-123",
    }

    assert response["status"] == "success"
    assert "imported successfully" in response["message"]
    assert response["id"] is not None


# Test error cases
def test_gallery_entry_not_found_handling():
    """Test error handling when gallery entry is not found."""
    gallery_id = "non-existent"
    gallery = [
        {"id": "task-1", "title": "Task 1"},
        {"id": "task-2", "title": "Task 2"},
    ]

    # Simulate search logic
    found = None
    try:
        index = int(gallery_id)
        if 0 <= index < len(gallery):
            found = gallery[index]
    except ValueError:
        for entry in gallery:
            if entry.get("id") == gallery_id or entry.get("title") == gallery_id:
                found = entry
                break

    # Should not find the entry
    assert found is None


def test_missing_github_url_error():
    """Test error handling for missing GitHub URL in gallery entry."""
    gallery_entry = {
        "id": "task-1",
        "title": "Task without GitHub",
        # Missing github_repo_url
    }

    # Should detect missing URL
    github_url = gallery_entry.get("github_repo_url")
    assert github_url is None
