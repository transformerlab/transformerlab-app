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

    @classmethod
    def get_instance(cls):
        """
        Get the singleton instance of CLIState.
        """
        return cls()


# Convenience function to access the singleton
cli_state = CLIState.get_instance()
