---
title: 使用 Incus 构建实验室开发环境 3
authors:
  - duskmoon
tags:
  - incus
  - qemu
  - kvm
  - devops
  - terraform
  - opentofu
  - cloud-init
---

# 使用 Incus 构建实验室开发环境 3

之前主要关注的是 Incus 容器，但有时候也有虚拟机的场景。本期将初步探索虚拟机的配置和管理。

<!-- truncate -->

## 制作基础镜像

与上一期类似，唯一的问题是启动实例时需要声明这是一个虚拟机而非容器:

```bash
# 启动镜像，这里使用 ubuntu/26.04/cloud 作为基础镜像
incus launch images:ubuntu/26.04/cloud builder -c user.user-data="$(cat base.yaml)" --vm
# 等待一段时间，虚拟机启动并执行 cloud-init 比较耗时
# 等待 cloud-init 执行完成
incus exec builder -- cloud-init status --wait
# 清除 cloud-init 相关数据，以便后续容器创建时能再次执行 cloud-init
incus exec builder -- cloud-init clean
# 发布镜像
incus publish builder --alias u26-c-b-vm --force --reuse
# 删除临时容器
incus delete builder --force
```

这样就得到了一个名为 `u26-c-b-vm` 的虚拟机镜像，相比上一期的容器镜像体积明显有所增加:

```bash
+----------------+--------------+--------+--------------------------------------------------+--------------+-----------------+-----------+----------------------+
|     ALIAS      | FINGERPRINT  | PUBLIC |                   DESCRIPTION                    | ARCHITECTURE |      TYPE       |   SIZE    |     UPLOAD DATE      |
+----------------+--------------+--------+--------------------------------------------------+--------------+-----------------+-----------+----------------------+
| u26-c-b-vm     | 657558dbbe4d | no     | Ubuntu resolute amd64 (cloud) (20260427_07:42)   | x86_64       | VIRTUAL-MACHINE | 567.08MiB | 2026/04/28 07:36 UTC |
+----------------+--------------+--------+--------------------------------------------------+--------------+-----------------+-----------+----------------------+
```

## 配置开发环境

同样我们使用 OpenTofu/Terraform 来管理虚拟机的配置:

```hcl
locals {
  vms = {
    alice = { image = "u26-c-b-vm", port = 11000, root = "alice", ipv4_address = "10.192.180.10" }
  }

  base_init = {
    apt = {
      primary = [
        { uri = "https://mirrors.tuna.tsinghua.edu.cn/ubuntu/", arches = ["default"] }
      ]
    }
    package_update = true
  }

  vm_init = {
    for k, v in local.vms :
    k => join("\n", [
      "#cloud-config",
      yamlencode(local.base_init),
      lookup(v, "extra_init", "")
    ])
  }
}

resource "incus_instance" "vms" {
  for_each = local.vms

  name  = each.key
  image = each.value.image
  type  = "virtual-machine"

  config = merge({
    "limits.cpu"     = lookup(each.value, "cpu_limit", "4"),
    "limits.memory"  = lookup(each.value, "memory_limit", "8GiB"),
    "user.user-data" = local.vm_init[each.key],
    "cloud-init.network-config" = yamlencode({
      network = {
        version = 2
        ethernets = {
          all = {
            match = {
              name = "e*"
            }
            dhcp4 = true
          }
        }
      }
    })
    },
    lookup(each.value, "extra_config", {})
  )

  device {
    name = "eth0"
    type = "nic"
    properties = {
      name           = "eth0"
      network        = "incusbr0"
      "ipv4.address" = each.value.ipv4_address
    }
  }

  device {
    name = "ssh"
    type = "proxy"
    properties = {
      listen  = "tcp:192.168.1.134:${each.value.port}"
      connect = "tcp:0.0.0.0:22"
      nat     = true
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
}
```

与上一期不同，虚拟机的 ssh 端口映射使用 `proxy` 设备必须指定 `nat = true` 并显式指定宿主机的 IP 地址来启用 NAT 转发，这进而要求该虚拟机**必须**指定一个静态 IP 地址。这里我给 `alice` 分配了 `incusbr0` 网桥上的 `10.192.180.10` 地址。

此外，`nic` 的配置中指定网卡名称对于 `ubuntu` 镜像似乎并没有作用，虚拟机内的网卡是 `enp5s0` 而不是 `eth0`，因此 `cloud-init` 的相关配置也要做出调整。还需要注意的是，虚拟机不支持对单个文件使用 `disk` 进行映射，只能绑定目录或者使用 `file` 来将文件复制到虚拟机内。

## 小结

相比于容器，虚拟机的配置要繁琐一些，需要特别注意网络配置和硬件资源限制。不过对于需要完整环境的场景，虚拟机还是比容器更合适的选择（比如在虚拟机中使用 docker 来运行多个容器进行实验）。

## 参考

- [Incus 官方文档 - Images](https://linuxcontainers.org/incus/docs/main/images/)
- [Cloud-init 官方文档](https://docs.cloud-init.io/en/latest/reference/modules.html)
- [duskmoon314/incus-images](https://github.com/duskmoon314/incus-images)