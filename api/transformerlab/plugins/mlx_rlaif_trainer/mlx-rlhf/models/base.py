import inspect
from copy import deepcopy
from dataclasses import dataclass

LAYER_PATTERNS = [
    "transformer.h.{layer}",
    "model.decoder.layers.{layer}",
    "gpt_neox.layers.{layer}",
    "model.layers.{layer}",
]


@dataclass
class BaseModelArgs:
    @classmethod
    def from_dict(cls, params):
        return cls(**{k: v for k, v in params.items() if k in inspect.signature(cls).parameters})


def create_reference_model(model, num_shared_layers: int = None, pattern: str = None):
    """
    Creates a static reference copy of a model. Note that model will be in `.eval()` mode.

    Args:
        model (`PreTrainedModelWrapper`): The model to be copied.
        num_shared_layers (`int`, *optional*): The number of initial layers that are shared between both models and kept frozen.
        pattern (`str`, *optional*): The shared layers are selected with a string pattern
            (e.g. "transformer.h.{layer}" for GPT2) and if a custom pattern is necessary it can be passed here.

    Returns
        `PreTrainedModelWrapper`
    """

    parameter_names = [n for n, _ in model.named_parameters()]
    ref_model = deepcopy(model)

    # if no layers are shared, return copy of model
    if num_shared_layers is None:
        for param_name in parameter_names:
            param = ref_model.get_parameter(param_name)
            param.requires_grad = False
        return ref_model.eval()

    # identify layer name pattern
    if pattern is not None:
        pattern = pattern.format(layer=num_shared_layers)
    else:
        for pattern_candidate in LAYER_PATTERNS:
            pattern_candidate = pattern_candidate.format(layer=num_shared_layers)
            if any([pattern_candidate in name for name in parameter_names]):
                pattern = pattern_candidate
                break

    if pattern is None:
        raise ValueError("Layer pattern could not be matched.")

    # divide parameters in shared and unshared parameter lists
    shared_param_list = []
    unshared_param_list = []

    shared_parameter = True
    for name, param in model.named_parameters():
        if pattern in name:
            shared_parameter = False
        if shared_parameter:
            shared_param_list.append(name)
        else:
            unshared_param_list.append(name)

    # create reference of the original parameter if they are shared
    for param_name in shared_param_list:
        param = model.get_parameter(param_name)
        param.requires_grad = False

        ref_param = ref_model.get_parameter(param_name)
        ref_param = param  # noqa

    # for all other parameters just make sure they don't use gradients
    for param_name in unshared_param_list:
        param = ref_model.get_parameter(param_name)
        param.requires_grad = False

    if pattern is not None and len(unshared_param_list) == 0:
        print("Pattern passed or found, but no layers matched in the model. Check for a typo.")

    return ref_model.eval()


class Dataset:
    """
    Light-weight wrapper to hold lines from a jsonl file
    """

    def __init__(self):
        pass

    def __getitem__(self, idx: int):
        raise NotImplementedError

    def __len__(self):
        raise NotImplementedError
