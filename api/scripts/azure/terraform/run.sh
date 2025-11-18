#!/bin/bash
set -e

# ------------------------------
# Helper Functions
# ------------------------------

# Extract a string value (expects a quoted value) from terraform.tfvars.
get_tfvar_value_string() {
  local var_name="$1"
  local default_value="$2"
  local value
  value=$(grep -E "^\s*${var_name}\s*=" terraform.tfvars | head -n1 | cut -d'=' -f2-)
  # Trim leading/trailing whitespace and remove surrounding quotes if any.
  value=$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
  echo "${value:-$default_value}"
}

# Extract the raw value (works for arrays and objects) from terraform.tfvars.
get_tfvar_value_raw() {
  local var_name="$1"
  local default_value="$2"
  local line
  line=$(grep -E "^\s*${var_name}\s*=" terraform.tfvars | grep -v '^\s*#' | head -n1 || true)
  if [[ -n "$line" ]]; then
    # Remove variable name and equal sign; preserve original formatting.
    value=$(echo "$line" | sed -E "s/^\s*${var_name}\s*=\s*(.*)/\1/")
  else
    value="$default_value"
  fi
  echo "$value"
}

# Check if a resource is already in the Terraform state.
is_imported() {
  local resource_name="$1"
  if terraform state list 2>/dev/null | grep -q "${resource_name}"; then
    return 0
  else
    return 1
  fi
}

# ------------------------------
# Get Azure Subscription ID
# ------------------------------
subscription_id=$(az account show --query id -o tsv)
echo "Subscription ID: ${subscription_id}"
export ARM_SUBSCRIPTION_ID=${subscription_id}

# ------------------------------
# Read All Configurations from terraform.tfvars
# ------------------------------

# Resource Group and Location
rg_name=$(get_tfvar_value_string "resource_group_name" "rg-transformerlab")
location=$(get_tfvar_value_string "location" "eastus")

# Network Configuration
vnet_name=$(get_tfvar_value_string "vnet_name" "vnet-transformerlab")
vnet_address_space=$(get_tfvar_value_raw "vnet_address_space" '["10.0.0.0/16"]')
subnet_name=$(get_tfvar_value_string "subnet_name" "subnet-transformerlab")
subnet_address_prefixes=$(get_tfvar_value_raw "subnet_address_prefixes" '["10.0.1.0/24"]')
public_ip_name=$(get_tfvar_value_string "public_ip_name" "pip-transformerlab")
nic_name=$(get_tfvar_value_string "network_interface_name" "nic-transformerlab")
nsg_name=$(get_tfvar_value_string "nsg_name" "nsg-transformerlab")
security_rules=$(get_tfvar_value_raw "security_rules" "[ { name = \"Allow-SSH\", ... } ]")  # Summary of security rules

# Compute / VM Configuration
vm_name=$(get_tfvar_value_string "vm_name" "vm-transformerlab")
vm_size=$(get_tfvar_value_string "vm_size" "Standard_D8s_v3")
admin_username=$(get_tfvar_value_string "admin_username" "azureuser")
gpu_driver=$(get_tfvar_value_string "enable_gpu_driver" "false")
os_disk_storage_type=$(get_tfvar_value_string "os_disk_storage_type" "Premium_LRS")
os_disk_size_gb=$(get_tfvar_value_string "os_disk_size_gb" "200")
image_publisher=$(get_tfvar_value_string "image_publisher" "Canonical")
image_offer=$(get_tfvar_value_string "image_offer" "0001-com-ubuntu-server-jammy")
image_sku=$(get_tfvar_value_string "image_sku" "22_04-lts-gen2")
image_version=$(get_tfvar_value_string "image_version" "latest")
cloud_init_file=$(get_tfvar_value_string "cloud_init_file" "./cloud-init/cloud-init.yaml")
ssh_private_key_file=$(get_tfvar_value_string "ssh_private_key_file" "~/.ssh/az_vm_prvt_key.pem")

# ------------------------------
# Print Configuration Summary
# ------------------------------
echo "------------------------------------------"
echo "Terraform Deployment Configuration Summary:"
echo "Resource Group         : ${rg_name}"
echo "Location               : ${location}"
echo "Virtual Network Name   : ${vnet_name}"
echo "VNet Address Space     : ${vnet_address_space}"
echo "Subnet Name            : ${subnet_name}"
echo "Subnet Prefixes        : ${subnet_address_prefixes}"
echo "Public IP Name         : ${public_ip_name}"
echo "Network Interface Name : ${nic_name}"
echo "NSG Name               : ${nsg_name}"
echo "Security Rules         : ${security_rules}"
echo "VM Name                : ${vm_name}"
echo "VM Size                : ${vm_size}"
echo "Enable GPU Driver      : ${gpu_driver}"
echo "Admin Username         : ${admin_username}"
echo "OS Disk Storage Type   : ${os_disk_storage_type}"
echo "OS Disk Size (GB)      : ${os_disk_size_gb}"
echo "Image Publisher        : ${image_publisher}"
echo "Image Offer            : ${image_offer}"
echo "Image SKU              : ${image_sku}"
echo "Image Version          : ${image_version}"
echo "Cloud Init File        : ${cloud_init_file}"
echo "SSH Private Key File   : ${ssh_private_key_file}"
echo "------------------------------------------"

# ------------------------------
# Resource Import Procedures
# ------------------------------

if is_imported "module.resource_group.azurerm_resource_group.rg"; then
  echo "Resource group '${rg_name}' is already imported. Skipping import."
