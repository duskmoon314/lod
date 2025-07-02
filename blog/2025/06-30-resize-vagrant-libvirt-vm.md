---
title: 动态调整 vagrant-libvirt 虚拟机的磁盘大小
authors:
  - duskmoon
tags:
  - vagrant
  - libvirt
  - devops
---

# 动态调整 vagrant-libvirt 虚拟机的磁盘大小

在使用 vagrant-libvirt 的虚拟机时，发现创建时给的磁盘过小。
官方文档虽未提及，但搜索后发现可以用 `qemu-img` 轻松调整，遂记录一下。

<!-- truncate -->

## 背景

我使用的是 `bento/ubuntu-24.04` 这个 box，其默认磁盘空间为 64GB，在 vm 中看到的结构如下:

```bash
$ df -h
Filesystem                              Size  Used Avail Use% Mounted on
tmpfs                                    46M  1.1M   45M   3% /run
/dev/mapper/ubuntu--vg-ubuntu--lv        31G  4.3G   25G  15% /
tmpfs                                   230M     0  230M   0% /dev/shm
tmpfs                                   5.0M     0  5.0M   0% /run/lock
/dev/vda2                               2.0G   95M  1.7G   6% /boot
tmpfs                                    46M   12K   46M   1% /run/user/1000

$ lsblk
NAME                      MAJ:MIN RM SIZE RO TYPE MOUNTPOINTS
vda                       253:0    0  64G  0 disk 
├─vda1                    253:1    0   1M  0 part 
├─vda2                    253:2    0   2G  0 part /boot
└─vda3                    253:3    0  62G  0 part 
  └─ubuntu--vg-ubuntu--lv 252:0    0  31G  0 lvm  /
```

可以看到，主要使用的空间是 `vda3` 分区上的 LVM 逻辑卷，其默认大小为 31GB。
但我需要大约 100GB 的空间来存储实验数据，因此我有两个目标：
1. 增大 `vda3` 分区的大小
2. 增大 LVM 逻辑卷的大小

## 调整步骤

1. 停止虚拟机

    在虚拟机运行的情况下，`qemu-img` 无法调整磁盘大小。

    ```bash
    $ vagrant halt
    ==> default: Attempting graceful shutdown of VM...
    ```

2. 使用 `qemu-img` 增加需要的空间

    在我的安装中，虚拟机的磁盘文件位于 `/var/lib/libvirt/images/` 目录下，可能在其他系统中有所不同。

    ```bash
    $ sudo qemu-img resize /var/lib/libvirt/images/vm_test_default.img +36G
    Image resized.
    ```

3. 重启虚拟机

    ```bash
    $ vagrant up --provider=libvirt
    Bringing machine 'default' up with 'libvirt' provider...
    ...
    ```

4. 进入虚拟机，可以看到磁盘大小已经发生变化

    ```bash
    $ vagrant ssh

    > lsblk
    NAME                      MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
    vda                       253:0    0  100G  0 disk 
    ├─vda1                    253:1    0    1M  0 part 
    ├─vda2                    253:2    0    2G  0 part /boot
    └─vda3                    253:3    0   62G  0 part 
      └─ubuntu--vg-ubuntu--lv 252:0    0   31G  0 lvm  /
    ```

5. 将新增空间分配给 `vda3`

    ```bash
    > sudo growpart /dev/vda 3
    CHANGED: partition=3 start=4198400 old: size=130017280 end=134215679 new: size=205516767 end=209715166

    > lsblk
    NAME                      MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
    vda                       253:0    0  100G  0 disk 
    ├─vda1                    253:1    0    1M  0 part 
    ├─vda2                    253:2    0    2G  0 part /boot
    └─vda3                    253:3    0   98G  0 part 
      └─ubuntu--vg-ubuntu--lv 252:0    0   31G  0 lvm  /
    ```

6. 重载分区表

    ```bash
    > sudo partprobe
    ```

7. 调整逻辑卷

    ```bash
    > sudo pvresize /dev/vda3
    Physical volume "/dev/vda3" changed
    1 physical volume(s) resized or updated / 0 physical volume(s) not resized

    > sudo lvextend -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
    Size of logical volume ubuntu-vg/ubuntu-lv changed from <31.00 GiB (7935 extents) to <98.00 GiB (25087 extents).
    Logical volume ubuntu-vg/ubuntu-lv successfully resized.
    ```

8. 扩展文件系统

    ```bash
    sudo resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv
    resize2fs 1.47.0 (5-Feb-2023)
    Filesystem at /dev/mapper/ubuntu--vg-ubuntu--lv is mounted on /; on-line resizing required
    old_desc_blocks = 4, new_desc_blocks = 13
    The filesystem on /dev/mapper/ubuntu--vg-ubuntu--lv is now 25689088 (4k) blocks long.

    > lsblk
    NAME                      MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
    vda                       253:0    0  100G  0 disk 
    ├─vda1                    253:1    0    1M  0 part 
    ├─vda2                    253:2    0    2G  0 part /boot
    └─vda3                    253:3    0   98G  0 part 
      └─ubuntu--vg-ubuntu--lv 252:0    0   98G  0 lvm  /

    > df -h
    Filesystem                              Size  Used Avail Use% Mounted on
    tmpfs                                    46M  1.0M   45M   3% /run
    /dev/mapper/ubuntu--vg-ubuntu--lv        97G  4.4G   88G   5% /
    tmpfs                                   230M     0  230M   0% /dev/shm
    tmpfs                                   5.0M     0  5.0M   0% /run/lock
    /dev/vda2                               2.0G   95M  1.7G   6% /boot
    tmpfs                                    46M   12K   46M   1% /run/user/1000
    ```

如此便完成了虚拟机磁盘大小的调整

## 整理为 provision

```ruby
config.vm.provision "shell", inline: <<-SHELL
  growpart /dev/vda 3
  partprobe
  pvresize /dev/vda3
  lvextend -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
  resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv
SHELL
```

## 参考

1. [Resize Disk of a Vagrant/Libvirt VM](https://www.rodolfocarvalho.net/blog/resize-disk-vagrant-libvirt/)
2. [Increasing a libvirt/KVM virtual machine disk capacity](https://nullr0ute.com/2018/08/increasing-a-libvirt-kvm-virtual-machine-disk-capacity/)