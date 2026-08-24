/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Real `ss -lntup` output, captured through `qm guest exec` on a Proxmox host.
 *
 * Kept verbatim, header row and trailing padding included, because every
 * awkward case in it is one a customer's server can produce: `%lo` scoped
 * addresses, IPv4-mapped IPv6 loopback, a bare `*` bind, a CGNAT address from
 * a VPN interface, and a socket held by two processes at once.
 */
export const SS_DEBIAN = `Netid State  Recv-Q Send-Q               Local Address:Port  Peer Address:PortProcess                                               
udp   UNCONN 0      0                          0.0.0.0:41641      0.0.0.0:*    users:(("tailscaled",pid=1085441,fd=19))             
udp   UNCONN 0      0                       127.0.0.54:53         0.0.0.0:*    users:(("systemd-resolve",pid=597,fd=16))            
udp   UNCONN 0      0                    127.0.0.53%lo:53         0.0.0.0:*    users:(("systemd-resolve",pid=597,fd=14))            
udp   UNCONN 0      0                          0.0.0.0:49256      0.0.0.0:*    users:(("avahi-daemon",pid=727,fd=14))               
udp   UNCONN 0      0                          0.0.0.0:5353       0.0.0.0:*    users:(("avahi-daemon",pid=727,fd=12))               
udp   UNCONN 0      0                             [::]:41206         [::]:*    users:(("avahi-daemon",pid=727,fd=15))               
udp   UNCONN 0      0                             [::]:41641         [::]:*    users:(("tailscaled",pid=1085441,fd=18))             
udp   UNCONN 0      0                             [::]:5353          [::]:*    users:(("avahi-daemon",pid=727,fd=13))               
tcp   LISTEN 0      5                     100.94.20.83:80         0.0.0.0:*    users:(("python3",pid=1182927,fd=10))                
tcp   LISTEN 0      4096                  100.94.20.83:36275      0.0.0.0:*    users:(("tailscaled",pid=1085441,fd=20))             
tcp   LISTEN 0      1024                     127.0.0.1:40000      0.0.0.0:*    users:(("warp-svc",pid=52362,fd=19))                 
tcp   LISTEN 0      5                          0.0.0.0:8080       0.0.0.0:*    users:(("sabnzbdplus",pid=1955260,fd=8))             
tcp   LISTEN 0      4096                 127.0.0.53%lo:53         0.0.0.0:*    users:(("systemd-resolve",pid=597,fd=15))            
tcp   LISTEN 0      4096                    127.0.0.54:53         0.0.0.0:*    users:(("systemd-resolve",pid=597,fd=17))            
tcp   LISTEN 0      4096                       0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=962,fd=3),("systemd",pid=1,fd=89))
tcp   LISTEN 0      4096   [fd7a:115c:a1e0::f539:1454]:50613         [::]:*    users:(("tailscaled",pid=1085441,fd=22))             
tcp   LISTEN 0      50              [::ffff:127.0.0.1]:3128             *:*    users:(("java",pid=1087167,fd=52))                   
tcp   LISTEN 0      50                           [::1]:9666          [::]:*    users:(("java",pid=1087167,fd=60))                   
tcp   LISTEN 0      50              [::ffff:127.0.0.1]:9666             *:*    users:(("java",pid=1087167,fd=59))                   
tcp   LISTEN 0      50              [::ffff:127.0.0.1]:9665             *:*    users:(("java",pid=1087167,fd=9))                    
tcp   LISTEN 0      50                               *:36057            *:*    users:(("java",pid=1087167,fd=56))                   
tcp   LISTEN 0      4096                          [::]:22            [::]:*    users:(("sshd",pid=962,fd=4),("systemd",pid=1,fd=90))
tcp   LISTEN 0      50                           [::1]:3128          [::]:*    users:(("java",pid=1087167,fd=53))                   
`;

/**
 * A plain web server, the shape most customer VPS installs actually have.
 * Produced with `-H`, so there is no header row.
 */
export const SS_MINIMAL = `tcp   LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=701,fd=3))
tcp   LISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=890,fd=6))
tcp   LISTEN 0      511          0.0.0.0:443       0.0.0.0:*    users:(("nginx",pid=890,fd=7))
tcp   LISTEN 0      151        127.0.0.1:3306      0.0.0.0:*    users:(("mariadbd",pid=1102,fd=23))
`;

/**
 * `ufw status verbose` on a server that allows SSH and HTTPS.
 *
 * Covers the default-policy line, a port list, an interface qualifier, a
 * source CIDR, LIMIT, and the `(v6)` duplicates ufw emits for every rule.
 */
export const UFW_VERBOSE = `Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     LIMIT IN    Anywhere
80,443/tcp                 ALLOW IN    Anywhere
3306                       DENY IN     Anywhere
5432/tcp                   ALLOW IN    10.0.0.0/8
53 on eth0                 ALLOW IN    Anywhere
22/tcp (v6)                LIMIT IN    Anywhere (v6)
80,443/tcp (v6)            ALLOW IN    Anywhere (v6)
`;

/** `ufw status numbered`, which prefixes every rule with its position. */
export const UFW_NUMBERED = `Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere
[ 2] 443/tcp                    ALLOW IN    Anywhere
[ 3] Anywhere                   DENY OUT    25/tcp
[10] 192.168.0.1 8080/tcp       REJECT IN   203.0.113.0/24
`;

export const UFW_INACTIVE = `Status: inactive
`;

/**
 * `iptables-save` on a server running Docker.
 *
 * Covers a non-filter table, a loopback accept, a conntrack rule, multiport,
 * a source CIDR, a negation, a comment, an ICMP rule, a jump into a user
 * chain, and a REJECT with a target option.
 */
export const IPTABLES_SAVE = `# Generated by iptables-save v1.8.9 on Mon Aug 24 12:00:00 2026
*nat
:PREROUTING ACCEPT [0:0]
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE
COMMIT
*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]
:DOCKER - [0:0]
-A INPUT -i lo -j ACCEPT
-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
-A INPUT -p tcp -m tcp --dport 22 -m comment --comment "allow ssh" -j ACCEPT
-A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
-A INPUT -s 10.0.0.0/8 -p tcp -m tcp --dport 5432 -j ACCEPT
-A INPUT ! -s 192.168.0.0/16 -p tcp -m tcp --dport 8086 -j DROP
-A INPUT -p icmp -m icmp --icmp-type 8 -j ACCEPT
-A INPUT -j LOG --log-prefix "dropped: "
-A FORWARD -o docker0 -j DOCKER
-A OUTPUT -p tcp -m tcp --dport 25 -j REJECT --reject-with icmp-port-unreachable
COMMIT
`;

/** A machine with nftables in use and the iptables shim reporting nothing. */
export const IPTABLES_EMPTY = `# Generated by iptables-save v1.8.9 on Mon Aug 24 12:00:00 2026
*filter
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
COMMIT
`;
