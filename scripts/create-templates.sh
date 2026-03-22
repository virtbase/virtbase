#!/bin/bash

# Sources using Openstack images
declare -A sources
declare -A template_ids
declare -A result_ids

template_ids["debian"]=900
template_ids["ubuntu"]=910
template_ids["almalinux"]=920
template_ids["fedora"]=930
template_ids["centos"]=940
template_ids["freebsd"]=950

# Debian Versions
sources["debian-13"]="https://cloud.debian.org/images/cloud/trixie/latest/debian-13-generic-amd64.qcow2"
sources["debian-12"]="http://cdimage.debian.org/cdimage/cloud/bookworm/latest/debian-12-generic-amd64.qcow2"
#sources["debian-11"]="http://cdimage.debian.org/cdimage/cloud/bullseye/latest/debian-11-generic-amd64.qcow2"
#sources["debian-10"]="http://cdimage.debian.org/cdimage/openstack/current-10/debian-10-openstack-amd64.qcow2"

# Ubuntu Versions
# Here we use a kvm image, because they are smaller than the openstack images
# See: https://cloud-images.ubuntu.com/

# Interim versions
sources["ubuntu-25.10"]="https://cloud-images.ubuntu.com/questing/current/questing-server-cloudimg-amd64.img"
sources["ubuntu-25.04"]="https://cloud-images.ubuntu.com/plucky/current/plucky-server-cloudimg-amd64.img"
# LTS versions
sources["ubuntu-24.04"]="https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
sources["ubuntu-22.04.5"]="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64-disk-kvm.img"

# Older version
#sources["ubuntu-23.04"]="https://cloud-images.ubuntu.com/lunar/current/lunar-server-cloudimg-amd64-disk-kvm.img"
#sources["ubuntu-22.10"]="https://cloud-images.ubuntu.com/kinetic/current/kinetic-server-cloudimg-amd64-disk-kvm.img"
#sources["ubuntu-20.04"]="https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64-disk-kvm.img"
#sources["ubuntu-18.04"]="https://cloud-images.ubuntu.com/bionic/current/bionic-server-cloudimg-amd64.img"
#sources["ubuntu-16.04"]="https://cloud-images.ubuntu.com/xenial/current/xenial-server-cloudimg-amd64-disk1.img"

# AlmaLinux Versions
# See: https://almalinux.org/get-almalinux/#Cloud_Images
sources["almalinux-10-kitten"]="https://kitten.repo.almalinux.org/10-kitten/cloud/x86_64_v2/images/AlmaLinux-Kitten-GenericCloud-10-latest.x86_64_v2.qcow2"
sources["almalinux-10"]="https://repo.almalinux.org/almalinux/10/cloud/x86_64_v2/images/AlmaLinux-10-GenericCloud-latest.x86_64_v2.qcow2"
#sources["almalinux-9"]="https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2"
#sources["almalinux-8"]="https://repo.almalinux.org/almalinux/8/cloud/x86_64/images/AlmaLinux-8-GenericCloud-latest.x86_64.qcow2"

# Fedora Versions
sources["fedora-43"]="https://download.fedoraproject.org/pub/fedora/linux/releases/43/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-43-1.6.x86_64.qcow2"
#sources["fedora-38"]="https://download.fedoraproject.org/pub/fedora/linux/releases/38/Cloud/x86_64/images/Fedora-Cloud-Base-38-1.6.x86_64.qcow2"

# CentOS Versions
sources["centos-stream-10"]="https://cloud.centos.org/centos/10-stream/x86_64/images/CentOS-Stream-GenericCloud-10-latest.x86_64.qcow2"
sources["centos-stream-9"]="https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2"

# FreeBSD Versions (unofficial)
sources["freebsd-14.2"]="https://object-storage.public.mtl1.vexxhost.net/swift/v1/1dbafeefbd4f4c80864414a441e72dd2/bsd-cloud-image.org/images/freebsd/14.2/2024-12-08/ufs/freebsd-14.2-ufs-2024-12-08.qcow2"
#sources["freebsd-14.2"]="https://object-storage.public.mtl1.vexxhost.net/swift/v1/1dbafeefbd4f4c80864414a441e72dd2/bsd-cloud-image.org/images/freebsd/14.2/2024-12-08/zfs/freebsd-14.2-zfs-2024-12-08.qcow2"
# https://github.com/mcmilk/openzfs-freebsd-images/releases/tag/v2025-06-07
# Not working :( (no boot drive found)
#sources["freebsd-14.3-stable"]="https://github.com/mcmilk/openzfs-freebsd-images/releases/download/v2025-06-07/amd64-freebsd-14.3-STABLE.qcow2.zst"
#sources["freebsd-15.0-current"]="https://github.com/mcmilk/openzfs-freebsd-images/releases/download/v2025-06-07/amd64-freebsd-15.0-CURRENT.qcow2.zst"

