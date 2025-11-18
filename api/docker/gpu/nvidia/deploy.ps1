# Check if curl exists, install if missing
if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
    Write-Output "curl not found, installing curl..."
    winget install --id curl.curl -e --source winget
}

# GitHub repo details
$repo = "transformerlab/transformerlab-api"
$url = "https://api.github.com/repos/$repo/releases/latest"

# Get latest version from GitHub
$response = Invoke-RestMethod -Uri $url -Method Get
if (-not $response.tag_name) {
    Write-Output "Failed to fetch the latest version."
    exit 1
}

# Remove leading 'v'
$version = $response.tag_name.TrimStart("v")

Write-Output "Latest TransformerLab API version: $version"

# Set environment paths
$homeDir = $env:USERPROFILE.Replace("\", "/")

# Read template and substitute version and HOME variable
$template = Get-Content -Path ".\docker-compose.yml.tpl" -Raw
$content = $template `
    -replace '\$\{VERSION\}', $version `
    -replace '\$\{HOME\}', $homeDir

# Write final docker-compose file
$content | Out-File -FilePath ".\docker-compose.yml" -Encoding utf8

Write-Output "Generated docker-compose.yml with image version: $version-cuda and HOME: $homeDir"

# Deploy using docker compose
docker compose up -d
