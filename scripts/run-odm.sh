#!/bin/bash

# Example Docker execution for OpenDroneMap on a GPU-enabled Compute Engine instance
# The GCS bucket containing the React client's images is mounted via FUSE to /mnt/gcs_fuse_mount

docker run -ti --rm \
    --gpus all \
    -v /mnt/gcs_fuse_mount/datasets/claim_0042:/datasets/code \
    opendronemap/odm --project-path /datasets \
    --use-3dmesh \
    --dsm \
    --orthophoto-resolution 2 \
    --pc-quality ultra
