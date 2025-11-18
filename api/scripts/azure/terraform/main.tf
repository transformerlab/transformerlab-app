terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = ">= 4.0.0"
    }
  }
}

# Automatically fetch the subscription id from your current Azure CLI login.
data "azurerm_client_config" "current" {}

provider "azurerm" {
  features {}
}

module "resource_group" {
  source = "./modules/resource_group"

  resource_group_name = var.resource_group_name
  location            = var.location
}

module "network" {
  source = "./modules/network"

  resource_group_name      = module.resource_group.resource_group_name
  location                 = var.location
  vnet_name                = var.vnet_name
  vnet_address_space       = var.vnet_address_space
  subnet_name              = var.subnet_name
  subnet_address_prefixes  = var.subnet_address_prefixes
  public_ip_name           = var.public_ip_name
  network_interface_name   = var.network_interface_name
  nsg_name                 = var.nsg_name
  security_rules           = var.security_rules
}

module "compute" {
  source = "./modules/compute"

  vm_name              = var.vm_name
  resource_group_name  = module.resource_group.resource_group_name
  location             = var.location
  vm_size              = var.vm_size
  admin_username       = var.admin_username
  network_interface_id = module.network.nic_id
  os_disk_storage_type = var.os_disk_storage_type
  os_disk_size_gb      = var.os_disk_size_gb
  image_publisher      = var.image_publisher
  image_offer          = var.image_offer
  image_sku            = var.image_sku
  image_version        = var.image_version
  cloud_init_file      = var.cloud_init_file
  ssh_private_key_file = var.ssh_private_key_file
  enable_gpu_driver    = var.enable_gpu_driver
}
