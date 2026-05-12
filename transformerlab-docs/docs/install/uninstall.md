---
title: Uninstall
sidebar_position: 200
---

# Uninstall Transformer Lab

:::warning
This page is no longer maintained. See the latest setup steps on the [For Teams install page](/for-teams/install).
:::

- **MacOS:** Delete the `~/.transformerlab/` Directory
- **Windows:** Delete the `~/.transformerlab/` Directory in WSL
- **Linux:** Delete the `~/.transformerlab/` Directory

### Stored Data

- Transformer Lab stores models and data in your `~/.transformerlab/` folder -- deleting everything there will destroy all your settings and experiments

### Clear Python Cache

Transformer Lab uses `uv` to install Python packages. You may also want to clear the `uv` cache. Instructions are below:

https://docs.astral.sh/uv/concepts/cache/#clearing-the-cache

### Delete Models and Datasets

Most models and datasets that are downloaded in Transformer Lab are downloaded using Hugging Face Hub which stores them at `~/.cache/huggingface/hub`. Delete this directory to remove the large model files, unless you want them available to other applications.
