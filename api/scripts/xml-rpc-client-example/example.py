import json  # For pretty-printing the results
import xmlrpc.client

# Connect to the XML-RPC server
server = xmlrpc.client.ServerProxy("http://localhost:8338/job_sdk")

# Get a simple string response
hello_result = server.hello("XML-RPC User")
print(f"String result: {hello_result}")

# Get a dictionary/object response
user = server.get_user(1)
print("\nDictionary result:")
print(json.dumps(user, indent=2))  # Pretty print the dictionary

# Get a list of objects
users = server.list_users()
print("\nList of objects result:")
print(json.dumps(users, indent=2))

# Get a complex nested object
project = server.get_project_data(123)
print("\nComplex nested object result:")
print(json.dumps(project, indent=2))

# Check what happens with non-existent data
missing_user = server.get_user(999)
print("\nNon-existent data result:")
print(json.dumps(missing_user, indent=2))

# We can also work with the returned objects directly
if user.get("active", False):
    print(f"\nUser {user['name']} is active!")
else:
    print(f"\nUser {user['name']} is not active!")

# Calculate average progress of tasks in a project
if "tasks" in project:
    complete_tasks = sum(1 for task in project["tasks"] if task["complete"])
    total_tasks = len(project["tasks"])
    print(
        f"\nProject task completion: {complete_tasks}/{total_tasks} ({complete_tasks / total_tasks * 100:.0f}%)"
    )
