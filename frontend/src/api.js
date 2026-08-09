const BASE_URL = "http://127.0.0.1:8000";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function uploadStatement(file) {
  const formData = new FormData();
  formData.append("file", file);
  return fetch(`${BASE_URL}/transactions/upload`, {
    method: "POST",
    body: formData,
  }).then(handle);
}

export function createTransaction(txn) {
  return fetch(`${BASE_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(txn),
  }).then(handle);
}

export function fetchTransactions(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return fetch(`${BASE_URL}/transactions${query ? `?${query}` : ""}`).then(handle);
}

export function updateTransaction(id, update) {
  return fetch(`${BASE_URL}/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  }).then(handle);
}

export function deleteTransaction(id) {
  return fetch(`${BASE_URL}/transactions/${id}`, { method: "DELETE" }).then(handle);
}

export function fetchMonthlySummary() {
  return fetch(`${BASE_URL}/summary/monthly`).then(handle);
}

export function fetchWealth() {
  return fetch(`${BASE_URL}/summary/wealth`).then(handle);
}

export function fetchCategories() {
  return fetch(`${BASE_URL}/categories`).then(handle);
}

export function fetchNetWorth() {
  return fetch(`${BASE_URL}/net-worth`).then(handle);
}

export function setNetWorthCategory(category, entry) {
  return fetch(`${BASE_URL}/net-worth/${category}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).then(handle);
}

export function clearNetWorthCategory(category) {
  return fetch(`${BASE_URL}/net-worth/${category}`, { method: "DELETE" }).then(handle);
}

export function runTransferDetection() {
  return fetch(`${BASE_URL}/transactions/detect-transfers`, { method: "POST" }).then(handle);
}

export function fetchNetWorthOverTime() {
  return fetch(`${BASE_URL}/summary/networth`).then(handle);
}

export function fetchCategoryBreakdown(month, direction = "out") {
  const params = new URLSearchParams({ month, direction });
  return fetch(`${BASE_URL}/summary/category-breakdown?${params}`).then(handle);
}

export function fetchSavingsCohort() {
  return fetch(`${BASE_URL}/summary/savings-cohort`).then(handle);
}
