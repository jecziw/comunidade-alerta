const API_BASE = "http://127.0.0.1:8000/api";

async function carregarResumoEstatisticas() {
  const res = await fetch(`${API_BASE}/statistics/overview`);
  const data = await res.json();

  const total = document.querySelector("#stats-kpi-total .stat-number");
  const resolvidas = document.querySelector("#stats-kpi-resolvidas .stat-number");
  const tempo = document.querySelector("#stats-kpi-tempo .stat-number");
  const bairros = document.querySelector("#stats-kpi-bairros .stat-number");

  if (total) total.textContent = data.total_alerts;
  if (resolvidas) resolvidas.textContent = data.resolved_alerts;
  if (tempo) tempo.textContent = `${data.avg_response_minutes} min`;
  if (bairros) bairros.textContent = data.monitored_neighborhoods;
}

async function carregarFeedPrioridade() {
  const res = await fetch(`${API_BASE}/alerts/priority-feed`);
  const data = await res.json();
  console.log("Feed de prioridade:", data.items);
}
