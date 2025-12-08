import json
import time
import xmlrpc.client

# Connect to the XML-RPC server
server = xmlrpc.client.ServerProxy("http://localhost:8338")

# Configuration for a training job
training_config = {
    "experiment_id": "alpha",
    "model_name": "mlx-community/Llama-3.2-1B-Instruct-4bit",
    "dataset": "Trelis/touch-rugby-rules",
    "template_name": "default",
    "output_dir": "./output",
    "log_to_wandb": False,
    "_config": {
        "dataset_name": "Trelis/touch-rugby-rules",
        "lr": 3e-5,
        "num_train_epochs": 3,
        "batch_size": 8,
        "gradient_accumulation_steps": 1,
    },
}

# Start a training job
# job_id = "998"
result = server.start_training(json.dumps(training_config))
job_id = result["job_id"]
print(f"\nTraining job ID: {job_id}")
print("Started training job:")
print(json.dumps(result, indent=2))

# Poll for status updates
for i in range(10):
    time.sleep(5)
    status = server.get_training_status(job_id, (i + 1) * 10)
    print(f"\nTraining status at {time.strftime('%H:%M:%S')}:")
    print(json.dumps(status, indent=2))

    # Break if training is complete
    if status["status"] in ["COMPLETE", "FAILED", "STOPPED"]:
        break

# Optionally stop the training
stop_result = server.stop_training(job_id)
print("\nStopped training job:")
print(json.dumps(stop_result, indent=2))
