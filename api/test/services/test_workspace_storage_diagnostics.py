"""Unit tests for workspace storage diagnostics (AWS profile / STS)."""

from unittest.mock import MagicMock, patch

from transformerlab.services.workspace_storage_diagnostics_service import _check_aws_credentials_diagnostic


@patch("boto3.Session")
def test_aws_diagnostic_named_profile_sts_ok(mock_session_cls, monkeypatch):
    monkeypatch.setenv("AWS_PROFILE", "myprofile")
    sess = MagicMock()
    sess.get_credentials.return_value = object()
    sts = MagicMock()
    sts.get_caller_identity.return_value = {"Account": "123456789012", "Arn": "arn:aws:iam::123456789012:user/u"}
    sess.client.return_value = sts
    mock_session_cls.return_value = sess

    result = _check_aws_credentials_diagnostic()
    assert result["ok"] is True
    assert result["resolution"] == "named_profile"
    assert result["profile_requested"] == "myprofile"
    assert result["sts_account"] == "123456789012"
    mock_session_cls.assert_called_once_with(profile_name="myprofile")


@patch("boto3.Session")
def test_aws_diagnostic_falls_back_to_default_chain(mock_session_cls, monkeypatch):
    from botocore.exceptions import ProfileNotFound

    monkeypatch.setenv("AWS_PROFILE", "missing-profile")

    default_sess = MagicMock()
    default_sess.get_credentials.return_value = object()
    sts = MagicMock()
    sts.get_caller_identity.return_value = {"Account": "99", "Arn": "arn:aws:sts::99:assumed-role/r"}
    default_sess.client.return_value = sts

    def session_factory(*args, **kwargs):
        if kwargs.get("profile_name") == "missing-profile":
            raise ProfileNotFound(profile="missing-profile")
        return default_sess

    mock_session_cls.side_effect = session_factory

    result = _check_aws_credentials_diagnostic()
    assert result["ok"] is True
    assert result["resolution"] == "default_chain"
    assert "note" in result
    assert mock_session_cls.call_count == 2
