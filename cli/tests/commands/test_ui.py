import json
import pytest
from transformerlab_cli.util.ui import render_table, render_object, exit_with_no_results


# NOTE: Rich's Console is initialized at import time and writes to its own
# internal file reference — patching sys.stdout does NOT intercept it.
# Always use pytest's capsys fixture to capture output from these helpers.


def test_render_table_json_is_valid_json(capsys):
    data = [{"id": "1", "name": "foo"}, {"id": "2", "name": "bar"}]
    render_table(data, "json", ["id", "name"], "Test")
    captured = capsys.readouterr()
    parsed = json.loads(captured.out.strip())
    assert parsed == data


def test_render_table_json_no_ansi_escape_codes(capsys):
    data = [{"id": "1", "name": "test"}]
    render_table(data, "json", ["id", "name"], "T")
    captured = capsys.readouterr()
    # No ANSI escape codes (which Rich/console.print_json injects on a TTY)
    assert "\x1b[" not in captured.out
    # Must be parseable as plain JSON
    json.loads(captured.out.strip())


def test_render_object_json_is_valid_json(capsys):
    data = {"key": "value", "num": 42}
    render_object(data, "json")
    captured = capsys.readouterr()
    parsed = json.loads(captured.out.strip())
    assert parsed == data


def test_exit_with_no_results_json_mode(capsys):
    with pytest.raises(SystemExit) as exc_info:
        exit_with_no_results("json", "No tasks found")
    assert exc_info.value.code == 2
    captured = capsys.readouterr()
    assert json.loads(captured.out.strip()) == {"error": "No tasks found"}


def test_exit_with_no_results_pretty_mode(capsys):
    with pytest.raises(SystemExit) as exc_info:
        exit_with_no_results("pretty", "No tasks found")
    assert exc_info.value.code == 2
    # Pretty mode prints a warning message (not JSON)
    captured = capsys.readouterr()
    assert "No tasks found" in captured.out


def test_exit_with_no_results_default_message(capsys):
    with pytest.raises(SystemExit) as exc_info:
        exit_with_no_results("json")
    assert exc_info.value.code == 2
    captured = capsys.readouterr()
    assert json.loads(captured.out.strip()) == {"error": "No results found"}
