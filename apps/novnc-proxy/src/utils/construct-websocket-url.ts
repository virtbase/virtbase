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

import type { WebSocketData } from "@virtbase/validators";

/**
 * Constructs a websocket URL (wss://) for a given Proxmox VE server and VM.
 * The URL can be used to the noVNC websocket endpoint of Proxmox VE.
 *
 * @returns The constructed websocket URL
 */
export const constructWebsocketUrl = ({
  host,
  node,
  vmid,
  type,
  port,
  vncticket,
}: Pick<WebSocketData, "host" | "node" | "vmid" | "type"> & {
  port: number | string;
  vncticket: string;
}): URL => {
  const url = new URL(`wss://${host}`);
  url.pathname = `/api2/json/nodes/${node}/${type}/${vmid}/vncwebsocket`;
  url.searchParams.set("port", `${port}`);
  url.searchParams.set("vncticket", vncticket);

  return url;
};
