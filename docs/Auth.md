# Authentication in Transformer Lab
(Developer Documentation)

## FastAPI Users

We implement auth in Transformer Lab using FastAPI Users:

https://github.com/fastapi-users/fastapi-users

https://fastapi-users.github.io/fastapi-users/latest/

## Auth strategy

We use JWT Auth. In models/users.py you will also see that we extend the default JWT to also add a refresh token.

All requests to the backend should include the JWT Token in the `Bearer` field in their requests. In addition, a second field called `X-Team-Id` should be added to all requests to state what team the user is acting on behalf of for this specific request.


### Sliding Window Refresh

The App UI uses authClient to talk to authenticated Endpoints using fetchWithAuth() and this function knows to automatically retry and endpoint if the regular JWT token is expired. It will first try to refresh the token using the refresh token and then it will retry the endpoint that failed. We implement sliding window refresh so that the refresh token that you get back is always 7 days valid from the last time you refreshed.

### Register - Invite Model

A user can register with any email and the user is created but the is_verified flag is initially set to false. An invite email is sent and if the user clicks on the email then they are verified.

To make this work, you need to have email set up, but if you do not, you can set emails to to dev in your .env and the links will be printed to your console.

## Adding Auth to Route

To make a route be protected, the easiest way is to protect the entire router by importing it into the app like this:

```python
app.include_router(
    evals.router, 
    dependencies=[Depends(get_user_and_team)]
)
```

But if you need access to the user and team values you can do this:

```python
@router.get("/compare_evals")
async def compare_eval(
    job_list: str = "",
    # 2. This grabs the ALREADY loaded user/team object from the cache
    current_user_and_team = Depends(get_user_and_team) 
):
    # Unpack your data
    user, team = current_user_and_team
    
    print(f"User {user.email} is comparing evals...") 
    
    # ... rest of your code ...
```

In the actual route and don't worry, it won't call the depends again, FastAPI knows to cache the values.

## App Auth

To access an authenticated endpoint use the authContext's provided fetchWithAuth like this:

```javascript
  const { fetchWithAuth } = useAuth();
```

You can use it with `getPath` like this:

```javascript
      const response = await fetchWithAuth(
        getPath('teams', ['rename'], { teamId }),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: newName }),
        },
      );
```


## Creating First User

The app will pre-create a first user called with login "admin@example.com" and password "admin123". You must change this password as soon as possible. In the UI this is under User Settings -> Change Password.

If you need to create additional users you can go to the UI and click on "Don't have an account? Sign up here." and then create a user. If you create a user via email, a registration link will be sent which you must click on in order to validate the email. If you are developing locally and your system does not send emails, you can set your SMTP server to "dev" in the environment variables and the registration link will be output to the console.

You can also create additional users by running `python api/scripts/create_user.py`

## Teams

Every user can belong to 1 or more "teams". A team is a group of users that work together and their experienments and work will be in a common team workspace.

A team is usually a company, lab, or an organization.

A user can create new teams and invite others to their team in the UI or using the API.

When users accept an invite, they join a team.

## Enabling Email

In order to use Transformer Lab with email as way to authorize users (versus using Gmail or another provider), Transformer Lab needs the ability to send emails.

Most computers that you run Transformer Lab are not good for sending emails because internet providers will treat messages sent from a random computer as spam.

So to enable proper email sending set the following .env variables in the api env:

```bash
SMTP_SERVER="smtp.example.com"
SMTP_PORT="587"
SMTP_USERNAME="your_email@example.com"
SMTP_PASSWORD="your_email_password"
EMAIL_FROM="your_email@example.com"

EMAIL_METHOD="smtp"
```

With valid values for SMTP. Third party messaging services like [Mailgun](https://www.mailgun.com/) will let you send messages using SMTP if you sign up and follow their instructions, then set the apprpriate values for the above.

## OIDC / OpenID Connect (any IdP)

You can add one or more **generic OIDC providers** (e.g. Okta, Keycloak, Auth0, Azure AD, or any OpenID Connect–compliant identity provider) using environment variables.

For each provider, set (with index `0`, `1`, `2`, …):

- **`OIDC_N_DISCOVERY_URL`** – Full URL to the IdP’s OpenID discovery document (e.g. `https://your-idp.example.com/.well-known/openid-configuration`).
- **`OIDC_N_CLIENT_ID`** – OAuth2 client ID from the IdP.
- **`OIDC_N_CLIENT_SECRET`** – OAuth2 client secret from the IdP.
- **`OIDC_N_NAME`** (optional) – Display name on the login button (e.g. "Company SSO"). Defaults to "OpenID #1", "OpenID #2", etc.

Example for a single provider:

```bash
OIDC_0_DISCOVERY_URL="https://your-idp.example.com/.well-known/openid-configuration"
OIDC_0_CLIENT_ID="your-client-id"
OIDC_0_CLIENT_SECRET="your-client-secret"
OIDC_0_NAME="Company SSO"
```

In your IdP’s app configuration, set the **redirect / callback URI** to:

`<API_BASE_URL>/auth/oidc-0/callback`

For a second provider use `oidc-1`, then `oidc-2`, and so on. The login page will show a "Continue with &lt;name&gt;" button for each configured OIDC provider.
