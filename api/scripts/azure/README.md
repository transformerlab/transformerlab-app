# Terraform Resource Deployment on Azure for Transformerlab-api server

This folder provides a modular Terraform setup for provisioning Azure resources and deploying he transformerlab-api server. It includes a helper script (`run.sh`) that automatically:

- Checks if the resources defined in your configuration already exist.
- Imports any existing resources into Terraform's state.
- Skips resources that are already managed by Terraform.
- Creates missing resources upon running `terraform apply`.

This script creates the following resources on Azure (if they don't exist):

- Resource Group
- Virtual Network
- Subnet
- Public IP
- Network Interface
- Network Security Group
- Network Interface and Security Group Association
- Virtual Machine

It also includes a cloud-init script to provision a Linux virtual machine that runs the Transformer Lab API service on a provisioned Azure VM.

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **For Windows Users :**
    - Install [WSL for Windows](https://learn.microsoft.com/en-us/windows/wsl/install)
    - Open `cmd` and run the command `wsl` to start a Linux (Ubuntu) terminal to proceed...

- **Terraform**  
  [Install Terraform](https://learn.hashicorp.com/tutorials/terraform/install-cli) (v1.0+ recommended)

- **Azure CLI**  
  [Install Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)

- **Git** (optional, to clone this repository)

---

## Setup

1. **Azure Authentication**  
   
    Log in to your Azure account using the Azure CLI:
    ```bash
    az login
    ```
    **Note :** *You should have the necessary permissions to create necessary resources on Azure - Owner permission is Ideal*

2. **Clone the Repository**
    
    If you haven't already, clone this repository:
    ```bash
    git clone https://github.com/transformerlab/transformerlab-api.git
    cd transformerlab-api/scripts/azure/terraform
    ```

3. **Configure Resource Names and Machine Types**

    Copy the `terraform.tfvars.tpl` file to create a new terraform.tfvars file before editing it:

    ```bash
    cp terraform.tfvars.tpl terraform.tfvars
    ```
    
    The deployment uses a `terraform.tfvars` file to define resource names, locations, VM sizes, etc. It is equivalent to a `.env` file used in Python to set configs or variables.

    - Edit `terraform.tfvars` (if needed) to set custom values.
    - Ensure that the variables you set (for example, `resource_group_name`, `vm_name`, etc.) are not commented out (i.e., remove any `#` at the beginning of lines).
    
    Example snippet from `terraform.tfvars`:

    ```bash
    # # The name of the resource group. This value is also passed into the resource_group and compute modules.
    # resource_group_name = "rg-custom"           # e.g., "rg-myproject"

    # # The Azure region where resources will be deployed.
    # location = "eastus2"                        # e.g., "eastus", "westus2", etc.
    ```

    - **NVidia GPU VMs on Azure:**

        - Ensure the `enable_gpu_driver` variable is set to `true` and the line is uncommented to pre-install NVidia drivers. Works for all NC series (*T4s, A100s and H100s*) and NV series (*V100s*). 
        - In case you missed it, you can also manually install the drivers in the VM using ssh. 


    **Note :** *The Terraform configuration will automatically provision default resources if this file is not edited, the intention of this file is to re-use anything you already have deployed on Azure for the deployment.*

---

## Running the Deployment

1. **Run the Import/Creation Script**

    The provided `run.sh` script will check if each resource exists in Azure and if it is already imported into Terraform’s state. If a resource is found in Azure but not in the state, it will be imported automatically. If it does not exist, Terraform will create it on `terraform apply`.

    To create and start your server, run:

    ```bash
    ./run.sh

The script should take care of provisioning the resources and starting a VM with transformerlab api running inside. The script will also output the public IP of the VM on the command line to be used in the `Connect to Remote Engine` screen.

```bash
Apply complete! Resources: 11 added, 0 changed, 0 destroyed.

Outputs:

ssh_private_key = <sensitive>
subscription_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
vm_public_ip = "xxx.xxx.xxx.xxx"
```

---

## Post Deployment

**Connect to Remote Server**

Open the Transformer Lab desktop application and click on `Connect to Remote Server` and enter the Public IP that was created. 

**Note :** *It might take few minutes for the server to install dependencies and start, recommended wait time is 5-10 minutes.*

---

## Troubleshooting

1. **SSH into the VM**

    After deployment, you can SSH into the Linux VM using the generated private key. The key is saved (by default) in your home directory (e.g.,`~/.ssh/az_vm_prvt_key.pem`). Use the admin username that you set for the VM (default = `azureuser`)

    Example SSH command:

    ```bash
    ssh-keygen -R <VM_PUBLIC_IP>
    ssh -i ~/.ssh/az_vm_prvt_key.pem <admin_username>@<VM_PUBLIC_IP>
    ```
    Replace `<admin_username>` with the username set for VM and `<VM_PUBLIC_IP>` with the public IP address output from Terraform.

2. **Viewing Transformer Lab Service Logs**

    The VM uses a systemd service named transformerlab.service to run the API. To check the service status or view logs for any errors:

    - Check the Service Status:

        ```bash
        sudo systemctl status transformerlab.service
        ```

    - View Service Logs:

        ```bash
        sudo journalctl -u transformerlab.service -f
        ```
    
    This command will stream live logs, allowing you to monitor the service in real time.

3. **GPU not detected from VM**

    - SSH into the VM and check if the `nvidia-smi` command shows the GPU details
    - If the above command shows that the drivers aren't installed properly, reinstall the extension:
        - Go to [Azure Portal](https://portal.azure.com/) 
        - Click on `Virtual Machines`.
        - Click on the name of the provisioned VM.
        - Then navigate to Settings --> Extensions + applications 
        - Click on `+ Add`
        - Search `NVidia GPU Driver Extension` and click on `Next`
        - Click on `Review + create`
        - It should take about 5-7 minutes to reinstall the extension

---

## Destroying the created resources

    Terraform commands can be used to destroy the resources (Available as commented lines inside `run.sh`)

    - Destroy only the VM:

        ```bash
        export ARM_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
        terraform destroy --target=module.compute.azurerm_linux_virtual_machine.vm -auto-approve
        ```

    - Destroy all resources

        ```bash
        export ARM_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
        terraform destroy -auto-approve
        ```

    - Cleanup the SSH private key
        
        ```bash
        ssh-keygen -R $(terraform output -raw vm_public_ip)
        rm -f ~/.ssh/az_vm_prvt_key.pem
        ```

---

## Directory Structure

The directory structure for this deployment is as follows:

```bash
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── terraform.tfvars.tpl  # User overrides for resource names and settings - (copy to terrafform.tfvars before editing)
├── run.sh                # Helper script to check and import resources
├── cloud-init/
│   └── cloud-init.yaml   # Cloud-init script for VM provisioning
└── modules/
    ├── resource_group/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── network/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── compute/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```