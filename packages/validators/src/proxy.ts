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

import * as z4 from "zod/v4";

export const WebsocketDataSchema = z4.object({
  /**
   * The VM ID of the guest in Proxmox VE.
   *
   * @example 1000
   */
  vmid: z4.int().positive(),
  /**
   * The type of the guest in Proxmox VE.
   * Either "qemu" or "lxc".
   *
   * @example "qemu"
   * @example "lxc"
   */
  type: z4.enum(["qemu", "lxc"]),
  /**
   * The FQDN of the Proxmox VE server, where the API is reachable.
   * It is assumed that HTTPS protocol is used.
   *
   * @example "pve01.example.com"
   */
  host: z4.hostname(),
  /**
   * The name of the node in Proxmox VE.
   * This is equal to the hostname of the node.
   *
   * @example "pve01"
   */
  node: z4.hostname(),
  /**
   * The ticket to authenticate the API request with.
   * This can either be an API token or the value of the PVEAuthCookie cookie.
   *
   * @example "PVEAPIToken=1234567890"
   */
  ticket: z4.string(),
  /**
   * The ticket to authenticate the VNC websocket request with.
   * This value is obtained from POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy
   */
  vncticket: z4.string(),
  /**
   * The port number of the VNC proxy.
   * This value is obtained from POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy
   *
   * @example 5900
   * @example "5900"
   */
  port: z4.union([z4.string(), z4.number()]),
  /**
   * The id of the server this payload was minted for.
   *
   * The payload round-trips through the browser, so it carries who and what it
   * was issued for. The proxy has no database of its own and therefore cannot
   * check the claim against an independent source, but binding it into the
   * authenticated ciphertext means a payload cannot be re-pointed at another
   * server without the shared key, and it gives the proxy something to log.
   *
   * @example "kvm_01hzy..."
   */
  serverId: z4.string().min(1),
  /**
   * The id of the user the payload was minted for. See `serverId`.
   */
  userId: z4.string().min(1),
  /**
   * Absolute expiry, as a Unix timestamp in seconds.
   *
   * Without it the blob stays usable for as long as the Proxmox vncticket it
   * carries, so anyone who once saw the console URL could reconnect. The proxy
   * rejects an expired payload before upgrading the connection.
   *
   * @example 1767225600
   */
  exp: z4.int().positive(),
});

export type WebSocketData = z4.infer<typeof WebsocketDataSchema>;
