# Gallery Sync Workflow

## Overview

The `sync-galleries.yml` workflow automatically syncs gallery JSON files from `api/transformerlab/galleries/` in this repository to the [transformerlab/galleries](https://github.com/transformerlab/galleries) repository whenever changes are merged to the `main` branch.

## How It Works

1. **Trigger**: The workflow runs when:
   - A PR is merged to `main`
   - The PR contains changes to any `*.json` file in `api/transformerlab/galleries/`

2. **Process**:
   - Checks out both repositories
   - Copies all gallery JSON files from this repo to the galleries repo
   - Commits and pushes changes if any files were modified
   - Includes a reference to the source commit for traceability

3. **Files Synced**:
   - `announcement-gallery.json`
   - `dataset-gallery.json`
   - `exp-recipe-gallery.json`
   - `interactive-gallery.json`
   - `model-gallery.json`
   - `model-group-gallery.json`
   - `plugin-gallery.json`
   - `task-gallery.json`

## Setup Requirements

### Personal Access Token (PAT)

The workflow requires a GitHub Personal Access Token with write access to the `transformerlab/galleries` repository.

**To set up the token:**

1. Create a PAT with `repo` scope (or fine-grained token with `Contents: Read and write` permission for the galleries repo)
2. Add it as a repository secret named `GALLERIES_SYNC_TOKEN` in this repository:
   - Go to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `GALLERIES_SYNC_TOKEN`
   - Value: Your PAT
   - Click "Add secret"

**Alternative**: If using a GitHub App or organization-level token, update the workflow to use that authentication method instead.

## Testing

To test the workflow:

1. Make a change to any gallery JSON file in `api/transformerlab/galleries/`
2. Create a PR and merge it to `main`
3. Check the Actions tab to see the workflow run
4. Verify the changes appear in the [transformerlab/galleries](https://github.com/transformerlab/galleries) repository

## Troubleshooting

- **Authentication errors**: Verify the `GALLERIES_SYNC_TOKEN` secret is set correctly and has the required permissions
- **No changes pushed**: The workflow only pushes if files actually changed (uses `git status --porcelain` to detect changes)
- **Workflow doesn't trigger**: Ensure your PR includes changes to `*.json` files in the `api/transformerlab/galleries/` directory
