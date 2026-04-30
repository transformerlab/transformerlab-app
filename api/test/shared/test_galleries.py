from transformerlab.shared import galleries


def test_channel_manifests_reject_too_new_min_version():
    manifest = {
        "channel": "stable",
        "min_supported_app_version": "0.30.0",
    }

    assert galleries.is_manifest_version_compatible(manifest, "0.27.0") is False


def test_channel_manifests_accept_matching_version_range():
    manifest = {
        "channel": "stable",
        "min_supported_app_version": "0.20.0",
        "max_supported_app_version": "0.29.0",
    }

    assert galleries.is_manifest_version_compatible(manifest, "0.27.0") is True


def test_only_selected_galleries_use_channel_fetch():
    assert galleries.should_use_channel_bundle(galleries.TASKS_GALLERY_FILE) is True
    assert galleries.should_use_channel_bundle(galleries.INTERACTIVE_GALLERY_FILE) is True
    assert galleries.should_use_channel_bundle(galleries.ANNOUNCEMENTS_GALLERY_FILE) is True
    assert galleries.should_use_channel_bundle(galleries.TEAM_TASKS_GALLERY_FILE) is False


def test_local_channel_path_uses_selected_channel(monkeypatch, tmp_path):
    monkeypatch.setattr(galleries.dirs, "GALLERIES_LOCAL_FALLBACK_DIR", str(tmp_path))
    monkeypatch.setenv("TLAB_GALLERY_CHANNEL", "beta")
    channel_file = tmp_path / "channels" / "beta" / "latest" / galleries.TASKS_GALLERY_FILE
    channel_file.parent.mkdir(parents=True, exist_ok=True)
    channel_file.write_text("[]", encoding="utf-8")

    resolved = galleries.get_local_gallery_path(galleries.TASKS_GALLERY_FILE)
    assert resolved.endswith("channels/beta/latest/task-gallery.json")
