import os
import tempfile
from unittest.mock import patch, Mock, AsyncMock
import pytest


def test_plugins_gallery(client):
    resp = client.get("/plugins/gallery")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        plugin = data[0]
        assert "name" in plugin or "description" in plugin


def test_plugins_list(client):
    resp = client.get("/plugins/list")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        plugin = data[0]
        assert "name" in plugin or "description" in plugin


def test_plugins_install(client):
    resp = client.get("/plugins/gallery/fastchat_server/install")
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        data = resp.json()
        assert "message" in data or "status" in data


def test_run_installer_script(client):
    resp = client.get("/plugins/fastchat_server/run_installer_script")
    # Installer may not exist, so allow 200 or 404
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        data = resp.json()
        assert "message" in data or "status" in data


def test_list_missing_plugins_for_current_platform(client):
    resp = client.get("/plugins/list_missing_plugins_for_current_platform")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_install_missing_plugins_for_current_platform(client):
    resp = client.get("/plugins/install_missing_plugins_for_current_platform")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_autoupdate_all_plugins(client):
    resp = client.get("/plugins/autoupdate_all_plugins")
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        data = resp.json()
        assert "message" in data or "status" in data


def test_plugin_install_with_nonexistent_plugin(client):
    """Test that installing a non-existent plugin returns appropriate error"""
    resp = client.get("/plugins/gallery/nonexistent_plugin_12345/install")
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        data = resp.json()
        # Should return an error status for non-existent plugin
        assert "status" in data
        if data.get("status") == "error":
            assert "message" in data


@pytest.mark.asyncio
async def test_delete_plugin_files_from_workspace():
    """Test the delete_plugin_files_from_workspace function directly"""
    from transformerlab.routers.plugins import delete_plugin_files_from_workspace

    # Create a temporary plugin directory structure
    with tempfile.TemporaryDirectory() as temp_dir:
        # Mock the get_plugin_dir function to use our temp directory
        async def mock_get_plugin_dir():
            return temp_dir

        with patch("lab.dirs.get_plugin_dir", side_effect=mock_get_plugin_dir):
            test_plugin_id = "test_plugin_to_delete"
            plugin_path = os.path.join(temp_dir, test_plugin_id)

            # Create the plugin directory with some files
            os.makedirs(plugin_path)
            test_file = os.path.join(plugin_path, "test_file.txt")
            with open(test_file, "w") as f:
                f.write("test content")

            # Verify the plugin directory exists
            assert os.path.exists(plugin_path)
            assert os.path.exists(test_file)

            # Call the delete function
            await delete_plugin_files_from_workspace(test_plugin_id)

            # Verify the plugin directory is deleted
            assert not os.path.exists(plugin_path)


@pytest.mark.asyncio
async def test_delete_plugin_files_from_workspace_nonexistent():
    """Test deleting a non-existent plugin doesn't raise an error"""
    from transformerlab.routers.plugins import delete_plugin_files_from_workspace

    with tempfile.TemporaryDirectory() as temp_dir:

        async def mock_get_plugin_dir():
            return temp_dir

        with patch("lab.dirs.get_plugin_dir", side_effect=mock_get_plugin_dir):
            # This should not raise an error even if plugin doesn't exist
            await delete_plugin_files_from_workspace("nonexistent_plugin")


@pytest.mark.asyncio
async def test_copy_plugin_files_to_workspace():
    """Test the copy_plugin_files_to_workspace function"""
    from transformerlab.routers.plugins import copy_plugin_files_to_workspace
    from transformerlab.shared import dirs

    with tempfile.TemporaryDirectory() as temp_dir:
        # Create mock gallery and plugin directories
        gallery_dir = os.path.join(temp_dir, "gallery")
        plugin_dir = os.path.join(temp_dir, "plugins")
        os.makedirs(gallery_dir)
        os.makedirs(plugin_dir)

        # Create a test plugin in the gallery
        test_plugin_id = "test_plugin_copy"
        source_plugin_path = os.path.join(gallery_dir, test_plugin_id)
        os.makedirs(source_plugin_path)

        # Create some test files in the source plugin
        test_file = os.path.join(source_plugin_path, "index.json")
        with open(test_file, "w") as f:
            f.write('{"name": "Test Plugin", "version": "1.0"}')

        async def mock_get_plugin_dir():
            return plugin_dir

        async def mock_plugin_dir_by_name(name):
            return os.path.join(plugin_dir, name)

        with (
            patch.object(dirs, "PLUGIN_PRELOADED_GALLERY", gallery_dir),
            patch("lab.dirs.get_plugin_dir", side_effect=mock_get_plugin_dir),
            patch("lab.dirs.plugin_dir_by_name", side_effect=mock_plugin_dir_by_name),
        ):
            # Copy the plugin
            await copy_plugin_files_to_workspace(test_plugin_id)

            # Verify the plugin was copied
            dest_plugin_path = os.path.join(plugin_dir, test_plugin_id)
            assert os.path.exists(dest_plugin_path)
            assert os.path.exists(os.path.join(dest_plugin_path, "index.json"))


