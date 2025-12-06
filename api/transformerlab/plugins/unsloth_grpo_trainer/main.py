import re
import time

import torch
from jinja2 import Environment
from lab import storage
from transformerlab.sdk.v1.train import tlab_trainer
from transformers import BitsAndBytesConfig
from trl import GRPOConfig, GRPOTrainer
from unsloth import FastLanguageModel, PatchFastRL

# Set up environment
jinja_environment = Environment()
# use_flash_attention = False

# Patch FastRL for GRPO
PatchFastRL("GRPO", FastLanguageModel)


def extract_answer(text: str, start_answer_string, end_answer_string) -> str:
    """Extract the answer from the text between start and end tags"""
    answer = text.split(f"{start_answer_string}")[-1]
    answer = answer.split(f"{end_answer_string}")[0]
    return answer.strip()


def count_xml(
    text, start_thinking_string, end_thinking_string, start_answer_string, end_answer_string
) -> float:
    """Count XML tags in the response"""
    count = 0.0
    if text.count(f"{start_thinking_string}\n") == 1:
        count += 0.125
    if text.count(f"\n{end_thinking_string}\n") == 1:
        count += 0.125
    if text.count(f"\n{start_answer_string}\n") == 1:
        count += 0.125
        count -= len(text.split(f"\n{end_answer_string}\n")[-1]) * 0.001
    if text.count(f"\n{end_answer_string}") == 1:
        count += 0.125
        count -= (len(text.split(f"\n{end_answer_string}")[-1]) - 1) * 0.001
    return count


