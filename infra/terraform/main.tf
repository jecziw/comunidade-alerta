terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker", version = "~> 3.0" }
  }
}
provider "docker" {}
resource "docker_network" "app" { name = "comunidade-alerta-dev" }
resource "docker_container" "db" {
  name  = "ca-db-dev"
  image = "postgres:16-alpine"
  env   = ["POSTGRES_DB=${var.db_name}", "POSTGRES_USER=${var.db_user}", "POSTGRES_PASSWORD=${var.db_password}"]
  ports { internal = 5432; external = 5432 }
  networks_advanced { name = docker_network.app.name }
}
