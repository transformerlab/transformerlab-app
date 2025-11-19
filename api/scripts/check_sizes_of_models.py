# Use this to scan your huggingface directory and print out the size
# of each model

import os


def get_dir_size(path):
    total = 0
    if not os.path.exists(path):
        return total
    with os.scandir(path) as it:
        for entry in it:
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size(entry.path)
    return total


cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
for entry in os.scandir(cache_dir):
    if entry.is_dir():
        blobs_dir = os.path.join(entry.path, "blobs")
        if not os.path.isdir(blobs_dir):
            continue

        dir_size = get_dir_size(blobs_dir) / 1024 / 1024
        # print(f"{entry.name}: {dir_size:.1f} MB")

        # obtain the model name by getting the part of entry after the last "--":
        model_name = entry.name.split("--")[-1]
        print(f"{model_name}\n{dir_size:.1f}\n")
