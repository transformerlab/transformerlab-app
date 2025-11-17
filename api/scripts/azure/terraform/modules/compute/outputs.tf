output "ssh_private_key" {
  description = "Private SSH key for accessing the VM"
  value       = tls_private_key.vm_key.private_key_pem
  sensitive   = true
}