download_template() {
    echo "[*] Downloading template $1..."
    wget -q --show-progress -O "$2" "$1"

    # If ends with .zst, decompress it
    if [[ "$1" == *.zst ]]; then
        echo "[*] Decompressing template $1..."
        zstd -d "$2"
        echo "[*] Decompression complete."
    fi

    echo "[*] Download complete."
}

vm_exists() {
  qm list | grep -q "$1"
}

echo "  _                             _       "
echo " | |                           | |      "
echo " | |_ ______ ___ _ __ ___  __ _| |_ ___ "
echo " | __|______/ __| '__/ _ \\/ _\` | __/ _ \\"
echo " | |_      | (__| | |  __/ (_| | ||  __/"
echo "  \__|      \___|_|  \___|\__,_|\__\___|"
echo ""
echo "   > Create Proxmox Templates <"
echo "        by @masterjanic"
echo ""


# Check if script is run with root permissions
if [ "$(id -u)" != "0" ]; then
    echo "[x] Please run this script with root privileges."
    exit 1
fi

# Check if Proxmox is installed
if ! [ -f /etc/pve/pve-root-ca.pem ]; then
    echo "[x] Proxmox is not installed, please run this script in a Proxmox Environment."
    exit 1
fi

echo "[*] Installing dependencies..."
# dhcpcd-base is required for running on Proxmox VE 9+ (see: https://github.com/libguestfs/libguestfs/issues/211)
apt -qq install -y libguestfs-tools dhcpcd-base wget dialog &> /dev/null

# Let user enter a storage name
read -p "[?] Please enter a the name for the storage to save the template machines to (default=local-lvm): " -r storage
storage=${storage:-"local-lvm"}

# Let user choose whether to delete templates after creation
read -p "[?] Do you want to delete the downloaded images after creation? (y/n, default=y): " -r delete_templates
delete_templates=${delete_templates:-y}

read -p "[?] Do you want to delete existing templates? (y/n, default=n): " -r delete_previous
delete_previous=${delete_previous:-n}

read -p "[?] Use CPU type host instead of kvm64 by default? (y/n, default=y): " -r use_cpu_host
use_cpu_host=${use_cpu_host:-y}

read -p "[?] Would you like to enable Suricata IPS on the templates? (y/n, default=n): " -r use_suricata
use_suricata=${use_suricata:-n}

clear

# Let user select distros to download
cmd=(dialog --separate-output --title "Distro Selection" --checklist "Select distros to create templates for:" 22 76 16)
options=(
    $(for key in "${!sources[@]}"; do
        echo "$key"
        echo "$key"
        echo "on"
    done)
)
choices=$("${cmd[@]}" "${options[@]}" 2>&1 >/dev/tty)

clear

# Check if storage exists in Proxmox
if ! (pvesm list "$storage" | grep -q "$storage"); then
    echo "[x] Storage does not exist in Proxmox or does not have any hosts, please choose another name."
    exit 1
fi

