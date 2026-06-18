variable "db_name"     { default = "comunidade_alerta" }
variable "db_user"     { default = "postgres" }
variable "db_password" { default = "postgres"; sensitive = true }
