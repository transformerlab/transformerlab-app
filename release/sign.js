const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Azure signing configuration
const config = {
  certProfileName: process.env.AZURE_CERT_PROFILE_NAME,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  codeSigningName: process.env.AZURE_CODE_SIGNING_NAME,
  endpoint: process.env.AZURE_ENDPOINT,
  tenantId: process.env.AZURE_TENANT_ID,
};

// Get signtool path from Windows SDK
const getSignToolPath = () => {
  // Default Windows SDK paths in GitHub Actions runners
  const windowsSdkPaths = [
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.17763.0\\x64\\signtool.exe',
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.19041.0\\x64\\signtool.exe',
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe',
  ];

  for (const sdkPath of windowsSdkPaths) {
    if (fs.existsSync(sdkPath)) {
      return sdkPath;
    }
  }

  throw new Error('Could not find signtool.exe in Windows SDK paths');
};

// Validate environment variables
const validateConfig = () => {
  const requiredVars = [
    'certProfileName',
    'clientId',
    'clientSecret',
    'codeSigningName',
    'endpoint',
    'tenantId',
  ];

  const missingVars = requiredVars.filter((varName) => !config[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
};

// Sign the application using Azure Trusted Signing
const signApplication = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`Signing file: ${filePath}`);

  try {
    const signToolPath = getSignToolPath();
    console.log(`Using signtool from: ${signToolPath}`);

    // Construct the signtool command
    const signToolCommand = [
      `"${signToolPath}"`,
      'sign',
      '/fd SHA256',
      '/tr http://timestamp.digicert.com',
      '/td SHA256',
      `/as "${filePath}"`,
      `/dlib "${config.endpoint}"`,
      `/dmdf "${config.codeSigningName}"`,
      `/dcid "${config.clientId}"`,
      `/dcs "${config.clientSecret}"`,
      `/dtid "${config.tenantId}"`,
      `/dcpn "${config.certProfileName}"`,
    ].join(' ');

    // Execute the signing command
    execSync(signToolCommand, { stdio: 'inherit' });

    console.log('Signing completed successfully');
    return true;
  } catch (error) {
    console.error('Signing failed:', error.message);
    throw error;
  }
};

// Main execution
try {
  // Get the file path from command line arguments
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error(
      'Please provide the path to the file to sign as a command line argument'
    );
  }

  // Validate environment variables
  validateConfig();

  // Sign the application
  signApplication(filePath);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