else
  if [[ $(az group exists --name "$rg_name") == "true" ]]; then
    echo "Resource group '${rg_name}' exists. Importing..."
    terraform import module.resource_group.azurerm_resource_group.rg "/subscriptions/${subscription_id}/resourceGroups/${rg_name}" || true
  else
    echo "Resource group '${rg_name}' does not exist. It will be created by Terraform."
  fi
fi

# Virtual Network (defined in module "network")
if is_imported "module.network.azurerm_virtual_network.vnet"; then
  echo "Virtual network '${vnet_name}' is already imported. Skipping import."
else
  if az network vnet show --resource-group "$rg_name" --name "$vnet_name" >/dev/null 2>&1; then
    echo "Virtual network '${vnet_name}' exists. Importing..."
    terraform import module.network.azurerm_virtual_network.vnet "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/virtualNetworks/${vnet_name}" || true
  else
    echo "Virtual network '${vnet_name}' does not exist. It will be created by Terraform."
  fi
fi

# Subnet (defined in module "network")
if is_imported "module.network.azurerm_subnet.subnet"; then
  echo "Subnet '${subnet_name}' is already imported. Skipping import."
else
  if az network vnet subnet show --resource-group "$rg_name" --vnet-name "$vnet_name" --name "$subnet_name" >/dev/null 2>&1; then
    echo "Subnet '${subnet_name}' exists. Importing..."
    terraform import module.network.azurerm_subnet.subnet "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/virtualNetworks/${vnet_name}/subnets/${subnet_name}" || true
  else
    echo "Subnet '${subnet_name}' does not exist. It will be created by Terraform."
  fi
fi

# Public IP (defined in module "network")
if is_imported "module.network.azurerm_public_ip.pip"; then
  echo "Public IP '${public_ip_name}' is already imported. Skipping import."
else
  if az network public-ip show --resource-group "$rg_name" --name "$public_ip_name" >/dev/null 2>&1; then
    echo "Public IP '${public_ip_name}' exists. Importing..."
    terraform import module.network.azurerm_public_ip.pip "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/publicIPAddresses/${public_ip_name}" || true
  else
    echo "Public IP '${public_ip_name}' does not exist. It will be created by Terraform."
  fi
fi

# Network Interface (defined in module "network")
if is_imported "module.network.azurerm_network_interface.nic"; then
  echo "Network interface '${nic_name}' is already imported. Skipping import."
else
  if az network nic show --resource-group "$rg_name" --name "$nic_name" >/dev/null 2>&1; then
    echo "Network interface '${nic_name}' exists. Importing..."
    terraform import module.network.azurerm_network_interface.nic "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/networkInterfaces/${nic_name}" || true
  else
    echo "Network interface '${nic_name}' does not exist. It will be created by Terraform."
  fi
fi

# Network Security Group (defined in module "network")
if is_imported "module.network.azurerm_network_security_group.nsg"; then
  echo "NSG '${nsg_name}' is already imported. Skipping import."
else
  if az network nsg show --resource-group "$rg_name" --name "$nsg_name" >/dev/null 2>&1; then
    echo "Network security group '${nsg_name}' exists. Importing..."
    terraform import module.network.azurerm_network_security_group.nsg "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/networkSecurityGroups/${nsg_name}" || true
  else
    echo "Network security group '${nsg_name}' does not exist. It will be created by Terraform."
  fi
fi

# NSG Association (defined in module "network")
if is_imported "module.network.azurerm_network_interface_security_group_association.nsg_assoc"; then
  echo "NSG association is already imported. Skipping import."
else
  if az network nic show --resource-group "$rg_name" --name "$nic_name" >/dev/null 2>&1 && \
     az network nsg show --resource-group "$rg_name" --name "$nsg_name" >/dev/null 2>&1; then
    echo "Network interface and NSG exist. Importing NSG association..."
    terraform import module.network.azurerm_network_interface_security_group_association.nsg_assoc "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/networkInterfaces/${nic_name}|/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Network/networkSecurityGroups/${nsg_name}" || true
  else
    echo "Network interface or NSG does not exist. NSG association will be created by Terraform."
  fi
fi

# Linux Virtual Machine (defined in module "compute")
if is_imported "module.compute.azurerm_linux_virtual_machine.vm"; then
  echo "Virtual machine '${vm_name}' is already imported. Skipping import."
else
  if az vm show --resource-group "$rg_name" --name "$vm_name" >/dev/null 2>&1; then
    echo "Virtual machine '${vm_name}' exists. Importing..."
    terraform import module.compute.azurerm_linux_virtual_machine.vm "/subscriptions/${subscription_id}/resourceGroups/${rg_name}/providers/Microsoft.Compute/virtualMachines/${vm_name}" || true
  else
    echo "Virtual machine '${vm_name}' does not exist. It will be created by Terraform."
  fi
fi

# Refresh Terraform state to ensure all imports are up-to-date.
echo "Refreshing Terraform state..."
terraform refresh

echo "Resource checks and imports completed."

# ------------------------------
# Terraform Provisioning
# ------------------------------

# Initialize, plan and apply with the tfvars file so that all user configurations are honored.
terraform init -upgrade
terraform plan -var-file="terraform.tfvars" -out out.plan
terraform apply "out.plan"

# Save the SSH private key to a file (ensure the output variable 'ssh_private_key' exists in your Terraform configuration)

# Use eval echo to expand any tilde in the path.
ssh_key_file=$(eval echo "${ssh_private_key_file}")

# Ensure the directory exists.
mkdir -p "$(dirname "${ssh_key_file}")"

# Write the SSH private key output to the expanded file location.
terraform output -raw ssh_private_key > "${ssh_key_file}"
chmod 600 "${ssh_key_file}"