# Delete existing templates
if [ "$delete_previous" = "y" ]; then
    echo "[*] Deleting existing templates..."

    vm_list=$(qm list | grep template | awk '{print $1}')
    for vm_id in "${template_ids[@]}"; do
        for i in $(seq $vm_id $(($vm_id + ${#sources[@]}))); do
            if echo "$vm_list" | grep -q "$i"; then
                qm destroy "$i"
            fi
        done
    done

    echo "[*] Deletion complete."
fi

start=$(date +%s)

sorted=$(for i in "${!choices[@]}"; do echo "${choices[i]}"; done | sort)
for source in $sorted; do
   if vm_exists "template-$source"; then
       echo "[*] Template for $source already exists, skipping..."
       continue
    fi

   distro=$(echo "$source" | cut -d'-' -f1)
   vm_id=${template_ids[$distro]}

   while vm_exists "$vm_id"; do
       echo "[*] VM with ID $vm_id already exists, trying next id..."
       vm_id=$(($vm_id + 1))
    done

    echo "[*] Creating template for $source..."

    extension="${sources[$source]##*.}"
    image_path="/tmp/$source.$extension"
    
    # Check if file exists and is less than 7 days old
    if [ -f "$image_path" ] && find "$image_path" -mtime -7 | grep -q .; then
        echo "[*] Image file $image_path already exists and is less than 7 days old, skipping download..."
    else
        download_template "${sources[$source]}" "$image_path"
    fi

    echo "[*] Customizing image, please wait..."
    
    # Delete default user accounts
    virt-customize -a "$image_path" \
        --install qemu-guest-agent \
        --run-command 'userdel -f -r almalinux || true' \
        --run-command 'userdel -f -r alpine || true' \
        --run-command 'userdel -f -r arch || true' \
        --run-command 'userdel -f -r cloud-user || true' \
        --run-command 'userdel -f -r fedora || true' \
        --run-command 'userdel -f -r ubuntu || true' \
        --run-command 'userdel -f -r debian || true' \
        --write "/etc/cloud/cloud.cfg.d/99-proxmox.cfg:datasource_list: [ NoCloud, ConfigDrive ]" \
        --run-command 'sed -i "s/ssh_pwauth:.*0/ssh_pwauth: 1/" /etc/cloud/cloud.cfg' \
        --run-command 'sed -i "s/ssh_pwauth:.*[Ff]alse/ssh_pwauth: true/" /etc/cloud/cloud.cfg' \
        --run-command 'sed -i "s/disable_root:.*[Tt]rue/disable_root: false/" /etc/cloud/cloud.cfg' \
        --run-command 'sed -i "s/disable_root:.*1/disable_root: 0/" /etc/cloud/cloud.cfg' \
        --run-command 'sed -i "s/lock_passwd:.*[Tt]rue/lock_passwd: false/" /etc/cloud/cloud.cfg' \
        --run-command 'sed -i "s/lock_passwd:.*1/lock_passwd: 0/" /etc/cloud/cloud.cfg' \
        --run-command 'sed -i "s/PasswordAuthentication no/PasswordAuthentication yes/" /etc/ssh/sshd_config' \
        --run-command 'sed -i "s/PermitRootLogin [Nn]o/PermitRootLogin yes/" /etc/ssh/sshd_config' \
        --run-command 'sed -i "s/#PermitRootLogin [Yy]es/PermitRootLogin yes/" /etc/ssh/sshd_config' \
        --run-command 'sed -i "s/#PermitRootLogin prohibit-password/PermitRootLogin yes/" /etc/ssh/sshd_config' \
        --run-command 'sed -i "s/KbdInteractiveAuthentication [Nn]o/#KbdInteractiveAuthentication no/" /etc/ssh/sshd_config' \
        --run-command 'sed -i "s/[#M]axAuthTries 6/MaxAuthTries 20/" /etc/ssh/sshd_config' \
        --run-command 'cloud-init clean --seed --logs' \
        --run-command 'truncate -s 0 /etc/machine-id' \
        --no-logfile

    echo "[*] Creating new VM with ID $vm_id..."
    is_x86_64_v2=$(echo "${sources[$source]}" | grep -c "x86_64")
    cpu_type="kvm64"

    if [ "$is_x86_64_v2" -eq 1 ]; then
        cpu_type="x86-64-v2"
    fi

    if [ "$use_cpu_host" = "y" ]; then
        cpu_type="host"
    fi

    echo "[*] Creating template from VM..."
    # See: https://bastientraverse.com/en/proxmox-optimized-cloud-init-templates/
    qm create $vm_id \
    --name "template-$source" \
    --description "$source cloud-init template" \
    --template 1 \
    --ostype l26 \
    --machine q35 \
    --cpu $cpu_type \
    --cores 2 \
    --memory 1024 \
    --scsihw virtio-scsi-single \
    --scsi0 "$storage:0,import-from=/tmp/$source.$extension,discard=on,iothread=1,ssd=1" \
    --net0 virtio,bridge=vmbr0,firewall=1 \
    --tablet 0 \
    --rng0 source=/dev/urandom \
    --boot order=scsi0 \
    --vga std --serial0 socket \
    --ide2 "$storage:cloudinit" \
    --agent enabled=1,fstrim_cloned_disks=1
    #--balloon 512 (causing some issues)
    #--vga serial0 => Also possible to use serial0, but will cause issues with symbols and not show boot process

    if [ "$use_suricata" = "y" ]; then
        echo "[*] Enabling Suricata IPS on the template..."

        # Check if Suricata is installed
        if ! command -v suricata &> /dev/null; then
            echo "[x] Suricata is not installed, please set it up first or disable Suricata on the template."
            exit 1
        fi

        node=$(hostname -s)
        # Enable Firewall, but allow incoming traffic by default
        pvesh set /nodes/$node/qemu/$vm_id/firewall/options --enable 1 --policy_in ACCEPT

        # Enable Suricata by ammending to the options
        firewall_file="/etc/pve/firewall/$vm_id.fw"

        # Throw error if file does not exist
        if [ ! -f "$firewall_file" ]; then
            echo "[x] Firewall file $firewall_file does not exist, please create it."
            exit 1
        fi

        # Enable IPS
        # ips: 1 and ips_queues: 0 must be appended to the TOML file

        # Example:
        # [OPTIONS]
        #
        # enable: 1
        # ips: 1
        # ips_queues: 0

        # Append to the firewall file
        echo "ips: 1" >> $firewall_file
        echo "ips_queues: 0" >> $firewall_file
    fi

    if [ "$delete_templates" = "y" ]; then
      echo "[*] Deleting downloaded image file:"
      rm -v $image_path
    fi

    result_ids[$source]="$vm_id"
    template_ids[$distro]=$(($vm_id+1))

    echo "[*] Template creation for $source complete."
done

end=$(date +%s)
echo "[*] Script execution finished after $((($end-$start)/60)) min $((($end-$start)%60)) sec."

created_count=${#result_ids[@]}
if [ "$created_count" -eq 0 ]; then
    echo "[!] No new templates were created."
    exit 0
else
  echo "[*] The following templates were created:"
  for source in "${!result_ids[@]}"; do
      echo "    - $source: ${result_ids[$source]}"
  done
fi
