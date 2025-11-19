"""
Email utility for sending verification emails using the OS mail system.

This is a temporary solution using the system's sendmail/mail command.
TODO: Replace with a proper email service (SendGrid, AWS SES, etc.) for production use.
"""

import subprocess
import re
from typing import Optional, Dict


def send_verification_email(
    to_email: str,
    subject: str,
    body: str,
    from_email: Optional[str] = None
) -> Dict[str, any]:
    """
    Send an email using the OS mail system (sendmail or mail command).
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        body: Email body content
        from_email: Optional sender email address
        
    Returns:
        Dictionary with:
        - success: bool - Whether email was sent successfully
        - error_type: str | None - Type of error if failed ('invalid_email', 'service_error', 'system_error')
        - error_message: str | None - Detailed error message if failed
        
    Note:
        This uses the system's mail command which requires:
        - macOS: mail command (built-in)
        - Linux: mail/mailx package or sendmail
        
        For production, this should be replaced with a proper email service.
    """
    # Basic email validation
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, to_email):
        return {
            "success": False,
            "error_type": "invalid_email",
            "error_message": f"Invalid email address format: {to_email}"
        }
    
    try:
        # Construct the email message
        # Using mail command which is available on most Unix systems
        mail_cmd = ["mail", "-s", subject, to_email]
        
        # Send the email
        process = subprocess.Popen(
            mail_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate(input=body)
        
        if process.returncode == 0:
            return {
                "success": True,
                "error_type": None,
                "error_message": None
            }
        else:
            # Check if error indicates invalid email address
            stderr_lower = stderr.lower()
            if any(indicator in stderr_lower for indicator in ['user unknown', 'invalid', 'does not exist', 'not found', 'undeliverable']):
                return {
                    "success": False,
                    "error_type": "invalid_email",
                    "error_message": f"Email address may be invalid or unreachable: {stderr.strip()}"
                }
            else:
                return {
                    "success": False,
                    "error_type": "service_error",
                    "error_message": f"Mail service error: {stderr.strip()}"
                }
            
    except FileNotFoundError:
        return {
            "success": False,
            "error_type": "system_error",
            "error_message": "Mail command not found. Please install mail/mailx package or configure sendmail."
        }
    except Exception as e:
        return {
            "success": False,
            "error_type": "system_error",
            "error_message": f"Unexpected error: {str(e)}"
        }


def send_team_invitation_email(
    to_email: str,
    team_name: str,
    inviter_email: str,
    invitation_url: str,
    from_email: Optional[str] = None
) -> Dict[str, any]:
    """
    Send a team invitation verification email.
    
    Args:
        to_email: Email address of the invited user
        team_name: Name of the team
        inviter_email: Email address of the person who sent the invitation
        invitation_url: URL to accept the invitation
        from_email: Optional sender email address
        
    Returns:
        Dictionary with success status and error details (see send_verification_email)
    """
    subject = f"Team Invitation: {team_name}"
    
    body = f"""Hello,

{inviter_email} has invited you to join the team "{team_name}" on TransformerLab.

To accept this invitation and verify your email address, please click the link below:

{invitation_url}

This invitation will expire in 7 days.

If you did not expect this invitation or believe it was sent in error, you can safely ignore this email.

---
TransformerLab Team
"""
    
    return send_verification_email(to_email, subject, body, from_email)
