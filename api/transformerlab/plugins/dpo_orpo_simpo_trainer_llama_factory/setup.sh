uv pip install "trl>=0.8.2"
rm -rf LLaMA-Factory
git clone https://github.com/hiyouga/LLaMA-Factory.git
cd LLaMA-Factory
git checkout beec77a0898a39d94f41c23920415f5b4873a23a # this is a known good version
uv pip install -e .[torch,metrics]