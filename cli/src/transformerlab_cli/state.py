class CLIState:
    """
    Singleton class to manage global CLI state.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(CLIState, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "output_format"):
            self.output_format = "pretty"  # Default output format


# Module-level singleton instance
cli_state = CLIState()
