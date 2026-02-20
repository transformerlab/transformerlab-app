import os


def get_add_if_verified_policy():
    import paramiko

    class AddIfVerified(paramiko.MissingHostKeyPolicy):
        """Custom SSH host key policy that adds host keys after verification."""

        def missing_host_key(self, client, hostname, key):
            """Handle missing host key by adding it to known_hosts after verification."""
            client._host_keys.add(hostname, key.get_name(), key)
            client._host_keys.save(os.path.expanduser("~/.ssh/known_hosts"))

    return AddIfVerified()
