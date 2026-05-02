Virtbase allows you to manage your rented KVMs and other associated resources via the API.

## Authentication

All requests to the Virtbase Public API must be authenticated with an API key. Add your API key to the `X-Virtbase-API-Key` header in each request you send.

A new API key can be obtained from your [account settings](https://app.virtbase.com/account/settings/api).

**Example**

```
X-Virtbase-API-Key: <your-api-key>
```

## Pagination

Some endpoints that return a list of items support pagination. You can control pagination with the following query string parameters:

- `page`: The page to fetch. The first page is 1.
- `per_page`: The number of items per page. The default is 10.

**Example Pagination**

```json
{
  "ssh_keys": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "per_page": 10,
      "previous_page": null,
      "next_page": 2,
      "last_page": 10,
      "total_entries": 100
    }
  }
}
```

The keys `previous_page`, `next_page` may be `null` when on the first page or the last page.

## Rate Limiting

Each request you send to our API endpoints are subject to rate limiting. This includes unauthenticated requests.

If you have reached your rate limit, your requests will be handled with a `429 Too Many Requests` error.

Unless otherwise specified, the default rate limit is 120 requests per minute (or 2 requests per second) using a sliding window. Burst requests are allowed within the window.

- The `X-RateLimit-Limit` header contains the total number of requests you can perform per time window.
- The `X-RateLimit-Remaining` header contains the number of requests remaining in the current rate limit time frame.
- The `X-RateLimit-Reset` header contains a UNIX timestamp of the point in time when your rate limit will have recovered, and you will have the full number of requests available again.

## Sorting

Some endpoints that return multiple entries support sorting. You can specify sorting with the `sort` query string parameter. You can sort by multiple fields. You can set the sort direction by appending `:asc` or `:desc` to the field name. By default ascending sorting is used.

**Example**

```
https://virtbase.com/api/v1/ssh_keys?sort=name
https://virtbase.com/api/v1/ssh_keys?sort=name:asc
https://virtbase.com/api/v1/ssh_keys?sort=name:desc
https://virtbase.com/api/v1/ssh_keys?sort=id:asc,name:desc
```