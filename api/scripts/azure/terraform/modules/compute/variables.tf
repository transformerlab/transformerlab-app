variable "vm_name" {
  description = "Name of the Virtual Machine"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the Resource Group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "vm_size" {
  description = "VM size"
  type        = string
}

variable "admin_username" {
  description = "Admin username for the VM"
  type        = string
}

variable "network_interface_id" {
  description = "ID of the Network Interface to attach to the VM"
  type        = string
}

variable "os_disk_storage_type" {
  description = "OS Disk storage account type"
  type        = string
}

variable "os_disk_size_gb" {
  description = "OS Disk size in GB"
  type        = number
}

variable "image_publisher" {
  description = "Publisher of the VM image"
  type        = string
}

variable "image_offer" {
  description = "Offer of the VM image"
  type        = string
}

variable "image_sku" {
  description = "SKU of the VM image"
  type        = string
}

variable "image_version" {
  description = "Version of the VM image"
  type        = string
}

variable "enable_gpu_driver" {
  description = "Set to true to enable the NVIDIA GPU driver extension for GPU VMs"
  type        = bool
  default     = false
}

variable "cloud_init_file" {
  description = "Path to the cloud-init file"
  type        = string
}

variable "ssh_private_key_file" {
  description = "File path to save the generated SSH private key"
  type        = string
}
