# AWS IAM Requirements for Transformer Lab Compute Provider

This document lists all IAM permissions required by the AWS credentials used to configure the Transformer Lab AWS compute provider. These permissions are checked at provider setup time and exercised during cluster launch and termination.

## Required IAM Policy

The following policy covers all operations TransformerLab performs. Attach it to the IAM user or role whose credentials are configured in the provider.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "STSIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    },
    {
      "Sid": "EC2Launch",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeSecurityGroups",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:DescribeKeyPairs",
        "ec2:ImportKeyPair",
        "ec2:DescribeImages",
        "ec2:RunInstances",
        "ec2:DescribeInstances",
        "ec2:TerminateInstances",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IAMSelfTerminationSetup",
      "Effect": "Allow",
      "Action": [
        "iam:GetRole",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:GetRolePolicy",
        "iam:GetInstanceProfile",
        "iam:CreateInstanceProfile",
        "iam:AddRoleToInstanceProfile"
      ],
      "Resource": [
        "arn:aws:iam::*:role/transformerlab-ec2-role-*",
        "arn:aws:iam::*:instance-profile/transformerlab-ec2-profile-*"
      ]
    },
    {
      "Sid": "IAMPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::*:role/transformerlab-ec2-role-*"
    }
  ]
}
```

## What Each Section Grants

### STSIdentity
Used by the provider health check (`check()`) to verify the credentials are valid.

### EC2Launch
Core EC2 operations for managing compute clusters:
- `Describe*` — read existing resources (security groups, key pairs, AMIs, instances)
- `CreateSecurityGroup` + `AuthorizeSecurityGroupIngress` — one-time SSH security group setup per team
- `ImportKeyPair` — registers the team's SSH public key for instance access
- `RunInstances` — launches a new EC2 instance for a job
- `TerminateInstances` — stops a cluster on demand
- `CreateTags` — tags instances with team and cluster metadata

### IAMSelfTerminationSetup
Allows TransformerLab to create and manage a minimal IAM role that the EC2 instance uses to terminate **itself** when the job finishes or crashes. Resources are scoped to `transformerlab-ec2-role-*` and `transformerlab-ec2-profile-*` to limit blast radius.

`iam:PassRole` is required so that `ec2:RunInstances` can attach the instance profile to the new instance.

## Resources Created Automatically

TransformerLab creates these resources once per team and reuses them on subsequent launches:

| Resource | Name Pattern | Purpose |
|---|---|---|
| Security group | `transformerlab-compute-<team_id>` | Allow SSH (port 22) inbound |
| Key pair | `transformerlab-<team_id>` | SSH access to instances |
| IAM role | `transformerlab-ec2-role-<team_id>` | EC2 assume-role principal for self-termination |
| IAM instance profile | `transformerlab-ec2-profile-<team_id>` | Wraps the role; attached to every launched instance |

## Instance Self-Termination Policy

The IAM role attached to each EC2 instance grants only:

```json
{
  "Effect": "Allow",
  "Action": "ec2:TerminateInstances",
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringEquals": {
      "ec2:ResourceTag/transformerlab-team-id": "<team_id>"
    }
  }
}
```

This means an instance can only terminate other instances belonging to the same team — it cannot terminate arbitrary EC2 instances in the account.
