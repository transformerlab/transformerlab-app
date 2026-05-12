---
title: Install
sidebar_position: 1
---

import Button from '@site/src/components/Button';
import { FaApple } from "react-icons/fa";
import { FaWindows } from "react-icons/fa";
import { FaLinux } from "react-icons/fa";

# Install Transformer Lab for Individuals

:::warning
This page is no longer maintained. See the latest setup steps on the [For Teams install page](/for-teams/install).
:::

For install instructions for Transformer Lab **for Teams**, [go here](/for-teams/install).

## Pre-Requisites

- MacOS <FaApple/>, Linux <FaLinux/>, or Windows (inside WSL2) <FaWindows/>
- Git and curl installed

## Step 1. Install Transformer Lab

```bash
curl -LsSf https://lab.cloud/install.sh | bash
```

## Step 2. Run Transformer Lab

```bash
cd ~/.transformerlab/src
./run.sh
```

## Step 3. Access the Web UI

You can now go to any modern browser and visit the URL of the server that was run by the previous command. For example if you are running on localhost, open Firefox or Chrome and visit:

`http://localhost:8338`

Here is a screenshot of what you should see:

![Web UI](./img/webui.png)

## Platform Specific Tips:

### Windows

1. Make sure you have WSL and CUDA drivers installed ([detailed instructions here](./windows-wsl-cuda.md))

### Linux

:::tip
Transformer Lab should work on most distros of Linux that support your GPU. We recommend [PopOS](https://pop.system76.com/) because it has great support for automatically installing NVIDIA drivers.

If you have a machine with an [AMD GPU, follow the instructions here](./install-on-amd.md).

![PopOS Screenshot](./img/popos.webp)
:::

### Step 1 - Ensure NVIDIA Drivers are Installed

If you installed PopOS you will have the option to select an NVIDIA enabled version of PopOS installed by default. You can test that NVIDIA support is successfully installed by running the following command in a command prompt and you should get output similar to what is shown below:

```bash
nvidia-smi
```

![nvidia-smi output](./img/nvidia-smi-output.png)

If this worked, congratulations, NVIDIA support for your Linux install is working and you can proceed with downloading and installing Transformer Lab.

If you need to install the nvidia drivers from scratch, there are instructions below for different versions of Linux:

- For PopOS: https://support.system76.com/articles/system76-driver/
- For Ubuntu: https://ubuntu.com/server/docs/nvidia-drivers-installation
- For everything else: https://docs.nvidia.com/datacenter/tesla/driver-installation-guide/index.html
