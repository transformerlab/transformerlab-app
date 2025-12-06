import argparse
import random

from digit_seq_rewards import RewardFunction, generate_synthetic_data

"""
python generate_digit_data.py --increasing --multiple-of 2 --num-samples 150
"""


def build_data_gen_parser():
    parser = argparse.ArgumentParser(description="Synthetic digit generation dataset generation.")
    # Generation args
    parser.add_argument(
        "--num-samples",
        "-n",
        type=int,
        default=100,
        help="How many training, validation, and testing samples should we generate?",
    )
    parser.add_argument(
        "--min-length",
        type=int,
        default=5,
        help="What should be the minimum sequence length?",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=15,
        help="What should be the maximum sequence length?",
    )
    parser.add_argument(
        "--noise",
        type=float,
        default=0.2,
        help="How much noise should be inherent in the sequence generation?",
    )
    parser.add_argument(
        "--increasing",
        "-i",
        action="store_true",
        help="Should digits all be increasing?",
    )
    parser.add_argument(
        "--decreasing",
        "-d",
        action="store_true",
        help="Should digits all be decreasing?",
    )
    parser.add_argument(
        "--multiple-of",
        type=int,
        default=1,
        help="What integer should all digits be a multiple-of?",
    )
    parser.add_argument("--seed", type=int, default=0, help="The PRNG seed")
    return parser


if __name__ == "__main__":
    parser = build_data_gen_parser()
    args = parser.parse_args()
    if args.increasing and args.decreasing:
        raise ValueError('"--increasing (-i)" and "--decreasing (-d)" cannot both be true.')
    elif not args.increasing and not args.decreasing:
        raise ValueError('One of "--increasing (-i)" or "--decreasing (-d)" must be true.')

    reward_fn = RewardFunction(
        is_positive=False,
        is_negative=False,
        is_increasing=args.increasing,
        is_decreasing=args.decreasing,
        multiple_of=args.multiple_of,
    )
    random.seed(args.seed)
    train_data = generate_synthetic_data(
        reward_function=reward_fn,
        num_samples=args.num_samples,
        sequence_length_range=(args.min_length, args.max_length),
        percent_noise=args.noise,
    )
    val_data = generate_synthetic_data(
        reward_function=reward_fn,
        num_samples=args.num_samples,
        sequence_length_range=(args.min_length, args.max_length),
        percent_noise=args.noise,
    )
    test_data = generate_synthetic_data(
        reward_function=reward_fn,
        num_samples=args.num_samples,
        sequence_length_range=(args.min_length, args.max_length),
        percent_noise=args.noise,
    )

    filename_prefix = ""
    if args.increasing:
        filename_prefix += "increasing_"
    elif args.decreasing:
        filename_prefix += "decreasing_"
    filename_prefix += f"mult_{args.multiple_of}_"
    for ds, name in zip([train_data, val_data, test_data], ["train", "valid", "test"]):
        dict_ds = [{"text": x, "reward": str(reward_fn(x)[0])} for x in ds]

        with open(f"./{filename_prefix}{name}.jsonl", "w") as fp:
            for x in ds:
                new_str = '{"text": "' + x + '", "reward": "' + str(reward_fn(x)[0]) + '"}\n'
                fp.write(new_str)
