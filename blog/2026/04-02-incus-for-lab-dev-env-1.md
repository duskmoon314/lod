---
title: 使用 Incus 构建实验室开发环境 1
authors:
  - duskmoon
tags:
  - incus
  - qemu
  - kvm
  - devops
  - docker
  - lxc
  - vagrant
  - terraform
  - opentofu
---

# 使用 Incus 构建实验室开发环境 1

在上一篇文章中，我们主要探索了 Incus 的基本功能，成功地创建了容器和虚拟机。然而其基于命令行的操作方式对于多容器的管理还是有些不便。本期介绍基于 OpenTofu/Terraform 的方式来管理 Incus 环境。

<!-- truncate -->

## 回顾 `docker-compose.yaml` 与 `Vagrantfile`

此前基于 Docker 和 Vagrant 来管理环境，我们分别使用了 `docker-compose.yaml` 和 `Vagrantfile` 来定义和管理我们的开发环境。两个典型的配置文件如下：

```yaml
services:
  duskmoon:
    image: duskmoon/dev-env:bs-u24
    container_name: duskmoon
    ports:
      - 10000:22
    restart: unless-stopped
    volumes:
      - ./bind/duskmoon:/root
      - /mnt/share:/mnt/share
    stdin_open: true
    tty: true
    entrypoint: ["/usr/sbin/sshd", "-D"]
```

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "bento/ubuntu-24.04"
  config.vm.hostname = "vm-duskmoon"
  config.vm.network "forwarded_port", guest: 22, host: 10000  # ssh

  config.vm.provider "libvirt" do |libvirt|
    libvirt.cpus = 4
    libvirt.memory = 8192
    libvirt.machine_type = "pc-q35-7.2"
    libvirt.features = ["acpi", "apic", "pae", "ioapic driver='qemu'"]
  end
end
```

通过这种方式，我们可以很方便地定义、复制、修改开发环境，而不用记录一系列的命令行操作步骤。对于 Incus 来说，我们也希望能够有类似的方式来管理我们的环境，这就是 OpenTofu/Terraform 的作用。

## OpenTofu + Incus provider

### 什么是 OpenTofu/Terraform？

Terraform 是 HashiCorp 开发的一款基础设施即代码（Infrastructure as Code，IaC）工具，允许用户将云基础设施的资源以文本配置的形式进行定义和管理。由于其协议的变更，开源社区创建了 OpenTofu 作为其替代品。以下我们将使用 OpenTofu 来管理 Incus 环境。

### OpenTofu 的安装

在 Debian/Ubuntu 上安装 OpenTofu 非常简单，只需要按照[官方文档](https://opentofu.org/docs/intro/install/deb/) 的步骤进行：

```bash
# Download the installer script:
curl --proto '=https' --tlsv1.2 -fsSL https://get.opentofu.org/install-opentofu.sh -o install-opentofu.sh
# Alternatively: wget --secure-protocol=TLSv1_2 --https-only https://get.opentofu.org/install-opentofu.sh -O install-opentofu.sh

# Give it execution permissions:
chmod +x install-opentofu.sh

# Please inspect the downloaded script

# Run the installer:
./install-opentofu.sh --install-method deb

# Remove the installer:
rm -f install-opentofu.sh
```

然后应该能在终端中使用 `tofu` 命令了：

```bash
> tofu version 
OpenTofu v1.11.5
on linux_amd64
```

### Incus provider 的使用

Incus 官方提供了一个 Terraform provider 插件，允许 OpenTofu/Terraform 来管理 Incus 的资源。其使用方式可以参考[OpenTofu Registry 的页面](https://search.opentofu.org/provider/lxc/incus/latest)，下面简要介绍最核心的部分。

首先，我们需要创建一个文件夹来存放配置文件：

```bash
> mkdir tofu-test
> cd tofu-test
> touch main.tf
```

在 `main.tf` 中，我们先定义 Incus 的 provider，然后类似上一篇文章定义容器：

```hcl
terraform {
  required_providers {
    incus = {
      source  = "lxc/incus"
      version = "1.0.2"
    }
  }
}

provider "incus" {
}

resource "incus_image" "ubuntu24" {
  source_image = {
    remote = "images"
    name   = "ubuntu/24.04"
  }
}

resource "incus_instance" "first" {
  name      = "first"
  image     = incus_image.ubuntu24.fingerprint
  ephemeral = false
}

resource "incus_instance" "second" {
  name      = "second"
  image     = incus_image.ubuntu24.fingerprint
  ephemeral = false
}

```

然后我们需要先通过 `tofu init` 来初始化环境，这一步会自动下载需要的 provider 插件：

```bash
> tofu init

Initializing the backend...

Initializing provider plugins...
- Reusing previous version of lxc/incus from the dependency lock file
- Using previously-installed lxc/incus v1.0.2

OpenTofu has been successfully initialized!

You may now begin working with OpenTofu. Try running "tofu plan" to see
any changes that are required for your infrastructure. All OpenTofu commands
should now work.

If you ever set or change modules or backend configuration for OpenTofu,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

我这里由于已经配置过了，所以直接复用了之前下载的插件。接下来我们可以通过 `tofu plan` 来查看即将要创建的资源：

