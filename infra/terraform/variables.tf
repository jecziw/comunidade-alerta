variable "project_name" {
  description = "Prefixo usado em todos os recursos criados"
  type        = string
  default     = "comunidade-alerta"
}

variable "image_tag" {
  description = "Tag das imagens Docker (sobrescrita pelo pipeline de CD)"
  type        = string
  default     = "local"
}

variable "node_env" {
  description = "Ambiente Node.js"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "production"], var.node_env)
    error_message = "node_env deve ser 'development' ou 'production'."
  }
}

# --- Banco de dados ---
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
  description = "Senha do PostgreSQL (use tfvars ou variável de ambiente em produção)"
  type        = string
  sensitive   = true
  default     = "postgres"
}

variable "db_port" {
  description = "Porta exposta do PostgreSQL no host"
  type        = number
  default     = 5432
}

# --- Portas dos serviços ---
variable "backend_port" {
  description = "Porta interna do backend"
  type        = number
  default     = 3000
}

variable "frontend_port" {
  description = "Porta exposta do frontend (Nginx) no host"
  type        = number
  default     = 8080
}

variable "prometheus_port" {
  description = "Porta exposta do Prometheus no host"
  type        = number
  default     = 9090
}

variable "grafana_port" {
  description = "Porta exposta do Grafana no host"
  type        = number
  default     = 3001
}

# --- Grafana ---
variable "grafana_user" {
  description = "Usuário admin do Grafana"
  type        = string
  default     = "admin"
}

variable "grafana_password" {
  description = "Senha admin do Grafana"
  type        = string
  sensitive   = true
  default     = "admin"
}
