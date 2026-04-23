output "alb_url" {
  description = "URL pública do Load Balancer — acesse o dashboard por aqui"
  value       = "http://${aws_lb.main.dns_name}"
}

output "backend_ecr_url" {
  description = "URL do repositório ECR do backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_ecr_url" {
  description = "URL do repositório ECR do frontend"
  value       = aws_ecr_repository.frontend.repository_url
}

output "rds_endpoint" {
  description = "Endpoint do banco RDS"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "Nome do cluster ECS"
  value       = aws_ecs_cluster.main.name
}