@pytest.mark.asyncio
async def test_run_installer_for_plugin_with_missing_setup_script():
    """Test that run_installer_for_plugin calls delete when no setup script is found"""
    from transformerlab.routers.plugins import run_installer_for_plugin
    from transformerlab.shared import dirs

    with tempfile.TemporaryDirectory() as temp_dir:
        # Create mock plugin structure
        gallery_dir = os.path.join(temp_dir, "gallery")
        plugin_dir = os.path.join(temp_dir, "plugins")
        test_plugin_id = "test_plugin_no_setup"
        source_plugin_path = os.path.join(gallery_dir, test_plugin_id)
        dest_plugin_path = os.path.join(plugin_dir, test_plugin_id)

        os.makedirs(source_plugin_path)
        os.makedirs(dest_plugin_path)

        # Create index.json without setup-script key
        index_file = os.path.join(source_plugin_path, "index.json")
        with open(index_file, "w") as f:
            f.write('{"name": "Test Plugin", "version": "1.0"}')

        # Create a mock log file
        mock_log_file = Mock()
        mock_log_file.write = AsyncMock()

        with (
            patch.object(dirs, "PLUGIN_PRELOADED_GALLERY", gallery_dir),
            patch("lab.dirs.get_plugin_dir", return_value=plugin_dir),
            patch("transformerlab.routers.plugins.delete_plugin_files_from_workspace") as mock_delete,
        ):
            mock_delete.return_value = None

            # Run the installer
            result = await run_installer_for_plugin(test_plugin_id, mock_log_file)

            # Verify it returns an error and calls delete
            assert result["status"] == "error"
            assert "No setup script found" in result["message"]
            mock_delete.assert_called_once_with(test_plugin_id)


@pytest.mark.skip()
@pytest.mark.asyncio
async def test_run_installer_for_plugin_setup_script_failure():
    """Test that run_installer_for_plugin calls delete when setup script fails"""
    from transformerlab.routers.plugins import run_installer_for_plugin
    from transformerlab.shared import dirs

    with tempfile.TemporaryDirectory() as temp_dir:
        # Create mock plugin structure
        gallery_dir = os.path.join(temp_dir, "gallery")
        plugin_dir = os.path.join(temp_dir, "plugins")
        test_plugin_id = "test_plugin_failing_setup"
        source_plugin_path = os.path.join(gallery_dir, test_plugin_id)
        dest_plugin_path = os.path.join(plugin_dir, test_plugin_id)

        os.makedirs(source_plugin_path)
        os.makedirs(dest_plugin_path)

        # Create index.json with a setup script
        index_file = os.path.join(source_plugin_path, "index.json")
        with open(index_file, "w") as f:
            f.write('{"name": "Test Plugin", "version": "1.0", "setup-script": "nonexistent_script.sh"}')

        # Create mock venv directory
        venv_path = os.path.join(dest_plugin_path, "venv")
        os.makedirs(venv_path)

        # Create a mock log file
        mock_log_file = Mock()
        mock_log_file.write = AsyncMock()

        with (
            patch.object(dirs, "PLUGIN_PRELOADED_GALLERY", gallery_dir),
            patch("lab.dirs.get_plugin_dir", return_value=plugin_dir),
            patch("asyncio.create_subprocess_exec") as mock_subprocess,
            patch("transformerlab.routers.plugins.delete_plugin_files_from_workspace") as mock_delete,
        ):
            # Mock subprocess to return failure
            mock_stdout = Mock()
            mock_stdout.readline = AsyncMock(side_effect=[b"", b""])  # Empty lines to end the loop

            mock_process = Mock()
            mock_process.stdout = mock_stdout
            mock_process.wait = AsyncMock(return_value=1)  # Non-zero exit code indicates failure
            mock_subprocess.return_value = mock_process
            mock_delete.return_value = None

            # Run the installer
            result = await run_installer_for_plugin(test_plugin_id, mock_log_file)

            # Verify it returns an error and calls delete
            assert result["status"] == "error"
            assert "failed with exit code 1" in result["message"]
            mock_delete.assert_called_once_with(test_plugin_id)


def test_plugin_installation_error_cleanup(client):
    """Test that plugin installation properly handles errors and cleans up"""
    # Test with a plugin that likely doesn't exist in the gallery
    resp = client.get("/plugins/gallery/invalid_plugin_name_xyz/install")

    # Should either return 404 (not found) or 200 with error status
    assert resp.status_code in (200, 404)

    if resp.status_code == 200:
        data = resp.json()
        assert "status" in data
        # If it's an error, verify the error message is present
        if data.get("status") == "error":
            assert "message" in data
            assert len(data["message"]) > 0
