# Pages

No pages of its own; the admin console's generic integration page configures
it. It adds one route, `GET /api/integrations/prometheus/metrics`, open to the
bearer of the scrape token and answering 404 to everyone else.
