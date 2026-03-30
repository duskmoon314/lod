---
title: 使用 Incus 构建实验室开发环境 0
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
---

# 使用 Incus 构建实验室开发环境 0

实验室此前主要使用 Docker 来构建容器化的开发环境，Vagrant + libvirt (QEMU/KVM) 来构建虚拟机开发环境。
或许使用 Incus 来统一管理会更加方便，基于 LXC 的容器亦可能更适合我们的使用场景。
本文是使用 Incus 构建环境的初步尝试，探索其使用方法。

<!-- truncate -->

## Incus 安装

Debian/Ubuntu 系统上安装 Incus 比较简单，参考[官方文档](https://linuxcontainers.org/incus/docs/main/installing/#installing) 使用 apt 即可安装。安装最新版本可以参考 [zabbly/incus](https://github.com/zabbly/incus) 的说明。

安装后，类似 docker，建议执行 `sudo usermod -aG incus-admin $USER` 将当前用户添加到 incus-admin 组中，这样就不需要每次使用 incus 命令都加 sudo 了。

## Init 初始化

安装好后，首先需要初始化 Incus，这会进入一个交互式的初始化过程，下面将介绍一些关键步骤的选择和配置。

### Cluster (集群)

Init 过程中首先会询问的是是否要使用集群：

```bash
Would you like to use clustering? (yes/no) [default=no]:
```

开启集群后，Incus 应该可以在一处管理多台服务器上的容器和虚拟机，目前这个初步尝试中我仅使用单台服务器，所以选择了默认的 no。

### Storage pool (存储池)

接下来会询问 Incus 的存储配置，这一步关系到后续 Incus 的功能和性能：

```bash
Do you want to configure a new storage pool? (yes/no) [default=yes]:
Name of the new storage pool [default=default]:
Name of the storage backend to use (lvm, truenas, dir, btrfs) [default=btrfs]:
Create a new BTRFS pool? (yes/no) [default=yes]:
Would you like to use an existing empty block device (e.g. a disk or partition)? (yes/no) [default=no]:
Size in GiB of the new loop device (1GiB minimum) [default=30GiB]: 256GiB
```

官方的推荐是使用 zfs 或 btrfs 与裸磁盘作为 Incus 的存储池，用于镜像和容器/虚拟机内数据的存储。不同的存储后端对 Incus 的功能和性能有不同的影响，如直接使用 dir 似乎就比较慢，btrfs 似乎会被容器/虚拟机逃避配额限制等。详情可以参考[官方文档](https://linuxcontainers.org/incus/docs/main/explanation/storage/#exp-storage)。

需要注意的是，选择 zfs 或 btrfs 需要先安装相关依赖。尚不确定 Incus 是如何检测，但目前尝试的机器上是先安装了 Incus 才安装 zfs 相关工具，导致在 init 过程中没有检测到 zfs 可用。

另一个问题是裸磁盘的使用，Incus 官方推荐使用裸磁盘（或现成的 zfs data pool）来创建存储池以获得更好的性能。不过我不太想调整这台机器上的 ext4 以免影响原有数据与容器，所以选择了使用 loop device 的方式创建 btrfs 存储池。考虑到所有开发环境我都考虑绑定宿主机的数据盘用作 `$HOME` 和 `/mnt/data`，且 Incus 似乎能通过 clone 共享存储，所以我选择了这种方案。

### Network bridge (网络桥接)

接下来是网络配置，Incus 会询问是否要创建一个新的本地网络桥接：

```bash
Would you like to create a new local network bridge? (yes/no) [default=yes]:
What should the new bridge be called? [default=incusbr0]:
What IPv4 address should be used? (CIDR subnet notation, “auto” or “none”) [default=auto]:
What IPv6 address should be used? (CIDR subnet notation, “auto” or “none”) [default=auto]:
```

类似 docker，Incus 推荐创建一个默认的网络桥接来连接容器和虚拟机，默认名称是 `incusbr0`。其默认 IP 地址尚没有看出是如何决定的，我这里是 `10.192.180.1/24` 和 `fd42:e307:6874:708d::1/64`，不像 docker 那样尝试使用 `172.17.0.1/16` (以及首次创建 docker compose 环境的 `172.18.0.1/16`) 有规律。

### Remote access (远程访问)

另一个重要的配置是远程访问，Incus 支持通过 HTTPS 进行远程访问和管理：

```bash
Would you like the server to be available over the network? (yes/no) [default=no]: yes
Address to bind to (not including port) [default=all]:
Port to bind to [default=8443]:
```

具体使用需要配置 TLS 证书，似乎也可以配置 OIDC 认证，尚未尝试。

### Image Update (镜像更新) 

倒数第二个配置是镜像更新，默认似乎是自动更新过期的镜像：

```bash
Would you like stale cached images to be updated automatically? (yes/no) [default=yes]:
```

### YAML Preseed (YAML 预设)

最后一个配置是是否要输出 YAML 格式的预设配置，默认是 no。这个预设配置可以用来快速部署相同的环境，或者在其他机器上使用相同的配置进行初始化。我这里的配置如下：

```bash
Would you like a YAML "init" preseed to be printed? (yes/no) [default=no]: yes
config:
  core.https_address: '[::]:8443'
networks:
- config:
    ipv4.address: auto
    ipv6.address: auto
  description: ""
  name: incusbr0
  type: ""
  project: default
storage_pools:
- config:
    size: 256GiB
  description: ""
  name: default
  driver: btrfs
storage_volumes: []
profiles:
- config: {}
  description: ""
  devices:
    eth0:
      name: eth0
      network: incusbr0
      type: nic
    root:
      path: /
      pool: default
      type: disk
  name: default
  project: default
projects: []
certificates: []
cluster_groups: []
cluster: null
```

## 其他配置

在初始化后，Incus 不一定能顺利使用，可能还有一些需要额外配置的地方：

### 网络防火墙

如果宿主机上启用了防火墙 (如 ufw)，或安装了 docker，需要参考文档说明调整配置以允许 Incus 的网络桥接正常工作，具体可以参考[官方文档](https://linuxcontainers.org/incus/docs/main/howto/network_bridge_firewalld/)

## 基础使用

Incus 的基础指令和 Docker, Vagrant 等工具类似：

```bash
> incus launch images:ubuntu/24.04 first
Launching first
> incus list
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
|      NAME       |  STATE  |          IPV4           |                       IPV6                       |      TYPE       | SNAPSHOTS |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
| first           | RUNNING | 10.192.180.167 (eth0)   | fd42:e307:6874:708d:1266:6aff:fee7:836e (eth0)   | CONTAINER       | 0         |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
```

这便创建了一个基于 `images:ubuntu/24.04` 镜像的容器，名称为 `first`，并且分配了 IP 地址。`images:` 是 Incus 的默认镜像源 `images.linuxcontainers.org`，在较新版本的 Incus 中还可以添加 OCI 镜像源如 `incus remote add docker https://docker.io --protocol=oci` 来使用 Docker Hub 上的镜像。

可以通过 `incus info` 来查看容器的信息:

```bash
> incus info first
Name: first
Description:
Status: RUNNING
Type: container
Architecture: x86_64
PID: 330518
Created: 2026/03/30 08:33 UTC
Last Used: 2026/03/30 08:33 UTC
Started: 2026/03/30 08:33 UTC

Resources:
  Processes: 12
  CPU usage:
    CPU usage (in seconds): 1
  Memory usage:
    Memory (current): 141.87MiB
  Network usage:
    eth0:
      Type: broadcast
      State: UP
      Host interface: veth47320dd2
      MAC address: 10:66:6a:e7:83:6e
      MTU: 1500
      Bytes received: 3.90kB
      Bytes sent: 2.91kB
      Packets received: 36
      Packets sent: 31
      IP addresses:
        inet:  10.192.180.167/24 (global)
        inet6: fd42:e307:6874:708d:1266:6aff:fee7:836e/64 (global)
        inet6: fe80::1266:6aff:fee7:836e/64 (link)
    lo:
      Type: loopback
      State: UP
      MTU: 65536
      Bytes received: 0B
      Bytes sent: 0B
      Packets received: 0
      Packets sent: 0
      IP addresses:
        inet:  127.0.0.1/8 (local)
        inet6: ::1/128 (local)
```

可以通过 `incus shell` 来进入容器：

```bash
> incus shell first
root@first:~# ls -alh
total 8.0K
drwx------ 1 root root   38 Mar 22 07:44 .
drwxr-xr-x 1 root root  236 Mar 22 07:50 ..
-rw-r--r-- 1 root root 3.1K Apr 22  2024 .bashrc
-rw-r--r-- 1 root root  161 Apr 22  2024 .profile
drwx------ 1 root root    0 Mar 22 07:44 .ssh
root@first:~# df -h
Filesystem      Size  Used Avail Use% Mounted on
/dev/loop0      256G  5.3G  249G   3% /
none            492K  4.0K  488K   1% /dev
efivarfs        512K  106K  402K  21% /sys/firmware/efi/efivars
tmpfs           100K     0  100K   0% /dev/incus
tmpfs           100K     0  100K   0% /dev/.incus-mounts
tmpfs           252G     0  252G   0% /dev/shm
tmpfs           101G  144K  101G   1% /run
tmpfs           5.0M     0  5.0M   0% /run/lock
tmpfs            51G  8.0K   51G   1% /run/user/0
root@first:~# systemctl status
● first
    State: running
    Units: 241 loaded (incl. loaded aliases)
     Jobs: 0 queued
   Failed: 0 units
    Since: Mon 2026-03-30 08:33:16 UTC; 14min ago
  systemd: 255.4-1ubuntu8.12
   CGroup: /
           ├─init.scope
           │ └─1 /sbin/init
           ├─system.slice
           │ ├─console-getty.service
           │ │ └─214 /sbin/agetty -o "-p -- \\u" --noclear --keep-baud - 115200,38400,9600 linux
           │ ├─cron.service
           │ │ └─205 /usr/sbin/cron -f -P
           │ ├─dbus.service
           │ │ └─206 @dbus-daemon --system --address=systemd: --nofork --nopidfile --systemd-activation --syslog-only
           │ ├─rsyslog.service
           │ │ └─220 /usr/sbin/rsyslogd -n -iNONE
           │ ├─systemd-journald.service
           │ │ └─123 /usr/lib/systemd/systemd-journald
           │ ├─systemd-logind.service
           │ │ └─210 /usr/lib/systemd/systemd-logind
           │ ├─systemd-networkd.service
           │ │ └─195 /usr/lib/systemd/systemd-networkd
           │ ├─systemd-resolved.service
           │ │ └─191 /usr/lib/systemd/systemd-resolved
           │ └─systemd-udevd.service
           │   └─udev
           │     └─182 /usr/lib/systemd/systemd-udevd
           └─user.slice
             └─user-0.slice
               ├─session-c1.scope
               │ ├─236 su -l
               │ ├─247 -bash
               │ ├─262 systemctl status
               │ └─263 pager
               └─user@0.service
                 └─init.scope
                   ├─239 /usr/lib/systemd/systemd --user
                   └─240 "(sd-pam)"
```

可以看到基本上就是一个普通的 Ubuntu 环境，比 docker 的容器更像一个完整的系统，应该可以更方便使用 systemctl 来管理服务了。

然后可以使用 `incus exec first -- <command>` 来执行命令，使用 `incus stop first` 来停止容器，使用 `incus delete first` 来删除容器。

创建虚拟机的方式也类似，只需添加 `--vm` 参数：

```bash
> incus launch images:ubuntu/24.04 second --vm
Launching second
> incus list
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
|      NAME       |  STATE  |          IPV4           |                       IPV6                       |      TYPE       | SNAPSHOTS |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
| second          | RUNNING | 10.192.180.87 (enp5s0)  | fd42:e307:6874:708d:1266:6aff:fe9d:eb19 (enp5s0) | VIRTUAL-MACHINE | 0         |
+-----------------+---------+-------------------------+--------------------------------------------------+-----------------+-----------+
> incus info second
Name: second
Description:
Status: RUNNING
Type: virtual-machine
Architecture: x86_64
PID: 352932
Created: 2026/03/30 08:56 UTC
Last Used: 2026/03/30 08:56 UTC
Started: 2026/03/30 08:56 UTC

Operating System:
  OS: Ubuntu
  OS Version: 24.04
  Kernel Version: 6.8.0-106-generic
  Hostname: second
  FQDN: localhost

Resources:
  Processes: 13
  CPU usage:
    CPU usage (in seconds): 3
  Memory usage:
    Memory (current): 188.39MiB
  Network usage:
    enp5s0:
      Type: broadcast
      State: UP
      Host interface: tape216594a
      MAC address: 10:66:6a:9d:eb:19
      MTU: 1500
      Bytes received: 4.04kB
      Bytes sent: 3.23kB
      Packets received: 38
      Packets sent: 35
      IP addresses:
        inet:  10.192.180.87/24 (global)
        inet6: fd42:e307:6874:708d:1266:6aff:fe9d:eb19/64 (global)
        inet6: fe80::1266:6aff:fe9d:eb19/64 (link)
    lo:
      Type: loopback
      State: UP
      MTU: 65536
      Bytes received: 7.28kB
      Bytes sent: 7.28kB
      Packets received: 92
      Packets sent: 92
      IP addresses:
        inet:  127.0.0.1/8 (local)
        inet6: ::1/128 (local)
> incus exec second -- systemctl status
● second
    State: running
    Units: 336 loaded (incl. loaded aliases)
     Jobs: 0 queued
   Failed: 0 units
    Since: Mon 2026-03-30 08:56:41 UTC; 1min 55s ago
  systemd: 255.4-1ubuntu8.12
   CGroup: /
           ├─init.scope
           │ └─1 /sbin/init splash
           ├─system.slice
           │ ├─cron.service
           │ │ └─314 /usr/sbin/cron -f -P
           │ ├─dbus.service
           │ │ └─315 @dbus-daemon --system --address=systemd: --nofork --nopidfile --systemd-activation --syslog-only
           │ ├─incus-agent.service
           │ │ ├─348 /run/incus_agent/incus-agent
           │ │ ├─492 systemctl status
           │ │ └─493 less
           │ ├─rsyslog.service
           │ │ └─373 /usr/sbin/rsyslogd -n -iNONE
           │ ├─system-getty.slice
           │ │ └─getty@tty1.service
           │ │   └─401 /sbin/agetty -o "-p -- \\u" --noclear - linux
           │ ├─system-serial\x2dgetty.slice
           │ │ └─serial-getty@ttyS0.service
           │ │   └─389 /sbin/agetty -o "-p -- \\u" --keep-baud 115200,57600,38400,9600 - vt220
           │ ├─systemd-journald.service
           │ │ └─197 /usr/lib/systemd/systemd-journald
           │ ├─systemd-logind.service
           │ │ └─332 /usr/lib/systemd/systemd-logind
           │ ├─systemd-networkd.service
           │ │ └─263 /usr/lib/systemd/systemd-networkd
           │ ├─systemd-resolved.service
           │ │ └─292 /usr/lib/systemd/systemd-resolved
           │ ├─systemd-timesyncd.service
           │ │ └─294 /usr/lib/systemd/systemd-timesyncd
           │ └─systemd-udevd.service
           │   └─udev
           │     └─257 /usr/lib/systemd/systemd-udevd
           └─user.slice
             └─user-0.slice
               └─user@0.service
                 └─init.scope
                   ├─472 /usr/lib/systemd/systemd --user
                   └─473 "(sd-pam)"
```

虚拟机应该是基于 QEMU/KVM 的，隔离性应该更好一些。

## 小结

在这个初步尝试中，Incus 的整体使用和 Docker, Vagrant 等工具类似，有一个还算方便的 CLI 来管理容器和虚拟机。不过 Incus 自身似乎不提供类似 `docker-compose.yaml` 和 `Vagrantfile` 的方式来管理容器与虚拟机的配置，而是采用 profile 的方式来复用配置，接下来的探索中会看看是否方便使用来管理实验室的开发环境。

## 参考

1. [Incus 官方文档](https://linuxcontainers.org/incus/docs/main/)
2. [使用 Incus 取代 LXD（Incus 的安装、设置和使用方法）](https://blog.hentioe.dev/posts/incus-usage.html)