@tlab_trainer.job_wrapper()
def train_model():
    """Main training function using TrainerTLabPlugin"""

    # Get configuration from tlab_trainer
    datasets = tlab_trainer.load_dataset()
    dataset = datasets["train"]

    # Get configuration values
    model_id = tlab_trainer.params.model_name
    max_seq_length = int(tlab_trainer.params.maximum_sequence_length)
    max_completion_length = int(tlab_trainer.params.maximum_completion_length)
    lora_rank = int(tlab_trainer.params.lora_r)
    lora_alpha = int(tlab_trainer.params.lora_alpha)
    learning_rate = float(tlab_trainer.params.learning_rate)
    learning_rate_schedule = tlab_trainer.params.get("learning_rate_schedule", "constant")
    max_grad_norm = float(tlab_trainer.params.max_grad_norm)
    batch_size = int(tlab_trainer.params.batch_size)
    num_epochs = int(tlab_trainer.params.num_train_epochs)
    weight_decay = float(tlab_trainer.params.weight_decay)
    adam_beta1 = float(tlab_trainer.params.adam_beta1)
    adam_beta2 = float(tlab_trainer.params.adam_beta2)
    adam_epsilon = float(tlab_trainer.params.adam_epsilon)
    output_dir = tlab_trainer.params.output_dir

    # Template configuration
    question_formatting_template = tlab_trainer.params.get("input_template", "")
    answer_formatting_template = tlab_trainer.params.get("output_template", "")
    system_prompt = tlab_trainer.params.get("instruction_template", "")

    start_thinking_string = tlab_trainer.params.get("start_thinking_string", "<reasoning>")
    end_thinking_string = tlab_trainer.params.get("end_thinking_string", "</reasoning>")
    start_answer_string = tlab_trainer.params.get("start_answer_string", "<answer>")
    end_answer_string = tlab_trainer.params.get("end_answer_string", "</answer>")

    # Format instruction function
    def format_instruction(template, mapping):
        return template.render(mapping)

    # Create templates
    question_template = jinja_environment.from_string(question_formatting_template)
    answer_template = jinja_environment.from_string(answer_formatting_template)
    # Process dataset
    dataset = dataset.map(
        lambda x: {
            "prompt": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": format_instruction(question_template, x)},
            ],
            "answer": format_instruction(answer_template, x).split("#### ")[-1],
        }
    )

    # Reward functions
    def correctness_reward_func(prompts, completions, answer, **kwargs) -> list[float]:
        responses = [completion[0]["content"] for completion in completions]
        extracted_responses = [
            extract_answer(r, start_answer_string, end_answer_string) for r in responses
        ]
        return [2.0 if r == a else 0.0 for r, a in zip(extracted_responses, answer)]

    def xmlcount_reward_func(completions, **kwargs) -> list[float]:
        contents = [completion[0]["content"] for completion in completions]
        return [
            count_xml(
                c,
                start_thinking_string,
                end_thinking_string,
                start_answer_string,
                end_answer_string,
            )
            for c in contents
        ]

    def extract_xml_answer(text: str) -> str:
        return extract_answer(text, start_answer_string, end_answer_string)

    def int_reward_func(completions, **kwargs) -> list[float]:
        """Reward function that checks if the answer is a number"""
        responses = [completion[0]["content"] for completion in completions]
        extracted_responses = [extract_xml_answer(r) for r in responses]
        return [0.5 if r.isdigit() else 0.0 for r in extracted_responses]

    def strict_format_reward_func(completions, **kwargs) -> list[float]:
        """Reward function that checks strictly if the completion has a specific format."""
        pattern = rf"^{start_thinking_string}\n.*?\n{end_thinking_string}\n{start_answer_string}\n.*?\n{end_answer_string}\n$"
        responses = [completion[0]["content"] for completion in completions]
        matches = [re.match(pattern, r) for r in responses]
        return [0.5 if match else 0.0 for match in matches]

    def soft_format_reward_func(completions, **kwargs) -> list[float]:
        """Reward function that checks if the completion has a specific format."""
        pattern = rf"{start_thinking_string}.*?{end_thinking_string}\s*{start_answer_string}.*?{end_answer_string}"
        responses = [completion[0]["content"] for completion in completions]
        matches = [re.match(pattern, r) for r in responses]
        return [0.5 if match else 0.0 for match in matches]

    # BitsAndBytes configuration
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    # Load model and tokenizer
    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_id,
            max_seq_length=max_seq_length,
            max_lora_rank=lora_rank,
            quantization_config=bnb_config,
            use_cache=False,
            device_map="auto",
        )
        model.config.pretraining_tp = 1
    except Exception as e:
        return f"Failed to load model: {e!s}"
    # Apply LoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r=lora_rank,
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
        lora_alpha=lora_alpha,
        use_gradient_checkpointing="unsloth",
    )

    # Training run name
    today = time.strftime("%Y%m%d-%H%M%S")
    run_suffix = tlab_trainer.params.get("template_name", today)

    # GRPO training configuration
    args = GRPOConfig(
        output_dir=output_dir,
        logging_dir=storage.join(output_dir, f"job_{tlab_trainer.params.job_id}_{run_suffix}"),
        num_train_epochs=num_epochs,
        weight_decay=weight_decay,
        per_device_train_batch_size=batch_size,
        num_generations=batch_size,
        gradient_accumulation_steps=2,
        gradient_checkpointing=True,
        optim="paged_adamw_32bit",
        logging_steps=10,
        save_strategy="epoch",
        learning_rate=learning_rate,
        bf16=True,
        tf32=True,
        max_grad_norm=max_grad_norm,
        warmup_ratio=0.03,
        max_completion_length=max_completion_length,
        lr_scheduler_type=learning_rate_schedule,
        adam_beta1=adam_beta1,
        adam_beta2=adam_beta2,
        adam_epsilon=adam_epsilon,
        disable_tqdm=False,
        run_name=f"job_{tlab_trainer.params.job_id}_{run_suffix}",
        report_to=tlab_trainer.report_to,
    )

    # Create progress callback using tlab_trainer
    progress_callback = tlab_trainer.create_progress_callback(framework="huggingface")

    # Initialize GRPO trainer
    trainer = GRPOTrainer(
        model=model,
        train_dataset=dataset,
        processing_class=tokenizer,
        reward_funcs=[
            xmlcount_reward_func,
            correctness_reward_func,
            int_reward_func,
            strict_format_reward_func,
            soft_format_reward_func,
        ],
        args=args,
        callbacks=[progress_callback],
    )
    # Train the model
    try:
        trainer.train()
    except Exception as e:
        raise e
    # Save the model
    try:
        trainer.save_model(output_dir=tlab_trainer.params.adaptor_output_dir)
    except Exception as e:
        raise e

    # Return success message
    return "Adaptor trained successfully"


train_model()
