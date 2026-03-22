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
});

export type WebSocketData = z4.infer<typeof WebsocketDataSchema>;
