variable "resource_group_name" {
  description = "Name of the Resource Group"
  type        = string
  default     = "rg-transformerlab"
}

variable "location" {
  description = "Azure region to deploy resources"
  type        = string
  default     = "eastus"
}

variable "vnet_name" {
  description = "Name of the Virtual Network"
  type        = string
  default     = "vnet-transformerlab"
}

variable "vnet_address_space" {
  description = "Address space for the Virtual Network"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "subnet_name" {
  description = "Name of the Subnet"
  type        = string
  default     = "subnet-transformerlab"
}

variable "subnet_address_prefixes" {
  description = "Address prefixes for the Subnet"
  type        = list(string)
  default     = ["10.0.1.0/24"]
}

variable "public_ip_name" {
  description = "Name of the Public IP"
  type        = string
  default     = "pip-transformerlab"
}

variable "network_interface_name" {
  description = "Name of the Network Interface"
  type        = string
  default     = "nic-transformerlab"
}

variable "nsg_name" {
  description = "Name of the Network Security Group"
  type        = string
  default     = "nsg-transformerlab"
}

variable "security_rules" {
  description = "List of security rules for the NSG"
  type = list(object({
    name                       = string
    priority                   = number
    direction                  = string
    access                     = string
    protocol                   = string
    source_port_range          = string
    destination_port_range     = string
    source_address_prefix      = string
    destination_address_prefix = string
  }))
  default = [
    {
      name                       = "Allow-SSH"
      priority                   = 1001
      direction                  = "Inbound"
      access                     = "Allow"
      protocol                   = "Tcp"
      source_port_range          = "*"
      destination_port_range     = "22"
      source_address_prefix      = "*"
      destination_address_prefix = "*"
    },
    {
      name                       = "Allow-FastAPI"
      priority                   = 1002
      direction                  = "Inbound"
      access                     = "Allow"
      protocol                   = "Tcp"
      source_port_range          = "*"
      destination_port_range     = "8338"
      source_address_prefix      = "*"
      destination_address_prefix = "*"
    }
  ]
}

variable "vm_name" {
  description = "Name of the Virtual Machine"
  type        = string
  default     = "vm-transformerlab"
}

variable "vm_size" {
  description = "VM size (e.g. Standard_D8s_v3)"
  type        = string
  default     = "Standard_D8s_v3"
}

variable "admin_username" {
  description = "Admin username for the VM"
  type        = string
  default     = "azureuser"
}

variable "os_disk_storage_type" {
  description = "OS Disk storage account type"
  type        = string
  default     = "Standard_LRS"
}

variable "os_disk_size_gb" {
  description = "OS Disk size in GB"
  type        = number
  default     = 200
}

variable "image_publisher" {
  description = "Publisher of the VM image"
  type        = string
  default     = "Canonical"
}

variable "image_offer" {
  description = "Offer of the VM image"
  type        = string
  default     = "0001-com-ubuntu-server-jammy"
}

variable "image_sku" {
  description = "SKU of the VM image"
  type        = string
  default     = "22_04-lts"
}

variable "image_version" {
  description = "Version of the VM image"
  type        = string
  default     = "latest"
}

variable "enable_gpu_driver" {
  description = "Set to true to enable the NVIDIA GPU driver extension for GPU VMs"
  type        = bool
  default     = false
}

variable "cloud_init_file" {
  description = "Path to the cloud-init file"
  type        = string
  default     = "$./cloud-init/cloud-init.yaml"
}

variable "ssh_private_key_file" {
  description = "File path to save the generated SSH private key"
  type        = string
  default     = "~/.ssh/az_vm_prvt_key.pem"
}
