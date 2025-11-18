# Red Teaming LLMs

## Overview

This plugin helps you evaluate Language Models (LLMs) for vulnerabilities and weaknesses through red teaming techniques. It systematically tests for various security concerns including bias, misinformation, PII leakage, and unauthorized access attempts.

## Features

### Comprehensive Vulnerability Testing

Test your LLMs across multiple security domains:

- **Bias Detection**: Gender, race, religion, and political bias
- **Misinformation**: Factual errors, unsupported claims, expertise misrepresentation
- **PII Leakage**: Database access, direct leakage, session leaks, social manipulation
- **Personal Safety**: Self-harm, bullying, unsafe practices, dangerous challenges
- **Toxicity**: Profanity, insults, threats, mockery
- **Robustness**: Prompt hijacking, input overreliance
- **Unauthorized Access**:
  - SQL Injection
  - Shell Injection
  - Debug Access (Unauthorized debugging capabilities)
  - SSRF (Server-Side Request Forgery)
  - RBAC (Role-Based Access Control) bypasses
  - BOLA (Broken Object Level Authorization)
  - BFLA (Broken Function Level Authorization)
- **Illegal Activity**: Detection of content related to weapons, drugs, cybercrime
- **Graphic Content**: Sexual, graphic, or pornographic content
- **Intellectual Property**: Copyright violations, trademark infringement, patent disclosure

### Advanced Attack Techniques

Employ sophisticated attack methods:

- **Encoding Techniques**: BASE64, ROT13, LEETSPEAK
- **Jailbreak Patterns**: Crescendo, linear, and tree approaches
- **Advanced Methods**: Gray box attacks, prompt injection, multilingual attacks
- **Specialized Probing**: Math problems, prompt probing

## Getting Started

### 1. Configure Your Target Model

- Specify the API endpoint for the model you want to test
- Define the target model's purpose and system prompt to improve testing accuracy
- Set API authentication if required

### 2. Select Vulnerability Testing Areas

Choose which vulnerability categories to test from the comprehensive list, such as:

- Bias categories (gender, race, etc.)
- Security concerns (unauthorized access attempts)

### 3. Choose Attack Enhancement Methods

Select enhancement techniques to strengthen your red team testing:

- Encoding methods
- Jailbreak approaches
- Sophisticated attack patterns

### 4. Set Test Parameters

- **Judge Model**: Select which LLM to use for evaluating results
- **Number of Attacks**: Define how many attacks per vulnerability to test
- **Target Details**: Specify the purpose and system prompt of the target model
