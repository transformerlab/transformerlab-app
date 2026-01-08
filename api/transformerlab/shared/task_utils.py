import json


def process_env_parameters_to_env_vars(config: dict) -> dict:
    """
    Process env_parameters from config/task.json and convert them to env_vars.

    For each env_parameter:
    - If it has env_var and value, add to env_vars with that value
    - If it has only env_var (no value), add to env_vars with blank value

    Args:
        config: Dictionary that may contain env_parameters

    Returns:
        Updated config with env_vars populated from env_parameters
    """
    if not isinstance(config, dict):
        return config

    env_parameters = config.get("env_parameters", [])
    if not isinstance(env_parameters, list):
        return config

    # Initialize env_vars if not present
    if "env_vars" not in config:
        config["env_vars"] = {}
    elif not isinstance(config["env_vars"], dict):
        # If env_vars exists but is not a dict, try to convert it
        try:
            if isinstance(config["env_vars"], str):
                config["env_vars"] = json.loads(config["env_vars"])
            else:
                config["env_vars"] = {}
        except (json.JSONDecodeError, TypeError):
            config["env_vars"] = {}

    # Process each env_parameter
    for param in env_parameters:
        if not isinstance(param, dict):
            continue

        env_var = param.get("env_var")
        if not env_var:
            continue

        # If value is provided, use it; otherwise use blank string
        value = param.get("value", "")
        config["env_vars"][env_var] = value

    return config
