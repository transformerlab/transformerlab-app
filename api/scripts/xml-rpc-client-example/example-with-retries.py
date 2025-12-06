import http.client
import logging
import time
import xmlrpc.client

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# Create a custom transport with timeout
class TimeoutTransport(xmlrpc.client.Transport):
    def __init__(self, timeout=10, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.timeout = timeout

    def make_connection(self, host):
        connection = super().make_connection(host)
        connection.timeout = self.timeout
        return connection


class RetryableXMLRPCClient:
    """
    A wrapper around XML-RPC client that implements retry logic for failed calls.
    """

    def __init__(self, url, max_retries=3, retry_delay=1, timeout=10):
        """
        Initialize the retryable XML-RPC client.

        Args:
            url: The URL of the XML-RPC server
            max_retries: Maximum number of retry attempts
            retry_delay: Base delay between retries (will be exponentially increased)
            timeout: Connection timeout in seconds
        """
        self.url = url
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.timeout = timeout

        # Create the XML-RPC server proxy with a custom transport that has timeout
        transport = TimeoutTransport(timeout=timeout)
        self.server = xmlrpc.client.ServerProxy(url, transport=transport)

    def _retry_operation(self, method_name, *args, **kwargs):
        """
        Execute an operation with retry logic.

        Args:
            method_name: The name of the XML-RPC method to call
            *args: Positional arguments to pass to the method
            **kwargs: Keyword arguments to pass to the method

        Returns:
            The result of the XML-RPC call or None if all retries failed
        """
        retries = 0
        last_exception = None

        # Get the method from the server
        try:
            method = getattr(self.server, method_name)
        except AttributeError:
            logger.error(f"Method '{method_name}' not found on server")
            return None

        # Ensure method_name is a string for logging
        if not isinstance(method_name, str):
            method_name = str(method_name)

        while retries <= self.max_retries:
            try:
                if retries > 0:
                    logger.info(f"Retry attempt {retries}/{self.max_retries} for {method_name}")

                return method(*args, **kwargs)

            except (
                TimeoutError,
                OSError,
                http.client.HTTPException,
                xmlrpc.client.ProtocolError,
                ConnectionError,
            ) as e:
                # Network/connection errors - these are retryable
                last_exception = e
                logger.warning(
                    f"Connection error in {method_name}: {e}. Retrying in {self.retry_delay * (2**retries)} seconds..."
                )

            except xmlrpc.client.Fault as e:
                # Server returned a fault - depending on the fault code, this might not be retryable
                last_exception = e

                # You can customize this logic based on your server's fault codes
                if getattr(e, "faultCode", 500) >= 500:  # Server errors might be temporary
                    logger.warning(f"Server fault {e.faultCode}: {e.faultString}. Retrying...")
                else:
                    # Client errors are likely not going to be resolved by retry
                    logger.error(f"Client fault {e.faultCode}: {e.faultString}. Not retrying.")
                    return None

            except Exception as e:
                # Unexpected errors - log and continue with program
                last_exception = e
                logger.error(f"Unexpected error in {method_name}: {e!s}. Not retrying.")
                return None

            # Implement exponential backoff
            time.sleep(self.retry_delay * (2**retries))
            retries += 1

        # If we've exhausted all retries
        logger.error(
            f"Failed after {self.max_retries} retries for {method_name}. Last error: {last_exception!s}"
        )
        return None

    def call(self, method_name, *args, **kwargs):
        """
        Call a method by name with retry logic.

        Args:
            method_name: The name of the XML-RPC method to call (must be a string)
            *args: Positional arguments to pass to the method
            **kwargs: Keyword arguments to pass to the method

        Returns:
            The result of the XML-RPC call or None if all retries failed
        """
        if not isinstance(method_name, str):
            raise TypeError("method_name must be a string")

        return self._retry_operation(method_name, *args, **kwargs)

    def __getattr__(self, name):
        """
        Dynamically create methods that match the XML-RPC server's methods.
        This makes the client usage identical to standard xmlrpc.client.ServerProxy.
        """
        # Safety check - ensure name is a string
        if not isinstance(name, str):
            raise TypeError("name must be a string object")

        # Create a wrapper that applies our retry logic
        def wrapper(*args, **kwargs):
            return self._retry_operation(name, *args, **kwargs)

        return wrapper


# Example usage
if __name__ == "__main__":
    # Create a retryable client
    client = RetryableXMLRPCClient(
        url="http://localhost:8338/job_sdk", max_retries=3, retry_delay=1, timeout=10
    )

    # Use the client just like a regular XML-RPC client
    try:
        # Method 1: Using attribute access (standard way)
        result = client.hello("World")
        if result is not None:
            print(f"Result: {result}")
        else:
            print("Operation failed after retries")

        # Method 2: Using explicit call method (alternative)
        user = client.call("get_user", 1)
        if user is not None:
            print(f"Got user: {user}")
        else:
            print("Could not retrieve user")

        # Your program continues even if XML-RPC calls fail
        print("Program continues running...")

    except Exception as e:
        # This will only be reached for errors not caught by the retry mechanism
        print(f"Unexpected error: {e!s}")
        print("Program continues anyway...")
