# ##############################
# # Root Module Variables
# ##############################

# # The name of the resource group. This value is also passed into the resource_group and compute modules.
# resource_group_name = "rg-custom"           

# # The Azure region where resources will be deployed.
# location = "eastus2"                        

# ##############################
# # Network Module Variables
# ##############################

# # Virtual Network configuration:
# vnet_name          = "vnet-custom"            
# vnet_address_space = ["10.1.0.0/16"]            

# # Subnet configuration:
# subnet_name             = "subnet-custom"       
# subnet_address_prefixes = ["10.1.1.0/24"]       

# # Public IP and Network Interface configuration:
# public_ip_name         = "pip-custom"           
# network_interface_name = "nic-custom"           

# # Network Security Group (NSG) configuration:
# nsg_name = "nsg-custom"                        

# # Define NSG security rules as a list of objects. You can add, remove, or modify rules.
# security_rules = [
#   {
#     name                       = "Allow-SSH"     
#     priority                   = 1001            
#     direction                  = "Inbound"       
#     access                     = "Allow"         
#     protocol                   = "Tcp"           
#     source_port_range          = "*"            
#     destination_port_range     = "22"            
#     source_address_prefix      = "*"             
#     destination_address_prefix = "*"             
#   },
#   {
#     name                       = "Allow-FastAPI"
#     priority                   = 1002
#     direction                  = "Inbound"
#     access                     = "Allow"
#     protocol                   = "Tcp"
#     source_port_range          = "*"
#     destination_port_range     = "8338"
#     source_address_prefix      = "*"
#     destination_address_prefix = "*"
#   },
#   {
#     name                       = "Allow-Electron"
#     priority                   = 1003
#     direction                  = "Inbound"
#     access                     = "Allow"
#     protocol                   = "Tcp"
#     source_port_range          = "*"
#     destination_port_range     = "1212"
#     source_address_prefix      = "*"
#     destination_address_prefix = "*"
#   }
# ]

# ##############################
# # Compute Module Variables
# ##############################

# # Virtual Machine configuration:
# vm_name   = "vm-custom"                      
# vm_size   = "Standard_NC8as_T4_v3"                
# admin_username = "adminuser"                 
# enable_gpu_driver = true                    

# # OS Disk configuration:
# os_disk_storage_type = "Standard_LRS"         
# os_disk_size_gb      = 200                   

# # VM Image configuration:
# image_publisher = "canonical"                 
# image_offer     = "0001-com-ubuntu-server-jammy"              
# image_sku       = "22_04-lts"                 
# image_version   = "latest"                    

# # Cloud-init configuration file that provisions the VM on boot.
# cloud_init_file = "cloud-init/cloud-init.yaml"  

# # File path where the generated SSH private key will be saved.
# ssh_private_key_file = "~/.ssh/custom_key.pem"  
