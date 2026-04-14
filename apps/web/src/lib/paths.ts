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

export const paths = {
  home: {
    getHref: () => "/",
  },
  admin: {
    home: {
      getHref: () => "/",
    },
    users: {
      getHref: (
        params: { name?: string; role?: "CUSTOMER" | "ADMIN" } = {},
      ) => {
        const basePath = "/users";

        if (Object.keys(params).length === 0) {
          return basePath;
        }

        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value) {
            searchParams.set(key, value);
          }
        }
        return `${basePath}?${searchParams.toString()}`;
      },
      overview: {
        getHref: (id: string) => `/users/${id}/overview`,
      },
    },
    servers: {
      getHref: (params: { name?: string } = {}) => {
        const basePath = "/servers";

        if (Object.keys(params).length === 0) {
          return basePath;
        }

        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value) {
            searchParams.set(key, value);
          }
        }
        return `${basePath}?${searchParams.toString()}`;
      },
    },
    datacenters: {
      getHref: () => "/datacenters",
      overview: {
        getHref: (id: string) => `/datacenters/${id}`,
      },
    },
    nodeGroups: {
      getHref: () => "/node-groups",
      overview: {
        getHref: (id: string) => `/node-groups/${id}`,
      },
    },
    nodes: {
      getHref: () => "/nodes",
      overview: {
        getHref: (id: string) => `/nodes/${id}`,
      },
    },
    templateGroups: {
      getHref: () => "/template-groups",
      overview: {
        getHref: (id: string) => `/template-groups/${id}`,
      },
    },
    templates: {
      overview: {
        getHref: (id: string) => `/templates/${id}`,
      },
    },
    subnets: {
      getHref: () => "/subnets",
      overview: {
        getHref: (id: string) => `/subnets/${id}`,
      },
    },
  },
  app: {
    home: {
      getHref: () => "/",
    },
    servers: {
      getHref: () => "/servers",
      overview: {
        getHref: (id: string) => `/servers/${id}/overview`,
      },
      console: {
        getHref: (id: string) => `/servers/${id}/console`,
      },
      firewall: {
        getHref: (id: string) => `/servers/${id}/firewall`,
      },
      backups: {
        getHref: (id: string) => `/servers/${id}/backups`,
      },
      rdns: {
        getHref: (id: string) => `/servers/${id}/rdns`,
      },
      plan: {
        getHref: (id: string) => `/servers/${id}/plan`,
      },
    },
    invoices: {
      getHref: () => "/invoices",
    },
    account: {
      settings: {
        getHref: () => "/account/settings",
        authentication: {
          getHref: () => "/account/settings/authentication",
        },
        billing: {
          getHref: () => "/account/settings/billing",
        },
        api: {
          getHref: () => "/account/settings/api",
        },
        sshKeys: {
          getHref: () => "/account/settings/ssh-keys",
        },
      },
    },
  },
} as const;