```bash
> tofu plan

OpenTofu used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

OpenTofu will perform the following actions:

  # incus_image.ubuntu24 will be created
  + resource "incus_image" "ubuntu24" {
      + copied_aliases = (known after apply)
      + created_at     = (known after apply)
      + fingerprint    = (known after apply)
      + resource_id    = (known after apply)
      + source_image   = {
          + architecture = (known after apply)
          + name         = "ubuntu/24.04"
          + remote       = "images"
          + type         = "container"
        }
    }

  # incus_instance.first will be created
  + resource "incus_instance" "first" {
      + architecture = (known after apply)
      + config       = {}
      + ephemeral    = false
      + image        = (known after apply)
      + ipv4_address = (known after apply)
      + ipv6_address = (known after apply)
      + mac_address  = (known after apply)
      + name         = "first"
      + profiles     = [
          + "default",
        ]
      + running      = true
      + status       = (known after apply)
      + target       = (known after apply)
      + type         = "container"
    }

  # incus_instance.second will be created
  + resource "incus_instance" "second" {
      + architecture = (known after apply)
      + config       = {}
      + ephemeral    = false
      + image        = (known after apply)
      + ipv4_address = (known after apply)
      + ipv6_address = (known after apply)
      + mac_address  = (known after apply)
      + name         = "second"
      + profiles     = [
          + "default",
        ]
      + running      = true
      + status       = (known after apply)
      + target       = (known after apply)
      + type         = "container"
    }

Plan: 3 to add, 0 to change, 0 to destroy.

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so OpenTofu can't guarantee to take exactly these actions if you run "tofu apply" now.
```

可以看到，首先会创建一个 `ubuntu24` 的镜像资源，然后基于这个镜像创建两个容器实例 `first` 和 `second`。最后我们通过 `tofu apply` 来执行这个计划：

```bash
> tofu apply

OpenTofu used the selected providers to generate the following execution plan. Resource actions are indicated with the following symbols:
  + create

OpenTofu will perform the following actions:

  # incus_image.ubuntu24 will be created
  + resource "incus_image" "ubuntu24" {
      + copied_aliases = (known after apply)
      + created_at     = (known after apply)
      + fingerprint    = (known after apply)
      + resource_id    = (known after apply)
      + source_image   = {
          + architecture = (known after apply)
          + name         = "ubuntu/24.04"
          + remote       = "images"
          + type         = "container"
        }
    }

  # incus_instance.first will be created
  + resource "incus_instance" "first" {
      + architecture = (known after apply)
      + config       = {}
      + ephemeral    = false
      + image        = (known after apply)
      + ipv4_address = (known after apply)
      + ipv6_address = (known after apply)
      + mac_address  = (known after apply)
      + name         = "first"
      + profiles     = [
          + "default",
        ]
      + running      = true
      + status       = (known after apply)
      + target       = (known after apply)
      + type         = "container"
    }

  # incus_instance.second will be created
  + resource "incus_instance" "second" {
      + architecture = (known after apply)
      + config       = {}
      + ephemeral    = false
      + image        = (known after apply)
      + ipv4_address = (known after apply)
      + ipv6_address = (known after apply)
      + mac_address  = (known after apply)
      + name         = "second"
      + profiles     = [
          + "default",
        ]
      + running      = true
      + status       = (known after apply)
      + target       = (known after apply)
      + type         = "container"
    }

Plan: 3 to add, 0 to change, 0 to destroy.

Do you want to perform these actions?
  OpenTofu will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value: yes

incus_image.ubuntu24: Creating...
incus_image.ubuntu24: Still creating... [10s elapsed]
incus_image.ubuntu24: Still creating... [20s elapsed]
incus_image.ubuntu24: Still creating... [30s elapsed]
incus_image.ubuntu24: Still creating... [40s elapsed]
incus_image.ubuntu24: Creation complete after 49s
incus_instance.second: Creating...
incus_instance.first: Creating...
incus_instance.second: Creation complete after 5s [name=second]
incus_instance.first: Creation complete after 5s [name=first]

Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
```

可以看到，OpenTofu 首先调用 Incus 拉取需要的景象资源，然后基于镜像创建了两个容器实例（顺序由什么决定还未研究）。我们可以用 Incus 检查一下状态：

```bash
> incus list
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
|      NAME       |  STATE  |          IPV4           |                       IPV6                       |      TYPE       | SNAPSHOTS |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
| first           | RUNNING | 10.192.180.168 (eth0)   | fd42:e307:6874:708d:1266:6aff:feee:22d8 (eth0)   | CONTAINER       | 0         |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
| second          | RUNNING | 10.192.180.26 (eth0)    | fd42:e307:6874:708d:1266:6aff:fea1:40d5 (eth0)   | CONTAINER       | 0         |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
> incus image list
+-------+--------------+--------+-------------------------------------+--------------+-----------------+-----------+----------------------+
| ALIAS | FINGERPRINT  | PUBLIC |             DESCRIPTION             | ARCHITECTURE |      TYPE       |   SIZE    |     UPLOAD DATE      |
+-------+--------------+--------+-------------------------------------+--------------+-----------------+-----------+----------------------+
|       | 86c715658822 | no     | Ubuntu noble amd64 (20260330_07:42) | x86_64       | CONTAINER       | 136.41MiB | 2026/04/02 11:45 UTC |
+-------+--------------+--------+-------------------------------------+--------------+-----------------+-----------+----------------------+
```

显然这很成功，再也不需要一行行敲命令了，而是可以通过 `main.tf` 来定义环境。

## 小结

相比于上一期的命令行方式，使用 OpenTofu/Terraform 极大地简化管理的心智负担。此外，结合 OpenTofu/Terraform 的 `Variable` 等功能，应该能让环境的定义和管理更加灵活。接下来将探索如何方便地配置 SSH 访问与 GPU 使用等功能，以探索实验室开发环境最重要的部分。

## 参考

- [OpenTofu 官方文档](https://opentofu.org/docs/)
- [OpenTofu Registry - Incus provider](https://search.opentofu.org/provider/lxc/incus/latest)
