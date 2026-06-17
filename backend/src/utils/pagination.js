'use strict';

// Small, dependency-free pagination helper shared by the admin list endpoints.
// Parses `page` / `limit` from a query object and returns safe, clamped values
// plus the Mongo `skip`. Defaults: page 1, limit 20 (max 100).
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, skip: (page - 1) * limit };
}

// Build the consistent list envelope returned by every paginated GET.
function buildList(items, total, page, limit) {
  return {
    data: items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

module.exports = { parsePagination, buildList };
