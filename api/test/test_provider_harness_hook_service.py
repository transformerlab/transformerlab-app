from transformerlab.services.provider_harness_hook_service import build_hooked_command


def test_build_hooked_command_joins_with_semicolons_and_trims() -> None:
    assert build_hooked_command("echo hi", "prep;", "cleanup ;") == "prep;echo hi;cleanup"


def test_build_hooked_command_omits_empty_segments() -> None:
    assert build_hooked_command("echo hi", "", None) == "echo hi"
    assert build_hooked_command("echo hi", None, "   ") == "echo hi"


def test_build_hooked_command_keeps_internal_semicolons() -> None:
    assert build_hooked_command("echo a; echo b", "prep", "cleanup") == "prep;echo a; echo b;cleanup"


def test_build_hooked_command_returns_empty_string_for_empty_run() -> None:
    assert build_hooked_command("   ", "prep", "cleanup") == ""
