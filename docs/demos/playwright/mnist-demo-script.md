# MNIST Demo Voiceover Script

## Step 0 — Welcome [22s]

Hello and welcome to Transformer Lab! Transformer Lab is an open-source platform for training, evaluating, and experimenting with machine learning models — all from a simple web interface. Today we'll walk through a complete workflow: importing a task from the gallery, configuring a compute provider, and reviewing the results of a training run.

## Step 1 — Logging In [12s]

We start by logging in. Transformer Lab supports team-based access, so each user has their own account. After signing in, the app automatically loads our last experiment.

## Step 2 — Exploring the Tasks Tab [26s]

An experiment in Transformer Lab is a workspace where you organize your tasks, models, and datasets. Let's navigate to the Tasks tab. Here you can see all the tasks associated with this experiment. To create a new task, we click "New." You can write your own task script or upload one from your computer. Let's close this for now.

## Step 3 — Importing from the Tasks Gallery [20s]

Transformer Lab also includes a built-in Tasks Gallery with ready-to-use tasks for common workflows. Let's browse the gallery and find the MNIST Train Task — a simple image classification training job that's perfect for getting started. We'll click "Import" to add it to our experiment.

## Step 4 — Queueing a Task [14s]

Now we can see the MNIST Train Task in our tasks list. To run it, we click "Queue." This opens the job configuration dialog where we can set parameters before submitting.

## Step 5 — Choosing a Compute Provider [21s]

One of Transformer Lab's key features is compute provider flexibility. You can run tasks locally, on cloud GPUs, or on remote clusters. Here we're selecting "SkypilotNew" as our provider, which provisions cloud resources automatically. For this demo, we'll cancel and instead look at results from a previous run.

## Step 6 — Viewing Job Output [20s]

Scrolling down to the Jobs section, we can see all previous job executions. Let's look at Run #43, a completed training job. Clicking "Output" shows the full terminal output from the job — you can see training progress, loss values, and completion status in real time.

## Step 7 — Reviewing Checkpoints [14s]

Transformer Lab automatically saves model checkpoints during training. Clicking "Checkpoints" shows the saved snapshots from this run. You can use these to resume training, compare models, or deploy the best checkpoint.

## Step 8 — Weights & Biases Integration [14s]

Finally, Transformer Lab integrates with Weights & Biases for experiment tracking. Clicking "W&B Tracking" opens your W&B dashboard where you can see detailed training metrics, charts, and comparisons across runs.

## Step 9 — Wrap Up [17s]

And that's a quick tour of Transformer Lab! We imported a task from the gallery, configured a compute provider, and reviewed training output, checkpoints, and experiment tracking — all from one interface. To learn more, visit lab.cloud. Thanks for watching!
