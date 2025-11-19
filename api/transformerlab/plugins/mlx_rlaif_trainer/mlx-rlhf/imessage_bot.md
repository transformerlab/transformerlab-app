In this example, we'll try to build a chatbot to emulate ourselves based on iMessage history.
This example is a work-in-progress, feel free to help improve the efficiency or performance of these scripts!

## Contents

* [Getting the Data](#Data)
* [Supervised Fine-tuning (SFT)](#Supervised-Fine-tuning)
* [Learning a Reward Model](#Learning-a-Reward-Model)
* [Reinforcement Learning (RLHF)](#Reinforcement-Learning-RLHF)
* [Talk to your model](#Generate)


## Data

I used the [imessage-exporter](https://github.com/ReagentX/imessage-exporter) to dump all of my iMessages into one directory.
Download/install the tool, open up a Terminal, and run:
```bash
imessage-exporter -f txt -o message_data
````
To export your messages in the `txt` format in an output directory called `message_data`.

_**WARNING**_ -- _Do not share this data._ 
This should go without saying, but your iMessage data is extremely personal. 
Your shared family passwords, awkward inappropriate messages, and so much more are in this data.
Please be careful with it. 
And keep in mind that your friends/family have likely not agreed to be in a dataset, so _do not share this data_.

## Supervised Fine-Tuning

We'll start with a [meta-llama/Llama-2-7b-chat-hf](https://huggingface.co/meta-llama/Llama-2-7b-chat-hf) model --

```
python sft.py --model meta-llama/Llama-2-7b-chat-hf \
               --train \
               -- data /Users/path/to/your/message_data/ \
               --iters 20000 \
               --batch-size 1 \
               --save-file lora_weights.npz
```

I have currently hard-coded the sequence length to be 256 in the `data_utils.py` script (Line 65-70).
This means that memory usage is pretty high, and training is very slow.
Open to-dos for (1) making this more flexible (config parameter for max-sequence-length) and (2) making this more memory efficient (QLoRA or other approach).

The `sft.py` script will spit out an adapter file, and you should use `fuse.py` to turn that into a model to load in.

### Learning a Reward Model

I haven't yet finished this piece of the puzzle! 
The plan is to generate synthetic data for learning a reward model using prompts from the message data.
So when a friend sends me a message, the bad example is whatever Llama-2 responds and the good example is whatever I responded. 

### Reinforcement Learning (RLHF)

To run update your model to maximize scores under a 
ground truth or learned reward model, we will use the `ppo_training.py` script.

```
python ppo_training.py --model ./imessage_sft_fine_tune/ \
               --reward_model /imessage_reward_model/ \
               --log_with=wandb
```

This loads in your iMessage fine-tune with `--model ./imessage_sft_fine_tune`, which you trained above.

### Generate

To chat with a trained model, use the `talk_to_model.py` script:

```
python talk_to_model.py --model ./imessage_sft_fine_tune/ \
               --max-tokens 50 \
               --temp 0.0
```
