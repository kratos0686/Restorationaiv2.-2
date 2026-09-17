# --- Global Load Balancer Configuration ---
# This sets up an External HTTP(S) Load Balancer to route traffic to your Cloud Run service.

# 1. Reserve a static external IP address for the Load Balancer
resource "google_compute_global_address" "default" {
  project = var.project_id
  name    = "gemini-app-lb-ip"
}

# 2. Create a Serverless Network Endpoint Group (NEG) for Cloud Run
# This allows the Load Balancer to direct traffic to your Cloud Run service.
resource "google_compute_region_network_endpoint_group" "cloud_run_neg" {
  project               = var.project_id
  name                  = "gemini-app-cloud-run-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_run {
    service = google_cloud_run_service.gemini_app_service.name
  }
}

# 3. Create a Backend Service to connect the NEG to the Load Balancer
resource "google_compute_backend_service" "cloud_run_backend" {
  project     = var.project_id
  name        = "gemini-app-cloud-run-backend"
  protocol    = "HTTP"
  timeout_sec = 30

  backend {
    group = google_compute_region_network_endpoint_group.cloud_run_neg.id
  }
}

# 4. Create a URL Map to define how requests are routed to backend services
resource "google_compute_url_map" "default" {
  project         = var.project_id
  name            = "gemini-app-url-map"
  default_service = google_compute_backend_service.cloud_run_backend.id
}

# 5. Create an HTTP Proxy to handle incoming HTTP requests
resource "google_compute_target_http_proxy" "default" {
  project = var.project_id
  name    = "gemini-app-http-proxy"
  url_map = google_compute_url_map.default.id
}

# 6. Create a Global Forwarding Rule to direct external IP traffic to the HTTP Proxy
resource "google_compute_global_forwarding_rule" "http" {
  project             = var.project_id
  name                = "gemini-app-http-forwarding-rule"
  ip_protocol         = "TCP"
  port_range          = "80"
  load_balancing_scheme = "EXTERNAL"
  target              = google_compute_target_http_proxy.default.id
  ip_address          = google_compute_global_address.default.id
}

# --- Cloud Storage Configuration ---
# Bucket for storing photos and room scans
resource "google_storage_bucket" "media_bucket" {
  name          = "${var.project_id}-media-scans"
  location      = var.region
  force_destroy = true # Be careful with this in production, but good for dev

  uniform_bucket_level_access = true

  cors {
    origin          = ["*"] # Adjust in production
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# --- Cloud Run Service Configuration ---
# This defines your serverless Gemini API application.

resource "google_cloud_run_service" "gemini_app_service" {
  project  = var.project_id
  name     = "gemini-app-service"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project_id}/gemini-app:${var.image_tag}" # Replace with your actual image tag
        env {
          name  = "DATABASE_HOST"
          value = google_sql_database_instance.main_db_instance.private_ip_address
        }
        env {
          name  = "DATABASE_USER"
          value = google_sql_user.db_user.name
        }
        env {
          name = "DATABASE_PASSWORD"
          value_from {
            secret_key_ref {
              secret_id = google_secret_manager_secret.db_password.secret_id
              version   = "latest"
            }
          }
        }
        env {
          name  = "DATABASE_NAME"
          value = google_sql_database.main_database.name
        }
        env {
          name  = "GCS_BUCKET_NAME"
          value = google_storage_bucket.media_bucket.name
        }
        # Add other environment variables as needed, e.g., for Gemini API key if not using Workload Identity
      }
      service_account_name = google_service_account.cloud_run_sa.email
    }
    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale" = "10" # Adjust max instances as needed
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  # Allow unauthenticated access if your application is public-facing.
  # For internal applications, remove this and configure IAM for specific callers.
  depends_on = [
    google_cloud_run_service_iam_member.allow_unauthenticated
  ]
}

