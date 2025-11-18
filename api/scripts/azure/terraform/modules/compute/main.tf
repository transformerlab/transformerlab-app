resource "tls_private_key" "vm_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "azurerm_linux_virtual_machine" "vm" {
  name                  = var.vm_name
  resource_group_name   = var.resource_group_name
  location              = var.location
  size                  = var.vm_size
  admin_username        = var.admin_username
  network_interface_ids = [ var.network_interface_id ]
  
  admin_ssh_key {
    username   = var.admin_username
    public_key = tls_private_key.vm_key.public_key_openssh
  }
  
  disable_password_authentication = true

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = var.os_disk_storage_type
    disk_size_gb         = var.os_disk_size_gb
  }

  source_image_reference {
    publisher = var.image_publisher
    offer     = var.image_offer
    sku       = var.image_sku
    version   = var.image_version
  }

  custom_data = base64encode(file(var.cloud_init_file))
}

resource "azurerm_virtual_machine_extension" "gpu_driver" {
  count                      = var.enable_gpu_driver ? 1 : 0
  name                       = "NvidiaGpuDriverLinux"
  virtual_machine_id         = azurerm_linux_virtual_machine.vm.id
  publisher                  = "Microsoft.HpcCompute"
  type                       = "NvidiaGpuDriverLinux"
  type_handler_version       = "1.9"
  auto_upgrade_minor_version = true
}

resource "local_file" "ssh_private_key_file" {
  content         = tls_private_key.vm_key.private_key_pem
  filename        = var.ssh_private_key_file
  file_permission = "0600"
}
