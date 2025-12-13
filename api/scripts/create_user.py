#!/usr/bin/env python3
"""
Script to create a new user by calling the /auth/register endpoint.

Usage:
    python create_user.py --user test@example.com --password password123
"""

import argparse
import requests
import sys
import json


def create_user(email: str, password: str, base_url: str = "http://127.0.0.1:8338"):
    """
    Register a new user via the /auth/register endpoint.

    Args:
        email: User's email address
        password: User's password
        base_url: Base URL of the API (default: http://127.0.0.1:8338)

    Returns:
        bool: True if successful, False otherwise
    """
    url = f"{base_url}/auth/register"

    payload = {"email": email, "password": password}

    headers = {"Content-Type": "application/json"}

    try:
        print(f"Registering user: {email}")
        response = requests.post(url, json=payload, headers=headers)

        if response.status_code == 201 or response.status_code == 200:
            print("✓ User created successfully!")
            print(f"Response: {json.dumps(response.json(), indent=2)}")
            return True
        else:
            print(f"✗ Failed to create user. Status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        print(f"✗ Error: Could not connect to {base_url}")
        print("Make sure the API server is running.")
        return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Create a new user by calling the /auth/register endpoint")
    parser.add_argument("--email", required=True, help="User's email address")
    parser.add_argument("--password", required=True, help="User's password")
    parser.add_argument(
        "--url", default="http://127.0.0.1:8338", help="Base URL of the API (default: http://127.0.0.1:8338)"
    )

    args = parser.parse_args()

    success = create_user(args.email, args.password, args.url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
