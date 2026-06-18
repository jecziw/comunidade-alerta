variable "aws_region"  { default = "sa-east-1" }            # São Paulo
variable "project"     { default = "comunidade-alerta" }
variable "db_name"     { default = "comunidade_alerta" }
variable "db_user"     { default = "postgres" }
variable "db_password" { default = "postgres", sensitive = true }
variable "domain"      { default = "comunidadealerta.com.br" }
variable "backend_image"  { default = "" }   # ECR image URI do backend
variable "frontend_image" { default = "" }   # ECR image URI do frontend
