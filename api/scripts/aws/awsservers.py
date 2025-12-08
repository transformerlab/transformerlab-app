import json
import sys


def list_servers():
    servers = json.load(sys.stdin)["Reservations"][0]["Instances"]

    print("Server                 Type                 Status        Public IP         Server Name")
    print(
        "---------------------+--------------------+-------------+-----------------+------------------------------------------"
    )
    for server in servers:
        id = server["InstanceId"]
        instance_type = server["InstanceType"]
        status = server.get("State", {}).get("Name", "")
        ip_address = ""
        dns_name = ""

        if status == "running":
            ip_address = server.get("PublicIpAddress", "")
            dns_name = server.get("PublicDnsName", "")

        print(f"{id}    {instance_type:20} {status:13} {ip_address:17} {dns_name}")


# Take first parameter and use it to call a function
if __name__ == "__main__":
    # args: [0] = current file, [1] = function name, [2:] = function args : (*unpacked)
    args = sys.argv
    globals()[args[1]](*args[2:])
