import mlx.core as mx
import mlx.nn as nn


class PromptTuning(nn.Module):
    def __init__(self, num_tokens: int, model: nn.Module):
        super().__init__()

        # Regular linear layer weights
        self.model = model
        self.prompts = nn.Embedding(num_tokens, self.model.model.args.hidden_size)
        self.prompt_size = num_tokens

    def __call__(self, input_ids, attention_mask=None, cache=None):
        # dtype = self.prompts.weight.dtype
        # if isinstance(self.prompts, nn.QuantizedLinear):
        #     dtype = self.prompts.scales.dtype
        if cache is None:
            prompt_embeds = mx.reshape(
                self.prompts(mx.arange(self.prompt_size)), (1, self.prompt_size, -1)
            )
            prompt_embeds = mx.repeat(prompt_embeds, input_ids.shape[0], axis=0)
            input_embeds = self.model.model.embed_tokens(input_ids)
            input_embeds = mx.concatenate([prompt_embeds, input_embeds], axis=1)
            if attention_mask is None:
                attention_mask = nn.MultiHeadAttention.create_additive_causal_mask(
                    input_embeds.shape[1]
                )
                attention_mask[:, : self.prompt_size] = 0
            else:
                attention_mask = 1 - attention_mask
                attention_mask *= -1e9
                if attention_mask.shape[-1] < input_embeds.shape[-1]:
                    prompt_attn = mx.zeros(
                        (input_embeds.shape[0], input_embeds.shape[1] - attention_mask.shape[1])
                    )
                    attention_mask = mx.concatenate([prompt_attn, attention_mask], axis=1)
            attention_mask = attention_mask.astype(input_embeds.dtype)
            skip_size = self.prompt_size
        else:
            skip_size = 0
            input_embeds = None
            # mask = None

        output, cache, value = self.model(input_ids, input_embeds, attention_mask, cache)
        output = output[:, skip_size:, :]
        value = value[:, skip_size:, :]
        return output, cache, value
