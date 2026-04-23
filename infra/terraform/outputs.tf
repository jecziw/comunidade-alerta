output "frontend_url" {
  description = "URL de acesso ao dashboard"
  value       = "http://localhost:${var.frontend_port}"
}

output "api_health_url" {
  description = "Endpoint de health check da API"
  value       = "http://localhost:${var.frontend_port}/api/health"
}

output "prometheus_url" {
  description = "URL do Prometheus"
  value       = "http://localhost:${var.prometheus_port}"
}

output "grafana_url" {
  description = "URL do Grafana"
  value       = "http://localhost:${var.grafana_port}"
}

output "grafana_credentials" {
  description = "Credenciais do Grafana (não expor em pipelines públicos)"
  sensitive   = true
  value       = "${var.grafana_user} / ${var.grafana_password}"
}

output "network_name" {
  description = "Rede Docker criada pelo Terraform"
  value       = docker_network.app.name
}
