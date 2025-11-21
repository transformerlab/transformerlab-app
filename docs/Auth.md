# Authentication in Transformer Lab
(Developer Documentation)

## FastAPI Users

We implement auth in Transformer Lab using FastAPI Users:

https://github.com/fastapi-users/fastapi-users

https://fastapi-users.github.io/fastapi-users/latest/

## Auth strategy

We use JWT Auth. In models/users.py you will also see that we extend the default JWT to also add a refresh token.


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
