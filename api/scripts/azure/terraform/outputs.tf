output "subscription_id" {
  description = "Subscription ID used for the deployment"
  value       = data.azurerm_client_config.current.subscription_id
}

output "vm_public_ip" {
  description = "Public IP address of the VM"
  value       = module.network.public_ip
}

output "ssh_private_key" {
  description = "Private SSH key for accessing the VM. Share this securely."
  value       = module.compute.ssh_private_key
  sensitive   = true
}
