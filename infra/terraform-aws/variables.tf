variable "aws_region" {
  description = "Região AWS onde os recursos serão criados"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo usado em todos os recursos"
  type        = string
  default     = "comunidade-alerta"
}

variable "image_tag" {
  description = "Tag das imagens Docker (injetada pelo pipeline de CD)"
  type        = string
  default     = "latest"
}

variable "db_name" {
  description = "Nome do banco PostgreSQL"
  type        = string
  default     = "comunidade_alerta"
}

variable "db_user" {
  description = "Usuário do PostgreSQL"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Senha do PostgreSQL"
  type        = string
  sensitive   = true
}
