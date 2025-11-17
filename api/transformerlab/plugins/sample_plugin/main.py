# This is a sample plugin that just displays the parameters that are provided to it
# It is used to test the plugin system
import argparse
import json

# Connect to the LLM Lab database (you can use this to update job status in the jobs table)
# llmlab_root_dir = os.getenv('LLM_LAB_ROOT_PATH')
# db = sqlite3.connect(llmlab_root_dir + "/workspace/llmlab.sqlite3")


def main():
    # Get all arguments provided to this script using argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--input_file", type=str)
    args, unknown = parser.parse_known_args()

    with open(args.input_file) as json_file:
        input = json.load(json_file)

    print("Input to Script:")
    print(input)


if __name__ == "__main__":
    main()