# Allow unauthenticated access to the Cloud Run service
resource "google_cloud_run_service_iam_member" "allow_unauthenticated" {
  project  = var.project_id
  location = google_cloud_run_service.gemini_app_service.location
  service  = google_cloud_run_service.gemini_app_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Create a dedicated Service Account for Cloud Run
resource "google_service_account" "cloud_run_sa" {
  project      = var.project_id
  account_id   = "gemini-app-cloud-run-sa"
  display_name = "Service Account for Gemini App Cloud Run"
}

# Grant the Cloud Run Service Account permission to access Secret Manager secrets
resource "google_secret_manager_secret_iam_member" "cloud_run_secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.db_password.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Grant the Cloud Run Service Account permission to access the Storage Bucket
resource "google_storage_bucket_iam_member" "cloud_run_storage_admin" {
  bucket = google_storage_bucket.media_bucket.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# --- Cloud SQL (PostgreSQL) Configuration ---
# This sets up a managed PostgreSQL database instance.

resource "google_sql_database_instance" "main_db_instance" {
  project          = var.project_id
  name             = "gemini-app-postgres-instance"
  database_version = "POSTGRES_14"
  region           = var.region
  settings {
    tier = "db-f1-micro" # Choose an appropriate machine type
    ip_configuration {
      ipv4_enabled = false # Disable public IP for security
      private_network = "projects/${var.project_id}/global/networks/${google_compute_network.vpc_network.name}"
    }
    backup_configuration {
      enabled            = true
      binary_log_enabled = true
      start_time         = "03:00"
    }
    maintenance_window {
      day  = 7 # Sunday
      hour = 0 # Midnight
    }
  }
}

resource "google_sql_database" "main_database" {
  project  = var.project_id
  name     = "gemini-app-db"
  instance = google_sql_database_instance.main_db_instance.name
  charset  = "UTF8"
  collation = "en_US.UTF8"
}

resource "google_sql_user" "db_user" {
  project  = var.project_id
  name     = "gemini-app-user"
  instance = google_sql_database_instance.main_db_instance.name
  host     = "%" # Allow connections from any host (for private IP, this is fine)
  password = google_secret_manager_secret_version.db_password_version.secret_data
}

# --- Secret Manager Configuration ---
# Securely stores your database password.

resource "google_secret_manager_secret" "db_password" {
  project  = var.project_id
  secret_id = "gemini-app-db-password"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password_version" {
  project     = var.project_id
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password # This should be a sensitive variable
}

# --- VPC Network for Cloud SQL Private IP ---
# Cloud SQL private IP requires a VPC network and a Private Service Connection.

resource "google_compute_network" "vpc_network" {
  project                 = var.project_id
  name                    = "gemini-app-vpc"
  auto_create_subnetworks = true
}

resource "google_compute_global_address" "private_ip_alloc" {
  project       = var.project_id
  name          = "gemini-app-private-ip-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  project                 = var.project_id
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# --- Variables ---
variable "project_id" {
  description = "The GCP project ID."
  type        = string
}

variable "region" {
  description = "The GCP region for resources."
  type        = string
  default     = "us-central1" # You can change this
}

variable "image_tag" {
  description = "The Docker image tag for your Cloud Run service (e.g., 'latest' or a specific commit SHA)."
  type        = string
}

variable "db_password" {
  description = "The password for the PostgreSQL database user. **WARNING: Handle with care, use Terraform Cloud or other secure methods for sensitive variables.**"
  type        = string
  sensitive   = true
}

# --- Outputs ---
output "load_balancer_ip_address" {
  description = "The external IP address of the Global HTTP(S) Load Balancer."
  value       = google_compute_global_address.default.address
}

output "cloud_run_service_url" {
  description = "The URL of the deployed Cloud Run service."
  value       = google_cloud_run_service.gemini_app_service.status[0].url
}

output "cloud_sql_instance_connection_name" {
  description = "The connection name for the Cloud SQL instance."
  value       = google_sql_database_instance.main_db_instance.connection_name
}

output "storage_bucket_name" {
  description = "The name of the Cloud Storage bucket for photos and scans."
  value       = google_storage_bucket.media_bucket.name
}
