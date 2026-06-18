output "alb_dns"     { value = aws_lb.main.dns_name }
output "db_endpoint" { value = aws_db_instance.postgres.endpoint, sensitive = true }
output "cluster"     { value = aws_ecs_cluster.main.name }
