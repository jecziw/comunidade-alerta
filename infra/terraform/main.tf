terraform {
  required_version = ">= 1.6"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }

  # --------------------------------------------------------------------------
  # Trocar por "s3" (AWS) ou "gcs" (GCP) quando subir para nuvem:
  #
  # backend "s3" {
  #   bucket = "meu-tfstate"
  #   key    = "comunidade-alerta/terraform.tfstate"
  #   region = "us-east-1"
  # }
  # --------------------------------------------------------------------------
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "docker" {
  # Em CI/CD, injete via DOCKER_HOST env var.
  # Para Docker Desktop local nenhuma config é necessária.
}

# --------------------------------------------------------------------------
# Rede interna
# --------------------------------------------------------------------------
resource "docker_network" "app" {
  name = "${var.project_name}-network"
}

# --------------------------------------------------------------------------
# Volume persistente do banco
# --------------------------------------------------------------------------
resource "docker_volume" "postgres" {
  name = "${var.project_name}-postgres-data"
}

resource "docker_volume" "grafana" {
  name = "${var.project_name}-grafana-data"
}

# --------------------------------------------------------------------------
# Imagens
# --------------------------------------------------------------------------
resource "docker_image" "backend" {
  name = "${var.project_name}-backend:${var.image_tag}"

  build {
    context    = "${path.root}/../../backend"
    dockerfile = "Dockerfile"
    no_cache   = false
  }

  triggers = {
    src_hash = sha1(join("", [
      filesha1("${path.root}/../../backend/src/server.js"),
      filesha1("${path.root}/../../backend/src/app.js"),
      filesha1("${path.root}/../../backend/package.json"),
    ]))
  }
}

resource "docker_image" "frontend" {
  name = "${var.project_name}-frontend:${var.image_tag}"

  build {
    context    = "${path.root}/../.."
    dockerfile = "frontend/Dockerfile"
    no_cache   = false
  }

  triggers = {
    html_hash = filesha1("${path.root}/../../frontend/public/index.html")
  }
}

resource "docker_image" "postgres" {
  name = "postgres:16-alpine"
}

resource "docker_image" "prometheus" {
  name = "prom/prometheus:v2.54.1"
}

resource "docker_image" "grafana" {
  name = "grafana/grafana:11.1.5"
}

# --------------------------------------------------------------------------
# PostgreSQL
# --------------------------------------------------------------------------
resource "docker_container" "postgres" {
  name  = "${var.project_name}-db"
  image = docker_image.postgres.image_id

  networks_advanced {
    name = docker_network.app.name
  }

  env = [
    "POSTGRES_DB=${var.db_name}",
    "POSTGRES_USER=${var.db_user}",
    "POSTGRES_PASSWORD=${var.db_password}",
  ]

  volumes {
    volume_name    = docker_volume.postgres.name
    container_path = "/var/lib/postgresql/data"
  }

  ports {
    internal = 5432
    external = var.db_port
  }

  healthcheck {
    test         = ["CMD-SHELL", "pg_isready -U ${var.db_user} -d ${var.db_name}"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 5
    start_period = "10s"
  }

  restart = "unless-stopped"
}

# --------------------------------------------------------------------------
# Backend
# --------------------------------------------------------------------------
resource "docker_container" "backend" {
  name  = "${var.project_name}-backend"
  image = docker_image.backend.image_id

  networks_advanced {
    name = docker_network.app.name
  }

  env = [
    "PORT=${var.backend_port}",
    "DATABASE_URL=postgresql://${var.db_user}:${var.db_password}@${docker_container.postgres.name}:5432/${var.db_name}",
    "NODE_ENV=${var.node_env}",
  ]

  healthcheck {
    test         = ["CMD", "wget", "-qO-", "http://localhost:${var.backend_port}/api/health"]
    interval     = "30s"
    timeout      = "5s"
    retries      = 5
    start_period = "15s"
  }

  restart = "unless-stopped"

  depends_on = [docker_container.postgres]
}

# --------------------------------------------------------------------------
# Frontend (Nginx)
# --------------------------------------------------------------------------
resource "docker_container" "frontend" {
  name  = "${var.project_name}-frontend"
  image = docker_image.frontend.image_id

  networks_advanced {
    name = docker_network.app.name
  }

  ports {
    internal = 80
    external = var.frontend_port
  }

  healthcheck {
    test     = ["CMD", "wget", "-qO-", "http://localhost/health"]
    interval = "30s"
    timeout  = "5s"
    retries  = 3
  }

  restart = "unless-stopped"

  depends_on = [docker_container.backend]
}

# --------------------------------------------------------------------------
# Prometheus
# --------------------------------------------------------------------------
resource "docker_container" "prometheus" {
  name  = "${var.project_name}-prometheus"
  image = docker_image.prometheus.image_id

  networks_advanced {
    name = docker_network.app.name
  }

  command = ["--config.file=/etc/prometheus/prometheus.yml"]

  volumes {
    host_path      = abspath("${path.root}/../prometheus/prometheus.yml")
    container_path = "/etc/prometheus/prometheus.yml"
    read_only      = true
  }

  ports {
    internal = 9090
    external = var.prometheus_port
  }

  restart    = "unless-stopped"
  depends_on = [docker_container.backend]
}

# --------------------------------------------------------------------------
# Grafana
# --------------------------------------------------------------------------
resource "docker_container" "grafana" {
  name  = "${var.project_name}-grafana"
  image = docker_image.grafana.image_id

  networks_advanced {
    name = docker_network.app.name
  }

  env = [
    "GF_SECURITY_ADMIN_USER=${var.grafana_user}",
    "GF_SECURITY_ADMIN_PASSWORD=${var.grafana_password}",
    "GF_USERS_ALLOW_SIGN_UP=false",
  ]

  volumes {
    volume_name    = docker_volume.grafana.name
    container_path = "/var/lib/grafana"
  }

  volumes {
    host_path      = abspath("${path.root}/../grafana/provisioning")
    container_path = "/etc/grafana/provisioning"
    read_only      = true
  }

  volumes {
    host_path      = abspath("${path.root}/../grafana/dashboards")
    container_path = "/var/lib/grafana/dashboards"
    read_only      = true
  }

  ports {
    internal = 3000
    external = var.grafana_port
  }

  restart    = "unless-stopped"
  depends_on = [docker_container.prometheus]
}
