const recipeDetails = [
  {
    id: 1,
    title: 'Train a Model From Scratch',
    description:
      'Build a new machine learning model from the ground up using Nanotron. Ideal for custom use cases and datasets.',
    requiredAssets: {
      models: ['llama2', 'llama3'],
      datasets: ['text', 'image'],
      plugins: ['lora', 'peft'],
    },
    supportedHardware: ['cpu', 'cuda', 'mps'],
  },
  {
    id: 2,
    title: 'Fine-tune an Existing Model',
    description:
      'Adapt a pre-trained model to your specific needs using LoRA. Save time and resources by leveraging existing knowledge.',
  },
  {
    id: 3,
    title: 'Evaluate a Model',
    description:
      'Assess the performance of your model using Eleuther Labs AI Evaluation Harness. Gain insights into accuracy and reliability.',
  },
  {
    id: 4,
    title: 'Convert a Model to the MLX Format',
    description:
      'Transform your model into the MLX format for compatibility with various deployment environments.',
  },
  {
    id: 5,
    title: 'Quantize a Model',
    description:
      'Optimize your model for faster inference and reduced size using Nanotron’s quantization tools.',
  },
  {
    id: 6,
    title: 'RAG Train and Evaluate',
    description:
      'Train and evaluate a Retrieval-Augmented Generation (RAG) model. Combine the power of retrieval and generation for enhanced performance.',
  },
];

export default recipeDetails;
