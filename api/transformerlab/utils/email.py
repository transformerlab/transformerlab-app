"""
Email utility for sending verification emails using SMTP.

Requires SMTP configuration in environment variables:
- EMAIL_METHOD: "smtp" or "dev" (default: "smtp")
  - "smtp": Send emails via SMTP server (requires SMTP_* config)
  - "dev": Log emails to console (no SMTP config needed)
- SMTP_SERVER: SMTP server address
- SMTP_PORT: SMTP server port (usually 587 for TLS, 465 for SSL)
- SMTP_USERNAME: SMTP authentication username
- SMTP_PASSWORD: SMTP authentication password
- EMAIL_FROM: Sender email address
"""

import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from os import getenv


def validate_email(email: str) -> None:
    """
    Validate email address format.

    Args:
        email: Email address to validate
    """
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(email_pattern, email):
        raise ValueError(f"Invalid email address format: {email}")


def get_smtp_config() -> dict:
    """
    Get SMTP configuration from environment variables.
    If all SMTP configuration values are missing, uses default values.

    Returns:
        Dictionary with SMTP configuration and email method
    """
    server = getenv("SMTP_SERVER")
    port = getenv("SMTP_PORT")
    username = getenv("SMTP_USERNAME")
    password = getenv("SMTP_PASSWORD")
    from_email = getenv("EMAIL_FROM")

    # Check if all SMTP config values are missing
    all_missing = not any([server, port, username, password, from_email])

    if all_missing:
        # Use default values when all are missing
        server = "smtp.example.com"
        port = "587"
        username = "your_email@example.com"
        password = "your_email_password"
        from_email = "your_email@example.com"
    elif not all([server, port, username, password, from_email]):
        # If only some are missing, raise an error
        missing = []
        if not server:
            missing.append("SMTP_SERVER")
        if not port:
            missing.append("SMTP_PORT")
        if not username:
            missing.append("SMTP_USERNAME")
        if not password:
            missing.append("SMTP_PASSWORD")
        if not from_email:
            missing.append("EMAIL_FROM")
        raise ValueError(f"Missing required SMTP configuration: {', '.join(missing)}")

    try:
        port = int(port)
    except ValueError:
        raise ValueError(f"Invalid SMTP_PORT: {port}. Must be a number.")

    return {
        "server": server,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
    }


def send_verification_email(
    to_email: str, subject: str, body: str, from_email: str | None = None
) -> None:
    """
    Send an email using SMTP or log to console in dev mode.

    Args:
        to_email: Recipient email address
        subject: Email subject
        body: Email body content (plain text)
        from_email: Optional sender email address (overrides EMAIL_FROM env var)
    """
    # Validate email format
    validate_email(to_email)

    # Check email method (default to "dev" to match .env.example)
    email_method = getenv("EMAIL_METHOD", "dev").lower()

    if email_method == "dev":
        # Dev mode: just log the email
        print(f"📧 [DEV MODE] Email not sent - body: {body}")
        return

    # SMTP mode: send actual email
    config = get_smtp_config()
    sender_email = from_email or config["from_email"]

    # Create message
    msg = MIMEMultipart()
    msg["From"] = sender_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    # Send email
    try:
        with smtplib.SMTP(config["server"], config["port"]) as server:
            server.starttls()  # Secure the connection
            try:
                server.login(config["username"], config["password"])
            except smtplib.SMTPAuthenticationError as e:
                raise RuntimeError(f"SMTP authentication failed: {e!s}")

            server.send_message(msg)

    except RuntimeError:
        # Re-raise authentication errors
        raise
    except (
        smtplib.SMTPConnectError,
        smtplib.SMTPServerDisconnected,
        ConnectionRefusedError,
        TimeoutError,
    ) as e:
        raise ConnectionError(f"Failed to connect to SMTP server: {e!s}")
    except smtplib.SMTPException as e:
        raise RuntimeError(f"Failed to send email: {e!s}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while sending email: {e!s}")


def send_email_verification_link(
    to_email: str, verification_url: str, from_email: str | None = None
) -> None:
    """
    Send an email verification link to confirm user's email address.

    Args:
        to_email: Email address to verify
        verification_url: URL containing the verification token
        from_email: Optional sender email address
    """
    subject = "Verify Your Email - Transformer Lab"

    body = f"""Hello,

Thank you for registering with Transformer Lab!

To complete your registration and verify your email address, please click the link below:

{verification_url}

This link will expire in 24 hours.

If you did not create an account with Transformer Lab, please ignore this email.

---
Transformer Lab Team
"""

    send_verification_email(to_email, subject, body, from_email)


def send_password_reset_email(to_email: str, reset_url: str, from_email: str | None = None) -> None:
    """
    Send a password reset email with a secure reset link.

    Args:
        to_email: Email address of the user requesting password reset
        reset_url: URL containing the reset token
        from_email: Optional sender email address
    """
    subject = "Password Reset Request - Transformer Lab"

    body = f"""Hello,

You recently requested to reset your password for your Transformer Lab account ({to_email}).

To reset your password, please click the link below:

{reset_url}

This link will expire in 1 hour for security reasons.

If you did not request a password reset, please ignore this email or contact support if you have concerns.

---
Transformer Lab Team
"""

    send_verification_email(to_email, subject, body, from_email)


def send_team_invitation_email(
    to_email: str,
    team_name: str,
    inviter_email: str,
    invitation_url: str,
    from_email: str | None = None,
) -> None:
    """
    Send a team invitation verification email.

    Args:
        to_email: Email address of the invited user
        team_name: Name of the team
        inviter_email: Email address of the person who sent the invitation
        invitation_url: URL to accept the invitation
        from_email: Optional sender email address

    """
    subject = f"Team Invitation: {team_name}"

    body = f"""Hello,

{inviter_email} has invited you to join the team "{team_name}" on Transformer Lab.

To accept this invitation and verify your email address, please click the link below:

{invitation_url}

This invitation will expire in 7 days.

If you did not expect this invitation or believe it was sent in error, you can safely ignore this email.

---
Transformer Lab Team
"""

    send_verification_email(to_email, subject, body, from_email)
