---
title: 使用 Incus 构建实验室开发环境 2
authors:
  - duskmoon
tags:
  - incus
  - qemu
  - kvm
  - devops
  - docker
  - lxc
  - terraform
  - opentofu
  - cloud-init
---

# 使用 Incus 构建实验室开发环境 2

在上一篇文章中，我们探索了使用 OpenTofu/Terraform 来管理 Incus 容器的基础操作。本期将继续深入，介绍更具体的实验室开发环境的构建方法。

<!-- truncate -->

## 制作基础镜像

Incus 官方的 [image server](https://images.linuxcontainers.org/) 提供了许多 Linux 发行版的镜像，但它们都比较基础，缺乏一些常用的工具 (如 `curl`, `wget` 等)。因此，我们需要制作一个基础的镜像以便使用，也能一定程度减少空间的占用。

在 Incus 生态中，有 [distrobuilder](https://github.com/lxc/distrobuilder) 可以使用 yaml 以类似 Dockerfile 的方式来构建镜像。不过其相对复杂，对于简单的镜像来说有些繁琐。因此我们可以直接使用 `incus publish` 来将一个容器制作成镜像。此外，Incus 支持使用 `cloud-init` 来在容器创建时进行配置，这既可以用于镜像的制作，也可以在后期容器创建时提供个性化的配置。

首先准备好 `cloud-init` 的配置文件 `base.yaml`：

```yaml
#cloud-config
package_update: true # 更新软件包列表
packages: # 要安装的软件
  - curl
  - wget
  - git
  - ca-certificates
  - vim
  - htop
  - openssh-server

ssh_pwauth: false # 禁止 ssh 密码登录
```

然后可以使用如下命令来创建一个容器、配置软件、发布镜像：

```bash
# 启动镜像，这里使用 ubuntu/24.04/cloud 作为基础镜像
incus launch images:ubuntu/24.04/cloud builder -c user.user-data="$(cat base.yaml)"
# 等待 cloud-init 执行完成
incus exec builder -- cloud-init status --wait
# 清除 cloud-init 相关数据，以便后续容器创建时能再次执行 cloud-init
incus exec builder -- cloud-init clean
# 发布镜像
incus publish builder --alias u24-c-b --force --reuse
# 删除临时容器
incus delete builder --force
```

这样我们就得到了一个名为 `u24-c-b` 的基础镜像，包含基础的软件，并且在创建容器时仍可执行 `cloud-init` 来进行个性化配置。下面展示的是 `u24-c-b` 和其基础镜像 `ubuntu24-cloud` 的信息：

```bash
> incus image ls
+--------------------+--------------+--------+--------------------------------------------------+--------------+-----------+-------------+----------------------+
|       ALIAS        | FINGERPRINT  | PUBLIC |                   DESCRIPTION                    | ARCHITECTURE |   TYPE    |    SIZE     |     UPLOAD DATE      |
+--------------------+--------------+--------+--------------------------------------------------+--------------+-----------+-------------+----------------------+
| u24-c-b            | b9e623baacf2 | no     | Ubuntu noble amd64 (cloud) (20260411_07:42)      | x86_64       | CONTAINER | 300.38MiB   | 2026/04/12 16:33 UTC |
+--------------------+--------------+--------+--------------------------------------------------+--------------+-----------+-------------+----------------------+
| ubuntu24-cloud     | 0ab43463b49a | no     | Ubuntu noble amd64 (20260411_07:42)              | x86_64       | CONTAINER | 165.04MiB   | 2026/04/12 05:58 UTC |
+--------------------+--------------+--------+--------------------------------------------------+--------------+-----------+-------------+----------------------+
```

## 配置开发环境

接下来，我们可以使用 OpenTofu/Terraform 来创建一系列容器，构建实验室的开发环境：

```hcl
terraform {
  required_providers {
    incus = {
      source  = "lxc/incus"
      version = "1.0.2"
    }
  }
}

provider "incus" {}

locals {
  containers = {
    alice = { image = "u24-c-b", port = 10000, root = "alice" }
    bob   = { image = "u24-c-b", port = 10001, root = "bob" }
    carol = { image = "u24-c-b", port = 10002, root = "carol" }
  }

  base_init = {
    apt = {
      primary = [
        { uri = "https://mirrors.tuna.tsinghua.edu.cn/ubuntu/", arches = ["default"] }
      ]
    }
    package_update = true
  }

  container_init = {
    for k, v in local.containers :
    k => join("\n", [
      "#cloud-config",
      yamlencode(local.base_init),
      lookup(v, "extra_init", "")
    ])
  }
}

resource "incus_instance" "containers" {
  for_each = local.containers

  name  = each.key
  image = each.value.image

  config = {
    "nvidia.runtime"             = "true"
    "nvidia.driver.capabilities" = "compute,utility"
    "user.user-data"             = local.container_init[each.key]
  }

  device {
    name = "ssh"
    type = "proxy"
    properties = {
      listen  = "tcp:0.0.0.0:${each.value.port}"
      connect = "tcp:127.0.0.1:22"
    }
  }

  device {
    name = "root_disk"
    type = "disk"
    properties = {
      source = abspath("${path.root}/bind/${each.value.root}")
      path   = "/root"
      shift  = true
    }
  }

  device {
    name = "gpu"
    type = "gpu"
    properties = {
      gputype = "physical"
    }
  }
}
```

这里我们利用了 OpenTofu/Terraform 的 `for_each` 来复用资源定义，并创建了 `alice`, `bob`, `carol` 三个容器。每个容器都配置了几个关键 `device`:

- `ssh`: 通过 `proxy` 类型将宿主机上的 10000-10002 端口映射到容器的 22 端口，暴露容器的 SSH 服务。
- `root_disk`: 将宿主机上的 `bind/alice`, `bind/bob`, `bind/carol` 目录绑定到容器的 `/root` 目录，并启用 `shift` 来调整权限。
  - 通过绑定目录的方式，容器的 `~ (/root)` 被持久化在宿主机上，更换镜像或重建容器时数据不容易丢失。
- `gpu`: 和 `nvidia.runtime` 配置配合使用，允许容器访问 GPU 资源，适合需要 GPU 的开发环境。

在 `tofu apply` 之后，便得到了可以 ssh 访问与 GPU 可用的开发环境：

```bash
> ssh incus-alice
Last login: Tue Apr 14 07:57:12 2026 from 127.0.0.1
Welcome to fish, the friendly interactive shell
Type help for instructions on how to use fish
root@alice ~# nvidia-smi
Tue Apr 14 08:45:11 2026
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 580.105.08             Driver Version: 580.105.08     CUDA Version: 13.0     |
+-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |
|                                         |                        |               MIG M. |
|=========================================+========================+======================|
...
root@alice ~# cd pytorch-test/
root@alice ~/pytorch-test# uv run python
Python 3.12.12 (main, Nov 19 2025, 22:46:53) [Clang 21.1.4 ] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import torch
>>> torch.cuda.is_available()
True
```

## 小结

目前来看，这一套流程已基本满足了我们实验室的开发环境需求。目前仍在测试阶段，后续会继续完善相关的配置和流程。

## 参考

- [Incus 官方文档 - Images](https://linuxcontainers.org/incus/docs/main/images/)
- [Cloud-init 官方文档](https://docs.cloud-init.io/en/latest/reference/modules.html)
- [duskmoon314/incus-images](https://github.com/duskmoon314/incus-images)