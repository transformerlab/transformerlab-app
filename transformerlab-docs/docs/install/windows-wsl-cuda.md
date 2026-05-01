---
title: Windows - Install WSL and CUDA
sidebar_position: 22
---

import Button from '@site/src/components/Button';

# Advanced: Installing WSL2 and CUDA on Windows

:::warning
This page is no longer maintained. See the latest setup steps on the [For Teams install page](/for-teams/install).
:::

CUDA is the toolkit that allows you to connect to NVIDIA GPUs. You can skip installing CUDA if you do not have an NVIDIA GPU. Without CUDA, Transformer Lab can do basic tasks, but an NVIDIA GPU is needed to unlock advanced LLM work.

To run Transformer Lab, you also need to install WSL2. WSL2 is a full Linux kernel integration in Windows that enables running Linux distributions natively -- this is where our Transformer Lab's Python Machine Learning workspace will run.

## Installing WSL2 and CUDA

Instructions for installing both WSL2 and CUDA are in the following document:

https://learn.microsoft.com/en-us/windows/ai/directml/gpu-cuda-in-wsl

Essentially, you need to install the CUDA toolkit which you can find here:

https://developer.nvidia.com/cuda-downloads

And then you need to install WSL2 on Windows by running the following command in the Windows Powershell (run as administrator).

```bash
wsl --install
```

(Detailed instructions for installing WSL2 are [here](https://learn.microsoft.com/en-us/windows/wsl/install).)

:::note

For Transformer Lab to work, make sure that your default WSL instance is **Ubuntu**. WSL lets you install multiple distros but you can set the default using the following command:

```
wsl --set-default Ubuntu
```

:::
